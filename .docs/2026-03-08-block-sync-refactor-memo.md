# Block Sync Refactor — Surgical Diff-and-Patch

**Date**: 2026-03-08  
**Status**: Proposed  
**Affects**: `packages/symbiont-cms/src/lib/server/notion/`  
**Files**: `client.ts · blocks-diff.ts · default-hooks.ts`

---

## Problem

The current `updatePageBlocks()` implementation is a destructive nuke-and-repave:

```
1. GET  /blocks/{page_id}/children         ← only first page (no pagination!)
2. for each block: DELETE /blocks/{block_id}   ← page is now empty
3. PATCH /blocks/{page_id}/children (chunk of 100)
4. PATCH /blocks/{page_id}/children (next chunk of 100)
…
```

This causes several concrete failures:

1. **Interruption = data loss.** If the process is killed after step 2 but before step 3 finishes (Ctrl-C, timeout, network drop, auth error, 429 rate limit), the page is left empty — permanently, until the next successful sync.

2. **100-block API limit confusion.** Notion enforces a max of 100 blocks per `PATCH /children` request. Long articles that span multiple chunks are garbled because ordering of subsequently-appended chunks can be disrupted — blocks arrive out of sequence or interleaved. The append endpoint takes a `position` parameter, but the current code always appends to `end`, relying on sequential execution; any transient failure or retry breaks the ordering contract.

3. **Missing pagination on read.** `getBlocks()` calls `blocks.children.list()` without paginating — pages with >100 top-level blocks only have their first page of blocks read. The delete loop then nukes only the first 100, the append re-writes all content, and the remaining original blocks are orphaned after the newly-appended ones — resulting in duplicated/ghost content at the bottom of the page.

4. **All-or-nothing cost.** Every sync call for every page re-writes all content even if only one paragraph changed. For a newspaper with 200+ articles, this is hundreds of unnecessary API calls per sync.

5. **No block identity.** Deleted blocks lose their Notion block IDs. Internal references (bookmarks, synced blocks, notification subscriptions, comments) that pointed at those IDs break silently.

6. **Sequential delete loop.** Each block is deleted with a separate API call, sequentially. A page with 80 blocks means 80 serial DELETE requests before any content is written back. This is both slow and maximizes the danger window.

---

## Pre-Requisite Fix: Paginated Block Reads

Before any diff algorithm work, `getBlocks()` in `client.ts` needs to paginate. The current implementation:

```typescript
async getBlocks(pageId: string): Promise<any[]> {
  const response = await this.notion.blocks.children.list({ block_id: pageId });
  return response.results as any[];   // ← only first 100 blocks!
}
```

Must become:

```typescript
async getBlocks(pageId: string): Promise<any[]> {
  const allBlocks: any[] = [];
  let cursor: string | undefined;
  do {
    const response = await this.notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
    });
    allBlocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);
  return allBlocks;
}
```

This is a bug fix independent of the refactor and should ship first in its own commit. `updatePageBlocks()` has the same single-page bug in its delete loop.

---

## Available API Primitives

| Operation | Endpoint | Semantics |
|---|---|---|
| **List** children | `GET /blocks/{id}/children` | Paginated (100/page); returns block IDs + types + content |
| **Update** a block | `PATCH /blocks/{block_id}` | Replaces entire content of that block in-place; **cannot change type**; children not updatable here |
| **Delete** a block | `DELETE /blocks/{block_id}` | Soft-delete (moves to Trash, restorable via `PATCH /blocks/{id}` with `in_trash: false`) |
| **Append** children | `PATCH /blocks/{id}/children` | Up to 100 per request; `position` parameter: `{type: "end"}`, `{type: "start"}`, `{type: "after_block", after_block: {id}}` |

Key constraints:
- **Type is immutable.** `PATCH /blocks/{id}` returns 400 if you send a body with a different type than the block's current type. A paragraph cannot become a heading in-place; it must be deleted and re-inserted.
- **Update replaces the entire field.** Omitting a sub-field (e.g. `checked` on a `to_do`) preserves the old value, but sending `rich_text` replaces the whole array. There's no way to patch a single rich_text span within a block.
- **Children not updatable via update.** To modify children of a toggle/callout, you must use the append endpoint on that block's ID, or delete+re-append child blocks individually.
- **Delete is recoverable.** Soft-deleted blocks go to Trash and can be restored via `PATCH /blocks/{id}` with `in_trash: false`. This is critical for atomicity reasoning.
- **Append with `position: after_block`** requires the referenced block to currently exist and not be in trash. This constrains operation ordering.

---

## Proposed Algorithm — Surgical Diff-Patch

Instead of blowing away the entire page, compute a minimal edit script from the existing Notion block list to the desired block list, then apply only the necessary operations.

### Why Not Full LCS?

The original proposal suggested a textbook LCS (longest common subsequence) algorithm. On reflection, full LCS is overkill and risky for this use case:

1. **Our blocks have no stable identity across runs.** Desired blocks (from `markdownToBlocks()`) have no IDs — they're generated fresh from markdown. We can't match "this desired paragraph is the same block as existing block `abc123`" except by content similarity.

2. **LCS on content hashes is fragile.** A single character change in a paragraph produces a completely different hash, making it invisible to LCS. A heading being promoted from h3 to h2 changes type, making it invisible too. LCS would see these as delete + insert when update-in-place would be cheaper and preserve the Notion block ID.

3. **Typical edits are local.** When an author syncs content, the common case is: a few blocks modified, maybe one added or removed. Massive reorderings are rare. We should optimize for the common case.

### The Algorithm: Linear Scan with Type Matching

A simpler, more robust approach: scan both lists in parallel, greedily matching blocks by type-compatibility, and classifying each position as keep/update/insert/delete.

```
Two pointers: i (existing), j (desired)

while i < existing.length AND j < desired.length:
  if existing[i].type === desired[j].type:
    if normalized(existing[i]) === normalized(desired[j]):
      emit KEEP(existing[i].id)                          // identical
    else:
      emit UPDATE(existing[i].id, desired[j])             // same type, content changed
    i++; j++
  else:
    # Type mismatch. Look ahead to decide: is this an insert or a delete?
    # Check if desired[j] matches a near-future existing block (→ delete existing[i])
    # Check if existing[i] matches a near-future desired block (→ insert desired[j])
    # If neither: emit REPLACE (delete existing + insert desired), advance both
```

The lookahead window is small (e.g. 3 blocks) — enough to handle a single block being inserted or deleted without cascading misalignment. If the lookahead fails (large structural changes), everything from that point forward is treated as delete-remaining + insert-remaining. This is safe and simple; large structural changes are rare and don't benefit from surgical updates anyway.

### Why This Is Better Than LCS

- **Preserves block IDs maximally.** Same-type blocks at the same position are updated in-place rather than deleted+re-added, even if content changed. This preserves Notion block IDs, comments, and internal references.
- **Simple to implement and debug.** No DP matrix, no backtracking. The algorithm is a single forward pass with a bounded lookahead.
- **Graceful degradation.** When the diff is overwhelming (>50% of blocks changed), `diffBlocks()` can detect this and return `forceFullReplace: true`, falling back to the existing nuke-and-repave (but with the pagination fix).
- **O(n) with small constant.** Lookahead is bounded, so worst case is still linear in block count.

### Phase 1 — Normalize and Diff

Builds on existing `normalizeBlockForDiff()` in `blocks-diff.ts`.

```
existing = [A, B, C, D, E]           (Notion IDs known)
desired  = [A, B', C, F, E]          (no IDs — generated from markdown)

scan:
  i=0 j=0: A.type === A.type, normalized equal     → KEEP(A.id)
  i=1 j=1: B.type === B'.type, normalized differs   → UPDATE(B.id, B')
  i=2 j=2: C.type === C.type, normalized equal       → KEEP(C.id)
  i=3 j=3: D.type ≠ F.type
            lookahead: desired[4]=E matches existing[4]=E (skip 1 existing, 0 desired? No.)
            lookahead: existing[4]=E matches desired[4]=E
            → heuristic: D is not in desired, F is new
            → DELETE(D.id), INSERT(F, after=C.id), don't advance i or j for E yet
  i=4 j=4: E.type === E.type, normalized equal       → KEEP(E.id)

result: [KEEP(A), UPDATE(B,B'), KEEP(C), DELETE(D), INSERT(F,after=C), KEEP(E)]
```

### Phase 2 — Apply Edit Script (Atomicity-Safe Order)

Operations are applied in a specific order that guarantees the page is never in a *subset* state (missing content), only ever in a *superset* state (may have stale duplicates):

**Step 1: Updates** (`PATCH /blocks/{id}`)
- Non-destructive. The page is always coherent during this phase.
- Each update is independent; a failure in one doesn't affect others.
- All updates can theoretically be parallelized (different block IDs), but we run them sequentially to be kind to rate limits.

**Step 2: Inserts** (`PATCH /blocks/{page_id}/children` with `position: after_block`)
- Additive. Even if we crash mid-insert, the page has all original content plus some new blocks — no data loss.
- Inserts must be applied in document order (top to bottom) so each `after_block` reference points to a block that already exists. The edit script is already in document order.
- We batch adjacent inserts into a single append call (up to 100), using `position: after_block` to place them correctly.

**Step 3: Replaces** (for type-changed blocks)
- Each replace is: insert new block at the position of the old block, then delete the old block.
- Done as pairs: insert-then-delete for each replaced block. If we crash after insert but before delete, the page has a duplicate (old + new at same position) — visible but not data loss.

**Step 4: Deletes** (`DELETE /blocks/{id}`)
- Soft-deletes only after all inserts and replaces are committed.
- If interrupted here, the page has extra stale blocks. These are cleaned up on the next sync.
- If deletion of a specific block fails (e.g. 404 because it was already deleted), log and continue.

### Insert Batching

Adjacent inserts can be batched into a single `PATCH /blocks/{page_id}/children` call, which reduces API calls and guarantees ordering:

```
operations: [INSERT(F, after=C), INSERT(G, after=F), INSERT(H, after=G)]
→ batch into: PATCH /blocks/{page_id}/children { children: [F, G, H], position: { type: "after_block", after_block: { id: C.id } } }
```

Non-adjacent inserts (interleaved with keeps/updates) are separate calls. This naturally handles the 100-block limit — if a batch exceeds 100, split it.

### Handling new pages (no existing blocks)

When `existingBlocks` is empty (brand-new page, or first sync), the diff is trivially "insert all". This maps to a single `PATCH /blocks/{page_id}/children` call (chunked at 100), identical to the current append path but without the preceding destructive delete loop.

---

## Data Structures

### BlockFingerprint

```typescript
type BlockFingerprint = {
  id?: string;         // Notion block ID (present for existing, undefined for desired)
  type: string;        // e.g. 'paragraph', 'heading_2'
  normalized: any;     // output of normalizeBlockForDiff()
  hasChildren: boolean;
  raw: any;            // original block (for passing to API calls)
};
```

No hashing needed — we compare normalized forms directly via `JSON.stringify()`, which is what `blocksAreEquivalent()` already does. Hashing adds complexity for no perf benefit at our block counts.

### EditOperation

```typescript
type EditOperation =
  | { op: 'keep';    existingId: string }
  | { op: 'update';  existingId: string; existingType: string; newContent: any }
  | { op: 'insert';  afterId: string | null; block: any }    // null = insert at start
  | { op: 'delete';  existingId: string }
  | { op: 'replace'; existingId: string; newBlock: any };     // type changed
```

### DiffResult

```typescript
type DiffResult = {
  operations:        EditOperation[];
  stats: {
    kept:     number;
    updated:  number;
    inserted: number;
    deleted:  number;
    replaced: number;
  };
  forceFullReplace: boolean;  // true when diff is too large to be worth patching
};
```

---

## New / Modified Files

### `blocks-diff.ts` — extend

Add:
- `fingerprintBlock(block: any): BlockFingerprint`
- `diffBlocks(existing: any[], desired: any[]): DiffResult` — linear scan with lookahead
- `blocksAreEquivalent()` stays as a convenience fast-path (returns `diffBlocks(a,b).stats.updated + inserted + deleted + replaced === 0` internally, or keep the current implementation as a hot-path optimization)

### `client.ts` — modify

- **Fix `getBlocks()` pagination** — immediate bug fix (see Pre-Requisite section)
- **Fix `updatePageBlocks()` delete loop pagination** — same bug
- **Add `patchPageBlocks(pageId, diff)`** — applies diff edit script per the Phase 2 ordering
- **Keep `updatePageBlocks()`** — retained as fallback for `forceFullReplace` and new-page cases, but fixed to paginate

```typescript
async patchPageBlocks(
  pageId: string,
  diff: DiffResult,
): Promise<{ applied: number; failed: number }> {
  // 1. Updates
  for (const op of diff.operations.filter(o => o.op === 'update')) {
    try {
      await this.notion.blocks.update({
        block_id: op.existingId,
        [op.existingType]: op.newContent,
      });
    } catch (e) {
      this.logger.warn({ event: 'patch_update_failed', blockId: op.existingId, error: e.message });
    }
  }

  // 2. Inserts (batched by adjacency)
  // ... batch adjacent inserts, use position: after_block

  // 3. Replaces (insert new, then delete old)
  // ...

  // 4. Deletes
  for (const op of diff.operations.filter(o => o.op === 'delete')) {
    try {
      await this.notion.blocks.delete({ block_id: op.existingId });
    } catch (e) {
      this.logger.warn({ event: 'patch_delete_failed', blockId: op.existingId, error: e.message });
    }
  }
}
```

### `default-hooks.ts` — update `defaultContentSyncHook`

```typescript
// Fetch what's already in Notion (now properly paginated)
const existingBlocks = await notionClient.getBlocks(ctx.page.id);

// Convert markdown to Notion blocks
const newBlocks = convertMarkdownToNotionBlocks(finalContent);

// Compute diff
const diff = diffBlocks(existingBlocks, newBlocks);

if (diff.stats.updated + diff.stats.inserted + diff.stats.deleted + diff.stats.replaced === 0) {
  // Nothing changed
  ctx.logger.debug({ event: 'content_sync_skipped_no_change', pageId, blockCount: newBlocks.length });
  return null;
}

if (diff.forceFullReplace) {
  // Too many changes — full replace is cheaper and more reliable
  ctx.logger.info({ event: 'content_sync_full_replace', pageId, ...diff.stats });
  await notionClient.updatePageBlocks(ctx.page.id, newBlocks);
} else {
  // Surgical patch
  ctx.logger.info({ event: 'content_sync_patch', pageId, ...diff.stats });
  await notionClient.patchPageBlocks(ctx.page.id, diff);
}
```

---

## Edge Cases

### Tables

Tables in Notion are a parent `table` block with `table_row` children. When a table's content changes:
- If row count is the same and cell content changed → we can update individual `table_row` blocks in-place.
- If row count changed → the table block itself hasn't changed type, but its children have. Since `has_children: true`, the conservative path kicks in.

**Decision**: For v1, treat table blocks where children changed as `replace` (delete whole table + re-insert). Tables are rare enough in our content to not warrant recursive diffing yet.

### Equation blocks ($$)

Block math equations (`$$...$$`) become `equation` blocks with an `expression` field. The update API supports updating `expression` in-place. The normalizer already handles this, so `update` operations on equation blocks work out of the box.

### Image blocks

Notion-hosted (`file` type) images have signed URLs that change on every API read. `normalizeBlockForDiff` already returns `{ _file: true }` for these, forcing them to always diff as "changed". For the surgical approach:
- External images: compared by URL, updated in-place if URL changed.
- File images: always treated as "delete + insert" (since we can't meaningfully compare them).

### Empty desired list (content cleared)

If `newBlocks` is empty (author deleted all content), the diff is "delete all existing blocks". This is safe — the page ends up empty, which is the correct state. Unlike the current approach, this happens through controlled delete operations, not an interrupted sequence.

### Notion-side edits between syncs

If someone edits the page directly in Notion between syncs, the next sync will overwrite their changes. This is by design — Notion is the display target, database is the source of truth. The diff just sees different content and emits updates/replaces. No special handling needed.

---

## Rate Limiting Strategy

The current codebase has no rate limit handling at all — 429 responses throw and abort the entire sync. For the surgical approach where we may issue dozens of individual API calls per page, this needs addressing:

- **Per-request retry with backoff.** Wrap each API call in a retry loop: on 429, read the `Retry-After` header (or default to 1s), wait, retry up to 3 times.
- **Global concurrency limit.** Even though operations are sequential per-page, multiple pages may sync in parallel. Use a simple concurrency semaphore (3 concurrent API calls).
- **Graceful degradation.** If retries are exhausted for an operation, log it as a warning and continue to the next operation. The page is left in superset state (safe).

This retry wrapper should be added at the `NotionClient` level, not in the diff application logic.

---

## Rollout Plan

### Phase 0: Bug fixes (ship independently)
1. Fix `getBlocks()` pagination.
2. Fix `updatePageBlocks()` delete loop pagination.
3. Both are one-line fixes with high impact on existing reliability.

### Phase 1: Diff infrastructure
1. Add `fingerprintBlock()` and `diffBlocks()` to `blocks-diff.ts`.
2. Unit tests with fixture data (various edit scenarios).
3. No behavioral change — `blocksAreEquivalent()` can be reimplemented on top of `diffBlocks()` or kept as-is.

### Phase 2: `patchPageBlocks()` 
1. Add the new method to `client.ts`.
2. Integration test: manually sync a known page, verify block IDs are preserved for unchanged blocks.
3. Add retry wrapper for 429s.

### Phase 3: Hook integration
1. Update `defaultContentSyncHook` to use the new path.
2. `forceFullReplace` threshold configurable via `DatabaseBlueprint` (default: 60% of blocks changed).
3. Ship behind a config flag (`syncStrategy: 'patch' | 'replace'`, default `'patch'`) so individual datasources can opt out during rollout.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Linear scan misaligns on content-heavy reorders | `forceFullReplace` threshold catches this; falls back to current approach (but with pagination fix) |
| `PATCH /blocks/{id}` returns 400 on type mismatch (bug in diff logic) | Each operation is try/caught individually; log error and continue; page is left in superset state |
| Rate limiting (429) causes cascading failures | Retry wrapper with exponential backoff; per-operation error isolation |
| Table/nested blocks produce incorrect diffs | Conservative: any block with `has_children` where children may have changed → `replace` the whole subtree |
| Notion API version changes block behavior | Pin `Notion-Version` header; already done in client constructor |
| `position: after_block` references a deleted block | Operation ordering (inserts before deletes) prevents this; `replace` pairs are ordered insert-then-delete |

---

## What This Doesn't Solve

- **Move operations.** A block moved from position 3 to position 7 is treated as delete+insert. The Notion API has no "move block" endpoint, so this is inherent.
- **Deep nested block diffing.** Blocks with children (toggles, callouts, columns) fall back to full replace of that subtree. Recursive diff is a future enhancement.
- **Bidirectional conflict resolution.** If a human edits content in Notion that differs from the source of truth, the next sync overwrites it. This is intentional and tracked separately.
- **Block-level parallelism.** Updates could theoretically be parallelized since they affect independent blocks, but sequential execution is safer for rate limits and debugging. Revisit if sync speed becomes a bottleneck.

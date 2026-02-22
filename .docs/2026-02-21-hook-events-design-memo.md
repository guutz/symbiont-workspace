# Hook Events Design Memo

**Date:** February 21, 2026  
**Status:** DRAFT — for iteration, not implementation  
**Context:** The hook system is built and wired up on `copilot/perform-hook-migration-status`. This memo audits the current `HOOK_EVENTS` definition in `types.ts` and proposes revisions before we lock the API.

---

## Framing: What Symbiont Should Own vs. What California Tech Should Own

Before going event-by-event, the right question is: **what is the invariant core of any Notion→Supabase sync, and what is newspaper-specific?**

### Symbiont Core (built-in defaults make sense here)

These are things every Symbiont site will need regardless of content type:

- Reading title/content from Notion
- Generating and de-duplicating slugs
- Uploading Notion-hosted images to Supabase (they expire)
- Extracting and uploading cover images
- Syncing permanent URLs back to Notion
- Deciding whether a page is published (at minimum: is it in the database?)
- Attaching a date to a page
RIGHT, WE SHOULD DEFINE MORE OFFICIALLY THE ARCHETYPICAL 'PAGE' AND ITS REQUIRED PROPERTIES. TITLE, CONTENT, AUTHOR(S), PUBLISH DATE, SLUG, COVER IMAGE, TAGS, AND OTHER METADATA. THIS DEFINES THE CORE CONTRACT OF THE CMS. NOT SURE WHAT SHOULD BE CONSIDERED METADATA VS. CORE PROPERTIES. FOR EXAMPLE, AUTHOR(S) COULD BE CORE OR METADATA DEPENDING ON THE SITE'S NEEDS. SUMMARY TOO. DATE TOO. ALL OF IT I GUESS TECHNICALLY EXCEPT TITLE AND CONTENT AND SLUG?

### California Tech Specific (belongs in their `hooks: []` config, not in defaults)

- **Issue/volume system** — parsing `"October 21, 2024"` from a select property to derive a publish date. No generic site would need this.
- **Section taxonomy** — mapping Notion section names to route categories.
- **Print layout metadata** — `layout`, `template`, `emphasis` fields for the InDesign pipeline.
- **Featured flag** — editorial "featured article" checkbox.
- **Author name formatting** — whether to use Notion People vs. a multi-select display authors field.
- **Draft/staging exclusion** — excluding pages with a specific status property value.
- **Website Slug passthrough** — reading a manually-set slug property by name. THIS ONE I FEEL LIKE IS A MORE GENERAL USE CASE?

This boundary means Symbiont's defaults should be minimal and correct, not comprehensive. A default that's wrong more than 20% of the time is a trap.

---

## Audit: Current Events

### `page:*` — Page Lifecycle

| Event | Strategy | Current Behavior | Assessment |
|---|---|---|---|
| `page:exclude` | OrAll | Returns false by default | ✅ Correct |
| `page:validate` | AndAll | Returns true by default | ⚠️ See below |

**`page:exclude` vs `page:validate`:** These semantically overlap in a confusing way. Right now:
- `exclude` = "skip this page entirely, don't write to DB"
- `validate` = "this page's data is structurally valid"

The problem: there's no observable difference in behavior today. The transformer presumably skips on both. If they produce the same outcome, having two events is noise. 

**Proposal:** Collapse into a single `page:should-sync` (AndAll → sync if all return true) so the intent is unambiguous. Or, if we keep both, make their effects explicit: `exclude` = don't even attempt, `validate` = attempt but log a warning and skip if invalid. That distinction is meaningful for observability.
YEAH I AM NOT SURE WHERE EXCLUDE VS VALIDATE CAME FROM TBH. SHOULD-SYNC SOUNDS GOOD.

**Missing: `page:before` and `page:after`**

There's no hook that fires at the start and end of processing a single page. This matters for:
- Setting up per-page state that multiple hooks share via `services` (e.g., fetching a related "Issue" page from Notion once, rather than in each metadata hook)
- Teardown / cleanup
- Timing/tracing individual pages

Without these, hooks can't efficiently share expensive Notion API calls.

---

### `metadata:*` — Metadata Extraction

| Event | Strategy | Assessment |
|---|---|---|
| `metadata:title` | FirstWins | ✅ Correct |
| `metadata:tags` | Collect | ✅ Correct |
| `metadata:authors` | Collect | ✅ Correct |
| `metadata:summary` | FirstWins | ✅ Correct |
| `metadata:custom` | Collect (merge objects) | ✅ Correct, but see below |

SEE COMMENT ABOVE

**`metadata:custom` is doing too much work.** Right now it's the escape hatch for everything california-tech cares about: `layout`, `featured`, `issueNumber`, section, print template, etc. This works but:

1. There's no type safety on the `meta` JSONB bag — you get `Record<string, unknown>`
2. There's no way for Symbiont to know what's in `meta`, which limits features like indexing or querying
3. Multiple hooks adding to the same `meta` bag via Collect strategy risks silent key collisions THIS ONE COULD JUST BE SOLVED BY PRIORITY BASED OVERRIDE?

**Missing: `metadata:status`**

Publication status (`draft` | `published` | `scheduled`) is a first-class concept in any CMS. Right now it's handled implicitly via `publish:check` returning false, which excludes the page entirely. But:
- California Tech has articles that are "submitted" or "in review" — they exist in Notion, they shouldn't sync yet, but they also shouldn't be confused with a validation error.
- A `metadata:status` event returning a typed status enum would let the database store drafts as rows with `status = 'draft'`, enabling an editorial preview mode without a separate database.
MY FEELING IS THAT WE DON'T NEED TO CODIFY PUBLICATION STATUS INTO SYMBIONT, IT MAKES MORE SENSE FOR THAT TO LIVE IN NOTION. I LIKE THE UI OF PUBLISH:CHECK AND PUBLISH:DATE HOOKS TO INTERPRET THAT STATUS HOWEVER THEY WANT, SINCE THOSE ARE THE ONES THAT DIRECTLY CONTROL SYMBIONT'S BEHAVIOR. THE USER CAN ADD A STATUS METADATA FIELD IF THEY WANT, BUT I DON'T THINK SYMBIONT NEEDS IT.

**Missing: `metadata:date`**

`publish:date` returns a date, but "publish date" conflates two things:
- `created_at` — when the article was written/first published (often the print issue date for california-tech)
- `updated_at` — when it was last changed (already tracked by Supabase via `updated_at` column)

California-tech parses an issue date from a Notion select property and uses it as both. These should probably be separate columns / separate events. `metadata:date` could return `{ created: string, published: string }` or we just add a `metadata:created-at` event alongside `publish:date`.
SIMILAR COMMENTS AS PREVIOUS. THE INTENTION OF THE PUBLISH:DATE HOOK IS THE TIMESTAMP THE POST SHOULD BE AVAILABLE TO THE PUBLIC. FURTHER DISTINCTIONS BETWEEN CREATED VS PUBLISHED SEEM OUT OF SCOPE FOR SYMBIONT ITSELF, AND MORE A MATTER OF HOW THE USER CHOOSES TO MODEL THEIR NOTION DATABASE AND HOOKS AND METADATA AVAILABLE TO THEIR WEBSITE.

---

### `publish:*` — Publication

| Event | Strategy | Assessment |
|---|---|---|
| `publish:check` | AndAll | ⚠️ See below |
| `publish:date` | FirstWins | ✅ Mostly OK |

**`publish:check` default is too permissive.** The default hook returns `true` for all pages. That means an article a Notion user leaves half-written in the database will sync. Real-world: california-tech already needed to add their own exclude logic for this. Consider making the default check for a standard `Status` or `Published` property if `publishProperty` is configured in `DatabaseBlueprint`. Opt-in defaults are better than opt-out defaults.
PERHAPS THE DEFAULT CAN BE TO SEARCH FOR A PROPERTY OF TYPE STATUS, AND CHECK IF IT'S IN THE COMPLETED CATEGORY OF STATUSES. NOT SURE IF THAT INFO IS AVAILABLE FROM THE NOTION API THOUGH. AND FALLBACK FALSE.

**`publish:date` and iso strings.** The return type is `string` — there's an implicit expectation it's an ISO 8601 string but nothing enforces it. A `Date` union type would at least make the contract explicit.
SURE. DEFAULT VALUE CAN BE THE NOTION PAGE LAST UPDATED TIME.

---

### `slug:*` — Slug Handling

| Event | Strategy | Assessment |
|---|---|---|
| `slug:extract` | FirstWins | ✅ Correct |
| `slug:generate` | FirstWins | ✅ Correct |
| `slug:validate` | AndAll | ⚠️ Questionable |
| `slug:transform` | FirstWins | ⚠️ Questionable |

**`slug:validate` vs `slug:transform`:** These feel like they're solving the same problem in different ways. `transform` processes the slug string; `validate` says whether it's acceptable. But:
- Validate has no way to fix a bad slug — it can only abort the page
- Transform currently has no default implementation (returns null)
- The combination means: the slug is generated, then transformed (if anyone registered a hook), then validated (if anyone registered a hook). The pipeline ordering is unclear.

**Proposal:** Consider merging into a single `slug:finalize` event with a Waterfall strategy (see Pipeline section below) that lets hooks chain transformations, with the final result being the slug. Validation can be a boolean-returning sub-step or just a consequence of the abort mechanism.

**Missing: `slug:conflict`**

When slug de-duplication runs (the `ensureUniqueSlug` function in the transformer), there's no hook to customize what happens. Right now it appends `-2`, `-3`, etc. California-tech might want different behavior (e.g., error instead of silent renaming, or use the Notion page ID as a suffix).

YEAH THIS NEEDS A REWORK. IT IS A BIT TRICKY MAKING SURE THE DATABASE AND THE NOTION PAGE PROPERTY (IF APPLICABLE) STAY IN SYNC. CHECK IF THERE'S ANYTHING IN THE NOTION SLUG FIELD AND SLUGIFY IT IF NECESSARY, OTHERWISE GENERATE ONE FROM THE POST TITLE, THEN CHECK AND FIX CONFLICTS, THEN SYNC BACK THE FINAL SLUG TO NOTION IF NECESSARY.
MY INITIAL APPROACH TO THE NOTION SLUG SYNC WAS THE 'WEBSITE SLUG' FIELD IN THE SYMBIONT CONFIG, OBVIOUSLY THINGS HAVE EVOLVED SINCE THEN, BUT I THINK IN GENERAL IT COULD BE GOOD TO HAVE THOSE HIGHER LEVEL CONFIG OPTIONS THAT MAP TO COMMON HOOK USE CASES. I THINK THE SLUG CONFLICT ONE IS A GOOD EXAMPLE OF THIS. MAYBE IN THE CONFIG YOU CAN SPECIFY 'ON SLUG CONFLICT: ERROR / AUTO-RENAME / USE NOTION ID' OR WHATEVER, AND THEN SYMBIONT REGISTERS THE APPROPRIATE HOOKS UNDER THE HOOD BASED ON THAT SETTING. OR THEY CAN ALSO REGISTER THEIR OWN CUSTOM HOOK IF THEY WANT TO DO SOMETHING MORE COMPLEX.

---

### `content:*` — Content Pipeline

| Event | Strategy | Assessment |
|---|---|---|
| `content:fetch` | FirstWins | ⚠️ Placeholder |
| `content:transform` | FirstWins | ✅ OK |
| `content:images` | RunAll | ❌ Bug |

**`content:fetch` is a well-intentioned placeholder with no pathway.** The comment says "content is fetched by transformer." So this event never fires in the current code. Either wire it in (fetching Notion blocks and converting to markdown happens inside this event) or remove it until it can be properly implemented. A dead event in the public API is worse than no event.
YES I THINK WE'RE GETTING RID OF THIS ENTIRELY. FETCHING CONTENT FROM ANYWHERE ELSE BESIDES NOTION IS OUTSIDE THE SCOPE OF SYMBIONT.

**`content:images` has a strategy mismatch.** The hook returns a modified markdown string (transformed content). But `RunAll` ignores return values — it's for side effects. This is a bug. The image URL substitution result gets discarded. 

The right model for content transformation is a **Waterfall/Pipeline** strategy: output of hook N becomes the input of hook N+1. Neither `FirstWins` nor `RunAll` captures this. `content:transform` and `content:images` are both pipeline steps — one does semantic transforms, one does URL rewriting. They should both be pipeline events.

**Missing: `content:postprocess`**

Post-processing after images are uploaded but before storing: things like stripping Notion artifacts, normalizing whitespace, applying custom markdown extensions. This is currently jammed into `content:transform` (which fires before images) but ideally you want a chance to process after the full content pipeline runs.

I THINK THE MAIN CONTENT HOOKS SHOULD BE CONTENT:TEXT AND CONTENT:MEDIA. POSTPROCESS COULD BE USEFUL TOO, NOT SURE. AND I DO THINK IT SHOULD BE A PIPELINE, THE NOTION PAGEOBJECTRESPONSE GOES IN AND THE FINAL MARKDOWN TO STORE IN THE DATABASE COMES OUT. MORE COMMENTS ON PIPELINE LATER.

---

### `cover:*` — Cover Image

| Event | Strategy | Assessment |
|---|---|---|
| `cover:extract` | FirstWins | ✅ Correct |
| `cover:fallback` | FirstWins | ✅ Correct |
| `cover:process` | RunAll | ❌ Same bug as content:images |

**`cover:process` has the same `RunAll` mismatch.** It returns a URL but `RunAll` ignores return values. The URL transformation result is lost. This needs to be either a `FirstWins` pipeline event or use the new Pipeline strategy.

**The extract/fallback two-step is slightly awkward.** The flow is: run `cover:extract`, if null run `cover:fallback`, then pipe result into `cover:process`. But this means `cover:fallback` is only called if `cover:extract` returns null — is that wired up in the transformer, or does it fall through naturally? Worth making the fallback chaining explicit in docs/comments.

I'M THINKING COVER IMAGE OPERATIONS MIGHT NOT BE A CORE SYMBIONT FEATURE, OR AT LEAST NOT ONE THAT'S ALWAYS ON, SO MAYBE IT CAN BE A BUILTIN HOOK ENABLED VIA CONFIG. AND I THINK IT SHOULD BE UNDER A DIFFERENT HOOK NAME -- SAME STEP AS METADATA EXTRACTION, OR OTHER POST-PROCESSING.

---

### `sync:*` — Write-back to Notion

| Event | Strategy | Assessment |
|---|---|---|
| `sync:slug` | RunAll | ✅ Correct (side effect) |
| `sync:content` | RunAll | ✅ Correct (side effect) |
| `sync:images` | RunAll | ✅ Correct but vestigial |

**`sync:images` is effectively dead code.** The comment says "covered by sync:content and cover:process." This is correct but having a registered default no-op hook that does nothing is confusing. Either remove it or have it serve a real purpose (e.g., deduplicate image upload tracking).

**Missing: `sync:before` and `sync:after`** (database-level, not page-level)

There's no hook for "a full sync run is starting" or "a full sync run just completed." These would be valuable for:
- Invalidating caches (Vercel ISR revalidation, CDN purge) after a sync completes
- Reporting sync results (send a webhook, update a status page)
- Database cleanup (soft-delete pages that were removed from Notion)

Right now all three of these live outside the hook system (or aren't implemented).

CAN DEFINITELY RETHINK THIS. SYNC:IMAGES CAN GO AWAY, OR ELSE HAVE SOME STUFF FROM CONTENT:IMAGES MOVED TO IT, NOT SURE WHAT MAKES THE MOST SENSE. I LIKE THE BEFORE AND AFTER HOOKS, THERES A BUNCH OF EXISTING CODE THAT CAN MOVE INTO THOSE HOOKS TOO. 

---

## The Missing Strategy: Waterfall/Pipeline

The current `CompositionStrategy` enum is missing a critical pattern used by `content:transform` and `content:images`: **sequential pipeline where each hook's output becomes the next hook's input**.

```
// What we want for content processing:
raw_markdown
  → [hook: content:transform] → modified_markdown
  → [hook: content:images] → url_replaced_markdown
  → [hook: content:postprocess] → final_markdown
```

`RunAll` is wrong here (ignores outputs). `FirstWins` is wrong (stops at first result). We need:

```typescript
Pipeline, // Output of hook N becomes input of hook N+1; final hook's output is returned
```

With Pipeline strategy, the initial `input` seeds the chain, and every hook receives the previous hook's output as its `ctx.input`. A hook returning `null` means "pass through unchanged." This is exactly how Express middleware or the Remark plugin pipeline works.

**Affected events that should switch to Pipeline:**
- `content:transform`
- `content:images`
- `cover:process`

DEFINITELY DOWN TO BAKE THE PIPELINE INFRASTRUCTURE IN NOW, IT MAKES THE MOST SENSE FOR ALL HOOKS TO TAKE AN INPUT AND RETURN AN OUTPUT EVEN IF IT'S NULL.

---

## Proposed Revised Event List

This is the proposed revised `HOOK_EVENTS`, annotated with what's new, changed, or removed:

```
// ── Sync Lifecycle ──────────────────────────────────────
sync:before-all          RunAll      NEW - before processing any pages in a run
sync:after-all           RunAll      NEW - after all pages processed (receives SyncResult)

// ── Page Lifecycle ──────────────────────────────────────
page:before              RunAll      NEW - setup before processing a single page
page:should-sync         AndAll      CHANGED - replaces page:exclude + page:validate
page:after               RunAll      NEW - teardown/notification after page processed

// ── Metadata Extraction ──────────────────────────────────
metadata:title           FirstWins   unchanged
metadata:status          FirstWins   NEW - 'draft' | 'published' | 'scheduled' | string
metadata:date            FirstWins   NEW - { created: string, published?: string }
metadata:tags            Collect     unchanged
metadata:authors         Collect     unchanged
metadata:summary         FirstWins   unchanged
metadata:custom          Collect     unchanged (but better scoped: not a dumping ground)

// ── Publishing ────────────────────────────────────────────
publish:check            AndAll      unchanged (may be redundant with metadata:status)
publish:date             FirstWins   unchanged (may be merged into metadata:date)

// ── Slug Pipeline ────────────────────────────────────────
slug:extract             FirstWins   unchanged
slug:generate            FirstWins   unchanged
slug:finalize            Pipeline    CHANGED - replaces slug:validate + slug:transform
slug:conflict            FirstWins   NEW - called when a slug collision is detected

// ── Content Pipeline ─────────────────────────────────────
content:transform        Pipeline    CHANGED strategy from FirstWins to Pipeline
content:images           Pipeline    CHANGED strategy from RunAll to Pipeline
content:postprocess      Pipeline    NEW - final pass after image URLs resolved

// ── Cover Pipeline ───────────────────────────────────────
cover:extract            FirstWins   unchanged
cover:fallback           FirstWins   unchanged
cover:process            Pipeline    CHANGED strategy from RunAll to Pipeline

// ── Notion Write-back ────────────────────────────────────
sync:slug                RunAll      unchanged
sync:content             RunAll      unchanged
// sync:images           REMOVED     vestigial no-op
```

---

## Open Questions for Iteration

1. **`publish:check` + `metadata:status`:** Do we need both? If `metadata:status` returns `'draft'`, the system could automatically skip syncing. `publish:check` becomes redundant. Or keep `publish:check` as the explicit gate and have `metadata:status` merely inform the stored row.

2. **`page:should-sync` vs `page:exclude` + `page:validate`:** Is collapsing them a breaking change we want to make now, or keep backward compat?

3. **`publication:date` vs `metadata:date`:** Are publish date and created date always the same for california-tech (they derive one from the issue)? Or do they need to be tracked separately?

4. **`sync:before-all` / `sync:after-all` input types:** What data should they receive? Probably the list of `PageObjectResponse` to process (before) and the `SyncResult[]` (after).

5. **Pipeline strategy exit condition:** If a Pipeline hook returns `null`, does that mean "pass through" or "abort pipeline"? The natural choice is pass-through (null = identity transform), but we should be explicit. YEAH, NULL SHOULD MEAN PASS-THROUGH, ABORTING CAN BE DONE BY THROWING AN ERROR

6. **`page:before` shared state:** How do hooks share expensive per-page data (e.g., a resolved Issue page fetched from Notion)? The `services` object is the natural place (mutable), but that's a bit loose. Alternatively, `HookContext` could include an `state: Record<string, unknown>` that's per-page and reset between pages. I THINK THIS CAN BE SOLVED WITH THE SAME INFRASTRUCTURE AS THE PIPELINE?

---

## What California Tech's Hooks Would Look Like (Post-Changes)

This is the concrete smoke test — does the revised API let california-tech express everything they need cleanly?

```typescript
hooks: [
  // Exclude pages without a published checkbox
  {
    name: 'caltech:page:should-sync',
    event: 'page:should-sync',
    fn: (ctx) => {
      const status = ctx.page.properties.Status?.select?.name;
      return status === 'Published' || status === 'Approved';
    }
  },

  // Derive publish date from the Issue select property
  {
    name: 'caltech:publish:date',
    event: 'publish:date',
    priority: 'override',
    fn: (ctx) => {
      const issue = ctx.page.properties.Issue?.select?.name;
      if (!issue) return ctx.page.properties['Website Publish Date']?.date?.start ?? null;
      const match = issue.match(/(\w+)\s+(\d+),\s+(\d{4})/);
      if (!match) return null;
      // ... parse and return ISO string
    }
  },

  // Read manually-set slug from Notion property
  {
    name: 'caltech:slug:extract',
    event: 'slug:extract',
    priority: 'override',
    fn: (ctx) => ctx.page.properties['Website Slug']?.rich_text?.[0]?.plain_text?.trim() ?? null
  },

  // Attach newspaper-specific metadata
  {
    name: 'caltech:metadata:custom',
    event: 'metadata:custom',
    fn: (ctx) => ({
      layout: ctx.page.properties.Layout?.select?.name ?? 'standard',
      featured: ctx.page.properties.Featured?.checkbox ?? false,
      issueNumber: ctx.page.properties.Issue?.select?.name ?? null,
      section: ctx.page.properties.Section?.select?.name ?? null,
      printTemplate: ctx.page.properties['Print Template']?.select?.name ?? null,
    })
  },

  // Invalidate Vercel ISR after sync completes
  {
    name: 'caltech:sync:after-all',
    event: 'sync:after-all',
    continueOnError: true,
    fn: async (ctx) => {
      await fetch(`https://api.vercel.com/v1/integrations/deploy/${REVALIDATE_HOOK}`);
    }
  }
]
```

This is clean, legible, and entirely within california-tech's config. No Symbiont internals need to know about issues, sections, or print templates.

---

## Summary of Recommended Changes

| Priority | Change | Reason |
|---|---|---|
| 🔴 Bug | `content:images` → Pipeline strategy | RunAll discards return values |
| 🔴 Bug | `cover:process` → Pipeline strategy | Same issue |
| 🟠 Design | Add `Pipeline` to `CompositionStrategy` | Required for transform chains |
| 🟠 Design | Add `page:before` / `page:after` | Shared state across per-page hooks |
| 🟠 Design | Add `sync:before-all` / `sync:after-all` | Cache invalidation, reporting |
| 🟡 Cleanup | Remove `sync:images` | Registered no-op is confusing |
| 🟡 Cleanup | Wire or remove `content:fetch` | Dead event in current code |
| 🟡 Design | Add `metadata:status` | First-class publication status |
| 🟡 Design | Add `slug:conflict` | Slug collision customization |
| 🟢 Consider | Collapse `page:exclude` + `page:validate` | Eliminate semantic ambiguity |
| 🟢 Consider | Add `metadata:date` | Separate created vs. published date |

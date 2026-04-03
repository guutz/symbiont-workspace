# Publish Check Abstain Semantics Memo

Date: 2026-04-01
Status: Accepted as a tactical change, revisit required
Scope: Hook registry publish flow control and default publish check behavior

## Summary

We changed publish check behavior so datasource-specific hooks can publish content even when the built-in default hook cannot evaluate Notion Status schema.

The new behavior is:
- The default publish check hook returns null (abstain) when it cannot evaluate publish readiness.
- Final publish decision still preserves opt-in behavior by requiring:
  - at least one explicit true vote, and
  - zero false votes.

This keeps dark-by-default behavior when no hook votes true, while allowing explicit datasource overrides such as tech-archives publish hooks.

## Why This Was Done

The archive datasource needed explicit publishing from a custom hook, but the previous default hook returned false when the Notion datasource did not have a Status property available for Symbiont's default publish check.

Because publish check uses AndAll composition, a default false vote blocked publishing even when a datasource hook voted true.

## Tradeoffs

Pros:
- Enables intentional datasource-level publish overrides.
- Preserves opt-in default when all hooks abstain.
- Avoids requiring every datasource to model Notion Status exactly like article workflows.

Cons:
- Adds event-specific logic to AndAll execution for publish check.
- More nuanced semantics than plain boolean AND.
- Increases cognitive load for future maintainers.

## Revisit Criteria

Revisit this change when any of the following happen:
- We add datasource-level policy configuration for publish behavior.
- We refactor hook composition to support first-class abstain-aware voting policies.
- We standardize all production datasources on a single Notion Status schema.

## Revisit Options

Option A: Keep current behavior and document it as official publish-check voting semantics.

Option B: Add explicit config on DatabaseBlueprint, for example:
- publishCheckMode: strict-opt-in | abstain-aware-opt-in

Option C: Revert to strict false defaults and require every datasource to implement compatible Status properties.

## Decision Record

Current decision: keep the tactical abstain-aware opt-in behavior for now due to archive publishing requirements, and revisit when policy configuration work is scheduled.

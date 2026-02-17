# Documentation Hub

This folder is the living knowledge base for the Symbiont CMS workspace. The docs are grouped by intent so you can dive straight to architecture, implementation, or roadmap notes without wading through repetition.

**Note:** All documentation files now use date-prefixed naming (YYYY-MM-DD) for consistency and chronological organization.

## Core Concepts

- **`2025-10-01-symbiont-cms-reference.md`** – System overview, architecture, configuration, and package API surface
- **`2025-09-01-zero-rebuild-cms-vision.md`** – The product vision and phased roadmap toward a zero-rebuild CMS
- **`2026-02-03-implementation-status.md`** – **⭐ Living doc:** Honest tracker of what's shipped vs. designed vs. conceptual

## Implementation Guides

- **`2025-10-01-quickstart.md`** – Minimal steps to boot the workspace against Supabase
- **`2025-10-09-hybrid-strategy.md`** – **⭐ Complete guide:** SvelteKit file types + why Symbiont uses 4-file hybrid rendering
- **`2025-10-01-integration-guide.md`** – How Symbiont wires into QWER, including data transforms and store behaviour
- **`2025-10-01-type-compatibility.md`** – Snapshot of key type mappings and conventions (linked from the integration guide)
- **`2025-10-15-publishing-rules.md`** – Comprehensive guide to `isPublicRule` and `publishDateRule` configuration

## Content Pipeline

- **`2025-10-15-markdown-compatibility.md`** – Supported markdown syntax (Notion/Tiptap → markdown-it rendering)
- **`2025-10-20-feature-detection-architecture.md`** – Design for feature detection at ingestion (Phase 1.5 - partially implemented)
- **`2025-10-25-notion-color-workaround.md`** – Temporary workaround for text colors (until notion-to-md v4)
- **`2026-01-15-notion-to-md-v4-evaluation.md`** – Quick evaluation of notion-to-md v4 features and migration path
- **`2026-02-04-notion-to-md-v4-comprehensive-analysis.md`** – **⭐ Deep dive:** V4 architecture analysis vs. Symbiont's approach (Feb 2026)

## Platform Strategy

- **`2026-01-19-supabase-migration-plan.md`** – Migration strategy from Nhost to Supabase
- **`2026-02-01-supabase-image-strategy.md`** – Image storage implementation with Supabase
- **`2025-12-01-dynamic-file-management.md`** – File storage approach, bucket configuration, and migration phases
- **`2025-12-01-image-optimization-strategy.md`** – Plan for normalizing images into Supabase Storage with size hints
- **`2025-12-15-dynamic-redirects-strategy.md`** – Database-driven redirects, middleware patterns, and analytics follow-up

## Future Designs & Architecture Proposals

- **`2026-02-14-HOOK_SYSTEM_GUIDE.md`** – **✨ Current:** Consolidated hook system design (simplified extractor model)
- **`IMPLEMENTATION_PROMPT_HOOK_SYSTEM.md`** – **🤖 Agent Prompt:** Complete implementation guide for AI agents
- **`2025-12-15-symbiont-cli-design.md`** – Proposed CLI tool for config initialization, validation, and code generation

## Historical / Completed

- **`2025-10-31-symbiont-refactor-memo.md`** – Original refactor planning memo (October 2025)
- **`2025-11-01-alias-column-memo.md`** – Alias column addition to database schema
- **`2025-11-15-refactor-complete.md`** – Refactor completion notes
- **`2025-11-15-schema-update.md`** – Database schema update documentation
- **`2025-12-01-bidirectional-sync-plan.md`** – Plan for two-way sync between Notion and database
- **`2025-10-09-hybrid-implementation.md`** – Hybrid rendering implementation details

## What Changed in This Refresh?

- **Feb 14, 2026:** Hook system simplification and consolidation
  - **Simplified hook model** - Removed ctx.data and ctx.skip(), hooks now return value or null
  - **Hooks are extractors, not transformers** - All hooks read from ctx.page independently
  - **Automatic composition** - Registry handles merging based on return type (primitives: first wins, objects: auto-merge)
  - **Created 2026-02-14-HOOK_SYSTEM_GUIDE.md** - Single consolidated guide replacing 6 separate documents
  - **Created IMPLEMENTATION_PROMPT_HOOK_SYSTEM.md** - Complete 8-week implementation guide for AI agents
  - **Updated hook-system-poc.ts** - Working implementation of simplified model
  - **Deleted old hook docs** - Removed 6 superseded documents (composition guide, refactor memo, etc.)
  - See `.docs/2026-02-14-HOOK_SYSTEM_GUIDE.md` and `.docs/examples/hook-system-poc.ts`
- **Feb 13, 2026:** Hook composition behavior clarification
  - **Added HOOK_COMPOSITION_GUIDE.md** - Comprehensive guide explaining multi-hook behavior patterns
  - **Clarified overwrite vs merge semantics** - Single-value types (last wins) vs object types (explicit merge)
  - **Documented control flow** - skip() vs abort() behavior
  - **Added best practices** - Decision trees, common pitfalls, and examples
  - **Updated hook refactor memo** - Added composition section with key insights
  - See `.docs/2026-02-13-HOOK_COMPOSITION_GUIDE.md`
- **Feb 13, 2026:** File naming standardization + "The Loop" documentation
  - **Renamed all docs** - Now use YYYY-MM-DD prefix for consistency
  - **Added "The Loop" section** - Documented how to query pages/posts in Svelte files
  - **Clarified hook timing** - Hooks run at sync time, not query time
  - See updated `.docs/2026-02-13-hook-based-config-refactor.md`
- **Feb 13, 2026:** Hook-based config architecture proposal
  - **Added comprehensive refactor memo** - 33KB design document for hook-based configuration
  - **Created proof-of-concept code** - Working HookRegistry implementation with examples
  - **Documented migration strategy** - Single-phase breaking change (8 weeks)
  - **Added before/after comparisons** - 6 detailed examples showing benefits
  - **Includes complete type definitions** - Full TypeScript API for hooks system
  - See `.docs/2026-02-13-hook-based-config-refactor.md` and `.docs/examples/`
- **Feb 4, 2026:** notion-to-md v4 comprehensive analysis
  - **Completed comprehensive v4 evaluation** - Full architectural comparison
  - **Added 2026-02-04-notion-to-md-v4-comprehensive-analysis.md** - Feature-by-feature analysis vs. Symbiont
  - **Recommendation: Stay on v3.1.9** - V4 architectural mismatch (file-based vs. database-first)
  - **Identified key differences** - Exporter plugins, frontmatter, media strategies
  - **Score: Symbiont 7, V4 2, Tie 1** - Our custom solutions win in most areas
- **Feb 4, 2026:** Supabase migration completion
  - **Completed Nhost → Supabase migration** - All services migrated
  - **Integrated Martian fork** - markdown-to-notion package added to workspace
  - **Implemented image upload** - Content-hash based filenames with metadata
  - **Updated guutz-blog config** - Matches california-tech structure with symbiont.ts
  - Updated root README, copilot instructions, and .docs references
- **Oct 9, 2025:** Major documentation consolidation
  - **Deleted `rendering-strategy.md`** - Content merged into 2025-10-09-hybrid-strategy.md
  - **Deleted `RENDERING_GUIDE.md`** - SvelteKit reference table merged into 2025-10-09-hybrid-strategy.md
  - **Updated 2025-10-09-hybrid-strategy.md** - Now includes SvelteKit file types reference + complete rendering guide
  - **One source of truth** - All rendering documentation in one place
- **Oct 8, 2025:** Major documentation cleanup and accuracy update
  - Deleted deprecated documents
  - Updated feature-detection-architecture.md with partial implementation status
  - Updated markdown-compatibility.md with current implementation status  
  - Created `2026-02-03-implementation-status.md` for transparent tracking
  - Updated all strategy docs with implementation status banners
  - Clarified Phase 2-3 are designed but not yet implemented
  - Identified gaps: testing, observability, Storage config

---

**Last refreshed:** February 13, 2026

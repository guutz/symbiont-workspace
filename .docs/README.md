# Documentation Hub

This folder is the living knowledge base for the Symbiont CMS workspace. The docs are grouped by intent so you can dive straight to architecture, implementation, or roadmap notes without wading through repetition.

## Core Concepts

- **`symbiont-cms.md`** – System overview, architecture, configuration, and package API surface
- **`zero-rebuild-cms-vision.md`** – The product vision and phased roadmap toward a zero-rebuild CMS
- **`IMPLEMENTATION_STATUS.md`** – **NEW:** Honest tracker of what's shipped vs. designed vs. conceptual

## Implementation Guides

- **`QUICKSTART.md`** – Minimal steps to boot the workspace against Supabase
- **`HYBRID_STRATEGY.md`** – **⭐ Complete guide: SvelteKit file types + why Symbiont uses 4-file hybrid rendering**
- **`INTEGRATION_GUIDE.md`** – How Symbiont wires into QWER, including data transforms and store behaviour
- **`TYPE_COMPATIBILITY.md`** – Snapshot of key type mappings and conventions (linked from the integration guide)
- **`publishing-rules.md`** – Comprehensive guide to `isPublicRule` and `publishDateRule` configuration

## Content Pipeline

- **`markdown-compatibility.md`** – Supported markdown syntax (Notion/Tiptap → markdown-it rendering)
- **`feature-detection-architecture.md`** – Design for feature detection at ingestion (Phase 1.5 - partially implemented)
- **`notion-color-workaround.md`** – Temporary workaround for text colors (until notion-to-md v4)
- **`notion-to-md-v4-evaluation.md`** – Quick evaluation of notion-to-md v4 features and migration path
- **`notion-to-md-v4-comprehensive-analysis.md`** – **⭐ Deep dive: V4 architecture analysis vs. Symbiont's approach (Feb 2026)**

## Platform Strategy

- **`2026-01-19-supabase-migration-plan.md`** – Migration strategy from Nhost to Supabase
- **`2026-02-01-supabase-image-strategy.md`** – Image storage implementation with Supabase
- **`dynamic-file-management.md`** – File storage approach, bucket configuration, and migration phases
- **`image-optimization-strategy.md`** – Plan for normalizing images into Supabase Storage with size hints
- **`dynamic-redirects-strategy.md`** – Database-driven redirects, middleware patterns, and analytics follow-up

## Future Designs & Architecture Proposals

- **`symbiont-cli-design.md`** – Proposed CLI tool for config initialization, validation, and code generation
- **`2026-02-13-hook-based-config-refactor.md`** – **⭐ NEW:** Comprehensive proposal for hook-based configuration system (WordPress-style extensibility)

## What Changed in This Refresh?

- **Feb 13, 2026:** Hook-based config architecture proposal
  - **Added comprehensive refactor memo** - 33KB design document for hook-based configuration
  - **Created proof-of-concept code** - Working HookRegistry implementation with examples
  - **Documented migration strategy** - 4-phase approach maintaining backward compatibility
  - **Added before/after comparisons** - 6 detailed examples showing benefits
  - **Includes complete type definitions** - Full TypeScript API for hooks system
  - See `.docs/2026-02-13-hook-based-config-refactor.md` and `.docs/examples/`
- **Feb 4, 2026:** notion-to-md v4 comprehensive analysis
  - **Completed comprehensive v4 evaluation** - Full architectural comparison
  - **Added notion-to-md-v4-comprehensive-analysis.md** - Feature-by-feature analysis vs. Symbiont
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
  - **Deleted `rendering-strategy.md`** - Content merged into HYBRID_STRATEGY.md (configuration + bandwidth adaptation)
  - **Deleted `RENDERING_GUIDE.md`** - SvelteKit reference table merged into HYBRID_STRATEGY.md
  - **Updated HYBRID_STRATEGY.md** - Now includes SvelteKit file types reference + complete rendering guide
  - **One source of truth** - All rendering documentation in one place
- **Oct 9, 2025:** Split rendering docs into focused guides
  - **Created `HYBRID_STRATEGY.md`** - Focused justification for Symbiont's 4-file approach
  - Separated "why" (strategy/justification) from general reference material
- **Oct 8, 2025:** Major documentation cleanup and accuracy update
  - Deleted `server-side-markdown-rendering-v2.md` (1435 lines, deprecated)
  - Deleted `id-usage-guide.md` (info covered in symbiont-cms.md)
  - Updated feature-detection-architecture.md with partial implementation status
  - Updated markdown-compatibility.md with current implementation status  
  - Created `IMPLEMENTATION_STATUS.md` for transparent tracking
  - Updated all strategy docs with implementation status banners
  - Clarified Phase 2-3 are designed but not yet implemented
  - Identified gaps: testing, observability, Storage config
- Consolidated overlapping guidance and removed deprecated documents
- Folded ID usage notes and type-alignment context into the integration and core docs
- Updated statuses so "implemented" means shipped in the repo as of October 2025

---

**Last refreshed:** February 13, 2026

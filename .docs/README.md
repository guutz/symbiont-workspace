# Documentation Hub

This folder is the living knowledge base for the Symbiont CMS workspace. The docs are grouped by intent so you can dive straight to architecture, implementation, or roadmap notes without wading through repetition.

## Core Concepts

- **`symbiont-cms.md`** – System overview, architecture, configuration, and package API surface
- **`zero-rebuild-cms-vision.md`** – The product vision and phased roadmap toward a zero-rebuild CMS
- **`IMPLEMENTATION_STATUS.md`** – **NEW:** Honest tracker of what's shipped vs. designed vs. conceptual

## Implementation Guides

- **`QUICKSTART.md`** – Minimal steps to boot the workspace against Nhost
- **`HYBRID_STRATEGY.md`** – **⭐ Complete guide: SvelteKit file types + why Symbiont uses 4-file hybrid rendering**
- **`INTEGRATION_GUIDE.md`** – How Symbiont wires into QWER, including data transforms and store behaviour
- **`TYPE_COMPATIBILITY.md`** – Snapshot of key type mappings and conventions (linked from the integration guide)
- **`publishing-rules.md`** – Comprehensive guide to `isPublicRule` and `publishDateRule` configuration

## Content Pipeline

- **`markdown-compatibility.md`** – Supported markdown syntax (Notion/Tiptap → markdown-it rendering)
- **`feature-detection-architecture.md`** – Design for feature detection at ingestion (Phase 1.5 - partially implemented)
- **`notion-color-workaround.md`** – Temporary workaround for text colors (until notion-to-md v4)

## Platform Strategy

- **`dynamic-file-management.md`** – File storage approach, bucket configuration, and migration phases
- **`image-optimization-strategy.md`** – Concrete plan for normalising images into Nhost Storage with size hints
- **`dynamic-redirects-strategy.md`** – Database-driven redirects, middleware patterns, and analytics follow-up

## Future Designs

- **`symbiont-cli-design.md`** – Proposed CLI tool for config initialization, validation, and code generation

## What Changed in This Refresh?

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
  - Identified gaps: testing, observability, Nhost Storage config
- Consolidated overlapping guidance and removed deprecated documents
- Folded ID usage notes and type-alignment context into the integration and core docs
- Updated statuses so "implemented" means shipped in the repo as of October 2025

---

**Last refreshed:** October 9, 2025

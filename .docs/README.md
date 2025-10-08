# Documentation Hub

This folder is the living knowledge base for the Symbiont CMS workspace. The docs are grouped by intent so you can dive straight to architecture, implementation, or roadmap notes without wading through repetition.

## Core Concepts

- **`symbiont-cms.md`** – System overview, architecture, configuration, and package API surface
- **`zero-rebuild-cms-vision.md`** – The product vision and phased roadmap toward a zero-rebuild CMS

## Implementation Guides

- **`QUICKSTART.md`** – Minimal steps to boot the workspace against Nhost
- **`INTEGRATION_GUIDE.md`** – How Symbiont wires into QWER, including data transforms and store behaviour
- **`TYPE_COMPATIBILITY.md`** – Snapshot of key type mappings and conventions (linked from the integration guide)

## Content Pipeline

- **`markdown-compatibility.md`** – Supported syntax, plugins, and testing guidance for Notion/Tiptap content
- **`feature-detection-architecture.md`** – How and where feature flags are derived during ingestion
- **`notion-color-workaround.md`** – Temporary instructions for text colour handling until notion-to-md v4 ships

## Platform Strategy

- **`dynamic-file-management.md`** – File storage approach, bucket configuration, and migration phases
- **`image-optimization-strategy.md`** – Concrete plan for normalising images into Nhost Storage with size hints
- **`dynamic-redirects-strategy.md`** – Database-driven redirects, middleware patterns, and analytics follow-up

## What Changed in This Refresh?

- Consolidated overlapping guidance and removed deprecated documents (for example, the old server-side markdown v2 write-up)
- Folded ID usage notes and type-alignment context into the integration and core docs
- Updated statuses so "implemented" means shipped in the repo as of October 2025

---

**Last refreshed:** October 8, 2025

/**
 * Hook system for Symbiont CMS
 * 
 * Provides a WordPress-inspired extensibility model with:
 * - Lifecycle events for page transformation
 * - Priority-based execution order
 * - Default hooks with sensible behavior
 * - Type-safe hook definitions
 */

export * from './types.js';
export * from './registry.js';
export * from './default-hooks.js';

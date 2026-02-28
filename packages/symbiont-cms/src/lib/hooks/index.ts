/**
 * Hook system for Symbiont CMS
 * 
 * Provides a WordPress-inspired extensibility model with:
 * - Lifecycle events for page transformation
 * - Event-based composition strategies
 * - Default hooks with sensible behavior
 * - Type-safe hook definitions with named priorities
 */

export * from './types.js';
export * from './registry.js';
export * from './default-hooks.js';

/**
 * Tests for slug helper utilities
 */
import { describe, it, expect } from 'vitest';
import { createSlug } from './slug-helpers.js';

describe('slug-helpers', () => {
	describe('createSlug', () => {
		it('should create slug from simple text', () => {
			expect(createSlug('Hello World')).toBe('hello-world');
		});

		it('should handle special characters', () => {
			expect(createSlug('Hello & Goodbye!')).toBe('hello-and-goodbye');
		});

		it('should handle unicode characters', () => {
			expect(createSlug('Café résumé')).toBe('cafe-resume');
		});

		it('should handle numbers', () => {
			expect(createSlug('Test 123')).toBe('test-123');
		});

		it('should remove emoji and special symbols', () => {
			expect(createSlug('Hello 🌍 World ✨')).toBe('hello-world');
		});

		it('should handle multiple spaces', () => {
			expect(createSlug('Hello    World')).toBe('hello-world');
		});

		it('should handle leading/trailing spaces', () => {
			expect(createSlug('  Hello World  ')).toBe('hello-world');
		});

		it('should handle underscores and dashes', () => {
			// slugify with strict mode removes underscores
			expect(createSlug('hello_world-test')).toBe('helloworld-test');
		});

		it('should handle empty string', () => {
			const result = createSlug('');
			expect(result).toBe('');
		});

		it('should handle all special characters', () => {
			expect(createSlug('!!!')).toBe('');
		});

		it('should handle mixed case', () => {
			expect(createSlug('HeLLo WoRLd')).toBe('hello-world');
		});
	});

	// NOTE: generateUniqueSlugSync tests skipped - function moved to PostBuilder class
	// Slug uniqueness is now handled by PostBuilder.ensureUniqueSlug() which queries the database
	// See packages/symbiont-cms/src/lib/server/sync/post-builder.ts
	describe.skip('generateUniqueSlugSync (DEPRECATED)', () => {
		// Tests removed - functionality moved to async database-backed implementation
	});

	describe('slug edge cases', () => {
		it('should handle createSlug with only punctuation', () => {
			expect(createSlug('...')).toBe('');
		});

		it('should handle createSlug with mixed punctuation and text', () => {
			expect(createSlug('Hello... World!!!')).toBe('hello-world');
		});
	});
});

/**
 * Tests for slug helper utilities
 */
import { describe, it, expect } from 'vitest';
import { createSlug, generateUniqueSlugSync } from './slug-helpers.js';

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

	describe('generateUniqueSlugSync', () => {
		it('should return base slug if not used', () => {
			const usedSlugs = new Set(['other-slug']);
			const result = generateUniqueSlugSync('my-slug', usedSlugs, 'page-123');
			expect(result).toBe('my-slug');
		});

		it('should append -2 for first conflict', () => {
			const usedSlugs = new Set(['my-slug']);
			const result = generateUniqueSlugSync('my-slug', usedSlugs, 'page-123');
			expect(result).toBe('my-slug-2');
		});

		it('should append -3 if -2 is also taken', () => {
			const usedSlugs = new Set(['my-slug', 'my-slug-2']);
			const result = generateUniqueSlugSync('my-slug', usedSlugs, 'page-123');
			expect(result).toBe('my-slug-3');
		});

		it('should find first available number', () => {
			const usedSlugs = new Set(['test', 'test-2', 'test-3', 'test-5']);
			const result = generateUniqueSlugSync('test', usedSlugs, 'page-123');
			expect(result).toBe('test-4');
		});

		it('should use page ID fallback after 100 attempts', () => {
			const usedSlugs = new Set<string>();
			// Fill up slots 1-100
			usedSlugs.add('conflict');
			for (let i = 2; i <= 100; i++) {
				usedSlugs.add(`conflict-${i}`);
			}
			
			const pageId = 'abc123def456ghi789';
			const result = generateUniqueSlugSync('conflict', usedSlugs, pageId);
			
			// Should use last 8 chars of page ID (slice(-8) on 18 char string = last 8)
			expect(result).toBe('conflict-56ghi789');
		});

		it('should handle empty used slugs set', () => {
			const usedSlugs = new Set<string>();
			const result = generateUniqueSlugSync('new-slug', usedSlugs, 'page-123');
			expect(result).toBe('new-slug');
		});

		it('should handle slug with existing numbers', () => {
			const usedSlugs = new Set(['post-1']);
			const result = generateUniqueSlugSync('post-1', usedSlugs, 'page-123');
			expect(result).toBe('post-1-2');
		});

		it('should handle very long slugs', () => {
			const longSlug = 'this-is-a-very-long-slug-that-goes-on-and-on';
			const usedSlugs = new Set([longSlug]);
			const result = generateUniqueSlugSync(longSlug, usedSlugs, 'page-123');
			expect(result).toBe(`${longSlug}-2`);
		});

		it('should consistently use same page ID for fallback', () => {
			const usedSlugs = new Set<string>();
			usedSlugs.add('slug');
			for (let i = 2; i <= 100; i++) {
				usedSlugs.add(`slug-${i}`);
			}
			
			const pageId = 'fixed-page-id-12345678';
			const result1 = generateUniqueSlugSync('slug', usedSlugs, pageId);
			const result2 = generateUniqueSlugSync('slug', usedSlugs, pageId);
			
			expect(result1).toBe(result2);
			expect(result1).toBe('slug-12345678');
		});
	});

	describe('slug edge cases', () => {
		it('should handle createSlug with only punctuation', () => {
			expect(createSlug('...')).toBe('');
		});

		it('should handle createSlug with mixed punctuation and text', () => {
			expect(createSlug('Hello... World!!!')).toBe('hello-world');
		});

		it('should handle slug generation with numerical base slugs', () => {
			const usedSlugs = new Set(['123']);
			const result = generateUniqueSlugSync('123', usedSlugs, 'page-abc');
			expect(result).toBe('123-2');
		});
	});
});

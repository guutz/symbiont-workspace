import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveNotionToken } from './env.js';

describe('resolveNotionToken', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		// Create a fresh copy of process.env for each test
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		// Restore original env
		process.env = originalEnv;
	});

	it('should resolve env var name to its value', () => {
		process.env.NOTION_TOKEN = 'secret_from_env';
		
		const result = resolveNotionToken('NOTION_TOKEN', 'test-blog');
		
		expect(result).toBe('secret_from_env');
	});

	it('should resolve custom env var name', () => {
		process.env.MY_CUSTOM_TOKEN = 'secret_custom';
		
		const result = resolveNotionToken('MY_CUSTOM_TOKEN', 'test-blog');
		
		expect(result).toBe('secret_custom');
	});

	it('should use literal value if not an env var', () => {
		const token = 'secret_abc123xyz';
		
		const result = resolveNotionToken(token, 'test-blog');
		
		expect(result).toBe('secret_abc123xyz');
	});

	it('should use default NOTION_TOKEN when omitted', () => {
		process.env.NOTION_TOKEN = 'secret_default';
		
		const result = resolveNotionToken(undefined, 'test-blog');
		
		expect(result).toBe('secret_default');
	});

	it('should throw error when default NOTION_TOKEN missing', () => {
		delete process.env.NOTION_TOKEN;
		
		expect(() => resolveNotionToken(undefined, 'test-blog')).toThrow(
			"Missing notionToken for database 'test-blog'"
		);
	});

	it('should prefer env var over literal when both exist', () => {
		process.env.TOKEN_NAME = 'secret_from_env';
		
		// If user passes 'TOKEN_NAME' and it exists as env var, use env value
		const result = resolveNotionToken('TOKEN_NAME', 'test-blog');
		
		expect(result).toBe('secret_from_env');
	});

	it('should handle empty string by using default', () => {
		process.env.NOTION_TOKEN = 'secret_default';
		
		// Empty string should be treated as omitted, falling back to default
		const result = resolveNotionToken('', 'test-blog');
		
		expect(result).toBe('secret_default');
	});
});

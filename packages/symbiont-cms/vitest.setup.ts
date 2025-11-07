/**
 * Vitest setup file
 * Runs before all tests
 */

// Mock required environment variables
process.env.NHOST_ADMIN_SECRET = 'test-admin-secret';
process.env.NODE_ENV = 'test';

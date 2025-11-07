/**
 * Structured logging utilities for Symbiont CMS
 * 
 * Provides context-aware logging with metrics tracking and log levels.
 * Uses Pino for fast, structured JSON logging.
 * 
 * @example
 * const logger = createLogger({ databaseId: 'blog' });
 * logger.info({ event: 'sync_started', pageCount: 10 });
 * logger.error({ event: 'sync_failed', error: err.message });
 */

import pino from 'pino';
import { readEnvVar } from './env.server.js';

// Default log level (can be overridden by LOG_LEVEL env var)
const LOG_LEVEL = readEnvVar('LOG_LEVEL') || 'info';
const NODE_ENV = readEnvVar('NODE_ENV') || 'development';

/**
 * Base Pino logger instance
 * - In development: pretty-printed colored output
 * - In production: JSON output for log aggregators
 */
export const baseLogger = pino({
	level: LOG_LEVEL,
	...(NODE_ENV === 'development' && {
		transport: {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'HH:MM:ss',
				ignore: 'pid,hostname',
				singleLine: false
			}
		}
	}),
	base: {
		service: 'symbiont-cms',
		env: NODE_ENV
	}
});

/**
 * Context for scoped loggers
 */
export interface LoggerContext {
	/** Database short ID (e.g., 'blog', 'docs') */
	databaseId?: string;
	/** Notion page ID */
	pageId?: string;
	/** Request ID for tracing */
	requestId?: string;
	/** Operation being performed */
	operation?: string;
	/** Additional context fields */
	[key: string]: any;
}

/**
 * Structured logger with context
 */
export interface Logger {
	/** Log debug information (development only) */
	debug(msg: string | object, ...args: any[]): void;
	/** Log informational messages (normal operations) */
	info(msg: string | object, ...args: any[]): void;
	/** Log warnings (recoverable issues) */
	warn(msg: string | object, ...args: any[]): void;
	/** Log errors (failures requiring attention) */
	error(msg: string | object, ...args: any[]): void;
	/** Create a child logger with additional context */
	child(context: LoggerContext): Logger;
}

/**
 * Create a logger with optional context
 * 
 * @param context - Context fields to include in all log entries
 * @returns Logger instance
 * 
 * @example
 * const logger = createLogger({ databaseId: 'blog', operation: 'sync' });
 * logger.info({ event: 'sync_started', pageCount: 10 });
 * // Output: { level: 'info', service: 'symbiont-cms', databaseId: 'blog', operation: 'sync', event: 'sync_started', pageCount: 10 }
 */
export function createLogger(context?: LoggerContext): Logger {
	const childLogger = context ? baseLogger.child(context) : baseLogger;

	return {
		debug(msg: string | object, ...args: any[]): void {
			if (typeof msg === 'string') {
				childLogger.debug(msg, ...args);
			} else {
				childLogger.debug(msg);
			}
		},

		info(msg: string | object, ...args: any[]): void {
			if (typeof msg === 'string') {
				childLogger.info(msg, ...args);
			} else {
				childLogger.info(msg);
			}
		},

		warn(msg: string | object, ...args: any[]): void {
			if (typeof msg === 'string') {
				childLogger.warn(msg, ...args);
			} else {
				childLogger.warn(msg);
			}
		},

		error(msg: string | object, ...args: any[]): void {
			if (typeof msg === 'string') {
				childLogger.error(msg, ...args);
			} else {
				childLogger.error(msg);
			}
		},

		child(childContext: LoggerContext): Logger {
			return createLogger({ ...context, ...childContext });
		}
	};
}

/**
 * Metrics tracker for monitoring sync operations
 */
export class SyncMetrics {
	private startTime: number;
	private pageCount: number = 0;
	private successCount: number = 0;
	private errorCount: number = 0;
	private errors: Array<{ pageId: string; error: string }> = [];

	constructor() {
		this.startTime = Date.now();
	}

	/** Record a successful page sync */
	recordSuccess(): void {
		this.pageCount++;
		this.successCount++;
	}

	/** Record a failed page sync */
	recordError(pageId: string, error: string): void {
		this.pageCount++;
		this.errorCount++;
		this.errors.push({ pageId, error });
	}

	/** Get sync duration in milliseconds */
	getDuration(): number {
		return Date.now() - this.startTime;
	}

	/** Get metrics summary */
	getSummary() {
		return {
			duration_ms: this.getDuration(),
			pages_processed: this.pageCount,
			success_count: this.successCount,
			error_count: this.errorCount,
			success_rate: this.pageCount > 0 ? (this.successCount / this.pageCount) : 1,
			errors: this.errors
		};
	}

	/** Log final metrics */
	logSummary(logger: Logger): void {
		const summary = this.getSummary();
		
		if (summary.error_count > 0) {
			logger.warn({
				event: 'sync_completed_with_errors',
				...summary
			});
		} else {
			logger.info({
				event: 'sync_completed',
				...summary
			});
		}
	}
}

/**
 * Measure execution time of an async operation
 * 
 * @param fn - Async function to measure
 * @returns Object with result and duration
 * 
 * @example
 * const { result, duration } = await measureTime(async () => {
 *   return await fetchFromNotion();
 * });
 * logger.info({ event: 'fetch_completed', duration_ms: duration });
 */
export async function measureTime<T>(
	fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
	const start = Date.now();
	const result = await fn();
	const duration = Date.now() - start;
	return { result, duration };
}

/**
 * Default logger instance (no context)
 * Use createLogger() for context-aware logging
 */
export const logger = createLogger();

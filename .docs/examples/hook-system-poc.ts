/**
 * Proof of Concept: Hook System for Symbiont CMS
 * 
 * This file demonstrates what the hook-based architecture would look like in practice.
 * It's not meant to be production code, but rather a concrete example for discussion.
 */

import type { PageObjectResponse } from '@notionhq/client';

// ============================================
// Type Definitions
// ============================================

export type HookEvent = 
    | 'page:exclude'
    | 'page:validate'
    | 'metadata:title'
    | 'metadata:tags'
    | 'metadata:authors'
    | 'metadata:summary'
    | 'metadata:custom'
    | 'publish:check'
    | 'publish:date'
    | 'slug:extract'
    | 'slug:generate'
    | 'slug:validate'
    | 'slug:transform'
    | 'content:fetch'
    | 'content:transform'
    | 'content:images'
    | 'cover:extract'
    | 'cover:process';

export interface HookContext<T = any> {
    page: PageObjectResponse;
    data: T;
    logger: Logger;
    
    // Control flow
    aborted: boolean;
    abortReason?: string;
    skipped: boolean;
    
    // Methods
    abort: (reason: string) => void;
    skip: () => void;
}

export type HookFunction<TInput = any, TOutput = any> = (
    context: HookContext<TInput>
) => Promise<TOutput> | TOutput;

export interface Hook<TInput = any, TOutput = any> {
    name: string;
    event: HookEvent;
    priority: number;  // Lower runs first (default: 50)
    continueOnError?: boolean;
    fn: HookFunction<TInput, TOutput>;
}

interface Logger {
    debug(data: any): void;
    info(data: any): void;
    warn(data: any): void;
    error(data: any): void;
}

// ============================================
// Hook Registry Implementation
// ============================================

export class HookRegistry {
    private hooks: Map<HookEvent, Hook[]> = new Map();
    private logger: Logger;
    
    constructor(logger: Logger) {
        this.logger = logger;
    }
    
    /**
     * Register a hook
     */
    register(hook: Hook): void {
        const existing = this.hooks.get(hook.event) || [];
        existing.push(hook);
        
        // Sort by priority (lower = earlier)
        existing.sort((a, b) => a.priority - b.priority);
        
        this.hooks.set(hook.event, existing);
        
        this.logger.debug({
            event: 'hook_registered',
            hookName: hook.name,
            hookEvent: hook.event,
            priority: hook.priority,
            totalHooksForEvent: existing.length
        });
    }
    
    /**
     * Register multiple hooks at once
     */
    registerAll(hooks: Hook[]): void {
        for (const hook of hooks) {
            this.register(hook);
        }
    }
    
    /**
     * Unregister a hook by name
     */
    unregister(hookName: string): void {
        for (const [event, hooks] of this.hooks.entries()) {
            const filtered = hooks.filter(h => h.name !== hookName);
            if (filtered.length !== hooks.length) {
                this.hooks.set(event, filtered);
                this.logger.debug({
                    event: 'hook_unregistered',
                    hookName,
                    hookEvent: event
                });
            }
        }
    }
    
    /**
     * Execute all hooks for a given event
     */
    async execute<TInput, TOutput = TInput>(
        event: HookEvent,
        initialContext: {
            page: PageObjectResponse;
            data: TInput;
        }
    ): Promise<TOutput> {
        const hooks = this.hooks.get(event) || [];
        
        if (hooks.length === 0) {
            this.logger.debug({
                event: 'no_hooks_registered',
                hookEvent: event
            });
            return initialContext.data as unknown as TOutput;
        }
        
        this.logger.debug({
            event: 'executing_hooks',
            hookEvent: event,
            hookCount: hooks.length,
            hookNames: hooks.map(h => h.name)
        });
        
        // Create mutable context
        const context: HookContext<any> = {
            page: initialContext.page,
            data: initialContext.data,
            logger: this.logger,
            aborted: false,
            skipped: false,
            abort: (reason: string) => {
                context.aborted = true;
                context.abortReason = reason;
            },
            skip: () => {
                context.skipped = true;
            }
        };
        
        // Execute hooks in priority order
        for (const hook of hooks) {
            if (context.aborted) {
                this.logger.warn({
                    event: 'hook_execution_aborted',
                    hookEvent: event,
                    hookName: hook.name,
                    reason: context.abortReason
                });
                throw new Error(`Hook execution aborted: ${context.abortReason}`);
            }
            
            try {
                this.logger.debug({
                    event: 'executing_hook',
                    hookName: hook.name,
                    hookEvent: event,
                    priority: hook.priority
                });
                
                const output = await hook.fn(context);
                
                // Handle skip
                if (context.skipped) {
                    this.logger.debug({
                        event: 'hook_skipped',
                        hookName: hook.name
                    });
                    context.skipped = false;  // Reset for next hook
                    continue;
                }
                
                // Update context data for next hook
                context.data = output;
                
                this.logger.debug({
                    event: 'hook_executed',
                    hookName: hook.name,
                    hookEvent: event
                });
                
            } catch (error: any) {
                this.logger.error({
                    event: 'hook_execution_failed',
                    hookName: hook.name,
                    hookEvent: event,
                    error: error?.message,
                    stack: error?.stack
                });
                
                if (!hook.continueOnError) {
                    throw error;
                }
            }
        }
        
        return context.data as TOutput;
    }
    
    /**
     * Get all hooks for an event
     */
    getHooks(event: HookEvent): Hook[] {
        return [...(this.hooks.get(event) || [])];
    }
    
    /**
     * Clear all hooks
     */
    clear(): void {
        this.hooks.clear();
    }
    
    /**
     * Get all registered events
     */
    getEvents(): HookEvent[] {
        return Array.from(this.hooks.keys());
    }
}

// ============================================
// Default Hooks (Shipped with Symbiont)
// ============================================

export function createDefaultHooks(): Hook[] {
    return [
        // Publishing: Default to always publish
        {
            name: 'symbiont:publish:check:default',
            event: 'publish:check',
            priority: 50,
            fn: async (ctx) => true
        },
        
        // Publishing: Use last_edited_time by default
        {
            name: 'symbiont:publish:date:default',
            event: 'publish:date',
            priority: 50,
            fn: async (ctx) => ctx.page.last_edited_time
        },
        
        // Slug: No custom slug by default
        {
            name: 'symbiont:slug:extract:default',
            event: 'slug:extract',
            priority: 50,
            fn: async (ctx) => null
        },
        
        // Slug: Generate from title
        {
            name: 'symbiont:slug:generate:default',
            event: 'slug:generate',
            priority: 50,
            fn: async (ctx) => {
                // Simple slug generation (in real code, use createSlug utility)
                const title = ctx.data.title || 'untitled';
                return title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '');
            }
        },
        
        // Metadata: Return empty object by default
        {
            name: 'symbiont:metadata:custom:default',
            event: 'metadata:custom',
            priority: 50,
            fn: async (ctx) => ctx.data || {}
        }
    ];
}

// ============================================
// Example: California Tech Hooks
// ============================================

export function createCalTechHooks(): Hook[] {
    return [
        // Custom publish date logic
        {
            name: 'caltech:publish:date:issue-based',
            event: 'publish:date',
            priority: 40,  // Run before default
            fn: async (ctx) => {
                // Try to get date from Issue property
                const issue = ctx.page.properties.Issue?.select?.name;
                if (issue) {
                    // Parse "October 21, 2024" format
                    const match = issue.match(/(\w+)\s+(\d+),\s+(\d{4})/);
                    if (match) {
                        const [_, month, day, year] = match;
                        const date = new Date(`${month} ${day}, ${year}`);
                        if (!isNaN(date.getTime())) {
                            return date.toISOString();
                        }
                    }
                }
                
                // Try Website Publish Date property
                const websiteDate = ctx.page.properties['Website Publish Date']?.date?.start;
                if (websiteDate) {
                    return new Date(websiteDate).toISOString();
                }
                
                // Fall back to default hook
                ctx.skip();
                return ctx.data;
            }
        },
        
        // Custom slug from property
        {
            name: 'caltech:slug:extract:custom-property',
            event: 'slug:extract',
            priority: 40,
            fn: async (ctx) => {
                const slugProperty = ctx.page.properties['Website Slug']?.rich_text;
                const slug = slugProperty?.[0]?.plain_text?.trim();
                return slug || null;
            }
        },
        
        // Custom metadata extraction
        {
            name: 'caltech:metadata:layout',
            event: 'metadata:custom',
            priority: 50,
            fn: async (ctx) => ({
                ...ctx.data,
                layout: ctx.page.properties.Layout?.select?.name || 'standard',
                featured: ctx.page.properties.Featured?.checkbox || false,
                issueNumber: ctx.page.properties.Issue?.select?.name
            })
        }
    ];
}

// ============================================
// Example: Debug Hooks
// ============================================

export function createDebugHooks(): Hook[] {
    return [
        // Log all properties for debugging
        {
            name: 'debug:log-properties',
            event: 'metadata:custom',
            priority: 1,  // Run first
            fn: async (ctx) => {
                ctx.logger.debug({
                    event: 'page_properties_debug',
                    pageId: ctx.page.id,
                    propertyNames: Object.keys(ctx.page.properties),
                    properties: ctx.page.properties
                });
                return ctx.data;  // Pass through unchanged
            }
        },
        
        // Validate URLs in metadata
        {
            name: 'debug:validate-urls',
            event: 'metadata:custom',
            priority: 99,  // Run last
            fn: async (ctx) => {
                const data = ctx.data as Record<string, any>;
                
                // Check for invalid URLs
                for (const [key, value] of Object.entries(data)) {
                    if (typeof value === 'string' && value.startsWith('http')) {
                        try {
                            new URL(value);
                        } catch {
                            ctx.logger.warn({
                                event: 'invalid_url_detected',
                                pageId: ctx.page.id,
                                field: key,
                                url: value
                            });
                        }
                    }
                }
                
                return data;
            }
        }
    ];
}

// ============================================
// Usage Example
// ============================================

async function exampleUsage() {
    // Create logger (stub)
    const logger: Logger = {
        debug: (data) => console.log('[DEBUG]', data),
        info: (data) => console.log('[INFO]', data),
        warn: (data) => console.warn('[WARN]', data),
        error: (data) => console.error('[ERROR]', data)
    };
    
    // Create registry
    const registry = new HookRegistry(logger);
    
    // Register default hooks
    registry.registerAll(createDefaultHooks());
    
    // Register California Tech custom hooks
    registry.registerAll(createCalTechHooks());
    
    // Register debug hooks (only in dev mode)
    if (process.env.NODE_ENV === 'development') {
        registry.registerAll(createDebugHooks());
    }
    
    // Example page object (simplified)
    const mockPage = {
        id: 'page-123',
        last_edited_time: '2026-02-13T00:00:00.000Z',
        properties: {
            'Issue': {
                select: { name: 'October 21, 2024' }
            },
            'Website Slug': {
                rich_text: [
                    { plain_text: 'my-custom-article-slug' }
                ]
            },
            'Layout': {
                select: { name: 'feature' }
            },
            'Featured': {
                checkbox: true
            }
        }
    } as any as PageObjectResponse;
    
    // Execute publish:date hooks
    const publishDate = await registry.execute<null, string>('publish:date', {
        page: mockPage,
        data: null
    });
    
    console.log('Publish Date:', publishDate);
    // Expected: "2024-10-21T00:00:00.000Z" (from Issue property)
    
    // Execute slug:extract hooks
    const extractedSlug = await registry.execute<null, string | null>('slug:extract', {
        page: mockPage,
        data: null
    });
    
    console.log('Extracted Slug:', extractedSlug);
    // Expected: "my-custom-article-slug"
    
    // Execute slug:generate hooks (if no extracted slug)
    if (!extractedSlug) {
        const generatedSlug = await registry.execute<{ title: string }, string>('slug:generate', {
            page: mockPage,
            data: { title: 'My Article Title' }
        });
        console.log('Generated Slug:', generatedSlug);
    }
    
    // Execute metadata:custom hooks
    const metadata = await registry.execute<Record<string, any>, Record<string, any>>('metadata:custom', {
        page: mockPage,
        data: {}
    });
    
    console.log('Custom Metadata:', metadata);
    // Expected: { layout: 'feature', featured: true, issueNumber: 'October 21, 2024' }
}

// ============================================
// Testing Hook Priorities
// ============================================

async function testHookPriorities() {
    const logger: Logger = {
        debug: (data) => console.log('[DEBUG]', data),
        info: (data) => console.log('[INFO]', data),
        warn: (data) => console.warn('[WARN]', data),
        error: (data) => console.error('[ERROR]', data)
    };
    
    const registry = new HookRegistry(logger);
    
    // Register hooks with different priorities
    registry.register({
        name: 'priority-10',
        event: 'metadata:custom',
        priority: 10,
        fn: async (ctx) => {
            console.log('Running priority 10');
            return { ...ctx.data, step1: 'priority-10' };
        }
    });
    
    registry.register({
        name: 'priority-50',
        event: 'metadata:custom',
        priority: 50,
        fn: async (ctx) => {
            console.log('Running priority 50');
            return { ...ctx.data, step2: 'priority-50' };
        }
    });
    
    registry.register({
        name: 'priority-30',
        event: 'metadata:custom',
        priority: 30,
        fn: async (ctx) => {
            console.log('Running priority 30');
            return { ...ctx.data, step3: 'priority-30' };
        }
    });
    
    const mockPage = {
        id: 'test-page',
        last_edited_time: '2026-02-13T00:00:00.000Z',
        properties: {}
    } as any as PageObjectResponse;
    
    const result = await registry.execute('metadata:custom', {
        page: mockPage,
        data: {}
    });
    
    console.log('Result:', result);
    // Expected: { step1: 'priority-10', step3: 'priority-30', step2: 'priority-50' }
    // Execution order: 10 → 30 → 50
}

// ============================================
// Testing Skip and Abort
// ============================================

async function testControlFlow() {
    const logger: Logger = {
        debug: (data) => console.log('[DEBUG]', data),
        info: (data) => console.log('[INFO]', data),
        warn: (data) => console.warn('[WARN]', data),
        error: (data) => console.error('[ERROR]', data)
    };
    
    const registry = new HookRegistry(logger);
    
    // Hook that skips
    registry.register({
        name: 'skip-if-no-data',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            if (!ctx.page.properties.CustomDate) {
                console.log('No custom date, skipping to next hook');
                ctx.skip();
                return null;
            }
            return ctx.page.properties.CustomDate.date.start;
        }
    });
    
    // Default hook
    registry.register({
        name: 'default-date',
        event: 'publish:date',
        priority: 50,
        fn: async (ctx) => {
            console.log('Using default date');
            return ctx.page.last_edited_time;
        }
    });
    
    const mockPage = {
        id: 'test-page',
        last_edited_time: '2026-02-13T00:00:00.000Z',
        properties: {}
    } as any as PageObjectResponse;
    
    const result = await registry.execute('publish:date', {
        page: mockPage,
        data: null
    });
    
    console.log('Publish Date:', result);
    // Expected: "2026-02-13T00:00:00.000Z" (from default hook after skip)
}

// Run examples if this file is executed directly
if (require.main === module) {
    console.log('=== Example Usage ===');
    exampleUsage().catch(console.error);
    
    console.log('\n=== Testing Hook Priorities ===');
    testHookPriorities().catch(console.error);
    
    console.log('\n=== Testing Control Flow ===');
    testControlFlow().catch(console.error);
}

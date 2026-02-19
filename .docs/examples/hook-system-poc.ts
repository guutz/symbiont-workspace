/**
 * Proof of Concept: Hook System for Symbiont CMS
 * 
 * SIMPLIFIED MODEL (Feb 14, 2026):
 * - Hooks are pure extractors that read from ctx.page
 * - Return your value, or null if you have nothing to contribute
 * - No ctx.data, no ctx.skip() - registry handles composition automatically
 * - Primitives: first non-null wins (stop early)
 * - Objects: merge all non-null results
 * - Booleans: AND all results
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

export interface HookContext {
    page: PageObjectResponse;
    logger: Logger;
    
    // Control flow
    aborted: boolean;
    abortReason?: string;
    
    // Methods
    abort: (reason: string) => void;
}

export type HookFunction<TOutput = any> = (
    context: HookContext
) => Promise<TOutput | null> | TOutput | null;

export interface Hook<TOutput = any> {
    name: string;
    event: HookEvent;
    priority: number;  // Lower runs first (default: 50)
    continueOnError?: boolean;
    fn: HookFunction<TOutput>;
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
     * 
     * Composition rules:
     * - Primitives (string, number, Date, boolean): First non-null wins
     * - Objects: Merge all non-null results
     * - Arrays: Concatenate all non-null results
     */
    async execute<TOutput = any>(
        event: HookEvent,
        page: PageObjectResponse
    ): Promise<TOutput | null> {
        const hooks = this.hooks.get(event) || [];
        
        if (hooks.length === 0) {
            this.logger.debug({
                event: 'no_hooks_registered',
                hookEvent: event
            });
            return null;
        }
        
        this.logger.debug({
            event: 'executing_hooks',
            hookEvent: event,
            hookCount: hooks.length,
            hookNames: hooks.map(h => h.name)
        });
        
        // Create mutable context
        const context: HookContext = {
            page: page,
            logger: this.logger,
            aborted: false,
            abort: (reason: string) => {
                context.aborted = true;
                context.abortReason = reason;
            }
        };
        
        let result: any = null;
        let resultType: 'primitive' | 'object' | 'array' | null = null;
        
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
                
                // Skip null results
                if (output === null || output === undefined) {
                    this.logger.debug({
                        event: 'hook_returned_null',
                        hookName: hook.name
                    });
                    continue;
                }
                
                // Determine result type on first non-null output
                if (resultType === null) {
                    if (Array.isArray(output)) {
                        resultType = 'array';
                    } else if (typeof output === 'object') {
                        resultType = 'object';
                    } else {
                        resultType = 'primitive';
                    }
                }
                
                // Compose based on type
                if (resultType === 'primitive') {
                    // First non-null wins, stop processing
                    result = output;
                    this.logger.debug({
                        event: 'hook_executed_first_wins',
                        hookName: hook.name,
                        stoppingEarly: true
                    });
                    break;
                } else if (resultType === 'object') {
                    // Merge objects
                    result = { ...result, ...output };
                    this.logger.debug({
                        event: 'hook_executed_merged',
                        hookName: hook.name
                    });
                } else if (resultType === 'array') {
                    // Concatenate arrays
                    result = result === null ? output : [...result, ...output];
                    this.logger.debug({
                        event: 'hook_executed_concatenated',
                        hookName: hook.name
                    });
                }
                
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
        
        return result;
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
        
        // Slug: No custom slug by default (returns null)
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
                // Note: In practice, title would come from another hook's result
                // or be extracted directly from ctx.page here
                const titleProp = ctx.page.properties.Title || ctx.page.properties.Name;
                const title = (titleProp as any)?.title?.[0]?.plain_text || 'untitled';
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
            fn: async (ctx) => ({})
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
                const issue = (ctx.page.properties.Issue as any)?.select?.name;
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
                const websiteDate = (ctx.page.properties['Website Publish Date'] as any)?.date?.start;
                if (websiteDate) {
                    return new Date(websiteDate).toISOString();
                }
                
                // Return null to fall through to default hook
                return null;
            }
        },
        
        // Custom slug from property
        {
            name: 'caltech:slug:extract:custom-property',
            event: 'slug:extract',
            priority: 40,
            fn: async (ctx) => {
                const slugProperty = (ctx.page.properties['Website Slug'] as any)?.rich_text;
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
                layout: (ctx.page.properties.Layout as any)?.select?.name || 'standard',
                featured: (ctx.page.properties.Featured as any)?.checkbox || false,
                issueNumber: (ctx.page.properties.Issue as any)?.select?.name
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
                // Return empty object, will be merged with later hooks
                return {};
            }
        },
        
        // Validate that URLs in page properties are valid
        {
            name: 'debug:validate-page-urls',
            event: 'metadata:custom',
            priority: 99,  // Run last to see accumulated metadata
            fn: async (ctx) => {
                // Check properties for URL fields
                for (const [key, prop] of Object.entries(ctx.page.properties)) {
                    if (prop.type === 'url' && prop.url) {
                        try {
                            new URL(prop.url);
                        } catch {
                            ctx.logger.warn({
                                event: 'invalid_url_detected',
                                pageId: ctx.page.id,
                                field: key,
                                url: prop.url
                            });
                        }
                    }
                }
                
                // Return empty - this is just validation
                return {};
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
    const publishDate = await registry.execute<string>('publish:date', mockPage);
    
    console.log('Publish Date:', publishDate);
    // Expected: "2024-10-21T00:00:00.000Z" (from Issue property)
    
    // Execute slug:extract hooks
    const extractedSlug = await registry.execute<string>('slug:extract', mockPage);
    
    console.log('Extracted Slug:', extractedSlug);
    // Expected: "my-custom-article-slug"
    
    // Execute slug:generate hooks (if no extracted slug)
    if (!extractedSlug) {
        const generatedSlug = await registry.execute<string>('slug:generate', mockPage);
        console.log('Generated Slug:', generatedSlug);
    }
    
    // Execute metadata:custom hooks
    const metadata = await registry.execute<Record<string, any>>('metadata:custom', mockPage);
    
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
            return { step1: 'priority-10' };
        }
    });
    
    registry.register({
        name: 'priority-50',
        event: 'metadata:custom',
        priority: 50,
        fn: async (ctx) => {
            console.log('Running priority 50');
            return { step2: 'priority-50' };
        }
    });
    
    registry.register({
        name: 'priority-30',
        event: 'metadata:custom',
        priority: 30,
        fn: async (ctx) => {
            console.log('Running priority 30');
            return { step3: 'priority-30' };
        }
    });
    
    const mockPage = {
        id: 'test-page',
        last_edited_time: '2026-02-13T00:00:00.000Z',
        properties: {}
    } as any as PageObjectResponse;
    
    const result = await registry.execute('metadata:custom', mockPage);
    
    console.log('Result:', result);
    // Expected: { step1: 'priority-10', step3: 'priority-30', step2: 'priority-50' }
    // Execution order: 10 → 30 → 50 (all merged together)
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
    
    // Hook that returns null if no custom date
    registry.register({
        name: 'custom-date-if-available',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            if (!ctx.page.properties.CustomDate) {
                console.log('No custom date, returning null');
                return null;  // Falls through to next hook
            }
            return (ctx.page.properties.CustomDate as any)?.date?.start;
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
    
    const result = await registry.execute('publish:date', mockPage);
    
    console.log('Publish Date:', result);
    // Expected: "2026-02-13T00:00:00.000Z" (from default hook, since custom returned null)
}

// ============================================
// Testing Hook Composition Patterns
// ============================================

async function testHookComposition() {
    const logger: Logger = {
        debug: (data) => console.log('[DEBUG]', data),
        info: (data) => console.log('[INFO]', data),
        warn: (data) => console.warn('[WARN]', data),
        error: (data) => console.error('[ERROR]', data)
    };
    
    console.log('\n--- Pattern 1: Single-Value (First Non-Null Wins) ---');
    const registry1 = new HookRegistry(logger);
    
    // First hook sets a date
    registry1.register({
        name: 'custom-date',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            console.log('Custom date hook: Setting to Jan 1, 2026');
            return '2026-01-01T00:00:00.000Z';
        }
    });
    
    // Second hook would set different date, but won't run
    registry1.register({
        name: 'default-date',
        event: 'publish:date',
        priority: 50,
        fn: async (ctx) => {
            console.log('Default date hook: This should NOT run!');
            return '2026-02-13T00:00:00.000Z';
        }
    });
    
    const mockPage = {
        id: 'test-page',
        last_edited_time: '2026-02-13T00:00:00.000Z',
        properties: {}
    } as any as PageObjectResponse;
    
    const result1 = await registry1.execute('publish:date', mockPage
    );
    console.log('Result (first wins):', result1);
    // Expected: "2026-01-01T00:00:00.000Z" (first non-null, second never runs!)
    
    console.log('\n--- Pattern 2: Single-Value with Null Fallback ---');
    const registry2 = new HookRegistry(logger);
    
    // First hook returns null if no custom data
    registry2.register({
        name: 'custom-date-conditional',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            const custom = ctx.page.properties.CustomDate;
            if (!custom) {
                console.log('Custom date hook: No custom date, returning null');
                return null;  // Falls through to next hook
            }
            return (custom as any)?.date?.start;
        }
    });
    
    // Second hook runs because first returned null
    registry2.register({
        name: 'default-date-fallback',
        event: 'publish:date',
        priority: 50,
        fn: async (ctx) => {
            console.log('Default date hook: Using fallback date');
            return '2026-02-13T00:00:00.000Z';
        }
    });
    
    const result2 = await registry2.execute('publish:date', mockPage);
    console.log('Result (after null):', result2);
    // Expected: "2026-02-13T00:00:00.000Z" (first returned null, second runs)
    
    console.log('\n--- Pattern 3: Object Auto-Merge ---');
    const registry3 = new HookRegistry(logger);
    
    // First hook returns partial metadata
    registry3.register({
        name: 'meta-layout',
        event: 'metadata:custom',
        priority: 30,
        fn: async (ctx) => {
            console.log('Layout hook: Setting layout and featured');
            return {
                layout: 'blog',
                featured: true
            };
        }
    });
    
    // Second hook returns more metadata - auto-merged!
    registry3.register({
        name: 'meta-seo',
        event: 'metadata:custom',
        priority: 40,
        fn: async (ctx) => {
            console.log('SEO hook: Adding SEO fields (auto-merged by registry)');
            return {
                // No ...ctx.data needed! Registry merges automatically
                ogImage: 'https://example.com/og.jpg',
                keywords: ['tech', 'blog']
            };
        }
    });
    
    // Third hook adds computed fields - also auto-merged!
    registry3.register({
        name: 'meta-computed',
        event: 'metadata:custom',
        priority: 50,
        fn: async (ctx) => {
            console.log('Computed hook: Adding word count (auto-merged by registry)');
            return {
                // No ...ctx.data needed!
                wordCount: 1234,
                readingTime: 7
            };
        }
    });
    
    const result3 = await registry3.execute('metadata:custom', mockPage);
    console.log('Result (auto-merged):', JSON.stringify(result3, null, 2));
    // Expected: { layout: 'blog', featured: true, ogImage: '...', keywords: [...], wordCount: 1234, readingTime: 7 }
    // All merged automatically by registry!
    
    console.log('\n--- Pattern 4: Null Filtering ---');
    const registry4 = new HookRegistry(logger);
    
    registry4.register({
        name: 'meta-sometimes-empty',
        event: 'metadata:custom',
        priority: 30,
        fn: async (ctx) => {
            console.log('Sometimes empty hook: Returning null');
            return null;  // This hook contributes nothing
        }
    });
    
    registry4.register({
        name: 'meta-actual-data',
        event: 'metadata:custom',
        priority: 40,
        fn: async (ctx) => {
            console.log('Actual data hook: Returning data');
            return {
                layout: 'blog'
            };
        }
    });
    
    const result4 = await registry4.execute('metadata:custom', mockPage);
    console.log('Result (nulls ignored):', JSON.stringify(result4, null, 2));
    // Expected: { layout: 'blog' } ← First hook's null was ignored
}

// Run examples if this file is executed directly (ESM version)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
    console.log('=== Example Usage ===');
    exampleUsage().catch(console.error);
    
    console.log('\n=== Testing Hook Priorities ===');
    testHookPriorities().catch(console.error);
    
    console.log('\n=== Testing Control Flow ===');
    testControlFlow().catch(console.error);
    
    console.log('\n=== Testing Hook Composition Patterns ===');
    testHookComposition().catch(console.error);
}

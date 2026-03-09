import type { PageObjectResponse } from '@notionhq/client';
import type { Database } from './database.types.js';
import type { Hook } from './hooks/types.js';

// Re-export the PageObjectResponse type for easier access
export type { PageObjectResponse };

/**
 * Defines a map of HTML tag names to CSS class strings.
 * This is used by the Renderer component to allow for custom styling
 * of the generated HTML elements.
 *
 * @example
 * const myTheme: ClassMap = {
 *   h1: 'text-4xl font-bold',
 *   p: 'mb-4',
 *   a: 'text-blue-500 hover:underline'
 * };
 */
export type ClassMap = {
    h1?: string;
    h2?: string;
    h3?: string;
    h4?: string;
    h5?: string;
    h6?: string;
    p?: string;
    a?: string;
    ul?: string;
    ol?: string;
    li?: string;
    blockquote?: string;
    code?: string;
    pre?: string;
    hr?: string;
    table?: string;
    thead?: string;
    tbody?: string;
    tr?: string;
    th?: string;
    td?: string;
    // Allows any other string key for extensibility with custom elements or plugins
    [key: string]: string | undefined;
};

/**
 * Table of contents item with nested structure.
 * Generated during markdown processing for navigation.
 */
export interface TocItem {
    id: string;         // Heading ID for anchor links (e.g., 'getting-started')
    text: string;       // Heading text content
    level: number;      // Heading level (1-6)
    children?: TocItem[]; // Nested headings
}



/**
 * Raw database page structure.
 * Derived from Supabase-generated types for the `pages` table.
 * 
 * This ensures type safety between the database schema and our TypeScript code.
 * 
 * NOTE: The database schema is intentionally fixed and should NOT be customized.
 * Use the `meta` JSONB field for custom data instead of modifying the schema.
 * The `database.types.ts` file is bundled with the package and should not be overridden.
 */
type DatabasePageRaw = Database['public']['Tables']['pages']['Row'];

/**
 * Refined database page type with properly typed JSONB fields.
 * 
 * Narrows the broad Supabase `Json` type to our actual data structures:
 * - tags: string[] (array of tag names)
 * - authors: string[] (array of author names)
 * - meta: Record<string, any> (flexible metadata object)
 * - cover: string (cover image URL) - schema debt: should be dedicated column, currently in meta
 */
export interface DatabasePage extends Omit<DatabasePageRaw, 'tags' | 'authors' | 'meta'> {
	tags: string[] | null;
	authors: string[] | null;
	meta: Record<string, any> | null;
}

/**
 * Enhanced page structure for website rendering.
 * Extends DatabasePage with computed/rendered fields for UI consumption.
 * This is the "sugared-up" version sent to +page.svelte components.
 * 
 * Extended to be compatible with QWER post type for seamless integration.
 */
export interface WebsitePage extends Omit<DatabasePage, 'page_id' | 'datasource_id' | 'datasource_alias' | 'updated_at'> {
    // Make database fields optional for flexibility
    page_id?: string;
    datasource_id?: string;
    datasource_alias?: string;
    updated_at?: string | null;

    /** Pre-rendered HTML from summary markdown (populated by postsLoad) */
    summary_html?: string;
    description?: string;
    language?: string;

    // Allow any other properties from your schema
    [key: string]: any;
}

/**
 * Database configuration blueprint.
 * Contains both public data (alias) and private server-only data (dataSourceId, notionToken, rules).
 * Used in symbiont.config.js.
 */
export interface DatabaseBlueprint {
    // ============================================
    // REQUIRED
    // ============================================

    /** Human-readable identifier (used in routes, queries). Example: 'blog', 'docs' */
    alias: string;

    /** Notion database UUID (stored in DB as datasource_id). Can use env vars. */
    dataSourceId: string;

    // ============================================
    // HOOK SYSTEM
    // ============================================

    /**
     * Hook-based configuration for page transformation.
     * Hooks provide a composable way to customize page processing.
     * 
     * @example
     * hooks: [
     *   {
     *     name: 'custom:publish-date',
     *     event: 'publish:date',
     *     priority: 40,
     *     fn: async (ctx) => ctx.page.properties.Date?.date?.start
     *   }
     * ]
     */
    hooks?: Hook[];

    // ============================================
    // SLUG CONFIGURATION
    // ============================================

    /**
     * Notion property name to read authored slug from AND write final slug back to.
     * Renamed from slugSyncProperty for clarity.
     */
    slugProperty?: string | null;

    /**
     * Strategy for handling slug conflicts.
     * - 'auto-rename': Append -2, -3, etc. until unique (default)
     * - 'error': Throw error and skip page
     * - 'use-page-id': Append short page ID
     */
    onSlugConflict?: 'auto-rename' | 'error' | 'use-page-id';

    // ============================================
    // LIFECYCLE CALLBACKS
    // ============================================

    /**
     * Called once per sync run before processing any pages.
     * Use for setup tasks like cache warming or external API calls.
     */
    onBeforeSync?: () => Promise<void>;

    /**
     * Called once per sync run after processing all pages.
     * Use for cleanup tasks like cache invalidation or notifications.
     */
    onAfterSync?: () => Promise<void>;

    // ============================================
    // METADATA - Optional property mappings
    // ============================================

    /** Tags property name (must be multi_select) */
    tagsProperty?: string | null;

    /** Authors property name (people or multi_select) */
    authorsProperty?: string | null;

    /** Summary property name (text or rich_text) */
    summaryProperty?: string | null;

    /** Cover image property name (files property) */
    coverProperty?: string | null;

    // ============================================
    // FLEXIBLE METADATA - Pass-through to JSONB
    // ============================================

    /**
     * Determines sync direction for content
     * - 'NOTION': Notion → DB (current behavior)
     * - 'WEB_EDITOR': DB → Notion (when Tiptap implemented)
     * - Custom function for per-page logic
     */
    contentSourceRule?: 'NOTION' | 'WEB_EDITOR' | ((page: PageObjectResponse) => 'NOTION' | 'WEB_EDITOR');

    // ============================================
    // SYNC STRATEGY
    // ============================================

    /**
     * Strategy for writing content back to Notion pages.
     * - 'patch': Surgical diff-and-patch — only modified blocks are updated
     *   (preserves Notion block IDs, comments, and internal references).
     * - 'replace': Nuke-and-repave — all blocks are deleted then rewritten.
     *   Use this to opt out of the diff algorithm for a specific datasource.
     *
     * Default: 'patch'
     */
    syncStrategy?: 'patch' | 'replace';

    /**
     * When `syncStrategy` is `'patch'`, this is the fraction of blocks that
     * must change before the patcher gives up and falls back to full replace.
     * A value of `0.6` means "if more than 60% of blocks changed, just
     * replace everything".
     *
     * Range: 0–1. Default: 0.6.
     */
    forceFullReplaceThreshold?: number;
}

/**
 * Full Symbiont configuration.
 * Contains both public data and private server-only configuration (databases with rules).
 */
export interface SymbiontConfig {
    /** PUBLIC */
    supabase: {
        url: string;         // https://<project-ref>.supabase.co
        publishableKey: string;     // Public key
    };

    /** PRIVATE: Database configurations with server-only sync rules. */
    databases: DatabaseBlueprint[];

    /** PRIVATE: Markdown rendering options that control server-side parsing. */
    markdown?: MarkdownConfig;

    /** PRIVATE: Response caching strategy (e.g. ISR). */
    caching?: CachingConfig;
}



/** Markdown configuration block from symbiont.config.js */
export interface MarkdownConfig {
    math?: {
        enabled: boolean;
        inlineDelimiters?: [string, string];
        displayDelimiters?: [string, string];
    };
    toc?: {
        enabled: boolean;
        minHeadingLevel?: number;
        maxHeadingLevel?: number;
    };
    extensions?: {
        footnotes?: boolean;
        spoilers?: boolean;
        highlights?: boolean;
        textColors?: boolean;
        gfm?: boolean;
    };
    images?: {
        lazy?: boolean;
        nhostStorage?: boolean;
    };
}

export type CachingStrategy = 'isr' | 'none';

export interface ISRConfig {
    enabled: boolean;
    revalidate: number;
}

export interface CachingConfig {
    strategy: CachingStrategy;
    isr?: ISRConfig;
}

/**
 * Fully hydrated configuration used at runtime where all database IDs are resolved.
 * This is what loadConfig() returns on the server.
 */
export type HydratedDatabaseConfig = DatabaseBlueprint;

export interface HydratedSymbiontConfig {
    databases: HydratedDatabaseConfig[];
    markdown?: MarkdownConfig;
    caching?: CachingConfig;
}

/**
 * Represents the result of a sync operation for a single database
 */
export type SyncResult = {
    /** The configured alias for this datasource */
    alias: string;
    /** The Notion database UUID */
    dataSourceId: string;
    /** Number of pages processed */
    processed: number;
    /** Number of pages skipped */
    skipped: number;
    /** Status of the sync operation */
    status: 'ok' | 'error' | 'no-changes' | 'success';
    /** Additional details, especially for errors */
    details?: string;
};


// LAYOUT TYPES

/**
 * String literal types for card templates.
 * This ensures type safety and autocompletion for template names.
 */
export type CardTemplate = 'standard' | 'featured' | 'compact';

/**
 * String literal types for print layout templates.
 */
export type PrintTemplate = 'StandardFlow' | 'FullPageSpread' | 'Sidebar';

/**
 * Defines the layout instructions for the 'web' (Svelte) engine.
 */
export interface WebLayoutTarget {
    card_template: CardTemplate;
    cover_image: string | null;
    show_summary: boolean;
}

/**
 * Defines the layout instructions for the 'print' (InDesign) engine.
 */
export interface PrintLayoutTarget {
    template: PrintTemplate;
    emphasis: number; // e.g., 1-10 scale
}

/**
 * This interface represents the final, merged layout object.
 * Your Svelte code (like the +page.server.js) will produce this
 * by merging the defaults with the partial front matter.
 */
export interface LayoutConfig {
    weight: number;
    targets: {
        web: WebLayoutTarget;
        print: PrintLayoutTarget;
    };
}

/**
 * A utility type to make all properties of an object,
 * and its nested objects, optional.
 */
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * This is the type you should use for your markdown front matter's 'layout' field.
 * It's a deep partial of the LayoutConfig, so every single field is optional.
 *
 * @example
 * ---
 * title: "My Post"
 * layout: { weight: 99, targets: { web: { card_template: 'featured' } } }
 * ---
 */
export type FrontMatterLayout = DeepPartial<LayoutConfig>;

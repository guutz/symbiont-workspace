import type { PageObjectResponse } from '@notionhq/client';

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
 * Represents the structure of a single post or article.
 * This type mirrors the `pages` table in the database.
 * 
 * Extended to be compatible with QWER post type for seamless integration.
 */
export type Post = {
    // Database fields (from pages table)
    page_id?: string;           // Notion page UUID (primary key)
    datasource_id?: string;     // Notion database ID
    title: string | null;
    slug: string;
    content: string | null;     // Markdown content
    publish_at: string | null;  // ISO 8601 date string
    updated_at?: string | null; // Last updated timestamp
    tags?: any[] | null;        // JSONB array
    authors?: any[] | null;     // JSONB array
    meta?: Record<string, any> | null; // JSONB object (flexible metadata)

    // Optional QWER-compatible fields
    summary?: string;
    description?: string;
    language?: string;
    cover?: string;

    // Allow any other properties from your schema
    [key: string]: any;
};

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

    /** 
     * Notion API integration token for this specific datasource.
     * Can be:
     * - Env var name (e.g., 'NOTION_TOKEN') - will be resolved from environment
     * - Actual token value (e.g., 'secret_abc123...') - used as-is
     * - Omitted - defaults to NOTION_TOKEN env var
     */
    notionToken?: string;

    // ============================================
    // PUBLISHING RULES
    // ============================================

    /** Boolean gate: determines IF a page should be published */
    isPublicRule?: (page: PageObjectResponse) => boolean;
    // Default: () => true

    /** Date extraction: determines WHEN a page should be published */
    publishDateRule?: (page: PageObjectResponse) => string | null;
    // Default: page.last_edited_time

    // ============================================
    // SLUG CONFIGURATION
    // ============================================

    /** Extract custom slug from Notion (return null for auto-generation) */
    slugRule?: (page: PageObjectResponse) => string | null;
    // Default: null (auto-generate from title)

    /** Notion property name to sync generated slugs back to */
    slugSyncProperty?: string | null;
    // Default: null (don't sync back)

    // ============================================
    // METADATA - Optional property mappings
    // ============================================

    /** Tags property name (must be multi_select) */
    tagsProperty?: string | null;
    // Default: null (no tags)

    /** Authors property name (people or multi_select) */
    authorsProperty?: string | null;
    // Default: null (no authors)

    // ============================================
    // FLEXIBLE METADATA - Pass-through to JSONB
    // ============================================

    /**
     * Extract arbitrary metadata to store in JSONB field
     * Use this for cover images, layout config, custom fields, etc.
     * 
     * @example
     * metadataExtractor: (page) => ({
     *   coverImage: page.properties['Cover']?.files?.[0]?.file?.url,
     *   homepageWeight: page.properties['Weight']?.number,
     *   featured: page.properties['Featured']?.checkbox
     * })
     */
    metadataExtractor?: (page: PageObjectResponse) => Record<string, any>;
    // Default: null (no extra metadata)

    /**
     * Determines sync direction for content
     * - 'NOTION': Notion → DB (current behavior)
     * - 'WEB_EDITOR': DB → Notion (when Tiptap implemented)
     * - Custom function for per-page logic
     */
    contentSourceRule?: 'NOTION' | 'WEB_EDITOR' | ((page: PageObjectResponse) => 'NOTION' | 'WEB_EDITOR');
}

/**
 * Full Symbiont configuration.
 * Contains both public data (graphqlEndpoint) and private server-only configuration (databases with rules).
 */
export interface SymbiontConfig {
    /** PUBLIC: GraphQL endpoint URL. Not secret, just a URL. */
    graphqlEndpoint: string;

    /** PRIVATE: Database configurations with server-only sync rules. */
    databases: DatabaseBlueprint[];

    /** PRIVATE: Markdown rendering options that control server-side parsing. */
    markdown?: MarkdownConfig;

    /** PRIVATE: Response caching strategy (e.g. ISR). */
    caching?: CachingConfig;
}

/**
 * Client-safe public configuration extracted from SymbiontConfig.
 * This is what gets exposed via the virtual module 'virtual:symbiont/config'.
 * Contains NO functions, NO secrets - only public identifiers.
 */
export interface PublicSymbiontConfig {
    /** GraphQL endpoint URL */
    graphqlEndpoint: string;

    /** All configured datasource aliases (for client-side queries) */
    aliases: string[];
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
    graphqlEndpoint: string;
    databases: HydratedDatabaseConfig[];
    markdown?: MarkdownConfig;
    caching?: CachingConfig;
}

/**
 * Represents the result of a sync operation for a single database
 * 
 * Note: This type is being phased out. Use SyncSummary from sync/orchestrator.ts instead.
 * @deprecated Use orchestrator SyncResult instead
 */
export type SyncSummary = {
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

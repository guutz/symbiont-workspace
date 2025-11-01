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
 * This type should mirror the data fetched from your Nhost/Supabase backend,
 * ensuring that component props are strongly typed.
 * 
 * Extended to be compatible with QWER post type for seamless integration.
 */
export type Post = {
    sql_id: string; // UUID from database (aliased from 'id' in GraphQL)
    title: string | null;
    slug: string;
    content: string | null; // The markdown content
    publish_at: string | null; // ISO 8601 date string
    updated_at?: string | null; // Last updated timestamp
    tags?: string[] | any[] | null;
    author?: string | null;
    
    // Optional QWER-compatible fields
    summary?: string;
    description?: string;
    language?: string;
    cover?: string;
    
    layout?: FrontMatterLayout;
    
    // Allow any other properties from your schema
    [key: string]: any;
};

type SourceOfTruth = 'NOTION' | 'WEB_EDITOR';

/**
 * Database configuration blueprint.
 * Contains both public data (dbNickname, notionDatabaseId) and private server-only rules.
 * 
 * Publishing Rules (work together, both optional with defaults):
 * 
 * - **isPublicRule**: Boolean gate - determines IF a page should be published
 *   - Default: `() => true` (all pages pass the gate)
 *   - Use for status checks, flags, or simple published/unpublished logic
 * 
 * - **publishDateRule**: Date extraction - determines WHEN a page should be published
 *   - Default: uses `page.last_edited_time` (always present in Notion)
 *   - Use for custom date properties or complex date logic
 * 
 * **Both rules must pass** for a page to be published:
 * 1. isPublicRule must return true
 * 2. publishDateRule must return a valid date (not null)
 * 
 * @example
 * // Simple: just gate by status (uses default last_edited_time)
 * {
 *   isPublicRule: (page) => page.properties.Status?.select?.name === 'Published'
 * }
 * 
 * @example
 * // Custom date property (allows all pages through gate)
 * {
 *   publishDateRule: (page) => page.properties['Go Live']?.date?.start || null
 * }
 * 
 * @example
 * // Complex: both rules working together
 * {
 *   isPublicRule: (page) => page.properties.Ready?.checkbox === true,
 *   publishDateRule: (page) => page.properties['Embargo Date']?.date?.start || null
 * }
 */
export interface DatabaseBlueprint {
    /** PUBLIC: A unique identifier/source_id for this database in the GraphQL schema, e.g., 'tech-blog'. */
    dbNickname: string;

    /** PUBLIC: The Notion database ID. This is NOT secret - it's just an identifier. */
    notionDatabaseId: string;

    /** PRIVATE: Whether the Symbiont web editor should be exposed for this database. */
    webEditorEnabled?: boolean;

    /** 
     * PRIVATE: Optional boolean gate that determines IF a page should be published.
     * Works in combination with publishDateRule to determine final publish_at value.
     * 
     * Default: `() => true` (all pages pass the gate)
     * 
     * @example
     * // Only publish pages marked as "Published"
     * isPublicRule: (page) => page.properties.Status?.select?.name === 'Published'
     * 
     * @example
     * // Only publish pages with a checked "Ready" checkbox
     * isPublicRule: (page) => page.properties.Ready?.checkbox === true
     */
    isPublicRule?: (page: PageObjectResponse) => boolean;

    /**
     * PRIVATE: Optional function that extracts the publish date from a page.
     * Works in combination with isPublicRule to determine final publish_at value.
     * 
     * Default: Uses `page.last_edited_time` (always present in Notion)
     * 
     * Return an ISO date string to publish at that date, or null to mark as unpublished.
     * 
     * @example
     * // Use a custom "Go Live" date property
     * publishDateRule: (page) => page.properties['Go Live']?.date?.start || null
     * 
     * @example
     * // Use 'Publish Date' property with fallback to last_edited_time
     * publishDateRule: (page) => {
     *   return page.properties['Publish Date']?.date?.start || page.last_edited_time;
     * }
     * 
     * @example
     * // Use scheduled date only if status is "Scheduled"
     * publishDateRule: (page) => {
     *   const status = page.properties.Status?.select?.name;
     *   if (status === 'Scheduled') {
     *     return page.properties['Scheduled Date']?.date?.start || null;
     *   }
     *   return page.last_edited_time;
     * }
     */
    publishDateRule?: (page: PageObjectResponse) => string | null;

    /** PRIVATE: A function that determines the source of truth for a page's content. */
    sourceOfTruthRule: (page: PageObjectResponse) => SourceOfTruth;

    /** 
     * PRIVATE: A function that determines the slug for a post. 
     * Should return the slug from the page's Slug property if present,
     * otherwise return null to trigger auto-generation.
     * Default behavior: reads from page.properties.Slug.rich_text
     */
    slugRule?: (page: PageObjectResponse) => string | null;

    /**
     * PRIVATE: The name of the Notion property where the generated slug should be written back.
     * Defaults to 'Slug' if not specified.
     */
    slugPropertyName?: string;

    /** PRIVATE: The name of the Notion property where authors are stored. Defaults to 'Authors'. */
    authorsPropertyName?: string;

    /** PRIVATE: The name of the Notion property where tags are stored. Defaults to 'Tags'. */
    tagsPropertyName?: string;

    titlePropertyName?: string;

    coverImagePropertyName?: string;
}

/**
 * Full Symbiont configuration.
 * Contains both public data (graphqlEndpoint) and private server-only configuration (databases with rules).
 */
export interface SymbiontConfig {
    /** PUBLIC: GraphQL endpoint URL. Not secret, just a URL. */
    graphqlEndpoint: string;
    
    /** PUBLIC: Optional explicit default database identifier. Falls back to first database when omitted. */
    primaryShortDbId?: string;

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
	
	/** Primary database dbNickname (first configured database) */
	primaryShortDbId: string;
	
	/** All configured database dbNicknames */
	shortDbIds: string[];
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
    primaryShortDbId: string;
    databases: HydratedDatabaseConfig[];
    markdown?: MarkdownConfig;
    caching?: CachingConfig;
}

/**
 * Represents the result of a sync operation for a single database
 */
export type SyncSummary = {
    /** The configured source_id for this database in GraphQL */
    dbNickname: string;
    /** The actual Notion database ID */
    notionDatabaseId: string;
    /** Number of pages processed */
    processed: number;
    /** Number of pages skipped */
    skipped: number;
    /** Status of the sync operation */
    status: 'ok' | 'error' | 'no-changes';
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

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
 * Represents the structure of a single post or article.
 * This type should mirror the data fetched from your Nhost/Supabase backend,
 * ensuring that component props are strongly typed.
 * 
 * Extended to be compatible with QWER post type for seamless integration.
 */
export type Post = {
    sql_id: string; // UUID
    title: string | null;
    slug: string;
    content: string | null; // The markdown content
    publish_at: string | null; // ISO 8601 date string
    updated_at?: string | null; // Last updated timestamp
    tags?: string[] | any[] | null;
    
    // Optional QWER-compatible fields
    summary?: string;
    description?: string;
    language?: string;
    cover?: string;
    
    // Allow any other properties from your schema
    [key: string]: any;
};

type SourceOfTruth = 'NOTION' | 'WEB_EDITOR';

/**
 * Database configuration blueprint.
 * Contains both public data (short_db_ID, notionDatabaseId) and private server-only rules.
 */
export interface DatabaseBlueprint {
    /** PUBLIC: A unique identifier/source_id for this database in the GraphQL schema, e.g., 'tech-blog'. */
    short_db_ID: string;

    /** PUBLIC: The Notion database ID. This is NOT secret - it's just an identifier. */
    notionDatabaseId: string;

    /** PRIVATE: Whether the Symbiont web editor should be exposed for this database. */
    webEditorEnabled?: boolean;

    /** PRIVATE: A function that determines if a Notion page should be considered public. */
    isPublicRule: (page: PageObjectResponse) => boolean;

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
}

/**
 * Client-safe public configuration extracted from SymbiontConfig.
 * This is what gets exposed via the virtual module 'virtual:symbiont/config'.
 * Contains NO functions, NO secrets - only public identifiers.
 */
export interface PublicSymbiontConfig {
	/** GraphQL endpoint URL */
	graphqlEndpoint: string;
	
	/** Primary database short_db_ID (first configured database) */
	primaryShortDbId: string;
	
	/** All configured database short_db_IDs */
	shortDbIds: string[];
}/**
 * Fully hydrated configuration used at runtime where all database IDs are resolved.
 * This is what loadConfig() returns on the server.
 */
export type HydratedDatabaseConfig = DatabaseBlueprint;

export interface HydratedSymbiontConfig {
    graphqlEndpoint: string;
    databases: HydratedDatabaseConfig[];
}

export function defineSymbiontConfig<T extends SymbiontConfig>(config: T): T {
    return config;
}

/**
 * Represents the result of a sync operation for a single database
 */
export type SyncSummary = {
    /** The configured source_id for this database in GraphQL */
    short_db_ID: string;
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


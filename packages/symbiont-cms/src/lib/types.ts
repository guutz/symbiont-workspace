import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

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
 */
export type Post = {
    id: string; // UUID
    title: string;
    slug: string;
    content: string | null; // The markdown content
    publish_at: string | null; // ISO 8601 date string
    tags?: string[] | null;
    // Add any other properties from your schema as needed
    [key: string]: any;
};

type SourceOfTruth = 'NOTION' | 'WEB_EDITOR';

interface DatabaseRuleBase {
    /** A unique identifier for this configuration, e.g., 'personal-blog'. */
    id: string;

    /** Whether the Symbiont web editor should be exposed for this database. */
    webEditorEnabled?: boolean;

    /** A function that determines if a Notion page should be considered public. */
    isPublicRule: (page: PageObjectResponse) => boolean;

    /** A function that determines the source of truth for a page's content. */
    sourceOfTruthRule: (page: PageObjectResponse) => SourceOfTruth;
}

type DatabaseWithInlineId = DatabaseRuleBase & {
    databaseId: string;
    databaseIdEnvVar?: never;
};

type DatabaseWithEnvPointer = DatabaseRuleBase & {
    databaseIdEnvVar: string;
    databaseId?: never;
};

/**
 * Configuration as authored by the developer. Database IDs may be provided inline or
 * referenced by environment variable name, but not both.
 */
export type DatabaseBlueprint = DatabaseWithInlineId | DatabaseWithEnvPointer;

export interface SymbiontConfig {
    databases: DatabaseBlueprint[];
}

/**
 * Fully hydrated configuration used at runtime where all database IDs must be defined.
 */
export type HydratedDatabaseConfig = DatabaseRuleBase & {
    databaseId: string;
};

export interface HydratedSymbiontConfig {
    databases: HydratedDatabaseConfig[];
}

export function defineSymbiontConfig<T extends SymbiontConfig>(config: T): T {
    return config;
}


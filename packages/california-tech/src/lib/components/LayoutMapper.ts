import DefaultLayout from './layouts/DefaultLayout.svelte';
import PostsOnlyLayout from './layouts/PostsOnlyLayout.svelte';
import ProfileOnlyLayout from './layouts/ProfileOnlyLayout.svelte';
import CustomLayout from './layouts/CustomLayout.svelte';
import type { Site } from '$lib/types/site';

// Layout component registry
export const layoutComponents = {
  'default': DefaultLayout,
  'posts-only': PostsOnlyLayout,
  'profile-only': ProfileOnlyLayout,
  'custom': CustomLayout,
} as const;

/**
 * Get the layout component for a given layout type
 * @param layout - The layout type from site config
 * @param customComponent - Optional custom component to use instead
 * @returns The Svelte component for the layout
 */
export function getLayoutComponent(
  layout: Site.IndexLayout = 'default',
  customComponent?: any
) {
  // If a custom component is provided, use it
  if (customComponent) {
    return customComponent;
  }
  
  // Otherwise, use the registered layout component
  return layoutComponents[layout] || layoutComponents['default'];
}

/**
 * Check if a layout type is valid
 * @param layout - The layout type to check
 * @returns True if the layout type is valid
 */
export function isValidLayout(layout: string): layout is Site.IndexLayout {
  return layout in layoutComponents;
}
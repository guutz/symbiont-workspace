// src/routes/[slug]/+page.ts
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  try {
    const { default: component, metadata } = await import(
      `$content/blogs/${params.slug}.md`
    );

    return {
      component,
      metadata,
    };
  } catch (e) {
    throw error(404, `Could not find ${params.slug}`);
  }
};

// Dynamic route - fetches posts from database at request time
// Cannot be prerendered because slugs are not known at build time
export const prerender = false;

// Re-export the load function from symbiont-cms
export { postLoad as load } from 'symbiont-cms/server';

# Symbiont Blog Route Quick Start

The Symbiont package now ships ready-to-use exports so you can wire up a blog post detail page without copying boilerplate into your SvelteKit project. This guide covers the default experience and the customization hooks that sit behind it.

## Minimal integration

Create the route directory `src/routes/blog/[slug]/` (or any other slugged path you prefer) and drop in two one-liners that re-export Symbiont's defaults:

```ts
// src/routes/blog/[slug]/+page.server.ts
export { blogLoad as load } from 'symbiont-cms';
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { BlogPostPage } from 'symbiont-cms';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<BlogPostPage post={data.post} />
```

That's it. The packaged `load` function will fetch the post matching the current slug (using `PUBLIC_NHOST_GRAPHQL_URL` by default), and `BlogPostPage` renders the headline, publish date, and markdown content using the Symbiont renderer.

## Customizing the server load

`createBlogLoad` accepts a configuration object so you can redirect traffic, inject headers, or swap out the fetch logic entirely.

```ts
import { createBlogLoad, createSymbiontGraphQLClient } from 'symbiont-cms';

export const load = createBlogLoad({
  graphqlEndpoint: 'https://my-custom-endpoint',
  createClient(endpoint, event) {
    return createSymbiontGraphQLClient(endpoint, {
      headers: { Authorization: `Bearer ${event.locals.session?.token ?? ''}` },
      fetch: event.fetch
    });
  }
});
```

If you only need to tweak the endpoint, pass `graphqlEndpoint`. For more advanced scenarios, override `createClient` or `fetchPost`.

## Customizing the page UI

`BlogPostPage` exposes several slots so you can layer in additional UI without rebuilding the entire component:

- `before` / `after` – wrap the article with hero sections, share widgets, etc.
- `date` – replace the default publish date copy.
- `content` – customize how the markdown gets rendered (e.g., inject a different renderer).
- `not-found` – control the empty state when a slug can't be resolved.

Every slot receives the resolved `post` via its slot props:

```svelte
<script lang="ts">
  import { BlogPostPage } from 'symbiont-cms';
  import HeroBanner from '$lib/components/HeroBanner.svelte';
  import ShareBar from '$lib/components/ShareBar.svelte';
  import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';
  import NotFoundArticle from '$lib/components/NotFoundArticle.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<BlogPostPage
  post={data.post}
  formatDate={(value) => new Date(value).toLocaleDateString('en-GB')}
>
  <svelte:fragment slot="before" let:post>
    <HeroBanner title={post.title} summary={post.description} />
  </svelte:fragment>

  <svelte:fragment slot="date" let:post>
    <p class="custom-meta">Last updated {new Date(post.publish_at ?? '').toLocaleString()}</p>
  </svelte:fragment>

  <svelte:fragment slot="content" let:post>
    <MarkdownRenderer content={post.content ?? ''} />
  </svelte:fragment>

  <svelte:fragment slot="after" let:post>
    <ShareBar slug={post.slug} />
  </svelte:fragment>

  <svelte:fragment slot="not-found">
    <NotFoundArticle />
  </svelte:fragment>
</BlogPostPage>
```

## Environment variables

The server load helper resolves the GraphQL endpoint from the public environment variable `PUBLIC_NHOST_GRAPHQL_URL` when no explicit endpoint is supplied. Make sure this variable is set in your deployment target (e.g., Vercel) to avoid runtime errors. If you prefer a private secret, simply pass `graphqlEndpoint` yourself.

## Migration notes

If you previously copied the example route from the docs, you can now delete the hand-written implementations and re-export the packaged defaults. The underlying fetch logic still lives in `createSymbiontGraphQLClient` and `getPostBySlug`, so any bespoke functionality you added there continues to work via the configuration hooks above.

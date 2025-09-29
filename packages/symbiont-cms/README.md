# Symbiont CMS

A CMS package for SvelteKit applications that syncs content from Notion.

## Installation

```bash
npm install symbiont-cms
# or
pnpm add symbiont-cms
```

## Usage

### Client-Side Components

For your Svelte components and client-side code:

```typescript
// Import client-side components and utilities
import { BlogPostPage, Renderer, defineSymbiontConfig } from 'symbiont-cms';
import type { Post, SymbiontConfig } from 'symbiont-cms';
```

#### Example: Blog Post Page

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { BlogPostPage } from 'symbiont-cms';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<BlogPostPage post={data.post} />
```

### Server-Side Functions

For server-side code (API routes, load functions):

```typescript
// Import server-only functions
import { blogLoad, handlePollBlogRequest, syncFromNotion, loadConfig } from 'symbiont-cms/server';
```

#### Example: Blog Load Function

```typescript
// src/routes/blog/[slug]/+page.server.ts
export { blogLoad as load } from 'symbiont-cms/server';
```

#### Example: API Route

```typescript
// src/routes/api/sync/poll-blog/+server.ts
import { handlePollBlogRequest } from 'symbiont-cms/server';

export const GET = handlePollBlogRequest;
```

## Package Structure

The package provides two main entry points:

- **`symbiont-cms`** - Client-side components and utilities  
- **`symbiont-cms/server`** - Server-only functions (API handlers, sync logic)

This separation ensures that server-only code doesn't get bundled in your client-side code.

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

Everything inside `src/lib` is part of your library, everything inside `src/routes` can be used as a showcase or preview app.

## Building

To build your library:

```sh
npm pack
```

To create a production version of your showcase app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Publishing

Go into the `package.json` and give your package the desired name through the `"name"` option. Also consider adding a `"license"` field and point it to a `LICENSE` file which you can create from a template (one popular option is the [MIT license](https://opensource.org/license/mit/)).

To publish your library to [npm](https://www.npmjs.com):

```sh
npm publish
```

import type { Handle } from '@sveltejs/kit';
import { siteConfig } from '$config/site';
import { sequence } from '@sveltejs/kit/hooks';

const themeHandler: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get('theme') || 'light';
  event.locals.theme = theme;

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      // Apply theme to both data-theme attribute AND body class
      return html
        .replace('data-theme="light"', `data-theme="${theme}"`)
        .replace('<body', `<body class="${theme}"`);
    },
  });

  return response;
};

export const handle = sequence(themeHandler, async ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="${siteConfig.lang ?? 'en'}">`),
  })
);
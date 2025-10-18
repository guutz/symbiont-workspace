import type { LayoutServerLoad } from './$types';

// Get the theme from the cookie and pass it to the layout
export const load: LayoutServerLoad = ({ locals }) => {
  return {
    theme: locals.theme,
  };
};

<script lang="ts">
	import MarkdownIt from 'markdown-it';
	import type { ClassMap } from './types.ts';

	/**
	 * The raw Markdown string to be rendered.
	 * @type {string | null | undefined}
	 */
	export let content: string | null | undefined = '';

	/**
	 * A map of HTML tags to CSS classes to apply to the rendered output.
	 * @type {ClassMap}
	 */
	export let classMap: ClassMap = {};

	// Instantiate markdown-it once.
	const md = new MarkdownIt();

	// --- Custom Renderer Rules ---
	// We save the original rendering rules and then wrap them with our custom logic.
	// This allows us to add classes to the tokens before they are rendered to HTML.

	const defaultRenderers = {
		heading_open:
			md.renderer.rules.heading_open ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			},
		paragraph_open:
			md.renderer.rules.paragraph_open ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			},
		link_open:
			md.renderer.rules.link_open ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			},
		bullet_list_open:
			md.renderer.rules.bullet_list_open ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			},
		ordered_list_open:
			md.renderer.rules.ordered_list_open ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			},
		list_item_open:
			md.renderer.rules.list_item_open ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			},
		blockquote_open:
			md.renderer.rules.blockquote_open ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			},
		code_block:
			md.renderer.rules.code_block ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			},
		fence:
			md.renderer.rules.fence ||
			function (tokens, idx, options, env, self) {
				return self.renderToken(tokens, idx, options);
			}
	};

	md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
		const token = tokens[idx];
		const level = parseInt(token.tag.substring(1), 10);
		const tag = `h${level}` as keyof ClassMap;
		if (classMap[tag]) {
			token.attrJoin('class', classMap[tag]!);
		}
		return defaultRenderers.heading_open(tokens, idx, options, env, self);
	};

	md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
		if (classMap.p) {
			tokens[idx].attrJoin('class', classMap.p);
		}
		return defaultRenderers.paragraph_open(tokens, idx, options, env, self);
	};

	md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
		if (classMap.a) {
			tokens[idx].attrJoin('class', classMap.a);
		}
		return defaultRenderers.link_open(tokens, idx, options, env, self);
	};
	
	md.renderer.rules.bullet_list_open = (tokens, idx, options, env, self) => {
		if (classMap.ul) {
			tokens[idx].attrJoin('class', classMap.ul);
		}
		return defaultRenderers.bullet_list_open(tokens, idx, options, env, self);
	};
	
	md.renderer.rules.ordered_list_open = (tokens, idx, options, env, self) => {
		if (classMap.ol) {
			tokens[idx].attrJoin('class', classMap.ol);
		}
		return defaultRenderers.ordered_list_open(tokens, idx, options, env, self);
	};
	
	md.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
		if (classMap.li) {
			tokens[idx].attrJoin('class', classMap.li);
		}
		return defaultRenderers.list_item_open(tokens, idx, options, env, self);
	};
	
	md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
		if (classMap.blockquote) {
			tokens[idx].attrJoin('class', classMap.blockquote);
		}
		return defaultRenderers.blockquote_open(tokens, idx, options, env, self);
	};

	// Use a Svelte reactive statement (`$:`) to automatically re-render the HTML
	// whenever the `content` or `classMap` props change.
	$: renderedHtml = (() => {
		// This line ensures Svelte knows to re-run this block when classMap changes.
		JSON.stringify(classMap);

		if (content) {
			return md.render(content);
		}
		return '';
	})();
</script>

<!--
  The `{@html ...}` directive is Svelte's way of rendering a string
  as HTML. It's safe to use here because the content is sanitized
  by markdown-it.
-->
{@html renderedHtml}


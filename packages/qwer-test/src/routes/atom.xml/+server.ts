import type { RequestHandler } from '@sveltejs/kit';
import { siteConfig } from '$config/site';
import type { Post } from '$lib/types/post';
import LZString from 'lz-string';
import { getPostsFromPrimarySource, type Post as SymbiontPost } from 'symbiont-cms';

const getPosts = async (): Promise<SymbiontPost[]> => {
  const graphqlEndpoint = process.env.PUBLIC_NHOST_GRAPHQL_URL;
  
  if (graphqlEndpoint) {
    try {
      return await getPostsFromPrimarySource(graphqlEndpoint, { 
        limit: 100
      });
    } catch (error) {
      console.error('[atom.xml] Error fetching posts:', error);
    }
  }
  
  return [];
};

const render = async (): Promise<string> => {
  const posts = await getPosts();
  
  return `<?xml version='1.0' encoding='utf-8'?>
<feed xmlns="http://www.w3.org/2005/Atom" ${siteConfig.lang ? `xml:lang="${siteConfig.lang}"` : ''}>
<id>${siteConfig.url}</id>
<title><![CDATA[${siteConfig.title}]]></title>
${
  siteConfig.subtitle
    ? `<subtitle>
<![CDATA[${siteConfig.subtitle}]]>
</subtitle>`
    : ''
}
<icon>${new URL(`favicon.png`, siteConfig.url).href}</icon>
<link href="${siteConfig.url}"/>
<link href="${new URL('atom.xml', siteConfig.url).href}" rel="self" type="application/atom+xml"/>
<updated>${new Date().toJSON()}</updated>
<author>
  <name><![CDATA[${siteConfig.author.name}]]></name>
</author>
${posts
  .map((post) => {
    return `<entry>
    <title type="html"><![CDATA[${post.title ?? 'Untitled'}]]></title>
    <author><name><![CDATA[${siteConfig.author.name}]]></name></author>
    <link href="${new URL(post.slug, siteConfig.url).href}" />
    <id>${new URL(post.slug, siteConfig.url).href}</id>
    <published>${new Date(post.publish_at ?? new Date()).toJSON()}</published>
    <updated>${new Date(post.updated_at ?? post.publish_at ?? new Date()).toJSON()}</updated>
    <summary type="html"><![CDATA[${post.content?.substring(0, 200) ?? ''}]]></summary>
    <content type="html"><![CDATA[${post.content ?? ''}]]></content>
    ${Array.isArray(post.tags) ? post.tags
      .map((tag: any) => {
        if (typeof tag === 'string')
          return `<category term="${tag}" scheme="${new URL(`?tags=${encodeURI(tag)}`, siteConfig.url).href}" />`;
        return '';
      })
      .filter((t: any) => t)
      .join('\n') : ''}
    </entry>`;
  })
  .join('\n')}
</feed>
`;
};

export const GET: RequestHandler = async () => {
  return new Response(await render(), {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
    },
  });
};

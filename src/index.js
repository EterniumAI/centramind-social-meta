import routes from './routes.json';

const CRAWLER_REGEX = /facebookexternalhit|facebookcatalog|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|Pinterest|redditbot|Applebot|Bingbot|Googlebot|DuckDuckBot|Baiduspider|YandexBot/i;

export default {
  async fetch(request, env, ctx) {
    const ua = request.headers.get('user-agent') || '';
    const isCrawler = CRAWLER_REGEX.test(ua);
    const url = new URL(request.url);

    // For non-crawlers, pass through to origin without modification.
    if (!isCrawler) {
      return fetch(request);
    }

    // For crawlers, fetch the origin response, then inject per-route meta.
    const originResp = await fetch(request);
    const contentType = originResp.headers.get('content-type') || '';

    // Only rewrite HTML responses.
    if (!contentType.includes('text/html')) {
      return originResp;
    }

    const meta = resolveRouteMeta(url.pathname);
    const html = await originResp.text();
    const rewritten = injectMeta(html, meta, url);

    return new Response(rewritten, {
      status: originResp.status,
      headers: {
        ...Object.fromEntries(originResp.headers.entries()),
        'cache-control': 'public, max-age=60',
        'x-meta-injected': '1',
      },
    });
  },
};

function resolveRouteMeta(pathname) {
  // Exact match first, then prefix match (longest first).
  if (routes[pathname]) return routes[pathname];

  const keys = Object.keys(routes)
    .filter((k) => k.endsWith('/*'))
    .sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const prefix = key.slice(0, -2);
    if (pathname.startsWith(prefix)) return routes[key];
  }

  return routes['/'];
}

function injectMeta(html, meta, url) {
  const canonical = `https://eternium.ai${url.pathname}`;
  const tags = [
    `<title>${escape(meta.title)}</title>`,
    `<meta name="description" content="${escape(meta.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:title" content="${escape(meta.title)}" />`,
    `<meta property="og:description" content="${escape(meta.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${meta.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:type" content="${meta.type || 'website'}" />`,
    `<meta property="og:site_name" content="Eternium AI" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(meta.title)}" />`,
    `<meta name="twitter:description" content="${escape(meta.description)}" />`,
    `<meta name="twitter:image" content="${meta.image}" />`,
  ].join('\n    ');

  // Remove existing OG/Twitter/title/canonical to avoid duplicates.
  const stripped = html
    .replace(/<title>.*?<\/title>/gi, '')
    .replace(/<link[^>]*rel="canonical"[^>]*>/gi, '')
    .replace(/<meta[^>]*name="description"[^>]*>/gi, '')
    .replace(/<meta[^>]*property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta[^>]*name="twitter:[^"]*"[^>]*>/gi, '');

  return stripped.replace(/<head([^>]*)>/i, `<head$1>\n    ${tags}\n  `);
}

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

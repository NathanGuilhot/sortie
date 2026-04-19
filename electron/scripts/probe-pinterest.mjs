// Probe Pinterest's resource API and validate the parser's output shape.
// Useful for debugging when imported pins are missing metadata.
// Run from repo root:  node electron/scripts/probe-pinterest.mjs <query>

const QUERY = process.argv[2] ?? 'kitchen interior';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PWS_HANDLER = 'www/pin/[id].js';

function urlEncode(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
    .replace(/\+/g, '%20');
}

function buildGet(endpoint, options, sourceUrl) {
  return `${endpoint}?${urlEncode({
    source_url: sourceUrl,
    data: JSON.stringify({ options, context: {} }),
    _: String(Date.now()),
  })}`;
}

async function bootstrap() {
  const r = await fetch('https://www.pinterest.com/', { headers: { 'user-agent': UA } });
  return (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function call(url, cookie) {
  const r = await fetch(url, {
    headers: {
      'user-agent': UA,
      'x-pinterest-pws-handler': PWS_HANDLER,
      cookie,
      accept: 'application/json, text/javascript, */*; q=0.01',
    },
  });
  return r.json();
}

const NO_LINK_SENTINEL = 'uploaded by user';
const cleanString = (v) => {
  if (!v) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
};
const pickDescription = (p) =>
  cleanString(p.description) ??
  cleanString(p.title) ??
  cleanString(p.auto_alt_text) ??
  cleanString(p.alt_text);
const pickAlt = (p) =>
  cleanString(p.auto_alt_text) ?? cleanString(p.alt_text) ?? cleanString(p.title);

function parsePin(p) {
  if (!p || typeof p !== 'object' || p.videos) return null;
  const orig = p.images?.orig;
  if (!orig?.url || typeof p.id !== 'string') return null;
  const w = orig.width || 0;
  const h = orig.height || 0;
  if (w <= 0 || h <= 0) return null;
  const link = cleanString(p.link);
  const domainRaw = cleanString(p.domain);
  const sourceDomain =
    domainRaw && domainRaw.toLowerCase() !== NO_LINK_SENTINEL ? domainRaw : null;
  const sourceUrl = sourceDomain ? link : null;
  return {
    pinId: p.id,
    sourceUrl,
    sourceDomain,
    description: pickDescription(p),
    alt: pickAlt(p),
    raw_link: p.link ?? null,
    raw_domain: p.domain ?? null,
    raw_title: p.title ?? null,
    raw_description: p.description ?? null,
  };
}

(async () => {
  const cookie = await bootstrap();
  const opts = {
    appliedProductFilters: '---',
    auto_correction_disabled: false,
    bookmarks: [],
    page_size: 50,
    query: QUERY,
    redux_normalize_feed: true,
    rs: 'typed',
    scope: 'pins',
    source_url: `/search/pins/?q=${encodeURIComponent(QUERY)}&rs=typed`,
  };
  const url = buildGet(
    'https://www.pinterest.com/resource/BaseSearchResource/get/',
    opts,
    `/search/pins/?q=${encodeURIComponent(QUERY)}rs=typed`,
  );
  const env = await call(url, cookie);
  const pins = env?.resource_response?.data?.results ?? [];
  console.log(`got ${pins.length} pins for "${QUERY}"`);

  const parsed = pins.map(parsePin).filter(Boolean);
  console.log('\n=== sample 5 parsed (with raw fallback fields) ===');
  for (const p of parsed.slice(0, 5)) {
    console.log(JSON.stringify(p, null, 2));
    console.log('---');
  }

  let withSrc = 0,
    withDesc = 0,
    rawLinkSet = 0,
    rawDescSet = 0;
  for (const p of parsed) {
    if (p.sourceUrl) withSrc++;
    if (p.description) withDesc++;
    if (p.raw_link) rawLinkSet++;
    if (p.raw_description) rawDescSet++;
  }
  console.log('\n=== summary ===');
  console.log({
    total: parsed.length,
    withSourceUrl: withSrc,
    withDescription: withDesc,
    rawLinkSet,
    rawDescSet,
  });
})();

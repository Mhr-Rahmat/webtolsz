import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const { origin } = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
if (new URL(origin).origin !== origin || !origin.startsWith('https://')) {
  throw new Error('site.config.json must contain an HTTPS origin without a trailing slash.');
}
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('js/calculators-data.js', 'utf8'), context);
const calculators = context.ALL_CALCULATORS_DATA;
const app = fs.readFileSync('js/app.js', 'utf8');
vm.runInContext(app.slice(0, app.indexOf('// --- 2. CALCULATORS')), context);
const categories = vm.runInContext('CATEGORIES', context);
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const home = {
  path: '/', title: 'CalcHub | All-in-One Online Calculator Platform',
  name: 'CalcHub Online Calculators', heading: 'All Your Calculators in One Place',
  description: 'Free, fast, and accurate online calculators for math, finance, health, geometry, construction, physics, chemistry, date & time, and unit conversions.'
};
const pages = [home,
  ...categories.map((cat) => ({ path: `/category/${cat.slug}`,
    title: `${cat.name} Calculators - Free Online Tools | CalcHub`,
    name: `${cat.name} Calculators`, heading: `${cat.name} Calculators`,
    description: cat.description, category: cat })),
  ...calculators.map((calc) => ({ path: `/calculators/${calc.slug}`,
    title: `${calc.title} - Free Online Calculator | CalcHub`,
    name: calc.title, heading: calc.title, description: calc.shortDesc, calculator: calc }))
];
if (new Set(pages.map((page) => page.path)).size !== pages.length) throw new Error('Duplicate sitemap paths.');
for (const page of pages) {
  if (page.path !== '/' && !/^\/(category|calculators)\/[a-z0-9-]+$/.test(page.path)) throw new Error(`Invalid route: ${page.path}`);
}
for (const calc of calculators) {
  if (!categories.some((cat) => cat.id === calc.category)) throw new Error(`Unknown category: ${calc.category}`);
}

const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + pages.map((page) => `  <url><loc>${escape(origin + page.path)}</loc></url>`).join('\n') + '\n</urlset>\n';
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
for (const directory of ['public', 'dist']) {
  fs.writeFileSync(`${directory}/sitemap.xml`, sitemap);
  fs.writeFileSync(`${directory}/robots.txt`, robots);
}
// Keep the build's canonical asset copies in sync with the editable source.
for (const file of ['app.js', 'calculators-data.js']) {
  for (const directory of ['public/js', 'dist/js']) fs.copyFileSync(`js/${file}`, `${directory}/${file}`);
}

const template = fs.readFileSync('dist/index.html', 'utf8');
const link = (href, label) => `<a href="${href}">${escape(label)}</a>`;
for (const page of pages) {
  const url = origin + page.path;
  const schema = { '@context': 'https://schema.org', '@type': page.category ? 'CollectionPage' : 'WebApplication',
    name: page.name, url, description: page.description,
    ...(!page.category ? { applicationCategory: 'UtilitiesApplication', operatingSystem: 'All',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } } : {}) };
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, () => `<meta name="description" content="${escape(page.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<script id="site-schema" type="application\/ld\+json">[\s\S]*?<\/script>/,
      () => `<script id="site-schema" type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`)
    .replace(/(<h1 class="hero-title">)[\s\S]*?(<\/h1>)/, `$1${escape(page.heading)}$2`)
    .replace(/(<p class="hero-subtitle">)[\s\S]*?(<\/p>)/, `$1${escape(page.description)}$2`);
  const metadata = [
    ['property', 'og:type', 'website'], ['property', 'og:title', page.title],
    ['property', 'og:description', page.description], ['property', 'og:url', url],
    ['name', 'twitter:card', 'summary'], ['name', 'twitter:title', page.title],
    ['name', 'twitter:description', page.description], ['name', 'twitter:url', url]
  ].map(([attribute, name, value]) => `<meta ${attribute}="${name}" content="${escape(value)}" />`).join('\n    ');
  html = html.replace('</head>', `${metadata}\n  </head>`);
  const selected = page.calculator || (page.category && calculators.find((calc) => calc.category === page.category.id));
  if (selected) {
    html = html.replace(/(<h3 id="active-calc-title"[^>]*>)[\s\S]*?(<\/h3>)/, `$1${escape(selected.title)}$2`)
      .replace(/(<p id="active-calc-desc"[^>]*>)[\s\S]*?(<\/p>)/, `$1${escape(selected.shortDesc)}$2`);
  }
  // Real HTML links let crawlers discover every page without opening the search dialog.
  const related = page.category ? calculators.filter((calc) => calc.category === page.category.id)
    : page.calculator ? calculators.filter((calc) => calc.category === page.calculator.category) : calculators;
  const directory = `<nav class="container" aria-label="Calculator directory"><h2>Browse calculators</h2><ul>`
    + categories.map((cat) => `<li>${link(`/category/${cat.slug}`, cat.name)}</li>`).join('') + '</ul><ul>'
    + related.map((calc) => `<li>${link(`/calculators/${calc.slug}`, calc.title)}</li>`).join('') + '</ul></nav>';
  html = html.replace('</main>', `${directory}\n      </main>`);
  const output = page.path === '/' ? 'dist/index.html' : path.join('dist', `${page.path.slice(1)}.html`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html);
}
console.log(`Generated ${pages.length} sitemap URLs and HTML pages with canonical origin ${origin}.`);

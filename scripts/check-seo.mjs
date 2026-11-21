import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const { origin } = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
const sitemap = fs.readFileSync('dist/sitemap.xml', 'utf8');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('js/calculators-data.js', 'utf8'), context);
const calculators = context.ALL_CALCULATORS_DATA;
const titles = new Set();
assert.equal(urls.length, 1 + 15 + calculators.length);
assert.equal(new Set(urls).size, urls.length, 'Sitemap must not contain duplicate URLs.');
for (const url of urls) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, origin);
  assert.equal(parsed.search + parsed.hash, '');
  const file = parsed.pathname === '/' ? 'dist/index.html' : `dist${parsed.pathname}.html`;
  const html = fs.readFileSync(file, 'utf8');
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
  assert.equal(canonicals.length, 1, `${file}: exactly one canonical required.`);
  assert.equal(canonicals[0][1], url, `${file}: incorrect canonical.`);
  for (const name of ['og:url', 'twitter:url']) {
    assert.ok(html.includes(`="${name}" content="${url}"`), `${file}: incorrect ${name}.`);
  }
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  assert.ok(!titles.has(title), `${file}: duplicate page title.`);
  titles.add(title);
  const schema = JSON.parse(html.match(/<script id="site-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.url, url);
  assert.ok(schema.name && schema.description);
  for (const match of html.matchAll(/href="(\/(?:calculators|category)\/[a-z0-9-]+)"/g)) {
    assert.ok(fs.existsSync(`dist${match[1]}.html`), `${file}: broken internal link ${match[1]}.`);
  }
  assert.ok(!html.includes('calchub.netlify.app'), `${file}: old domain found.`);
}
for (const calc of calculators) {
  assert.ok(urls.includes(`${origin}/calculators/${calc.slug}`), `Missing calculator ${calc.slug}`);
}
assert.ok(fs.readFileSync('dist/robots.txt', 'utf8').includes(`Sitemap: ${origin}/sitemap.xml`));
assert.ok(fs.existsSync('dist/404.html'), 'Cloudflare needs a root 404 page to disable SPA fallback.');
assert.ok(!fs.readFileSync('dist/_redirects', 'utf8').includes('/*'), 'Catch-all rewrites can hide missing sitemap files.');
for (const file of ['app.js', 'calculators-data.js']) {
  assert.equal(fs.readFileSync(`js/${file}`, 'utf8'), fs.readFileSync(`dist/js/${file}`, 'utf8'));
  assert.equal(fs.readFileSync(`js/${file}`, 'utf8'), fs.readFileSync(`public/js/${file}`, 'utf8'));
}
console.log(`SEO checks passed for all ${urls.length} pages, canonical/social/schema URLs, internal links, robots.txt, and routing configuration.`);

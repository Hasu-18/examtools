#!/usr/bin/env node
/*
 * bookpipe.js — validate a book group before it goes into src/data/products.json
 *
 * HOW TO RUN
 *   node scripts/bookpipe.cjs <input.json>
 *
 * INPUT  (paste raw Amazon product URLs; the ASIN is parsed out for you)
 *   {
 *     "slug": "mht-cet",
 *     "books": [
 *       { "url": "https://www.amazon.in/Some-Book-Slug/dp/B0ABCDEFGH?crid=...",
 *         "badge": "PYQ",
 *         "note": "One or two sentences describing what the book contains." },
 *       { "url": "https://www.amazon.in/gp/product/9387860X12",
 *         "title": "Override when the URL slug is unusable",
 *         "publisher": "MTG", "badge": "PYQ", "note": "..." }
 *     ]
 *   }
 *
 *   url        required. /dp/<ASIN>, /gp/product/<ASIN>, /gp/aw/d/<ASIN> or /product/<ASIN>,
 *              with or without a query string. A shortlink with no ASIN in it is
 *              resolved first and the ASIN taken from where it lands.
 *   title      optional. Omit it and a draft is derived from the URL slug and
 *              printed for you to correct.
 *   publisher  optional, "" is fine — AffiliateBlock renders no element for an
 *              empty publisher, so it leaves no gap.
 *   badge      optional. Values in use: PYQ, Practice Sets, Complete Guide,
 *              2026 Edition, Bestseller, "Hindi & English".
 *   note       required, and must describe the actual book. Do not invent it.
 *
 * OUTPUT
 *   Per-book resolution result, a rule check, and the group as products.json
 *   would hold it. Writes nothing and never emits a price field. Exits non-zero
 *   if any rule fails, so it is safe to chain.
 *
 * RULES ENFORCED  (so they need not be re-derived next time)
 *   - slug must exist in src/data/exams.json
 *   - ASIN must be exactly 10 uppercase alphanumerics
 *   - URL is built as https://www.amazon.in/dp/<ASIN>?tag=formsetu-21 so the
 *     ASIN stays visible in the stored link and stays auditable
 *   - every URL must resolve 200 at an amazon.* host with tag=formsetu-21 intact
 *   - at most 3 books; 2 is allowed but warned, fewer than 2 fails
 *   - no duplicate title or ASIN within the group
 *   - warns if a URL already appears in another group, or if the group exists
 *   - never a price field
 *
 * NOTE ON SEARCH: amazon.in refuses programmatic fetches (503), so this tool
 * deliberately does not search for candidates or scrape product pages. Supply
 * title/publisher/note yourself, or wire this to the Product Advertising API.
 *
 * This file lives outside src/ and public/, so Astro never includes it in dist.
 * It is .cjs because package.json sets "type": "module" and this uses require().
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const exams = require(path.join(ROOT, 'src/data/exams.json'));
const products = require(path.join(ROOT, 'src/data/products.json'));

const examName = new Map(exams.map(e => [e.slug, e.name]));
const examFull = new Map(exams.map(e => [e.slug, e.fullName]));

const ASIN_RE = /^[A-Z0-9]{10}$/;
const AMAZON_HOST = /(^|\.)amazon\.[a-z.]+$/i;
const NULL_DEV = process.platform === 'win32' ? 'NUL' : '/dev/null';

// ---------------------------------------------------------------- helpers

function curlResolve(url) {
  try {
    const out = execFileSync('curl', [
      '-sS', '-L', '--max-time', '25', '-o', NULL_DEV,
      '-A', 'formsetu-link-check',
      '-w', '%{http_code} %{url_effective} %{num_redirects}',
      url
    ], { encoding: 'utf8', timeout: 40000 });
    const [code, final, hops] = out.trim().split(/\s+/);
    return { code, final, hops };
  } catch (e) {
    return { code: '000', final: '-', hops: '-', err: String(e.message).slice(0, 100) };
  }
}

// Pull the ASIN out of any of Amazon's product URL shapes.
function asinFrom(url) {
  const pats = [
    /\/dp\/([A-Za-z0-9]{10})(?:[/?#]|$)/,
    /\/gp\/product\/([A-Za-z0-9]{10})(?:[/?#]|$)/,
    /\/gp\/aw\/d\/([A-Za-z0-9]{10})(?:[/?#]|$)/,
    /\/product\/([A-Za-z0-9]{10})(?:[/?#]|$)/,
    /[?&]asin=([A-Za-z0-9]{10})(?:&|$)/i
  ];
  for (const re of pats) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// Draft a title from the human-readable slug segment of the URL.
function titleFrom(url) {
  let p;
  try { p = new URL(url).pathname; } catch { return null; }
  const segs = p.split('/').filter(Boolean);
  const stop = new Set(['dp', 'gp', 'product', 'aw', 'd', '-', 'en', 'hi']);
  // the slug is the segment immediately before the dp/gp marker
  const idx = segs.findIndex(s => s === 'dp' || s === 'product' || s === 'd');
  const cand = idx > 0 ? segs[idx - 1] : null;
  if (!cand || stop.has(cand) || ASIN_RE.test(cand) || !cand.includes('-')) return null;
  return decodeURIComponent(cand).replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- input

const inPath = process.argv[2];
if (!inPath) {
  console.error('usage: node scripts/bookpipe.js <input.json>   (see header for the input shape)');
  process.exit(2);
}
const input = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const slug = input.slug;
const books = Array.isArray(input.books) ? input.books : [];

const fails = [];
const warns = [];
const drafts = [];

if (!examName.has(slug)) {
  console.error('FAIL: "' + slug + '" is not a slug in src/data/exams.json');
  process.exit(1);
}

console.log('exam: ' + slug + '  "' + examName.get(slug) + '"');
if (examFull.get(slug) && examFull.get(slug) !== examName.get(slug)) {
  console.log('      fullName: ' + examFull.get(slug));
}
if (products[slug]) {
  warns.push('a group for "' + slug + '" already exists with ' +
    products[slug].items.length + ' book(s) — writing this would replace it');
}
console.log();

const usedUrl = new Map();
Object.entries(products).forEach(([k, g]) => g.items.forEach(i => usedUrl.set(i.url, k)));

// ---------------------------------------------------------------- per book

const items = [];
const asins = [];

books.forEach((b, i) => {
  const n = i + 1;
  const tag = 'book ' + n;

  if (!b.url) { fails.push(tag + ': no url'); return; }
  if ('price' in b) fails.push(tag + ': price field present — never allowed');
  if (!b.note) fails.push(tag + ': no note (it must describe the actual book)');

  // ---- ASIN: straight from the url, else resolve a shortlink and take it from there
  let asin = asinFrom(b.url);
  let asinVia = 'url';
  let resolvedFinal = null;
  if (!asin) {
    const r0 = curlResolve(b.url);
    resolvedFinal = r0.final;
    asin = asinFrom(r0.final || '');
    asinVia = 'resolved shortlink';
  }
  if (!asin) {
    fails.push(tag + ': could not find an ASIN in the url' +
      (resolvedFinal ? ' or in where it redirects (' + String(resolvedFinal).slice(0, 60) + ')' : ''));
    return;
  }
  if (!ASIN_RE.test(asin)) {
    fails.push(tag + ': parsed ASIN "' + asin + '" is not 10 uppercase alphanumerics');
    return;
  }
  asins.push(asin);

  // ---- title: supplied, or drafted from the url slug for correction
  const draft = titleFrom(b.url) || (resolvedFinal ? titleFrom(resolvedFinal) : null);
  let title = b.title;
  if (!title) {
    if (!draft) {
      fails.push(tag + ': no title given and the url has no usable slug — supply "title"');
    } else {
      title = draft;
      drafts.push({ n, asin, draft });
    }
  } else if (draft && draft !== b.title) {
    drafts.push({ n, asin, draft, supplied: b.title });
  }

  // ---- build + resolve
  const url = 'https://www.amazon.in/dp/' + asin + '?tag=formsetu-21';
  const r = curlResolve(url);
  let host = '-';
  try { host = new URL(r.final).host; } catch {}
  const tagKept = /[?&]tag=formsetu-21(&|$)/.test(r.final || '');
  const ok = r.code === '200' && AMAZON_HOST.test(host) && tagKept;
  if (!ok) {
    fails.push(tag + ': does not resolve clean — status ' + r.code +
      ', host ' + host + ', tag ' + (tagKept ? 'kept' : 'LOST'));
  }
  if (usedUrl.has(url)) warns.push(tag + ': this url already appears in group "' + usedUrl.get(url) + '"');

  console.log('  book ' + n + '  ASIN ' + asin + ' (' + asinVia + ')');
  console.log('      resolve: status=' + r.code + '  host=' + host +
    '  tag=' + (tagKept ? 'kept' : 'LOST') + '  hops=' + r.hops + '  -> ' + (ok ? 'PASS' : 'FAIL'));
  console.log('      title:   ' + (title || '(MISSING)'));

  items.push({
    title: title || '', publisher: b.publisher || '', badge: b.badge || '',
    note: b.note || '', image: '', url
  });
});

// ---------------------------------------------------------------- rules

const titles = items.map(x => x.title);
const dupT = titles.filter((x, i) => titles.indexOf(x) !== i);
const dupA = asins.filter((x, i) => asins.indexOf(x) !== i);
if (dupT.length) fails.push('duplicate title within the group: ' + [...new Set(dupT)].join(' | '));
if (dupA.length) fails.push('duplicate ASIN within the group: ' + [...new Set(dupA)].join(', '));
if (items.length > 3) fails.push('more than 3 books (' + items.length + ')');
if (items.length === 2) warns.push('only 2 books — allowed, but say so when handing this over rather than padding');
if (items.length < 2) fails.push('fewer than 2 books (' + items.length + ')');

if (drafts.length) {
  console.log();
  console.log('=== titles drafted from the URL slug — correct any that read badly ===');
  drafts.forEach(d => {
    console.log('  book ' + d.n + '  ' + d.asin);
    console.log('      draft:    ' + d.draft);
    if (d.supplied) console.log('      you gave: ' + d.supplied + '   (yours is used)');
  });
}

console.log();
console.log('=== rule check ===');
console.log('  books: ' + items.length +
  '   unique titles: ' + (new Set(titles).size === titles.length) +
  '   unique ASINs: ' + (new Set(asins).size === asins.length) +
  '   price fields: none');
console.log('  FAILS: ' + (fails.length ? '' : 'none'));
fails.forEach(f => console.log('    - ' + f));
console.log('  WARNINGS: ' + (warns.length ? '' : 'none'));
warns.forEach(w => console.log('    - ' + w));

console.log();
console.log('=== group JSON for review (nothing was written) ===');
console.log(JSON.stringify({
  [slug]: { label: 'Books for ' + examName.get(slug), note: '', items }
}, null, 2));

console.log();
if (fails.length) {
  console.log('VERDICT: NOT READY — ' + fails.length + ' failure(s) above.');
  process.exit(1);
}
console.log('VERDICT: all checks pass. Review the titles, then approve before this is written.');

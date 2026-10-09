import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES } from '../src/lib/registry/index.ts';
import { CATEGORIES } from '../src/lib/registry/categories.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const sitemapXmlPath = path.join(distDir, 'sitemap.xml');

const siteUrl = 'https://quote.info-myview.co.kr';

console.log('🔍 [ensure-sitemap] Starting Dynamic /sitemap.xml generation from Registry...');

if (!fs.existsSync(distDir)) {
  console.error('❌ dist directory does not exist! Please run astro build first.');
  process.exit(1);
}

// 1. Static informational pages with specific update dates (do not blindly overwrite with today)
const staticPages = [
  { path: '', priority: '1.0', changefreq: 'daily', lastmod: '2026-10-09' },
  { path: '/about', priority: '0.6', changefreq: 'monthly', lastmod: '2026-10-09' },
  { path: '/privacy', priority: '0.4', changefreq: 'yearly', lastmod: '2026-10-01' },
  { path: '/terms', priority: '0.4', changefreq: 'yearly', lastmod: '2026-10-01' },
];

// Determine latest service verification date for homepage lastmod
const latestServiceDate = SERVICES.reduce((latest, s) => {
  const d = s.evidence?.lastVerifiedAt || '2026-10-09';
  return d > latest ? d : latest;
}, '2026-10-01');
staticPages[0].lastmod = latestServiceDate;

// 2. Dynamic Categories from Registry
const categoryUrls = CATEGORIES.map((cat) => {
  const catServices = SERVICES.filter((s) => (s.categoryId || s.category) === cat.id);
  const catLatestDate = catServices.reduce((latest, s) => {
    const d = s.evidence?.lastVerifiedAt || '2026-10-09';
    return d > latest ? d : latest;
  }, '2026-10-01');

  return {
    loc: `${siteUrl}/category/${cat.id}`,
    lastmod: catLatestDate,
    changefreq: 'weekly',
    priority: '0.8',
  };
});

// 3. Dynamic Services from Registry (Scales automatically to 30, 40, 50, etc.)
const serviceUrls = SERVICES.map((service) => {
  const verifiedDate = service.evidence?.lastVerifiedAt || service.priceEvidence?.verifiedAt || '2026-10-09';
  return {
    loc: `${siteUrl}/estimate/${service.slug}`,
    lastmod: verifiedDate,
    changefreq: 'weekly',
    priority: '0.9',
  };
});

// Combine all URLs
const allUrls = [
  ...staticPages.map((p) => ({
    loc: p.path === '' ? `${siteUrl}/` : `${siteUrl}${p.path}`,
    lastmod: p.lastmod,
    changefreq: p.changefreq,
    priority: p.priority,
  })),
  ...categoryUrls,
  ...serviceUrls,
];

// Check duplicate URLs
const seenLocs = new Set();
const duplicates = [];
for (const u of allUrls) {
  if (seenLocs.has(u.loc)) {
    duplicates.push(u.loc);
  }
  seenLocs.add(u.loc);
}

if (duplicates.length > 0) {
  console.error(`❌ Duplicate URLs detected in sitemap generation (${duplicates.length} items):`, duplicates);
  process.exit(1);
}

console.log(`📊 Registry services dynamically loaded: ${SERVICES.length}`);
console.log(`📊 Registry categories dynamically loaded: ${CATEGORIES.length}`);
console.log(`📊 Total URLs to be indexed in official /sitemap.xml: ${allUrls.length}`);

// Generate clean, standard compliant XML
const xmlLines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
];

for (const u of allUrls) {
  xmlLines.push('  <url>');
  xmlLines.push(`    <loc>${u.loc}</loc>`);
  xmlLines.push(`    <lastmod>${u.lastmod}</lastmod>`);
  xmlLines.push(`    <changefreq>${u.changefreq}</changefreq>`);
  xmlLines.push(`    <priority>${u.priority}</priority>`);
  xmlLines.push('  </url>');
}

xmlLines.push('</urlset>');

const xmlContent = xmlLines.join('\n');
fs.writeFileSync(sitemapXmlPath, xmlContent, 'utf-8');

console.log(`✅ Successfully generated official /sitemap.xml with ${allUrls.length} URLs!`);
console.log(`   File location: ${sitemapXmlPath}`);
console.log(`   File size: ${Buffer.byteLength(xmlContent, 'utf8')} bytes`);

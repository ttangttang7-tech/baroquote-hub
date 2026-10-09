import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const sitemapXmlPath = path.join(distDir, 'sitemap.xml');

const siteUrl = 'https://quote.info-myview.co.kr';
const today = new Date().toISOString().split('T')[0];

console.log('🔍 [ensure-sitemap] Verifying /sitemap.xml generation in dist...');

if (!fs.existsSync(distDir)) {
  console.error('❌ dist directory does not exist! Please run astro build first.');
  process.exit(1);
}

// 1. Collect all static pages
const staticPages = [
  { path: '', priority: '1.0', changefreq: 'daily' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.4', changefreq: 'yearly' },
  { path: '/terms', priority: '0.4', changefreq: 'yearly' },
];

// 2. Collect 6 categories
const categories = [
  'cleaning',
  'moving',
  'heating-cooling',
  'plumbing',
  'interior',
  'installation',
];

// 3. Collect all 30 service slugs
const serviceSlugs = [
  // Cleaning (7)
  'move-in-cleaning',
  'air-conditioner-cleaning',
  'washing-machine-cleaning',
  'mold-removal',
  'housekeeper-service',
  'mattress-cleaning',
  'office-cleaning-service',
  // Moving (5)
  'studio-moving',
  'full-service-moving',
  'bulky-waste-removal',
  'freight-truck-delivery',
  'ladder-truck-moving',
  // Heating / Cooling (3)
  'ac-relocation-installation',
  'boiler-repair-replacement',
  'heating-pipe-flushing',
  // Plumbing (3)
  'leak-detection',
  'faucet-replacement',
  'drain-unclogging',
  // Interior (8)
  'wallpaper-flooring',
  'bathroom-renovation',
  'kitchen-cabinet-replacement',
  'tile-grout-repair',
  'interior-demolition-restoration',
  'insect-screen-replacement',
  'blinds-curtains-installation',
  'rooftop-waterproofing',
  // Installation (4)
  'smart-lock-installation',
  'wall-mounted-tv-installation',
  'lighting-installation',
  'kitchen-hood-replacement',
];

const allUrls = [
  ...staticPages.map(p => ({
    loc: `${siteUrl}${p.path}`,
    lastmod: today,
    changefreq: p.changefreq,
    priority: p.priority
  })),
  ...categories.map(c => ({
    loc: `${siteUrl}/category/${c}`,
    lastmod: today,
    changefreq: 'weekly',
    priority: '0.8'
  })),
  ...serviceSlugs.map(s => ({
    loc: `${siteUrl}/estimate/${s}`,
    lastmod: today,
    changefreq: 'weekly',
    priority: '0.9'
  }))
];

console.log(`📊 Total URLs to be indexed in official /sitemap.xml: ${allUrls.length}`);

// Generate clean, standard compliant XML
const xmlLines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
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

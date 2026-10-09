import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES } from '../src/lib/registry/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 [audit:seo] Starting SEO Audit...');

let errorCount = 0;

// 1. Uniqueness of SEO Title and Meta Description
const titles = new Set();
const descriptions = new Set();

for (const s of SERVICES) {
  if (!s.seo || !s.seo.title || !s.seo.description) {
    console.error(`❌ Service '${s.id}' missing seo.title or seo.description!`);
    errorCount++;
    continue;
  }

  if (titles.has(s.seo.title)) {
    console.error(`❌ Duplicate SEO title detected: "${s.seo.title}"`);
    errorCount++;
  }
  titles.add(s.seo.title);

  if (descriptions.has(s.seo.description)) {
    console.error(`❌ Duplicate SEO description detected: "${s.seo.description}"`);
    errorCount++;
  }
  descriptions.add(s.seo.description);

  // Check FAQ requirement: at least 4 FAQs per service
  if (!s.faqs || s.faqs.length < 4) {
    console.error(`❌ Service '${s.id}' has fewer than 4 FAQs (found: ${s.faqs?.length || 0})`);
    errorCount++;
  }

  // Check each FAQ has non-empty question and answer
  s.faqs.forEach((faq, i) => {
    if (!faq.question || faq.question.trim().length === 0) {
      console.error(`❌ Service '${s.id}' FAQ #${i+1} has empty question!`);
      errorCount++;
    }
    if (!faq.answer || faq.answer.trim().length === 0) {
      console.error(`❌ Service '${s.id}' FAQ #${i+1} has empty answer!`);
      errorCount++;
    }
  });
}

console.log(`✅ Verified ${SERVICES.length} unique titles, descriptions, and 4+ FAQs each.`);

// 2. Check robots.txt
const robotsTxtPath = path.join(projectRoot, 'public', 'robots.txt');
if (!fs.existsSync(robotsTxtPath)) {
  console.error('❌ public/robots.txt not found!');
  errorCount++;
} else {
  const robotsContent = fs.readFileSync(robotsTxtPath, 'utf-8');
  if (!robotsContent.includes('Sitemap: https://quote.info-myview.co.kr/sitemap.xml')) {
    console.error('❌ robots.txt does not contain exact Sitemap: https://quote.info-myview.co.kr/sitemap.xml');
    errorCount++;
  } else {
    console.log('✅ public/robots.txt contains exact official sitemap URL.');
  }
}

// 3. Check dist/sitemap.xml if dist exists
const distSitemapPath = path.join(projectRoot, 'dist', 'sitemap.xml');
if (fs.existsSync(distSitemapPath)) {
  const sitemapContent = fs.readFileSync(distSitemapPath, 'utf-8');
  if (!sitemapContent.startsWith('<?xml') || !sitemapContent.includes('<urlset')) {
    console.error('❌ dist/sitemap.xml is not valid XML or missing urlset tag!');
    errorCount++;
  } else {
    // Check all 30 service URLs exist in sitemap
    for (const s of SERVICES) {
      const expectedUrl = `https://quote.info-myview.co.kr/estimate/${s.slug}`;
      if (!sitemapContent.includes(expectedUrl)) {
        console.error(`❌ dist/sitemap.xml missing URL for service: ${expectedUrl}`);
        errorCount++;
      }
    }
    console.log('✅ dist/sitemap.xml checked: all service URLs present.');
  }
} else {
  console.log('ℹ️ dist/sitemap.xml not yet built (will be verified after build).');
}

if (errorCount > 0) {
  console.error(`\n💥 SEO Audit FAILED with ${errorCount} errors.`);
  process.exit(1);
} else {
  console.log('\n🎉 SEO Audit PASSED successfully!\n');
}

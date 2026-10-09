import { SERVICES } from '../src/lib/registry/index.ts';
import { CATEGORIES } from '../src/lib/registry/categories.ts';

const DOMAINS = [
  'https://quote.info-myview.co.kr',
  'https://baroquote-hub.ttangttang7.workers.dev'
];

async function verifyDomain(baseUrl) {
  console.log(`\n========================================`);
  console.log(`🌐 Live Verification on: ${baseUrl}`);
  console.log(`========================================`);

  let totalChecked = 0;
  let passCount = 0;
  let failCount = 0;

  const testUrls = [
    '',
    '/about',
    '/privacy',
    '/terms',
    '/robots.txt',
    '/sitemap.xml',
    ...CATEGORIES.map(c => `/category/${c.id}`),
    ...SERVICES.map(s => `/estimate/${s.slug}`)
  ];

  for (const path of testUrls) {
    const fullUrl = `${baseUrl}${path}`;
    totalChecked++;
    try {
      const res = await fetch(fullUrl, { headers: { 'User-Agent': 'BaroQuote-Audit-Agent/1.0' } });
      if (res.status === 200) {
        passCount++;
        if (path === '/sitemap.xml') {
          const text = await res.text();
          const hasXml = text.includes('<?xml') && text.includes('<urlset');
          const has30 = SERVICES.every(s => text.includes(`/estimate/${s.slug}`));
          console.log(`   [200 OK] ${path} (Valid XML: ${hasXml}, All 30 tools included: ${has30})`);
        } else if (path === '/robots.txt') {
          const text = await res.text();
          const hasSitemap = text.includes('Sitemap: https://quote.info-myview.co.kr/sitemap.xml');
          console.log(`   [200 OK] ${path} (Sitemap directive: ${hasSitemap})`);
        }
      } else {
        failCount++;
        console.error(`   [${res.status} FAIL] ${path}`);
      }
    } catch (err) {
      failCount++;
      console.error(`   [ERR] ${path} -> ${err.message}`);
    }
  }

  console.log(`\n📊 Result for ${baseUrl}: Checked ${totalChecked}, Passed ${passCount}, Failed ${failCount}`);
  return { passCount, failCount, totalChecked };
}

async function main() {
  for (const domain of DOMAINS) {
    await verifyDomain(domain);
  }
}

main().catch(console.error);

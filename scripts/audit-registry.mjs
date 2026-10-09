import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES } from '../src/lib/registry/index.ts';
import { CATEGORIES } from '../src/lib/registry/categories.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 [audit:registry] Starting Scalable Registry Audit...');

let errorCount = 0;

// Baseline 30 slugs established at release (427aa35)
// Any future expansion (40, 50, etc.) must preserve all 30 baseline tools without deletion.
const BASELINE_30_SLUGS = [
  'move-in-cleaning',
  'air-conditioner-cleaning',
  'washing-machine-cleaning',
  'mold-removal',
  'housekeeper-service',
  'mattress-cleaning',
  'office-cleaning-service',
  'studio-moving',
  'full-service-moving',
  'bulky-waste-removal',
  'freight-truck-delivery',
  'ladder-truck-moving',
  'ac-relocation-installation',
  'boiler-repair-replacement',
  'heating-pipe-flushing',
  'leak-detection',
  'faucet-replacement',
  'drain-unclogging',
  'wallpaper-flooring',
  'bathroom-renovation',
  'kitchen-cabinet-replacement',
  'tile-grout-repair',
  'interior-demolition-restoration',
  'insect-screen-replacement',
  'blinds-curtains-installation',
  'rooftop-waterproofing',
  'smart-lock-installation',
  'wall-mounted-tv-installation',
  'lighting-installation',
  'kitchen-hood-replacement',
];

// 1. Scalable Batch Count Rule: minimum 30, expanded in batches of 10 (30, 40, 50...)
const totalCount = SERVICES.length;
if (totalCount < 30) {
  console.error(`❌ Total service count is below baseline: found ${totalCount}, expected at least 30.`);
  errorCount++;
} else if (totalCount % 10 !== 0) {
  console.error(`❌ Total service count (${totalCount}) violates 10-tool batch increment policy (must be a multiple of 10: 30, 40, 50...).`);
  errorCount++;
} else {
  console.log(`✅ Total service count: ${totalCount} (Valid 10-tool batch, baseline satisfied) (PASS)`);
}

// 2. Deletion Detection: all baseline 30 slugs must still exist
const currentSlugs = new Set(SERVICES.map((s) => s.slug));
const missingBaseline = BASELINE_30_SLUGS.filter((slug) => !currentSlugs.has(slug));
if (missingBaseline.length > 0) {
  console.error(`❌ Deletion detected! The following baseline services are missing:`, missingBaseline);
  errorCount += missingBaseline.length;
} else {
  console.log(`✅ Baseline preservation: all ${BASELINE_30_SLUGS.length} baseline services confirmed present (PASS)`);
}

// 3. Uniqueness Checks: IDs, Slugs, RuleIDs
const ids = new Set();
const slugs = new Set();
const ruleIds = new Set();

for (const s of SERVICES) {
  if (ids.has(s.id)) {
    console.error(`❌ Duplicate service id detected: ${s.id}`);
    errorCount++;
  }
  ids.add(s.id);

  if (slugs.has(s.slug)) {
    console.error(`❌ Duplicate service slug detected: ${s.slug}`);
    errorCount++;
  }
  slugs.add(s.slug);

  if (ruleIds.has(s.ruleId)) {
    console.error(`❌ Duplicate service ruleId detected: ${s.ruleId}`);
    errorCount++;
  }
  ruleIds.add(s.ruleId);
}
console.log(`✅ Uniqueness check: ${ids.size} IDs, ${slugs.size} slugs, ${ruleIds.size} rule IDs (PASS)`);

// 4. Category Integrity & Automatic Validation
if (CATEGORIES.length < 6) {
  console.error(`❌ Category count is below standard 6 categories: found ${CATEGORIES.length}`);
  errorCount++;
} else {
  console.log(`✅ Category count: ${CATEGORIES.length} categories defined (PASS)`);
}

const validCategoryIds = new Set(CATEGORIES.map((c) => c.id));
const categoryDistribution = {};
for (const cat of CATEGORIES) {
  categoryDistribution[cat.id] = 0;
}

for (const s of SERVICES) {
  const catId = s.categoryId || s.category;
  if (!validCategoryIds.has(catId)) {
    console.error(`❌ Service '${s.id}' (${s.slug}) references invalid category: '${catId}'`);
    errorCount++;
  } else {
    categoryDistribution[catId]++;
  }

  if (!s.questions || s.questions.length === 0) {
    console.error(`❌ Service '${s.id}' (${s.slug}) has no questions defined!`);
    errorCount++;
  }
}

for (const [catId, count] of Object.entries(categoryDistribution)) {
  if (count === 0) {
    console.error(`❌ Category '${catId}' has 0 active services registered!`);
    errorCount++;
  } else {
    console.log(`   - Category '${catId}': ${count} services`);
  }
}

// 5. Main Page vs Registry Consistency
const indexAstroPath = path.join(projectRoot, 'src', 'pages', 'index.astro');
if (fs.existsSync(indexAstroPath)) {
  const indexContent = fs.readFileSync(indexAstroPath, 'utf-8');
  // Check that index references SERVICES or dynamic categories
  if (!indexContent.includes('SERVICES') && !indexContent.includes('CATEGORIES')) {
    console.warn(`⚠️ Warning: src/pages/index.astro might not be consuming Registry dynamically.`);
  } else {
    console.log(`✅ Main page (index.astro) dynamically integrates Registry (PASS)`);
  }
}

// 6. Sitemap vs Registry Consistency
const distSitemapPath = path.join(projectRoot, 'dist', 'sitemap.xml');
if (fs.existsSync(distSitemapPath)) {
  const sitemapContent = fs.readFileSync(distSitemapPath, 'utf-8');
  let sitemapMismatch = 0;
  for (const s of SERVICES) {
    const serviceUrl = `https://quote.info-myview.co.kr/estimate/${s.slug}`;
    if (!sitemapContent.includes(serviceUrl)) {
      console.error(`❌ Sitemap mismatch: URL for service '${s.slug}' not found in dist/sitemap.xml`);
      sitemapMismatch++;
    }
  }

  // Count total estimate URLs in sitemap
  const estimateMatches = sitemapContent.match(/<loc>https:\/\/quote\.info-myview\.co\.kr\/estimate\/[^<]+<\/loc>/g) || [];
  if (estimateMatches.length !== SERVICES.length) {
    console.error(`❌ Sitemap estimate URL count mismatch: sitemap has ${estimateMatches.length}, Registry has ${SERVICES.length}`);
    sitemapMismatch++;
  }

  if (sitemapMismatch > 0) {
    errorCount += sitemapMismatch;
  } else {
    console.log(`✅ Sitemap vs Registry: all ${SERVICES.length} service URLs match dist/sitemap.xml with 0 orphans (PASS)`);
  }
} else {
  console.log(`ℹ️ dist/sitemap.xml not yet built (will be verified after build step).`);
}

if (errorCount > 0) {
  console.error(`\n💥 Scalable Registry Audit FAILED with ${errorCount} errors.`);
  process.exit(1);
} else {
  console.log(`\n🎉 Scalable Registry Audit PASSED successfully! (Scalable to 40, 50+ services)\n`);
}

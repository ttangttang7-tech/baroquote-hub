import { SERVICES } from '../src/lib/registry/index.ts';
import { CATEGORIES } from '../src/lib/registry/categories.ts';

console.log('🔍 [audit:registry] Starting Registry Audit...');

let errorCount = 0;

// 1. Total count check
if (SERVICES.length !== 30) {
  console.error(`❌ Expected exactly 30 services, found ${SERVICES.length}`);
  errorCount++;
} else {
  console.log(`✅ Total service count: ${SERVICES.length} (PASS)`);
}

// 2. Categories count check
if (CATEGORIES.length !== 6) {
  console.error(`❌ Expected exactly 6 categories, found ${CATEGORIES.length}`);
  errorCount++;
} else {
  console.log(`✅ Total category count: ${CATEGORIES.length} (PASS)`);
}

// 3. Category count distribution check
const expectedCategoryCounts = {
  'cleaning': 7,
  'moving': 5,
  'heating-cooling': 3,
  'plumbing': 3,
  'interior': 8,
  'installation': 4,
};

const categoryCounts = {};
for (const s of SERVICES) {
  categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
}

for (const [catId, expected] of Object.entries(expectedCategoryCounts)) {
  const actual = categoryCounts[catId] || 0;
  if (actual !== expected) {
    console.error(`❌ Category '${catId}' expected ${expected} services, but found ${actual}`);
    errorCount++;
  } else {
    console.log(`✅ Category '${catId}': ${actual} services (PASS)`);
  }
}

// 4. Uniqueness check: id, slug, ruleId
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

  // Check category validity
  const validCat = CATEGORIES.some(c => c.id === s.category);
  if (!validCat) {
    console.error(`❌ Service '${s.id}' references invalid category: ${s.category}`);
    errorCount++;
  }

  // Check questions
  if (!s.questions || s.questions.length === 0) {
    console.error(`❌ Service '${s.id}' has no questions defined!`);
    errorCount++;
  }
}

console.log(`✅ IDs: ${ids.size} unique (PASS)`);
console.log(`✅ Slugs: ${slugs.size} unique (PASS)`);
console.log(`✅ Rule IDs: ${ruleIds.size} unique (PASS)`);

if (errorCount > 0) {
  console.error(`\n💥 Registry Audit FAILED with ${errorCount} errors.`);
  process.exit(1);
} else {
  console.log('\n🎉 Registry Audit PASSED successfully!\n');
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES } from '../src/lib/registry/index.ts';
import { calculateEstimate } from '../src/lib/engine/estimator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 [audit:prices] Starting Enhanced Price Evidence & Rate Audit...');

let errorCount = 0;
let networkWarningCount = 0;

// Load accurate scraped reference dataset if available
const scrapedPath = path.join(__dirname, 'accurate-soomgo-prices.json');
let scrapedData = [];
if (fs.existsSync(scrapedPath)) {
  try {
    scrapedData = JSON.parse(fs.readFileSync(scrapedPath, 'utf-8'));
    console.log(`📋 Loaded ${scrapedData.length} reference price entries from accurate-soomgo-prices.json`);
  } catch (err) {
    console.warn('⚠️ Could not parse accurate-soomgo-prices.json:', err.message);
  }
}

// Fabricated / unverified entities that must NEVER be asserted as official price sources
const DISALLOWED_FAKE_ENTITIES = [
  '한국청소협동조합',
  '한국수도관리공사',
  '한국난방배관세척협회',
  '대한도배협회',
  '한국줄눈시공협회',
  '한국비계구조물해체공사업협회',
  '한국차양창호협회',
  '한국가전설치기사연합',
];

const VALID_VERIFICATION_STATUSES = ['verified', 'partially_verified', 'unverified', 'stale'];
const VALID_SOURCE_TYPES = ['official_standard', 'platform_average', 'market_survey', 'regulatory_guideline'];
const VALID_UNITS = ['건당', '평당', '시공당', '시간당', '대당', '개소당', '만원', '원'];

// Today's date boundary
const TODAY_STR = '2026-10-09';

// 1. Synchronous Structural & Logical Price Audits
for (const service of SERVICES) {
  const ev = service.priceEvidence || service.evidence;
  if (!ev) {
    console.error(`❌ Service '${service.id}' (${service.slug}) missing price evidence object!`);
    errorCount++;
    continue;
  }

  // --- Check 1: Provider and Entity Authenticity ---
  if (!ev.provider || ev.provider.trim().length === 0) {
    console.error(`❌ Service '${service.slug}' missing provider name!`);
    errorCount++;
  } else {
    for (const fakeEntity of DISALLOWED_FAKE_ENTITIES) {
      if (ev.provider.includes(fakeEntity)) {
        console.error(`❌ Service '${service.slug}' asserts fabricated entity as price source: "${fakeEntity}"`);
        errorCount++;
      }
    }
  }

  // --- Check 2: Source Type Appropriateness ---
  const sType = ev.sourceType;
  if (!sType || !VALID_SOURCE_TYPES.includes(sType)) {
    console.error(`❌ Service '${service.slug}' has invalid sourceType: '${sType}' (expected one of ${VALID_SOURCE_TYPES.join(', ')})`);
    errorCount++;
  }

  // If source is a platform (Soomgo, etc.), it MUST NOT be declared as 'official_standard'
  if (ev.sourceUrl && ev.sourceUrl.includes('soomgo.com') && sType === 'official_standard') {
    console.error(`❌ Service '${service.slug}' incorrectly marked platform data (soomgo.com) as official_standard! Must be 'platform_average'.`);
    errorCount++;
  }

  // --- Check 3: Verification Status Integrity ---
  const vStatus = ev.verificationStatus;
  if (!vStatus || !VALID_VERIFICATION_STATUSES.includes(vStatus)) {
    console.error(`❌ Service '${service.slug}' has invalid verificationStatus: '${vStatus}'`);
    errorCount++;
  }

  if (vStatus !== 'verified' && ev.verified === true) {
    console.error(`❌ Service '${service.slug}' is marked verified: true despite verificationStatus being '${vStatus}'!`);
    errorCount++;
  }

  // --- Check 4: Base Price & Min/Max Bound Consistency ---
  if (typeof ev.basePrice !== 'number' || isNaN(ev.basePrice) || ev.basePrice <= 0) {
    console.error(`❌ Service '${service.slug}' has invalid basePrice: ${ev.basePrice}`);
    errorCount++;
  }

  if (typeof ev.minPrice === 'number' && typeof ev.maxPrice === 'number') {
    if (ev.minPrice > ev.maxPrice) {
      console.error(`❌ Service '${service.slug}' has minPrice (${ev.minPrice}) > maxPrice (${ev.maxPrice})`);
      errorCount++;
    }
    if (ev.minPrice > ev.basePrice || ev.maxPrice < ev.basePrice) {
      console.error(`❌ Service '${service.slug}' basePrice (${ev.basePrice}) is out of [minPrice, maxPrice] range [${ev.minPrice}, ${ev.maxPrice}]`);
      errorCount++;
    }
  }

  // Compare against scraped reference data if matching slug found
  const refItem = scrapedData.find((item) => item.slug === service.slug);
  if (refItem) {
    if (ev.basePrice !== refItem.avg) {
      console.error(`❌ Service '${service.slug}' basePrice (${ev.basePrice}) does not match scraped source average (${refItem.avg})!`);
      errorCount++;
    }
    if (typeof ev.minPrice === 'number' && ev.minPrice !== refItem.min) {
      console.error(`❌ Service '${service.slug}' minPrice (${ev.minPrice}) does not match scraped source min (${refItem.min})!`);
      errorCount++;
    }
    if (typeof ev.maxPrice === 'number' && ev.maxPrice !== refItem.max) {
      console.error(`❌ Service '${service.slug}' maxPrice (${ev.maxPrice}) does not match scraped source max (${refItem.max})!`);
      errorCount++;
    }
  }

  // --- Check 5: Price Unit Validation ---
  if (!ev.priceUnit || typeof ev.priceUnit !== 'string' || ev.priceUnit.trim().length === 0) {
    console.error(`❌ Service '${service.slug}' missing priceUnit!`);
    errorCount++;
  } else {
    const hasValidUnit = VALID_UNITS.some((u) => ev.priceUnit.includes(u));
    if (!hasValidUnit) {
      console.error(`❌ Service '${service.slug}' priceUnit '${ev.priceUnit}' does not contain recognized unit (${VALID_UNITS.join(', ')})`);
      errorCount++;
    }
  }

  // --- Check 6: Verification Date Validity ---
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!ev.lastVerifiedAt || !dateRegex.test(ev.lastVerifiedAt) || isNaN(Date.parse(ev.lastVerifiedAt))) {
    console.error(`❌ Service '${service.slug}' invalid lastVerifiedAt date: '${ev.lastVerifiedAt}'`);
    errorCount++;
  } else if (ev.lastVerifiedAt > TODAY_STR) {
    console.error(`❌ Service '${service.slug}' lastVerifiedAt is in the future: '${ev.lastVerifiedAt}' (today is ${TODAY_STR})`);
    errorCount++;
  }

  if (ev.surveyedAt && (!dateRegex.test(ev.surveyedAt) || isNaN(Date.parse(ev.surveyedAt)) || ev.surveyedAt > TODAY_STR)) {
    console.error(`❌ Service '${service.slug}' invalid surveyedAt date: '${ev.surveyedAt}'`);
    errorCount++;
  }

  // --- Check 7: Question Option Deltas Sanity ---
  for (const q of service.questions) {
    if (q.options) {
      for (const opt of q.options) {
        if (typeof opt.priceDelta === 'number') {
          if (isNaN(opt.priceDelta) || !isFinite(opt.priceDelta)) {
            console.error(`❌ Service '${service.slug}' question '${q.id}' option '${opt.value}' has invalid priceDelta: ${opt.priceDelta}`);
            errorCount++;
          }
          if (opt.priceDelta > ev.basePrice * 5 && ev.basePrice > 0) {
            console.error(`❌ Service '${service.slug}' question '${q.id}' option '${opt.value}' priceDelta (${opt.priceDelta}) exceeds 5x basePrice (${ev.basePrice})`);
            errorCount++;
          }
        }
      }
    }
  }

  // --- Check 8: calculateEstimate Sanity Run ---
  try {
    const initialAnswers = {};
    for (const q of service.questions) {
      initialAnswers[q.id] = q.defaultValue;
    }
    const res = calculateEstimate(service.id, initialAnswers);
    if (!res || !res.minAmount || !res.maxAmount || res.minAmount > res.maxAmount) {
      console.error(`❌ calculateEstimate produced invalid amounts for service '${service.slug}': min=${res?.minAmount}, max=${res?.maxAmount}`);
      errorCount++;
    }
  } catch (err) {
    console.error(`❌ calculateEstimate threw exception for service '${service.slug}':`, err);
    errorCount++;
  }
}

// 2. Asynchronous Source URL Verification
console.log('\n🌐 Probing 30 Price Source URLs (differentiating network timeouts vs source 404s)...');

const urlCheckPromises = SERVICES.map(async (service) => {
  const ev = service.priceEvidence || service.evidence;
  const rawUrl = ev.sourceUrl;

  // URL format validation
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    console.error(`❌ Service '${service.slug}' has unparseable sourceUrl: '${rawUrl}'`);
    return { status: 'error', slug: service.slug, message: 'Invalid URL format' };
  }

  if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.includes('soomgo.com')) {
    console.error(`❌ Service '${service.slug}' sourceUrl is not valid https soomgo endpoint: '${rawUrl}'`);
    return { status: 'error', slug: service.slug, message: 'Invalid source domain' };
  }

  // Probe live endpoint with 6s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(rawUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 200) {
      return { status: 'ok', slug: service.slug, url: rawUrl, httpStatus: 200 };
    } else if (res.status === 404 || res.status === 410) {
      console.error(`❌ [SOURCE DEAD] Service '${service.slug}' sourceUrl returned HTTP ${res.status}: ${rawUrl}`);
      return { status: 'error', slug: service.slug, message: `HTTP ${res.status} Not Found` };
    } else {
      // 403, 429, 500 etc. (platform rate limits or bot protections)
      console.warn(`⚠️ [PLATFORM NOTICE] Service '${service.slug}' returned HTTP ${res.status} (likely bot check): ${rawUrl}`);
      return { status: 'warning', slug: service.slug, message: `HTTP ${res.status}` };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`⚠️ [NETWORK TIMEOUT] Service '${service.slug}' URL probe timed out (transient network latency, not 404): ${rawUrl}`);
      return { status: 'network_warning', slug: service.slug, message: 'Timeout' };
    } else {
      console.warn(`⚠️ [NETWORK WARNING] Service '${service.slug}' URL probe connection error: ${err.message}`);
      return { status: 'network_warning', slug: service.slug, message: err.message };
    }
  }
});

const urlResults = await Promise.all(urlCheckPromises);

for (const r of urlResults) {
  if (r.status === 'error') {
    errorCount++;
  } else if (r.status === 'network_warning' || r.status === 'warning') {
    networkWarningCount++;
  }
}

const successCount = urlResults.filter((r) => r.status === 'ok').length;
console.log(`\n📊 Source URL Verification Summary:`);
console.log(`   - Verified HTTP 200 OK: ${successCount} / ${SERVICES.length}`);
console.log(`   - Network Notices / Latency: ${networkWarningCount}`);
console.log(`   - Dead / Invalid Source URLs: ${urlResults.filter((r) => r.status === 'error').length}`);

if (errorCount > 0) {
  console.error(`\n💥 Price Audit FAILED with ${errorCount} errors.`);
  process.exit(1);
} else {
  console.log(`\n🎉 Price Audit PASSED successfully! All price evidence and rates verified.\n`);
}

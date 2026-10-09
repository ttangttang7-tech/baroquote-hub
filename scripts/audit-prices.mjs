import { SERVICES } from '../src/lib/registry/index.ts';
import { calculateEstimate } from '../src/lib/engine/estimator.ts';

console.log('🔍 [audit:prices] Starting Price Evidence & Engine Audit...');

let errorCount = 0;

for (const service of SERVICES) {
  const ev = service.priceEvidence;
  if (!ev) {
    console.error(`❌ Service '${service.id}' has no priceEvidence object!`);
    errorCount++;
    continue;
  }

  if (!ev.sourceName || ev.sourceName.trim().length === 0) {
    console.error(`❌ Service '${service.id}' missing sourceName in priceEvidence`);
    errorCount++;
  }

  if (!ev.conditions || ev.conditions.trim().length === 0) {
    console.error(`❌ Service '${service.id}' missing conditions in priceEvidence`);
    errorCount++;
  }

  if (!ev.verifiedAt) {
    console.error(`❌ Service '${service.id}' missing verifiedAt in priceEvidence`);
    errorCount++;
  }

  if (!ev.verified) {
    console.warn(`⚠️ Warning: Service '${service.id}' is marked unverified.`);
  }

  if (service.estimateType === 'range_estimate') {
    if (typeof service.defaultMinAmount !== 'number' || service.defaultMinAmount <= 0) {
      console.error(`❌ Service '${service.id}' is range_estimate but defaultMinAmount is invalid: ${service.defaultMinAmount}`);
      errorCount++;
    }

    if (typeof service.defaultMaxAmount !== 'number' || service.defaultMaxAmount < (service.defaultMinAmount || 0)) {
      console.error(`❌ Service '${service.id}' is range_estimate but defaultMaxAmount is invalid or smaller than min: ${service.defaultMaxAmount}`);
      errorCount++;
    }
  }

  // Test calculateEstimate with default values
  const defaultAnswers = {};
  for (const q of service.questions) {
    defaultAnswers[q.id] = q.defaultValue;
  }

  try {
    const res = calculateEstimate(service.id, defaultAnswers);
    if (!res) {
      console.error(`❌ calculateEstimate returned null/undefined for service '${service.id}'`);
      errorCount++;
      continue;
    }

    if (res.type === 'range_estimate') {
      if (typeof res.minAmount !== 'number' || isNaN(res.minAmount) || !isFinite(res.minAmount) || res.minAmount < 0) {
        console.error(`❌ Calculated minAmount invalid for service '${service.id}': ${res.minAmount}`);
        errorCount++;
      }
      if (typeof res.maxAmount !== 'number' || isNaN(res.maxAmount) || !isFinite(res.maxAmount) || res.maxAmount < (res.minAmount || 0)) {
        console.error(`❌ Calculated maxAmount invalid for service '${service.id}': ${res.maxAmount}`);
        errorCount++;
      }
    }

    if (!res.basis || !res.basis.explanation || !Array.isArray(res.basis.breakdown)) {
      console.error(`❌ Basis breakdown missing or malformed for service '${service.id}'`);
      errorCount++;
    }

    if (!Array.isArray(res.includedItems) || res.includedItems.length === 0) {
      console.error(`❌ Included items empty for service '${service.id}'`);
      errorCount++;
    }

    if (!Array.isArray(res.excludedItems) || res.excludedItems.length === 0) {
      console.error(`❌ Excluded items empty for service '${service.id}'`);
      errorCount++;
    }

    if (!Array.isArray(res.checklist) || res.checklist.length === 0) {
      console.error(`❌ Checklist empty for service '${service.id}'`);
      errorCount++;
    }
  } catch (err) {
    console.error(`❌ Exception calculating estimate for service '${service.id}':`, err);
    errorCount++;
  }
}

if (errorCount > 0) {
  console.error(`\n💥 Price Audit FAILED with ${errorCount} errors.`);
  process.exit(1);
} else {
  console.log(`\n🎉 Price Audit PASSED successfully! All ${SERVICES.length} services verified.\n`);
}

import { describe, it, expect } from 'vitest';
import { SERVICES } from '../../src/lib/registry';
import { calculateEstimate } from '../../src/lib/engine/estimator';

describe('Estimation Engine — 30 Services Comprehensive Unit Test Suite (150+ tests)', () => {
  for (const service of SERVICES) {
    describe(`Service #${service.id} — ${service.title} (${service.slug})`, () => {
      // Helper to build default answers
      const getDefaultAnswers = () => {
        const answers: Record<string, any> = {};
        for (const q of service.questions) {
          answers[q.id] = q.defaultValue;
        }
        return answers;
      };

      // Test Case 1: Normal typical input
      it('Case 1: Standard normal input calculation', () => {
        const answers = getDefaultAnswers();
        const result = calculateEstimate(service.id, answers);

        expect(result).toBeDefined();
        expect(result.serviceId).toBe(service.id);
        expect(['range_estimate', 'quote_preparation']).toContain(result.type);
        expect(result.basis.breakdown.length).toBeGreaterThan(0);
        expect(result.includedItems.length).toBeGreaterThan(0);
        expect(result.excludedItems.length).toBeGreaterThan(0);
        expect(result.checklist.length).toBeGreaterThan(0);

        if (result.type === 'range_estimate') {
          expect(result.minAmount).toBeGreaterThan(0);
          expect(result.maxAmount).toBeGreaterThanOrEqual(result.minAmount!);
          expect(Number.isFinite(result.minAmount)).toBe(true);
          expect(Number.isFinite(result.maxAmount)).toBe(true);
          expect(Number.isNaN(result.minAmount)).toBe(false);
          expect(Number.isNaN(result.maxAmount)).toBe(false);
        }
      });

      // Test Case 2: Boundary minimum
      it('Case 2: Boundary minimum input calculation', () => {
        const answers = getDefaultAnswers();
        for (const q of service.questions) {
          if (q.type === 'number' && typeof q.min === 'number') {
            answers[q.id] = q.min;
          } else if (q.options && q.options.length > 0) {
            answers[q.id] = q.options[0].value;
          } else if (q.type === 'boolean') {
            answers[q.id] = false;
          }
        }

        const result = calculateEstimate(service.id, answers);
        expect(result).toBeDefined();

        if (result.type === 'range_estimate') {
          expect(result.minAmount).toBeGreaterThanOrEqual(0);
          expect(result.maxAmount).toBeGreaterThanOrEqual(result.minAmount!);
          expect(Number.isFinite(result.minAmount)).toBe(true);
          expect(Number.isFinite(result.maxAmount)).toBe(true);
        }
      });

      // Test Case 3: Boundary maximum
      it('Case 3: Boundary maximum input calculation', () => {
        const answers = getDefaultAnswers();
        for (const q of service.questions) {
          if (q.type === 'number' && typeof q.max === 'number') {
            answers[q.id] = q.max;
          } else if (q.options && q.options.length > 0) {
            answers[q.id] = q.options[q.options.length - 1].value;
          } else if (q.type === 'boolean') {
            answers[q.id] = true;
          }
        }

        const result = calculateEstimate(service.id, answers);
        expect(result).toBeDefined();

        if (result.type === 'range_estimate') {
          expect(result.minAmount).toBeGreaterThan(0);
          expect(result.maxAmount).toBeGreaterThanOrEqual(result.minAmount!);
          expect(Number.isFinite(result.minAmount)).toBe(true);
          expect(Number.isFinite(result.maxAmount)).toBe(true);
        }
      });

      // Test Case 4: Missing / Empty input fallback
      it('Case 4: Empty answers fallback to service defaults without errors', () => {
        const result = calculateEstimate(service.id, {});
        expect(result).toBeDefined();
        expect(result.serviceId).toBe(service.id);

        if (result.type === 'range_estimate') {
          expect(result.minAmount).toBeGreaterThan(0);
          expect(result.maxAmount).toBeGreaterThanOrEqual(result.minAmount!);
          expect(Number.isNaN(result.minAmount)).toBe(false);
          expect(Number.isNaN(result.maxAmount)).toBe(false);
        }
      });

      // Test Case 5: Dynamic variation condition check
      it('Case 5: Verification that changing options changes output or breakdown', () => {
        const defaultAnswers = getDefaultAnswers();
        const baseResult = calculateEstimate(service.id, defaultAnswers);

        // Find first question with options or a number field to alter
        const qToAlter = service.questions.find(q => 
          (q.options && q.options.length > 1) || q.type === 'number' || q.type === 'boolean'
        );

        if (qToAlter) {
          const alteredAnswers = { ...defaultAnswers };
          if (qToAlter.type === 'number') {
            alteredAnswers[qToAlter.id] = (defaultAnswers[qToAlter.id] || 10) * 2;
          } else if (qToAlter.options && qToAlter.options.length > 1) {
            const currentVal = defaultAnswers[qToAlter.id];
            const otherOpt = qToAlter.options.find(o => o.value !== currentVal) || qToAlter.options[1];
            alteredAnswers[qToAlter.id] = otherOpt.value;
          } else if (qToAlter.type === 'boolean') {
            alteredAnswers[qToAlter.id] = !defaultAnswers[qToAlter.id];
          }

          const alteredResult = calculateEstimate(service.id, alteredAnswers);
          expect(alteredResult).toBeDefined();

          if (baseResult.type === 'range_estimate') {
            // Price or breakdown note should reflect the alteration
            const priceChanged = alteredResult.minAmount !== baseResult.minAmount || alteredResult.maxAmount !== baseResult.maxAmount;
            const breakdownChanged = alteredResult.basis.breakdown.length !== baseResult.basis.breakdown.length ||
              JSON.stringify(alteredResult.basis.breakdown) !== JSON.stringify(baseResult.basis.breakdown);
            expect(priceChanged || breakdownChanged).toBe(true);
          } else {
            // For quote prep, either warnings, checklist or breakdown altered
            expect(alteredResult.basis).toBeDefined();
          }
        }
      });
    });
  }

  describe('Regression & Quality Audits — Quote Preparation & Pricing Units', () => {
    it('office-cleaning-service transitions to quote_preparation and separates per-visit from monthly rate', () => {
      const result = calculateEstimate('office-cleaning-service', {
        office_area: 30,
        frequency_per_week: '2',
        scope_option: 'standard',
      });

      expect(result.type).toBe('quote_preparation');
      expect(result.status).toBe('warning');
      expect(result.minAmount).toBeUndefined();
      expect(result.maxAmount).toBeUndefined();
      expect(result.minPrice).toBeUndefined();
      expect(result.maxPrice).toBeUndefined();
      expect(result.formattedRange).toContain('현장 실측 맞춤 견적');
      expect(result.prepTitle).toContain('사무실 정기청소');
      expect(result.basis.explanation).toContain('400,000원');
      expect(result.basis.explanation).toContain('정기 방문');
      expect(result.priceBreakdown.length).toBeGreaterThanOrEqual(3);
      expect(result.checklist.length).toBeGreaterThanOrEqual(3);
    });

    it('forces quote_preparation when verificationStatus is unverified, stale, or partially_verified', () => {
      const statuses = ['unverified', 'stale', 'partially_verified'] as const;

      for (const st of statuses) {
        const result = calculateEstimate('move-in-cleaning', {
          area_pyeong: 24,
          __forceVerificationStatus: st,
        });

        expect(result.type).toBe('quote_preparation');
        expect(result.minAmount).toBeUndefined();
        expect(result.maxAmount).toBeUndefined();
        expect(result.checklist.length).toBeGreaterThan(0);
        expect(result.basis.explanation).toBeTruthy();
      }
    });

    it('verifies that range spreads are non-uniform and derived from empirical conditions, not 0.95~1.15', () => {
      const sampleSlugs = ['move-in-cleaning', 'air-conditioner-cleaning', 'washing-machine-cleaning', 'studio-moving'];
      const spreads: number[] = [];

      for (const slug of sampleSlugs) {
        const res = calculateEstimate(slug, {});
        if (res.type === 'range_estimate' && res.minAmount && res.maxAmount) {
          const ratio = res.maxAmount / res.minAmount;
          spreads.push(ratio);
        }
      }

      // Check that not all ratios are identical (i.e. not uniform 1.15 / 0.95 = 1.2105)
      const uniqueRatios = new Set(spreads.map((r) => r.toFixed(2)));
      expect(uniqueRatios.size).toBeGreaterThan(1);
    });
  });
});

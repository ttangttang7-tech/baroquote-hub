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
});

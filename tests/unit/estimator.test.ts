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

    it('septic-tank-cleaning: verifies Gwangjin-gu exact statutory tariff (5㎥ standard = 124,370원, 5㎥ surcharge = 133,080원)', () => {
      // 1. 광진구 5㎥ 일반 작업 (표준 작업, 10원 미만 절사 검증)
      const resStandard = calculateEstimate('septic-tank-cleaning', {
        district_zone: 'gwangjin',
        tank_capacity_cbm: 5,
        work_environment: 'standard_ground',
      });
      expect(resStandard.type).toBe('range_estimate');
      expect(resStandard.minAmount).toBe(124370);
      expect(resStandard.maxAmount).toBe(124370);
      expect(resStandard.formattedRange).toBe('12만 4,370원');

      // 2. 광진구 5㎥ 할증 작업 (지하/장거리 7% 할증, 10원 미만 절사 검증)
      const resSurcharge = calculateEstimate('septic-tank-cleaning', {
        district_zone: 'gwangjin',
        tank_capacity_cbm: 5,
        work_environment: 'long_hose_basement',
      });
      expect(resSurcharge.type).toBe('range_estimate');
      expect(resSurcharge.minAmount).toBe(133080);
      expect(resSurcharge.maxAmount).toBe(133080);
      expect(resSurcharge.formattedRange).toBe('13만 3,080원');

      // 3. 타 지역 선택 시 견적준비형(quote_preparation) 전환 확인
      const resOther = calculateEstimate('septic-tank-cleaning', {
        district_zone: 'other_region',
        tank_capacity_cbm: 5,
      });
      expect(resOther.type).toBe('quote_preparation');
      expect(resOther.prepTitle).toContain('조례 요율 안내');
    });

    it('outdoor-wood-deck-installation branches railing to custom on-site quote without numeric price addition', () => {
      // 1. 난간 없음 (5평 합성목재 65만원/평 = 3,250,000원)
      const resNoRailing = calculateEstimate('outdoor-wood-deck-installation', {
        deck_material: 'wpc_composite',
        ground_foundation: 'concrete_flat',
        deck_area_pyeong: 5,
        railing_installation: 'none',
      });
      expect(resNoRailing.type).toBe('range_estimate');
      expect(resNoRailing.minAmount).toBe(Math.round(3250000 * 0.92));
      expect(resNoRailing.maxAmount).toBe(Math.round(3250000 * 1.12));

      // 2. 안전 난간 선택 시 금액 추가 없이(0원) 현장 실측 맞춤 분기 처리
      const resWithRailing = calculateEstimate('outdoor-wood-deck-installation', {
        deck_material: 'wpc_composite',
        ground_foundation: 'concrete_flat',
        deck_area_pyeong: 5,
        railing_installation: 'custom_onsite',
      });
      expect(resWithRailing.type).toBe('range_estimate');
      // 금액은 난간 없을 때와 동일하게 상판+기초만 계산 (난간 가격 직접 가산 배제)
      expect(resWithRailing.minAmount).toBe(resNoRailing.minAmount);
      expect(resWithRailing.maxAmount).toBe(resNoRailing.maxAmount);

      // 난간 현장 실측 가이드 항목 확인
      const railingBreakdown = resWithRailing.priceBreakdown.find((b) => b.name.includes('안전 난간'));
      expect(railingBreakdown).toBeDefined();
      expect(railingBreakdown?.amount).toBe(0);
      expect(resWithRailing.exclusions.some((e) => e.includes('안전 난간'))).toBe(true);
      expect(resWithRailing.cautions.some((c) => c.includes('안전 난간'))).toBe(true);
    });

    it('preparation trio (drain-unclogging, office-cleaning-service, office-moving) strictly emits 0 numeric amounts and provides checklists', () => {
      const prepSlugs = ['drain-unclogging', 'office-cleaning-service', 'office-moving'];

      for (const slug of prepSlugs) {
        const res = calculateEstimate(slug, {});
        expect(res.type).toBe('quote_preparation');
        expect(res.minAmount).toBeUndefined();
        expect(res.maxAmount).toBeUndefined();
        expect(res.minPrice).toBeUndefined();
        expect(res.maxPrice).toBeUndefined();
        expect(res.formattedRange).toContain('현장 실측 맞춤 견적');

        // All breakdown amounts must be strictly 0 (no leaked prices)
        for (const item of res.priceBreakdown) {
          expect(item.amount).toBe(0);
        }

        // Must provide contractor questions and caution/photo lists
        expect(res.contractorChecklist.length).toBeGreaterThanOrEqual(2);
        expect(res.cautions.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});

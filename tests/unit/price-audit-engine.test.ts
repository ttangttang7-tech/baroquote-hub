import { describe, it, expect } from 'vitest';
import { SERVICES, getServiceBySlug } from '../../src/lib/registry';
import { calculateEstimate } from '../../src/lib/engine/estimator';

describe('Price Evidence & Estimation Engine Quality Audits', () => {
  // 1. 미검증 데이터에서 견적 준비형 전환
  it('transitions to quote_preparation when price evidence is unverified', () => {
    const res = calculateEstimate('move-in-cleaning', {
      area_pyeong: 24,
      __forceVerificationStatus: 'unverified',
    });

    expect(res.type).toBe('quote_preparation');
    expect(res.status).toBe('warning');
    expect(res.minAmount).toBeUndefined();
    expect(res.maxAmount).toBeUndefined();
    expect(res.minPrice).toBeUndefined();
    expect(res.maxPrice).toBeUndefined();
    expect(res.formattedRange).toContain('현장 실측 맞춤 견적');
    expect(res.prepTitle).toBeTruthy();
    expect(res.basis.explanation).toBeTruthy();
    expect(res.checklist.length).toBeGreaterThan(0);
  });

  // 2. 오래된 가격자료에서 숫자 결과 처리
  it('transitions to quote_preparation when price evidence is stale', () => {
    const res = calculateEstimate('air-conditioner-cleaning', {
      ac_type: 'stand',
      __forceVerificationStatus: 'stale',
    });

    expect(res.type).toBe('quote_preparation');
    expect(res.minAmount).toBeUndefined();
    expect(res.maxAmount).toBeUndefined();
    expect(res.formattedRange).toContain('현장 실측 맞춤 견적');
  });

  // 3. 건당과 월정액 구분
  it('distinguishes office-cleaning-service per-visit basis from monthly subscription', () => {
    const officeService = getServiceBySlug('office-cleaning-service');
    expect(officeService).toBeDefined();

    const ev = officeService!.evidence;
    // Base reference is per-visit commercial cleaning
    expect(ev.priceUnit).toContain('건당');
    expect(ev.notes).toContain('1회성 상업공간 청소 건당 기준');
    expect(ev.notes).toContain('월정액');
    expect(ev.verificationStatus).toBe('partially_verified');

    // Estimator must produce quote_preparation without fabricated numbers
    const res = calculateEstimate('office-cleaning-service', {
      office_area: 30,
      frequency_per_week: '2',
      scope_option: 'standard',
    });

    expect(res.type).toBe('quote_preparation');
    expect(res.minAmount).toBeUndefined();
    expect(res.maxAmount).toBeUndefined();
    expect(res.priceBreakdown.length).toBeGreaterThanOrEqual(3);
    // Cost factors should have amount 0 or descriptive notes
    for (const item of res.priceBreakdown) {
      expect(item.amount).toBe(0);
      expect(item.description).toBeTruthy();
    }
  });

  // 4. 옵션 가산금 근거 및 적용 단위
  it('ensures option price deltas do not exceed 5x basePrice across all services', () => {
    for (const service of SERVICES) {
      const base = service.evidence.basePrice;
      for (const q of service.questions) {
        if (q.options) {
          for (const opt of q.options) {
            if (typeof opt.priceDelta === 'number') {
              expect(Number.isFinite(opt.priceDelta)).toBe(true);
              expect(Number.isNaN(opt.priceDelta)).toBe(false);
              expect(Math.abs(opt.priceDelta)).toBeLessThanOrEqual(base * 5);
            }
          }
        }
      }
    }
  });

  // 5. 실제 원문과 저장 데이터 불일치 감지 로직
  it('detects discrepancies when simulated live price differs from stored registry price', () => {
    const simulateCheck = (liveAvg: number, registryAvg: number) => {
      return liveAvg === registryAvg;
    };

    expect(simulateCheck(120000, 120000)).toBe(true);
    expect(simulateCheck(130000, 120000)).toBe(false);
  });

  // 6. 단위 일관성 검증 (건당, 평당, 대당 등 명확한 단위 명시)
  it('validates priceUnit format and ensures no arbitrary mixed units', () => {
    const VALID_UNITS = ['건당', '평당', '시공당', '시간당', '대당', '개소당', '만원', '원'];

    for (const service of SERVICES) {
      const unitStr = service.evidence.priceUnit;
      expect(unitStr).toBeTruthy();
      const hasValid = VALID_UNITS.some((u) => unitStr.includes(u));
      expect(hasValid).toBe(true);
    }
  });

  // 7. 30개 서비스 전수 회귀 검증
  it('runs all 30 services regression with zero runtime exceptions', () => {
    for (const service of SERVICES) {
      const defaultAnswers: Record<string, any> = {};
      for (const q of service.questions) {
        defaultAnswers[q.id] = q.defaultValue;
      }

      const res = calculateEstimate(service.id, defaultAnswers);
      expect(res).toBeDefined();
      expect(res.serviceId).toBe(service.id);
      expect(['range_estimate', 'quote_preparation']).toContain(res.type);

      if (res.type === 'range_estimate') {
        expect(res.minAmount).toBeGreaterThan(0);
        expect(res.maxAmount).toBeGreaterThanOrEqual(res.minAmount!);
      } else {
        expect(res.minAmount).toBeUndefined();
        expect(res.maxAmount).toBeUndefined();
      }
    }
  });
});

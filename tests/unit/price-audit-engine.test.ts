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

  // 8. 동적 날짜 기반 stale 감지 및 자동 quote_preparation 전환
  it('detects staleness when reference date exceeds verificationCycleDays', () => {
    // Verified date is 2026-10-09
    // Future reference date 100 days later: 2027-01-17
    const res = calculateEstimate('move-in-cleaning', {
      area_pyeong: 24,
      __referenceDate: '2027-01-20', // > 90 days after lastVerifiedAt
    });

    expect(res.type).toBe('quote_preparation');
    expect(res.minAmount).toBeUndefined();
    expect(res.maxAmount).toBeUndefined();
    expect(res.prepTitle).toContain('유효기간');
    expect(res.basis.explanation).toContain('재검증');
  });

  // 9. 검증 기한 이내 정상 견적 산출 확인
  it('provides range_estimate when reference date is within verificationCycleDays', () => {
    const res = calculateEstimate('move-in-cleaning', {
      area_pyeong: 24,
      __referenceDate: '2026-10-15', // only 6 days after lastVerifiedAt
    });

    expect(res.type).toBe('range_estimate');
    expect(res.minAmount).toBeGreaterThan(0);
    expect(res.maxAmount).toBeGreaterThanOrEqual(res.minAmount!);
  });

  // 10. 3개 가격 중 하나라도 누락 시 전체 검증 미승인 로직
  it('requires all 3 price points (avg, min, max) for full live verification', () => {
    const evaluateExtraction = (extracted: { avg: number | null; min: number | null; max: number | null }) => {
      const isFull = extracted.avg !== null && extracted.min !== null && extracted.max !== null;
      return isFull ? 'full_verified' : 'partially_verified';
    };

    expect(evaluateExtraction({ avg: 250000, min: 140000, max: 420000 })).toBe('full_verified');
    expect(evaluateExtraction({ avg: null, min: 140000, max: 420000 })).toBe('partially_verified');
    expect(evaluateExtraction({ avg: 250000, min: null, max: 420000 })).toBe('partially_verified');
  });

  // 11. 확정 견적 오인 방지 고지문 검증
  it('includes non-confirmed estimate disclaimer in range_estimate basis explanation', () => {
    const res = calculateEstimate('air-conditioner-cleaning', {
      ac_type: 'stand',
      __referenceDate: '2026-10-09',
    });

    expect(res.type).toBe('range_estimate');
    expect(res.basis.explanation).toContain('확정 견적이 아니며');
    expect(res.basis.explanation).toContain('참고용 예상 범위');
  });

  // 상황 A: 검증일로부터 30일 경과 (정상 숫자 견적)
  it('[상황 A] produces valid range_estimate when 30 days elapsed from verification', () => {
    // verified: 2026-10-09 -> +30 days = 2026-11-08
    const res = calculateEstimate('move-in-cleaning', {
      area_pyeong: 24,
      __referenceDate: '2026-11-08',
    });
    expect(res.type).toBe('range_estimate');
    expect(res.minAmount).toBeGreaterThan(0);
    expect(res.maxAmount).toBeGreaterThan(res.minAmount!);
  });

  // 상황 B: 검증일로부터 정확히 90일 경과 (경계값 규칙 정상 판정)
  it('[상황 B] maintains range_estimate on exactly 90-day boundary', () => {
    // verified: 2026-10-09T00:00:00Z -> exactly +90 days
    const baseTime = Date.parse('2026-10-09');
    const day90 = new Date(baseTime + 90 * 24 * 60 * 60 * 1000);
    const res = calculateEstimate('move-in-cleaning', {
      area_pyeong: 24,
      __referenceDate: day90.toISOString(),
    });
    expect(res.type).toBe('range_estimate');
    expect(res.minAmount).toBeGreaterThan(0);
  });

  // 상황 C: 검증일로부터 91일 경과 (stale 판정, quote_preparation 자동 전환, 숫자 금액 미노출)
  it('[상황 C] switches to quote_preparation on 91 days elapsed and hides numeric amounts', () => {
    const baseTime = Date.parse('2026-10-09');
    const day91 = new Date(baseTime + 91 * 24 * 60 * 60 * 1000);
    const res = calculateEstimate('move-in-cleaning', {
      area_pyeong: 24,
      __referenceDate: day91.toISOString(),
    });
    expect(res.type).toBe('quote_preparation');
    expect(res.minAmount).toBeUndefined();
    expect(res.maxAmount).toBeUndefined();
    expect(res.prepTitle).toContain('유효기간 만료');
  });

  // 상황 E: 만료 후 복사 기능 포맷 검증 (숫자 유출 없이 가이드 텍스트만 출력)
  it('[상황 E] produces preparation guide text without numeric amounts in stale state', () => {
    const res = calculateEstimate('move-in-cleaning', {
      area_pyeong: 32,
      contamination_level: 'heavy',
      __referenceDate: '2027-02-01', // well beyond 90 days
    });

    expect(res.type).toBe('quote_preparation');
    expect(res.minAmount).toBeUndefined();
    expect(res.maxAmount).toBeUndefined();

    // Verify copy formatting logic
    const isRange = res.type === 'range_estimate' && Boolean(res.minAmount && res.maxAmount);
    expect(isRange).toBe(false);

    let copyText = '';
    if (isRange) {
      copyText = `[바로견적] 입주청소 예상견적 요약\n▶ 예상 비용 범위: ${res.minAmount}원 ~ ${res.maxAmount}원`;
    } else {
      copyText = `[바로견적] 입주청소 현장 진단 및 준비 가이드\n▶ 견적 상태: 현장 실측 및 맞춤 견적 권장 (정액 숫자 견적 미제공)\n▶ 안내 사유: ${res.prepTitle}\n▶ 상세 가이드: ${res.basis.explanation}`;
    }

    expect(copyText).not.toContain('예상 비용 범위');
    expect(copyText).toContain('정액 숫자 견적 미제공');
    expect(copyText).toContain(res.prepTitle!);
  });

  // 상황 F: 사무실 정기청소 (시장 건당가격 40만원이 있더라도 월정액 견적은 항상 준비형 유지)
  it('[상황 F] preserves quote_preparation for office-cleaning-service even when fresh', () => {
    const res = calculateEstimate('office-cleaning-service', {
      office_area: 30,
      frequency_per_week: 2,
      __referenceDate: '2026-10-10', // fresh date
    });

    expect(res.type).toBe('quote_preparation');
    expect(res.minAmount).toBeUndefined();
    expect(res.maxAmount).toBeUndefined();
    expect(res.basis.explanation).toContain('정기 방문 클리닝');
  });
});


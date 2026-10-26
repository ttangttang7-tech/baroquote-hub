import type { EstimateResult, InputSummaryItem, PriceBreakdownItem } from '../registry/types';
import { getServiceBySlug, getServiceById } from '../registry/services';

export function formatKoreanWon(amount: number): string {
  if (isNaN(amount) || !isFinite(amount) || amount < 0) {
    return '0원';
  }
  const manWon = Math.floor(amount / 10000);
  const remainder = amount % 10000;
  if (manWon > 0 && remainder === 0) {
    return `${manWon.toLocaleString()}만원`;
  }
  if (manWon > 0 && remainder > 0) {
    return `${manWon.toLocaleString()}만 ${remainder.toLocaleString()}원`;
  }
  return `${amount.toLocaleString()}원`;
}

export const DEFAULT_STALE_THRESHOLD_DAYS = 90; // 분기별(90일) 주기

export function isPriceEvidenceStale(
  evidence?: { lastVerifiedAt?: string; verificationCycleDays?: number },
  referenceDate: Date = new Date()
): boolean {
  if (!evidence || !evidence.lastVerifiedAt) return true;
  const verifiedTime = Date.parse(evidence.lastVerifiedAt);
  if (isNaN(verifiedTime)) return true;
  const cycleDays = evidence.verificationCycleDays || DEFAULT_STALE_THRESHOLD_DAYS;
  const diffDays = (referenceDate.getTime() - verifiedTime) / (1000 * 60 * 60 * 24);
  return diffDays > cycleDays;
}

export function calculateEstimate(serviceSlugOrId: string, userInputs: Record<string, any> = {}): EstimateResult {
  const service = getServiceBySlug(serviceSlugOrId) || getServiceById(serviceSlugOrId);
  if (!service) {
    throw new Error(`Service not found for: ${serviceSlugOrId}`);
  }

  // 1. Strict input validation (음수, NaN, Infinity, 허용 범위 초과, 필수값 누락 방어)
  const validationErrors: string[] = [];
  for (const q of service.questions) {
    const rawVal = userInputs[q.id];

    // 필수 입력 항목인데 명시적으로 null이나 빈 문자열이 전달된 경우
    if (q.required && (rawVal === null || rawVal === '')) {
      validationErrors.push(`필수 입력 항목인 '${q.label}'의 값이 누락되었습니다.`);
      continue;
    }

    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
      if (q.type === 'number') {
        const numVal = typeof rawVal === 'number' ? rawVal : Number(rawVal);
        if (Number.isNaN(numVal) || !Number.isFinite(numVal) || numVal < 0) {
          validationErrors.push(`'${q.label}'에 유효하지 않은 숫자(음수, NaN, Infinity)가 입력되었습니다. (입력값: ${rawVal})`);
        } else {
          if (q.min !== undefined && numVal < q.min) {
            validationErrors.push(`'${q.label}'의 입력값(${numVal})이 허용 최소치(${q.min}${q.unit || ''}) 미만입니다. 입력값을 재확인해 주세요.`);
          }
          if (q.max !== undefined && numVal > q.max) {
            validationErrors.push(`'${q.label}'의 입력값(${numVal})이 허용 최대치(${q.max}${q.unit || ''})를 초과했습니다. 입력값을 재확인해 주세요.`);
          }
        }
      } else if (q.options && q.options.length > 0) {
        const validOption = q.options.some((opt) => opt.value === String(rawVal));
        if (!validOption) {
          validationErrors.push(`'${q.label}'에 유효하지 않은 옵션 선택값('${rawVal}')이 전달되었습니다.`);
        }
      }
    }
  }

  if (validationErrors.length > 0) {
    return {
      type: 'quote_preparation',
      status: 'warning',
      serviceId: service.id,
      minPrice: undefined,
      maxPrice: undefined,
      formattedRange: '입력값 오류 (견적 계산 차단)',
      prepTitle: '입력값 유효성 오류 (계산 차단 및 재확인 필요)',
      inputSummary: validationErrors.map((err, idx) => ({ label: `오류 ${idx + 1}`, value: err })),
      priceBreakdown: [],
      inclusions: [],
      exclusions: [],
      extraFeeWarnings: validationErrors,
      contractorChecklist: ['입력 서식의 평수, 수량, 옵션 항목에 올바른 수치를 기재했는지 확인하세요.'],
      verificationDate: service.evidence?.lastVerifiedAt || '2026-10-26',
      cautions: ['부정확하거나 허용 범위를 벗어난 수치(음수, NaN, 비정상 규격) 입력 시 임의의 왜곡된 견적이 출력되지 않도록 계산이 자동 차단됩니다.'],
      minAmount: undefined,
      maxAmount: undefined,
      basis: {
        breakdown: [],
        explanation: `입력값 검증 실패: ${validationErrors.join(' / ')} 올바른 수치를 입력한 후 다시 계산해 주세요.`,
      },
      includedItems: [],
      excludedItems: [],
      surchargeWarnings: validationErrors,
      checklist: ['올바른 입력값을 재입력해 주세요.'],
    };
  }

  // Fallback defaults for missing inputs
  const inputs: Record<string, any> = {};
  for (const q of service.questions) {
    const val = userInputs[q.id];
    if (val !== undefined && val !== null && val !== '') {
      inputs[q.id] = q.type === 'number' ? Number(val) : val;
    } else {
      inputs[q.id] = q.defaultValue;
    }
  }

  const inputSummary: InputSummaryItem[] = [];
  for (const q of service.questions) {
    const rawVal = inputs[q.id];
    let displayVal = String(rawVal);
    if (q.options) {
      const opt = q.options.find((o) => o.value === String(rawVal));
      if (opt) displayVal = opt.label;
    } else if (q.unit) {
      displayVal = `${rawVal}${q.unit}`;
    }
    inputSummary.push({
      label: q.label,
      value: displayVal,
    });
  }

  const priceBreakdown: PriceBreakdownItem[] = [];
  const refDate = userInputs.__referenceDate ? new Date(userInputs.__referenceDate) : new Date();
  const isStaleByDate = isPriceEvidenceStale(service.evidence, refDate);
  const rawStatus = service.evidence?.verificationStatus || 'verified';
  const effectiveStatus = userInputs.__forceVerificationStatus || (isStaleByDate ? 'stale' : rawStatus);

  const isOfficeCleaning = service.slug === 'office-cleaning-service';
  const isDrainUnclogging = service.slug === 'drain-unclogging';
  const hasInsufficientBasis =
    effectiveStatus === 'unverified' ||
    effectiveStatus === 'stale' ||
    effectiveStatus === 'partially_verified' ||
    isOfficeCleaning ||
    isDrainUnclogging ||
    service.estimateType === 'quote_preparation';

  let type: 'range_estimate' | 'quote_preparation' = hasInsufficientBasis ? 'quote_preparation' : 'range_estimate';
  let prepTitle: string | undefined = undefined;
  let prepExplanation: string | undefined = undefined;

  if (effectiveStatus === 'stale') {
    prepTitle = '가격 자료 유효기간 만료 (정기 재검증 진행 중)';
    prepExplanation = `본 서비스의 기존 시장 가격 자료는 유효기간(${service.evidence?.verificationCycleDays || DEFAULT_STALE_THRESHOLD_DAYS}일)을 경과하여 최신 실거래 시세 재검증을 진행하고 있습니다. 왜곡된 금액 제공을 방지하기 위해 숫자 견적 대신 아래 현장 실측 가이드와 업체 견적 비교 체크리스트를 우선 안내해 드립니다.`;
  } else if (isDrainUnclogging) {
    prepTitle = '하수구 청소 시세 상충 안내 (현장 맞춤 견적 권장)';
    prepExplanation = '숨고 원문 플랫폼의 상단 요약(평균 7만/최저 5만/최고 30만)과 본문 상세(평균 5만/최저 7만/최고 30만) 간 시세 데이터 충돌 및 모순이 확인되어 왜곡된 숫자 견적 출력을 전면 차단하고 현장 실측 맞춤 견적 준비형으로 안내합니다.';
  } else if (effectiveStatus === 'partially_verified' && !isOfficeCleaning) {
    prepTitle = '부분 검증 서비스 (현장 실측 맞춤 견적 권장)';
    prepExplanation = `본 서비스는 기본 출장비 및 기초 작업비만 일부 확인된 상태이며, 현장 조건에 따른 편차가 커 정확한 사전 정액 추정이 어렵습니다. 확정 견적 전 아래 체크리스트로 2~3개 업체의 견적을 비교하세요.`;
  }

  let baseCost = 0;
  let minCost = 0;
  let maxCost = 0;
  const inclusions: string[] = [];
  const exclusions: string[] = [];
  const extraFeeWarnings: string[] = [];
  const contractorChecklist: string[] = [];
  const cautions: string[] = [];

  switch (service.slug) {
    case 'move-in-cleaning': {
      const pyeong = Math.max(5, Math.min(100, Number(inputs.area_pyeong) || 24));
      const pyeongRate = 12000;
      baseCost = pyeong * pyeongRate;
      priceBreakdown.push({
        name: `공급면적 기본 청소 (${pyeong}평 × 12,000원)`,
        amount: baseCost,
      });

      const contOpt = service.questions.find((q) => q.id === 'contamination_level')?.options?.find((o) => o.value === inputs.contamination_level);
      const contDelta = contOpt?.priceDelta || 0;
      if (contDelta !== 0) {
        priceBreakdown.push({ name: `오염도 조정 (${contOpt?.label})`, amount: contDelta });
      }

      const verOpt = service.questions.find((q) => q.id === 'veranda_count')?.options?.find((o) => o.value === String(inputs.veranda_count));
      const verDelta = verOpt?.priceDelta || 0;
      if (verDelta !== 0) {
        priceBreakdown.push({ name: `베란다 구성 (${verOpt?.label})`, amount: verDelta });
      }

      const addOpt = service.questions.find((q) => q.id === 'additional_options')?.options?.find((o) => o.value === inputs.additional_options);
      const addDelta = addOpt?.priceDelta || 0;
      if (addDelta !== 0) {
        priceBreakdown.push({ name: `추가 특수청소 (${addOpt?.label})`, amount: addDelta });
      }

      const totalTarget = baseCost + contDelta + verDelta + addDelta;
      minCost = Math.round(totalTarget - Math.max(15000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(25000, totalTarget * 0.12));

      inclusions.push('방/거실 바닥, 창틀 4면, 실내 유리창 안쪽, 몰딩 분진 제거');
      inclusions.push('주방 상하부장 내부 분해, 가스레인지/후드 필터 기름때 세척');
      inclusions.push('욕실 천장, 환풍기 분해, 배수구 트랩 고온 스팀 살균 소독');
      exclusions.push('바깥 유리창(외창) 닦기, 스티커/시트지 대량 제거, 가전 내부 분해');
      extraFeeWarnings.push('창문 뽁뽁이/단열필름/시트지 제거 시 창당 2~3만원 추가 발생 가능');
      extraFeeWarnings.push('복층 구조이거나 층고가 3m 이상인 경우 사다리 특수공임 추가');
      contractorChecklist.push('외창 청소 가능 여부 및 스티커 제거 비용을 사전에 확정했는가?');
      contractorChecklist.push('작업 후 고객 직접 대면 검수 후 잔금을 치르는 조건인가?');
      cautions.push('당일 검수 시 서랍장 탈거 안쪽 및 걸레받이 하부 먼지까지 반드시 확인하세요.');
      break;
    }

    case 'air-conditioner-cleaning': {
      const acTypeOpt = service.questions.find((q) => q.id === 'ac_type')?.options?.find((o) => o.value === inputs.ac_type);
      baseCost = acTypeOpt?.priceDelta || 130000;
      const units = Math.max(1, Math.min(8, Number(inputs.unit_count) || 1));
      const multiUnitTotal = baseCost * units - (units > 1 ? (units - 1) * 10000 : 0);
      priceBreakdown.push({
        name: `${acTypeOpt?.label || '에어컨'} 분해청소 (${units}대)`,
        amount: multiUnitTotal,
      });

      const scopeOpt = service.questions.find((q) => q.id === 'cleaning_scope')?.options?.find((o) => o.value === inputs.cleaning_scope);
      const scopeDelta = (scopeOpt?.priceDelta || 0) * units;
      if (scopeDelta !== 0) {
        priceBreakdown.push({ name: `분해 세척 범위 (${scopeOpt?.label})`, amount: scopeDelta });
      }

      const totalTarget = multiUnitTotal + scopeDelta;
      minCost = Math.round(totalTarget - Math.max(10000, totalTarget * 0.07));
      maxCost = Math.round(totalTarget + Math.max(15000, totalTarget * 0.11));

      inclusions.push('전면 프론트 판넬, 필터, 송풍팬 분해 고압 물세척');
      inclusions.push('열교환기(냉각핀) 전용 친환경 세척제 분사 및 고압 살균 세척');
      inclusions.push('배수 드레인 호스 이물질 점검 및 피톤치드 연무 탈취');
      exclusions.push('실외기 내부 컴프레서 세척, 냉매 가스 충전');
      extraFeeWarnings.push('삼성 무풍 갤러리/LG 듀얼 복합 구조는 분해 난이도로 1~2만원 추가될 수 있음');
      contractorChecklist.push('세척 전후 송풍팬 및 냉각핀 사진을 직접 촬영해 보여주는가?');
      contractorChecklist.push('세척 후 정상 냉방 및 풍량 작동 시운전을 완료했는가?');
      cautions.push('청소 후 바로 끄지 마시고 송풍 모드로 30분 이상 가동하여 내부 물기를 완전히 건조하세요.');
      break;
    }

    case 'washing-machine-cleaning': {
      const washerOpt = service.questions.find((q) => q.id === 'washer_type')?.options?.find((o) => o.value === inputs.washer_type);
      baseCost = washerOpt?.priceDelta || 120000;
      priceBreakdown.push({ name: `${washerOpt?.label || '세탁기'} 기본 분해청소`, amount: baseCost });

      const contOpt = service.questions.find((q) => q.id === 'contamination_level')?.options?.find((o) => o.value === inputs.contamination_level);
      const contDelta = contOpt?.priceDelta || 0;
      if (contDelta !== 0) {
        priceBreakdown.push({ name: `오염도 가산 (${contOpt?.label})`, amount: contDelta });
      }

      const dryerOpt = service.questions.find((q) => q.id === 'dryer_attached')?.options?.find((o) => o.value === inputs.dryer_attached);
      const dryerDelta = dryerOpt?.priceDelta || 0;
      if (dryerDelta !== 0) {
        priceBreakdown.push({ name: `건조기 직렬 거치 해체 작업`, amount: dryerDelta });
      }

      const totalTarget = baseCost + contDelta + dryerDelta;
      minCost = Math.round(totalTarget - Math.max(10000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(15000, totalTarget * 0.13));

      inclusions.push('세탁조 통 전체 탈거, 스파이더 삼발이 분해 고압 세척');
      inclusions.push('고무 패킹 곰팡이 특수 제거 및 거름망/세제 투입구 살균');
      exclusions.push('부식된 스파이더 부품 교체 부품비, 모터 고장 수리');
      extraFeeWarnings.push('세탁기 후면 및 좌우 작업 공간이 50cm 미만으로 협소한 경우 추가 공임 발생');
      contractorChecklist.push('스파이더(삼발이) 뒷면 찌든 때까지 완전히 분해하여 세척하는가?');
      contractorChecklist.push('작업 후 탈수 시운전 시 이상 진동이나 소음이 없는지 확인했는가?');
      cautions.push('스파이더 부품이 노후되어 금이 가 있는 경우 분해 시 파손 위험이 있으니 사전 점검 필수입니다.');
      break;
    }

    case 'mold-removal': {
      const spaceOpt = service.questions.find((q) => q.id === 'space_type')?.options?.find((o) => o.value === inputs.space_type);
      baseCost = spaceOpt?.priceDelta || 250000;
      priceBreakdown.push({ name: `${spaceOpt?.label || '시공 공간'} 기본 방제`, amount: baseCost });

      const wallCount = Number(inputs.wall_count) || 1;
      const wallDelta = wallCount > 1 ? (wallCount - 1) * 120000 : 0;
      if (wallDelta > 0) {
        priceBreakdown.push({ name: `오염 벽면 ${wallCount}개소 추가`, amount: wallDelta });
      }

      const coatOpt = service.questions.find((q) => q.id === 'coating_option')?.options?.find((o) => o.value === inputs.coating_option);
      const coatDelta = coatOpt?.priceDelta || 0;
      if (coatDelta !== 0) {
        priceBreakdown.push({ name: `시공 공법 (${coatOpt?.label})`, amount: coatDelta });
      }

      const totalTarget = baseCost + wallDelta + coatDelta;
      minCost = Math.round(totalTarget - Math.max(20000, totalTarget * 0.09));
      maxCost = Math.round(totalTarget + Math.max(30000, totalTarget * 0.16));

      inclusions.push('곰팡이 균사체 화학적 박멸 및 오존 살균 정화');
      inclusions.push('항균 프라이머 도포 및 친환경 결로 방지 코팅');
      exclusions.push('벽체 크랙 누수 외부 코킹 공사, 훼손된 석고보드 목공 전면 교체');
      extraFeeWarnings.push('외벽 균열로 인한 외부 빗물 침투 누수 시 외벽 로프 코킹비 별도');
      contractorChecklist.push('시공 후 1년 이상 재발 무상 보증서를 서면으로 교부하는가?');
      contractorChecklist.push('단순 락스 도포가 아닌 친환경 규조토/단열 코팅 공정이 포함되는가?');
      cautions.push('시공 후 환기 습관과 실내 습도 50% 유지가 병행되어야 재발을 영구 방지할 수 있습니다.');
      break;
    }

    case 'housekeeper-service': {
      const hourOpt = service.questions.find((q) => q.id === 'work_hours')?.options?.find((o) => o.value === String(inputs.work_hours));
      baseCost = hourOpt?.priceDelta || 60000;
      priceBreakdown.push({ name: `가사도우미 1회 이용료 (${hourOpt?.label || '4시간'})`, amount: baseCost });

      const freqOpt = service.questions.find((q) => q.id === 'frequency_type')?.options?.find((o) => o.value === inputs.frequency_type);
      const freqDelta = freqOpt?.priceDelta || 0;
      if (freqDelta !== 0) {
        priceBreakdown.push({ name: `방문 조건 (${freqOpt?.label})`, amount: freqDelta });
      }

      const scopeOpt = service.questions.find((q) => q.id === 'scope_level')?.options?.find((o) => o.value === inputs.scope_level);
      const scopeDelta = scopeOpt?.priceDelta || 0;
      if (scopeDelta !== 0) {
        priceBreakdown.push({ name: `업무 범위 (${scopeOpt?.label})`, amount: scopeDelta });
      }

      const totalTarget = baseCost + freqDelta + scopeDelta;
      minCost = totalTarget;
      maxCost = totalTarget + 10000;

      inclusions.push('거실/방 바닥 청소기 및 물걸레, 주방 설거지 및 싱크대 정리');
      inclusions.push('화장실 기본 세척, 분리수거 및 종량제 봉투 배출');
      exclusions.push('청소 도구/세제 지참(고객 준비), 아이 돌봄, 반려동물 목욕/산책');
      extraFeeWarnings.push('주말/공휴일 배정 시 5,000원~10,000원 할증 요금 발생');
      contractorChecklist.push('배상책임보험 가입된 정식 플랫폼/소개소 등록 매니저인가?');
      contractorChecklist.push('우선적으로 청소하길 원하는 구역 순서를 작업 전 전달했는가?');
      cautions.push('귀중품이나 현금은 분실 오해 방지를 위해 서랍에 넣어 잠가두세요.');
      break;
    }

    case 'mattress-cleaning': {
      const sizeOpt = service.questions.find((q) => q.id === 'mattress_size')?.options?.find((o) => o.value === inputs.mattress_size);
      baseCost = sizeOpt?.priceDelta || 55000;
      priceBreakdown.push({ name: `${sizeOpt?.label || '퀸'} 기본 건식 케어`, amount: baseCost });

      const careOpt = service.questions.find((q) => q.id === 'care_type')?.options?.find((o) => o.value === inputs.care_type);
      const careDelta = careOpt?.priceDelta || 0;
      if (careDelta !== 0) {
        priceBreakdown.push({ name: `케어 방식 (${careOpt?.label})`, amount: careDelta });
      }

      const stainOpt = service.questions.find((q) => q.id === 'stain_type')?.options?.find((o) => o.value === inputs.stain_type);
      const stainDelta = stainOpt?.priceDelta || 0;
      if (stainDelta !== 0 && inputs.care_type !== 'dry') {
        priceBreakdown.push({ name: `오염 특수세척 (${stainOpt?.label})`, amount: stainDelta });
      }

      const totalTarget = baseCost + careDelta + (inputs.care_type !== 'dry' ? stainDelta : 0);
      minCost = Math.round(totalTarget - Math.max(6000, totalTarget * 0.07));
      maxCost = Math.round(totalTarget + Math.max(10000, totalTarget * 0.14));

      inclusions.push('심층 진동 집진 헤드로 진드기 사체/미세먼지 집진, UV 자외선 살균');
      inclusions.push('피톤치드 항균 코팅 및 침대 프레임 주변 먼지 흡입');
      exclusions.push('토퍼 추가 세척(1~2만원 별도), 라텍스 고온 스팀(변형 위험)');
      extraFeeWarnings.push('오래된 묵은 오줌/혈흔 얼룩은 100% 탈색 불가능할 수 있음');
      contractorChecklist.push('필터에 집진된 진드기와 먼지 오염도를 직접 눈으로 확인시켜 주는가?');
      contractorChecklist.push('습식 세척 시 침대 양면인지 단면인지 확인했는가?');
      cautions.push('습식 케어 후에는 최소 6시간 이상 선풍기/에어컨을 틀어 통풍 건조해야 합니다.');
      break;
    }

    case 'office-cleaning-service': {
      type = 'quote_preparation';
      prepTitle = '사무실 정기청소 월 관리비용 현장 실측 맞춤 가이드';

      const area = Math.max(10, Math.min(200, Number(inputs.office_area) || 30));
      const freqOpt = service.questions.find((q) => q.id === 'frequency_per_week')?.options?.find((o) => o.value === String(inputs.frequency_per_week));
      const scopeOpt = service.questions.find((q) => q.id === 'scope_option')?.options?.find((o) => o.value === inputs.scope_option);

      priceBreakdown.push({
        name: `사업장 실평수 (${area}평)`,
        amount: 0,
        description: '공간 면적에 따른 이동 동선 및 기본 청소 작업시간 결정 요인',
      });
      priceBreakdown.push({
        name: `주간 방문 주기 (${freqOpt?.label || '주 2회'})`,
        amount: 0,
        description: '방문 횟수별 전담 클리너 인건비 및 월간 회차 산정 기준',
      });
      if (scopeOpt) {
        priceBreakdown.push({
          name: `관리 영역 (${scopeOpt.label})`,
          amount: 0,
          description: '단독 화장실, 탕비실 오염원 처리 및 유리 파티션 관리 여부',
        });
      }

      prepExplanation =
        '숨고에 공개된 상업공간 청소 시세는 1회성 준공/이사 대청소 건당 평균 400,000원(최저 15만~최고 100만) 기준입니다. 정기 방문 클리닝은 주간 방문 횟수, 실평수, 쓰레기 배출 환경, 야간/주간 출입 보안 조건에 따라 월간 계약금이 결정되므로, 단일 정액가 대신 복수 업체의 방문 실측 소견 비교를 권장합니다.';

      inclusions.push('업무공간 바닥 쓸기 및 전용 약품 물걸레 청소');
      inclusions.push('개인/공용 쓰레기통 비우기 및 분리수거장 배출');
      exclusions.push('직원 책상 위 서류 정리, 정기 바닥 왁스 코팅 박리 작업');
      extraFeeWarnings.push('계단 청소 추가 또는 탕비실 커피머신 분해 청소 시 별도 공임');
      extraFeeWarnings.push('야간/새벽(22시~06시) 출입 작업 시 야간근로수당 가산 발생');
      contractorChecklist.push('위생관리용역업 정식 등록 업체 및 전자세금계산서 발행 가능한가?');
      contractorChecklist.push('출입 보안(카드키/도어락) 및 CCTV 관리 지침이 명문화되어 있는가?');
      contractorChecklist.push('종량제 쓰레기봉투 및 화장실 소모품 공급 주체를 명시했는가?');
      cautions.push('정기계약 전 1회 유료 시범 청소를 먼저 진행하여 퀄리티를 검증해보세요.');
      break;
    }

    // B. 이사·운송·폐기물 (5개)
    case 'studio-moving': {
      const typeOpt = service.questions.find((q) => q.id === 'moving_type')?.options?.find((o) => o.value === inputs.moving_type);
      baseCost = typeOpt?.priceDelta || 180000;
      priceBreakdown.push({ name: `${typeOpt?.label || '반포장이사'} 기본 요금`, amount: baseCost });

      const dist = Math.max(1, Math.min(100, Number(inputs.distance_km) || 10));
      const distDelta = dist > 15 ? Math.round((dist - 15) * 2000) : 0;
      if (distDelta > 0) {
        priceBreakdown.push({ name: `이동 거리 초과 (${dist}km, 15km 초과분)`, amount: distDelta });
      }

      const evOpt = service.questions.find((q) => q.id === 'elevator_status')?.options?.find((o) => o.value === inputs.elevator_status);
      const evDelta = evOpt?.priceDelta || 0;
      if (evDelta !== 0) {
        priceBreakdown.push({ name: `계단 작업 환경 (${evOpt?.label})`, amount: evDelta });
      }

      const helperOpt = service.questions.find((q) => q.id === 'helper_needed')?.options?.find((o) => o.value === inputs.helper_needed);
      const helperDelta = helperOpt?.priceDelta || 0;
      if (helperDelta !== 0) {
        priceBreakdown.push({ name: `전문 인부 추가`, amount: helperDelta });
      }

      const totalTarget = baseCost + distDelta + evDelta + helperDelta;
      minCost = Math.round(totalTarget - Math.max(15000, totalTarget * 0.06));
      maxCost = Math.round(totalTarget + Math.max(25000, totalTarget * 0.15));

      inclusions.push('1톤 탑차/카고 차량 운송, 큰 짐(침대/매트리스/서랍장) 포장 보양');
      inclusions.push('도착지 가구 배치 및 잔여 박스 회수 (반포장 기준)');
      exclusions.push('벽걸이 TV 타공 설치, 에어컨 배관 연결, 잔짐 수납 정리(고객 진행)');
      extraFeeWarnings.push('골목 진입 불가로 장거리 도보 운반 시 3만~5만원 수고비 발생 가능');
      contractorChecklist.push('적재물 배상책임보험 가입 화물차량인지 확인했는가?');
      contractorChecklist.push('사전에 박스와 바구니를 대여해 주는지 확인했는가?');
      cautions.push('이사 당일 귀중품, 현금, 노트북 등 중요 전자기기는 직접 소지하여 이동하세요.');
      break;
    }

    case 'full-service-moving': {
      const tonOpt = service.questions.find((q) => q.id === 'truck_tonnage')?.options?.find((o) => o.value === inputs.truck_tonnage);
      baseCost = tonOpt?.priceDelta || 1200000;
      priceBreakdown.push({ name: `포장이사 기본 인건비·차량 (${tonOpt?.label || '5톤'})`, amount: baseCost });

      const dist = Math.max(1, Math.min(200, Number(inputs.moving_distance) || 15));
      const distDelta = dist > 20 ? Math.round((dist - 20) * 3500) : 0;
      if (distDelta > 0) {
        priceBreakdown.push({ name: `거리 운임 (${dist}km, 고속도로 유류비)`, amount: distDelta });
      }

      const ladderOpt = service.questions.find((q) => q.id === 'ladder_usage')?.options?.find((o) => o.value === inputs.ladder_usage);
      const ladderDelta = ladderOpt?.priceDelta || 0;
      if (ladderDelta !== 0) {
        priceBreakdown.push({ name: `사다리차 이용료 (${ladderOpt?.label})`, amount: ladderDelta });
      }

      const peakOpt = service.questions.find((q) => q.id === 'peak_day')?.options?.find((o) => o.value === inputs.peak_day);
      const peakDelta = peakOpt?.priceDelta || 0;
      if (peakDelta !== 0) {
        priceBreakdown.push({ name: `일정 할증 (${peakOpt?.label})`, amount: peakDelta });
      }

      const totalTarget = baseCost + distDelta + ladderDelta + peakDelta;
      minCost = Math.round(totalTarget - Math.max(40000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(60000, totalTarget * 0.16));

      inclusions.push('전문 패커 3인 + 주방 도우미 1인(5톤 기준) 투입');
      inclusions.push('바닥재 흠집 방지 보양재 설치, 가구·가전 전용 커버 포장');
      inclusions.push('도착지 가구 재배치, 냉장고 스팀 청소, 바닥 청소기 및 물걸레 마무리');
      exclusions.push('에어컨/정수기 배관 설치비, 피아노 전문 조율, 아파트 엘리베이터 이용료');
      extraFeeWarnings.push('수납장 깊숙이 숨어있던 잔짐으로 인해 당일 톤수 초과 시 추가 차량비용 발생');
      contractorChecklist.push('정식 관허 허가증(화물운송주선면허) 등록 업체인가?');
      contractorChecklist.push('식대나 수고비 등 현장 추가 요금 요구 금지가 계약서에 명시되었는가?');
      cautions.push('방문 견적을 최소 3곳 받아 실제 톤수와 투입 인원을 확정 후 서면 계약하세요.');
      break;
    }

    case 'bulky-waste-removal': {
      const wasteOpt = service.questions.find((q) => q.id === 'waste_type')?.options?.find((o) => o.value === inputs.waste_type);
      baseCost = wasteOpt?.priceDelta || 180000;
      priceBreakdown.push({ name: `${wasteOpt?.label || '폐기물'} 수거 처리`, amount: baseCost });

      const disOpt = service.questions.find((q) => q.id === 'disassembly_needed')?.options?.find((o) => o.value === inputs.disassembly_needed);
      const disDelta = disOpt?.priceDelta || 0;
      if (disDelta !== 0) {
        priceBreakdown.push({ name: `가구 분해 해체 인건비`, amount: disDelta });
      }

      const envOpt = service.questions.find((q) => q.id === 'haul_environment')?.options?.find((o) => o.value === inputs.haul_environment);
      const envDelta = envOpt?.priceDelta || 0;
      if (envDelta !== 0) {
        priceBreakdown.push({ name: `반출 환경 추가공임 (${envOpt?.label})`, amount: envDelta });
      }

      const totalTarget = baseCost + disDelta + envDelta;
      minCost = Math.round(totalTarget - Math.max(12000, totalTarget * 0.07));
      maxCost = Math.round(totalTarget + Math.max(20000, totalTarget * 0.14));

      inclusions.push('가정 내 직접 방문, 가구 반출, 1톤 트럭 상차, 폐기장 직송');
      inclusions.push('폐기물 처리장 정식 반입 처리 수수료');
      exclusions.push('위험 화학물질, 석면 슬레이트 등 특정 유해 폐기물');
      extraFeeWarnings.push('돌침대, 피아노 등 초중량물은 5만~10만원 별도 중량비 발생');
      contractorChecklist.push('집 안에서 밖으로 내릴 때 바닥이나 벽지 손상 방지 보양을 해주는가?');
      contractorChecklist.push('정식 폐기물 수집운반 허가 차량인지 확인했는가?');
      cautions.push('대형 가전은 한국전자제품자원순환공제조합에서 무료 수거가 가능하니 먼저 확인하세요.');
      break;
    }

    case 'freight-truck-delivery': {
      const vehOpt = service.questions.find((q) => q.id === 'vehicle_type')?.options?.find((o) => o.value === inputs.vehicle_type);
      baseCost = vehOpt?.priceDelta || 60000;
      priceBreakdown.push({ name: `${vehOpt?.label || '1톤 트럭'} 기본 운임 (15km)`, amount: baseCost });

      const dist = Math.max(1, Math.min(400, Number(inputs.distance_km) || 20));
      const distDelta = dist > 15 ? Math.round((dist - 15) * 1500) : 0;
      if (distDelta > 0) {
        priceBreakdown.push({ name: `주행 거리 가산 (${dist}km)`, amount: distDelta });
      }

      const laborOpt = service.questions.find((q) => q.id === 'labor_help')?.options?.find((o) => o.value === inputs.labor_help);
      const laborDelta = laborOpt?.priceDelta || 0;
      if (laborDelta !== 0) {
        priceBreakdown.push({ name: `상하차 인력 지원 (${laborOpt?.label})`, amount: laborDelta });
      }

      const totalTarget = baseCost + distDelta + laborDelta;
      minCost = totalTarget;
      maxCost = totalTarget + 15000;

      inclusions.push('지정 장소 배차, 목적지까지 안전 운송, 기본 결속바 고정');
      exclusions.push('고속도로 통행료(실비 고객부담), 기사 단독 장거리 계단 운반');
      extraFeeWarnings.push('상하차 대기 시간 30분 초과 시 1시간당 2만원 대기료 발생');
      contractorChecklist.push('비/눈 예보 시 방수 호루 또는 탑차 배차가 가능한가?');
      contractorChecklist.push('화물 결속용 자동바와 완충재를 구비하고 있는가?');
      cautions.push('물품 규격(가로×세로×높이)과 무게를 기사님께 정확히 사전 공유해야 배차 취소를 방지합니다.');
      break;
    }

    case 'ladder-truck-moving': {
      const floorOpt = service.questions.find((q) => q.id === 'floor_range')?.options?.find((o) => o.value === inputs.floor_range);
      baseCost = floorOpt?.priceDelta || 140000;
      priceBreakdown.push({ name: `사다리차 층수 기본료 (${floorOpt?.label || '6~10층'})`, amount: baseCost });

      const workOpt = service.questions.find((q) => q.id === 'work_type')?.options?.find((o) => o.value === inputs.work_type);
      const workDelta = workOpt?.priceDelta || 0;
      if (workDelta !== 0) {
        priceBreakdown.push({ name: `작업 분량 (${workOpt?.label})`, amount: workDelta });
      }

      const groundOpt = service.questions.find((q) => q.id === 'ground_condition')?.options?.find((o) => o.value === inputs.ground_condition);
      const groundDelta = groundOpt?.priceDelta || 0;
      if (groundDelta !== 0) {
        priceBreakdown.push({ name: `진입 난이도 보강`, amount: groundDelta });
      }

      const totalTarget = baseCost + workDelta + groundDelta;
      minCost = totalTarget;
      maxCost = totalTarget + 20000;

      inclusions.push('전문 기사 직접 조작 운전, 붐대 인출 및 안전 지지대(아웃트리거) 설치');
      exclusions.push('집 안 내부 짐 운반(사다리 운전만 전담), 창문 탈거 및 재부착');
      extraFeeWarnings.push('강풍 주의보 발효 시 안전상 작업 불가 또는 대기 발생');
      contractorChecklist.push('작업 창문 밑 주차장 공간에 주차 통제 라바콘을 설치해 주는가?');
      contractorChecklist.push('안전 정기검사를 통과한 등록 장비인지 확인했는가?');
      cautions.push('사다리차가 작업할 바닥 밑에 정화조나 지하주차장 상판이 있는지 관리실에 확인하세요.');
      break;
    }

    // C. 냉난방·설비 (3개)
    case 'ac-relocation-installation': {
      const acOpt = service.questions.find((q) => q.id === 'ac_type')?.options?.find((o) => o.value === inputs.ac_type);
      baseCost = acOpt?.priceDelta || 180000;
      priceBreakdown.push({ name: `${acOpt?.label || '에어컨'} 기본 설치 공임`, amount: baseCost });

      const pipeOpt = service.questions.find((q) => q.id === 'pipe_extra_meter')?.options?.find((o) => o.value === String(inputs.pipe_extra_meter));
      const pipeDelta = pipeOpt?.priceDelta || 0;
      if (pipeDelta !== 0) {
        priceBreakdown.push({ name: `배관 추가 (${pipeOpt?.label})`, amount: pipeDelta });
      }

      const bracketOpt = service.questions.find((q) => q.id === 'outdoor_bracket')?.options?.find((o) => o.value === inputs.outdoor_bracket);
      const bracketDelta = bracketOpt?.priceDelta || 0;
      if (bracketDelta !== 0) {
        priceBreakdown.push({ name: `실외기 거치 (${bracketOpt?.label})`, amount: bracketDelta });
      }

      const gasOpt = service.questions.find((q) => q.id === 'gas_recharge')?.options?.find((o) => o.value === inputs.gas_recharge);
      const gasDelta = gasOpt?.priceDelta || 0;
      if (gasDelta !== 0) {
        priceBreakdown.push({ name: `진공 및 냉매가스 작업`, amount: gasDelta });
      }

      const totalTarget = baseCost + pipeDelta + bracketDelta + gasDelta;
      minCost = Math.round(totalTarget - Math.max(12000, totalTarget * 0.07));
      maxCost = Math.round(totalTarget + Math.max(20000, totalTarget * 0.13));

      inclusions.push('기본 배관 5m, 벽 타공 1회, 전원 연결, 드레인 호스');
      inclusions.push('정상 가동 시운전 및 토출 온도 점검');
      exclusions.push('기존 주거지 철거 및 운반비(타지역 3~5만 별도), 위험수당(난간 외부 작업 3만)');
      extraFeeWarnings.push('매립 배관 질소 브로잉 청관 작업 필요 시 라인당 5만원 추가');
      contractorChecklist.push('디지털 토크렌치 체결 및 진공 게이지 수치(0.5Torr 이하)를 확인하는가?');
      contractorChecklist.push('설치 후 누설 무상 A/S 기간(통상 1~2년)을 보증서에 명시하는가?');
      cautions.push('철거 시 펌프다운(냉매 모으기)을 제대로 하지 않으면 재설치 시 가스비가 전액 추가됩니다.');
      break;
    }

    case 'boiler-repair-replacement': {
      const sOpt = service.questions.find((q) => q.id === 'service_type')?.options?.find((o) => o.value === inputs.service_type);
      baseCost = sOpt?.priceDelta || 750000;
      priceBreakdown.push({ name: `${sOpt?.label || '보일러 교체'} 기본`, amount: baseCost });

      const areaOpt = service.questions.find((q) => q.id === 'home_area')?.options?.find((o) => o.value === inputs.home_area);
      const areaDelta = areaOpt?.priceDelta || 0;
      if (areaDelta !== 0) {
        priceBreakdown.push({ name: `난방 용량 가산 (${areaOpt?.label})`, amount: areaDelta });
      }

      const bundleOpt = service.questions.find((q) => q.id === 'pipe_flushing_bundle')?.options?.find((o) => o.value === inputs.pipe_flushing_bundle);
      const bundleDelta = bundleOpt?.priceDelta || 0;
      if (bundleDelta !== 0) {
        priceBreakdown.push({ name: `배관 녹물 청소 패키지`, amount: bundleDelta });
      }

      const totalTarget = baseCost + areaDelta + bundleDelta;
      minCost = Math.round(totalTarget - Math.max(20000, totalTarget * 0.06));
      maxCost = Math.round(totalTarget + Math.max(30000, totalTarget * 0.12));

      inclusions.push('친환경 콘덴싱 가스보일러 본체, 룸콘(온도조절기), 신규 연통 일체');
      inclusions.push('법정 의무 KFI 인증 일산화탄소(CO) 경보기 설치, 가스 후렉시블관 교체');
      inclusions.push('기존 폐보일러 무상 철거 및 수거, 도시가스 시공표지판 보험 서류 접수');
      exclusions.push('분배기 전체 밸브 교체(구당 2~3만원), 보일러실 배수 배관 신설 공사');
      extraFeeWarnings.push('연통 상향 굴곡이 길거나 코어 타공 필요 시 3만~5만원 추가');
      contractorChecklist.push('가스시설시공업 면허증을 보유한 유자격 엔지니어 시공인가?');
      contractorChecklist.push('가스 누출 검지기로 배관 연결 부위 기포 누설 검사를 진행하는가?');
      cautions.push('콘덴싱 보일러는 응축수 배출 호스가 겨울철 얼지 않도록 배수구 유도가 필수입니다.');
      break;
    }

    case 'heating-pipe-flushing': {
      const hOpt = service.questions.find((q) => q.id === 'heating_type')?.options?.find((o) => o.value === inputs.heating_type);
      baseCost = hOpt?.priceDelta || 120000;
      priceBreakdown.push({ name: `${hOpt?.label || '난방배관'} 기본 세척`, amount: baseCost });

      const pOpt = service.questions.find((q) => q.id === 'pyeong_size')?.options?.find((o) => o.value === inputs.pyeong_size);
      const pDelta = pOpt?.priceDelta || 0;
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `평형 가산 (${pOpt?.label})`, amount: pDelta });
      }

      const distOpt = service.questions.find((q) => q.id === 'distributor_status')?.options?.find((o) => o.value === inputs.distributor_status);
      const distDelta = distOpt?.priceDelta || 0;
      if (distDelta !== 0) {
        priceBreakdown.push({ name: `분배기 노후 밸브 정비`, amount: distDelta });
      }

      const totalTarget = baseCost + pDelta + distDelta;
      minCost = totalTarget;
      maxCost = totalTarget + 30000;

      inclusions.push('특허 초음파 마이크로버블 펄스 파동 세척 장비 투입');
      inclusions.push('분배기 각 라인별 1:1 순환 녹물·슬러지 배출 및 에어 빼기');
      inclusions.push('열화상 카메라로 각 방 바닥 난방수 흐름 전후 확인');
      exclusions.push('부식된 난방 분배기 통째 교체 공사(15만~30만원)');
      extraFeeWarnings.push('분배기 에어밸브 고착으로 밸브 파손 시 부품 교체비 발생');
      contractorChecklist.push('세척 완료 후 열화상 카메라로 방바닥 난방선이 살아나는지 보여주는가?');
      contractorChecklist.push('작업 중 누수 발생 여부를 각 방 분배기에서 꼼꼼히 점검하는가?');
      cautions.push('아주 오래된(30년 이상) 백관/동관 파이프는 세척 전 누수 위험을 먼저 진단받으세요.');
      break;
    }

    // D. 누수·배관·수도 (3개)
    case 'leak-detection': {
      const locOpt = service.questions.find((q) => q.id === 'leak_location')?.options?.find((o) => o.value === inputs.leak_location);
      baseCost = locOpt?.priceDelta || 300000;
      priceBreakdown.push({ name: `${locOpt?.label || '누수 진단'} 기본 탐지비`, amount: baseCost });

      const eqOpt = service.questions.find((q) => q.id === 'equipment_type')?.options?.find((o) => o.value === inputs.equipment_type);
      const eqDelta = eqOpt?.priceDelta || 0;
      if (eqDelta !== 0) {
        priceBreakdown.push({ name: `탐지 방식 (${eqOpt?.label})`, amount: eqDelta });
      }

      const repOpt = service.questions.find((q) => q.id === 'repair_work')?.options?.find((o) => o.value === inputs.repair_work);
      const repDelta = repOpt?.priceDelta || 0;
      if (repDelta !== 0) {
        priceBreakdown.push({ name: `수리 복구 (${repOpt?.label})`, amount: repDelta });
      }

      const totalTarget = baseCost + eqDelta + repDelta;
      minCost = Math.round(totalTarget - Math.max(20000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(35000, totalTarget * 0.18));

      inclusions.push('배관 공압 검사(직수/온수/난방), 청음기 핀포인트 탐지');
      inclusions.push('굴착 수리 시 배관 교체 연결 및 몰탈 미장 마감 (수리 포함 옵션 시)');
      exclusions.push('타일 마감재 완벽 색상 매칭(기존 타일 단종 시 유사 타일 마감)');
      extraFeeWarnings.push('미세 누수로 가스 주입 장시간 소요 시 가스비 5~10만원 추가 가능');
      contractorChecklist.push('누수 원인을 못 찾으면 출장비 0원(무료) 조건이 맞는지?');
      contractorChecklist.push('일상생활배상책임보험(일배책) 소견서와 견적서 서류 작성을 지원하는가?');
      cautions.push('누수 발생 시 먼저 수도계량기 밸브를 잠가 아랫집 2차 피해(가구/도배)를 최소화하세요.');
      break;
    }

    case 'faucet-replacement': {
      const fOpt = service.questions.find((q) => q.id === 'faucet_type')?.options?.find((o) => o.value === inputs.faucet_type);
      baseCost = fOpt?.priceDelta || 45000;
      priceBreakdown.push({ name: `${fOpt?.label || '수전'} 설치 공임`, amount: baseCost });

      const sOpt = service.questions.find((q) => q.id === 'supply_type')?.options?.find((o) => o.value === inputs.supply_type);
      const sDelta = sOpt?.priceDelta || 0;
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `수전 제품 (${sOpt?.label})`, amount: sDelta });
      }

      const vOpt = service.questions.find((q) => q.id === 'valve_condition')?.options?.find((o) => o.value === inputs.valve_condition);
      const vDelta = vOpt?.priceDelta || 0;
      if (vDelta !== 0) {
        priceBreakdown.push({ name: `노후 앵글밸브 신품 교체`, amount: vDelta });
      }

      const totalTarget = baseCost + sDelta + vDelta;
      minCost = totalTarget;
      maxCost = totalTarget + 15000;

      inclusions.push('기존 고장 수전 탈거 및 폐기 수거, 신규 수전 수평 설치');
      inclusions.push('온·냉수 고압 호스 체결 및 누수 테스트');
      exclusions.push('벽면 배관 연장 공사, 싱크볼 대리석 타공 신설');
      extraFeeWarnings.push('수전 너트가 녹슬어 고착되어 그라인더 절단 필요 시 1~2만원 공임 추가');
      contractorChecklist.push('수전 본체가 저가 플라스틱이 아닌 KS 인증 황동 주물 제품인가?');
      contractorChecklist.push('체결 후 고압 호스 이음새에서 미세 물방울이 맺히지 않는지 확인했는가?');
      cautions.push('직접 수전을 구매하실 경우 싱크대 타공 구멍 크기(35~38mm) 규격을 반드시 확인하세요.');
      break;
    }

    case 'drain-unclogging': {
      const bOpt = service.questions.find((q) => q.id === 'blockage_location')?.options?.find((o) => o.value === inputs.blockage_location);
      baseCost = bOpt?.priceDelta || 80000;
      priceBreakdown.push({ name: `${bOpt?.label || '하수구'} 기본 통수`, amount: baseCost });

      const eqOpt = service.questions.find((q) => q.id === 'equipment_level')?.options?.find((o) => o.value === inputs.equipment_level);
      const eqDelta = eqOpt?.priceDelta || 0;
      if (eqDelta !== 0) {
        priceBreakdown.push({ name: `장비 옵션 (${eqOpt?.label})`, amount: eqDelta });
      }

      const urgOpt = service.questions.find((q) => q.id === 'urgency_level')?.options?.find((o) => o.value === inputs.urgency_level);
      const urgDelta = urgOpt?.priceDelta || 0;
      if (urgDelta !== 0) {
        priceBreakdown.push({ name: `긴급 출동 할증`, amount: urgDelta });
      }

      const totalTarget = baseCost + eqDelta + urgDelta;
      minCost = Math.round(totalTarget - Math.max(20000, totalTarget * 0.06));
      maxCost = Math.round(totalTarget + Math.max(30000, totalTarget * 0.12));

      inclusions.push('배관 내부 이물질 파쇄 및 석션 흡입 제거, 물 빠짐 테스트');
      exclusions.push('배관 파손으로 인한 땅파기 배관 교체 토목공사');
      extraFeeWarnings.push('오랜 기름 슬러지가 10m 이상 굳어 있어 고압세척 전환 시 추가 요금');
      contractorChecklist.push('해결 실패(통수 불가) 시 출장비를 받지 않는 조건인가?');
      contractorChecklist.push('내시경 카메라로 배관 속 기름 슬러지가 다 빠진 화면을 보여주는가?');
      cautions.push('화학 배수관 세정제(락스 등)를 과다 투입한 상태라면 기사님께 미리 고지해 화상을 방지하세요.');
      break;
    }

    // E. 인테리어·시공 (8개)
    case 'wallpaper-flooring': {
      const pyeong = Math.max(6, Math.min(60, Number(inputs.home_pyeong) || 24));
      const wOpt = service.questions.find((q) => q.id === 'wallpaper_type')?.options?.find((o) => o.value === inputs.wallpaper_type);
      const baseW = wOpt?.priceDelta || 1350000;
      const wPyeongAdjust = Math.round((pyeong / 24) * baseW);
      priceBreakdown.push({ name: `도배 시공 (${pyeong}평형 / ${wOpt?.label})`, amount: wPyeongAdjust });

      const fOpt = service.questions.find((q) => q.id === 'flooring_type')?.options?.find((o) => o.value === inputs.flooring_type);
      const baseF = fOpt?.priceDelta || 0;
      const fPyeongAdjust = baseF > 0 ? Math.round((pyeong / 24) * baseF) : 0;
      if (fPyeongAdjust > 0) {
        priceBreakdown.push({ name: `바닥재 시공 (${fOpt?.label})`, amount: fPyeongAdjust });
      }

      const occOpt = service.questions.find((q) => q.id === 'occupied_status')?.options?.find((o) => o.value === inputs.occupied_status);
      const occDelta = occOpt?.priceDelta || 0;
      if (occDelta !== 0) {
        priceBreakdown.push({ name: `거주 중 짐 보양 및 이동 인건비`, amount: occDelta });
      }

      const totalTarget = wPyeongAdjust + fPyeongAdjust + occDelta;
      minCost = Math.round(totalTarget - Math.max(10000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(18000, totalTarget * 0.14));

      inclusions.push('친환경 도배 풀, 부직포 띄움 초배지, 삼중지 퍼티 작업');
      inclusions.push('도배사 인건비, 기본 폐기물 정리 및 바닥 쓸기');
      exclusions.push('기존 온돌마루 기계 철거 샌딩비(평당 3~4만원), 천장 석고보드 목공 교체');
      extraFeeWarnings.push('벽면 곰팡이가 극심하여 곰팡이 특수 코팅 작업 시 10만~20만원 추가');
      contractorChecklist.push('실크벽지 시공 시 부직포 띄움 초배를 정석대로 진행하는가?');
      contractorChecklist.push('시공 후 이음매 벌어짐에 대해 1년 무상 A/S가 보장되는가?');
      cautions.push('도배 직후 창문을 활짝 열거나 보일러를 세게 틀면 급격한 건조로 벽지 이음매가 터질 수 있습니다.');
      break;
    }

    case 'bathroom-renovation': {
      const cOpt = service.questions.find((q) => q.id === 'construction_method')?.options?.find((o) => o.value === inputs.construction_method);
      baseCost = cOpt?.priceDelta || 2200000;
      priceBreakdown.push({ name: `욕실 시공 공법 (${cOpt?.label})`, amount: baseCost });

      const gOpt = service.questions.find((q) => q.id === 'fixtures_grade')?.options?.find((o) => o.value === inputs.fixtures_grade);
      const gDelta = gOpt?.priceDelta || 0;
      if (gDelta !== 0) {
        priceBreakdown.push({ name: `위생도기 등급 (${gOpt?.label})`, amount: gDelta });
      }

      const lOpt = service.questions.find((q) => q.id === 'layout_option')?.options?.find((o) => o.value === inputs.layout_option);
      const lDelta = lOpt?.priceDelta || 0;
      if (lDelta !== 0) {
        priceBreakdown.push({ name: `샤워 공간 구성 (${lOpt?.label})`, amount: lDelta });
      }

      const totalTarget = baseCost + gDelta + lDelta;
      minCost = Math.round(totalTarget - Math.max(20000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(35000, totalTarget * 0.18));

      inclusions.push('벽 타일(300×600) 및 바닥 타일(300×300), 치마형 양변기/세면대');
      inclusions.push('댐퍼 슬라이드 거울장, SMC 평천장, LED 매립등 2개, 힘펠 환풍기');
      inclusions.push('기존 타일/도기 철거 및 건설폐기물 폐기처리 일체');
      exclusions.push('젠다이 조적 및 배관 연장 신설(25만~35만원 별도)');
      extraFeeWarnings.push('UBR 조립식 플라스틱 욕실의 경우 전체 철거 및 방수로 100만~150만원 가산');
      contractorChecklist.push('벽 타일 접착제(아덱스/세라픽스)와 방수 시멘트 정품을 사용하는가?');
      contractorChecklist.push('바닥 물 빠짐 구배(물매)를 확실하게 잡아 물고임이 없는가?');
      cautions.push('공사 완료 후 실리콘과 메지가 굳는 48시간 동안은 양변기 착석 및 물 사용을 피하세요.');
      break;
    }

    case 'kitchen-cabinet-replacement': {
      const lOpt = service.questions.find((q) => q.id === 'layout_type')?.options?.find((o) => o.value === inputs.layout_type);
      baseCost = lOpt?.priceDelta || 1800000;
      priceBreakdown.push({ name: `싱크대 구조 규격 (${lOpt?.label})`, amount: baseCost });

      const cOpt = service.questions.find((q) => q.id === 'countertop_material')?.options?.find((o) => o.value === inputs.countertop_material);
      const cDelta = cOpt?.priceDelta || 0;
      if (cDelta !== 0) {
        priceBreakdown.push({ name: `상판 자재 업그레이드 (${cOpt?.label})`, amount: cDelta });
      }

      const dOpt = service.questions.find((q) => q.id === 'door_finish')?.options?.find((o) => o.value === inputs.door_finish);
      const dDelta = dOpt?.priceDelta || 0;
      if (dDelta !== 0) {
        priceBreakdown.push({ name: `도어 표면 마감 (${dOpt?.label})`, amount: dDelta });
      }

      const totalTarget = baseCost + cDelta + dDelta;
      minCost = Math.round(totalTarget - Math.max(6000, totalTarget * 0.06));
      maxCost = Math.round(totalTarget + Math.max(10000, totalTarget * 0.12));

      inclusions.push('상·하부장 맞춤 수납장, 인조대리석 상판, 스테인리스 사각 싱크볼');
      inclusions.push('원홀 수전, 슬라이딩 후드, 서랍 댐퍼 힌지, 칼꽂이, 수저분리함');
      inclusions.push('기존 노후 싱크대 무료 철거 및 폐기물 수거');
      exclusions.push('주방 벽면 타일 덧방 시공(25만~40만원), 가스 배관 철거 인입');
      extraFeeWarnings.push('빌트인 인덕션/식기세척기 공간 확보를 위한 상판 특수 가공 타공비 발생');
      contractorChecklist.push('몸통 자재가 친환경 E0 등급 PB 보드를 사용하는지?');
      contractorChecklist.push('대리석 상판 이음새 접합부를 매끄럽게 그라인딩 샌딩해 주는가?');
      cautions.push('철거 직후 드러난 벽면 곰팡이나 기름때는 새 싱크대 안착 전에 깨끗이 닦아내세요.');
      break;
    }

    case 'tile-grout-repair': {
      const aOpt = service.questions.find((q) => q.id === 'area_scope')?.options?.find((o) => o.value === inputs.area_scope);
      baseCost = aOpt?.priceDelta || 180000;
      priceBreakdown.push({ name: `줄눈 시공 구역 (${aOpt?.label})`, amount: baseCost });

      const mOpt = service.questions.find((q) => q.id === 'material_type')?.options?.find((o) => o.value === inputs.material_type);
      const mDelta = mOpt?.priceDelta || 0;
      if (mDelta !== 0) {
        priceBreakdown.push({ name: `프리미엄 소재 (${mOpt?.label})`, amount: mDelta });
      }

      const wOpt = service.questions.find((q) => q.id === 'wall_included')?.options?.find((o) => o.value === inputs.wall_included);
      const wDelta = wOpt?.priceDelta || 0;
      if (wDelta !== 0) {
        priceBreakdown.push({ name: `벽면 줄눈 추가 (${wOpt?.label})`, amount: wDelta });
      }

      const totalTarget = baseCost + mDelta + wDelta;
      minCost = Math.round(totalTarget - Math.max(8000, totalTarget * 0.07));
      maxCost = Math.round(totalTarget + Math.max(15000, totalTarget * 0.16));

      inclusions.push('기존 백시멘트 깊이 3mm 수작업 V컷 그라인더 파내기');
      inclusions.push('진공청소기 분진 흡입, 친환경 프라이머 도포 및 줄눈제 충진');
      inclusions.push('욕실 테두리 바이오 실리콘 오염방지 코팅 서비스');
      exclusions.push('깨지거나 들뜬 타일 보수 교체(타일 부착 비용 별도)');
      extraFeeWarnings.push('구축 백시멘트가 돌처럼 단단하여 수작업 불가능 시 추가 공임 발생');
      contractorChecklist.push('수작업으로 깊이 3mm 이상 정직하게 백시멘트를 파내는지 확인했는가?');
      contractorChecklist.push('색상 샘플 칩을 현장 타일에 직접 대보고 고객 확인을 받는가?');
      cautions.push('시공 후 최소 24시간(케라폭시는 48시간) 동안은 바닥에 물기가 닿지 않도록 관리하세요.');
      break;
    }

    case 'interior-demolition-restoration': {
      const area = Math.max(1, Math.min(100, Number(inputs.area_pyeong) || 15));
      const tOpt = service.questions.find((q) => q.id === 'demolition_target')?.options?.find((o) => o.value === inputs.demolition_target);
      const baseT = tOpt?.priceDelta || 1500000;
      const areaAdjust = Math.round((area / 15) * baseT);
      priceBreakdown.push({ name: `철거 인건비 및 공구 작업 (${tOpt?.label} / ${area}평)`, amount: areaAdjust });

      const wOpt = service.questions.find((q) => q.id === 'waste_handling')?.options?.find((o) => o.value === inputs.waste_handling);
      const wDelta = wOpt?.priceDelta || 0;
      if (wDelta !== 0) {
        priceBreakdown.push({ name: `폐기물 반출 방식 (${wOpt?.label})`, amount: wDelta });
      }

      const totalTarget = areaAdjust + wDelta;
      minCost = Math.round(totalTarget - Math.max(40000, totalTarget * 0.09));
      maxCost = Math.round(totalTarget + Math.max(70000, totalTarget * 0.18));

      inclusions.push('전문 철거공 인력 투입, 해머드릴/뿌레카 파쇄 및 집진 작업');
      inclusions.push('건설폐기물 마대 수거 및 트럭 상차, 반출지 직송');
      exclusions.push('건물 외벽 비계(아시바) 설치비, 소방 스프링클러 배관 이설');
      extraFeeWarnings.push('야간 철거 또는 백화점/대형몰 심야 통제 작업 시 야간 할증 30% 가산');
      contractorChecklist.push('철거 전 소음 공사 입주민 안내 및 관리사무소 승강기 보양을 마쳤는가?');
      contractorChecklist.push('소상공인 희망리턴패키지 국비 지원용 견적서·영수증 서류 발급이 가능한가?');
      cautions.push('내력벽(콘크리트 기둥)은 건축법상 절대 철거 불가하므로 조적/석고 가벽만 철거하세요.');
      break;
    }

    case 'insect-screen-replacement': {
      const matOpt = service.questions.find((q) => q.id === 'screen_material')?.options?.find((o) => o.value === inputs.screen_material);
      const matPrice = matOpt?.priceDelta || 45000;
      const bigCount = Math.max(0, Math.min(10, Number(inputs.large_window_count) || 2));
      const smallCount = Math.max(0, Math.min(10, Number(inputs.small_window_count) || 3));
      const windowTotal = bigCount * matPrice + smallCount * Math.round(matPrice * 0.65);
      priceBreakdown.push({
        name: `방충망 맞춤 제작 (${matOpt?.label || '미세방충망'}, 대창 ${bigCount}개 + 중소창 ${smallCount}개)`,
        amount: windowTotal,
      });

      const dOpt = service.questions.find((q) => q.id === 'dust_strip_replace')?.options?.find((o) => o.value === inputs.dust_strip_replace);
      const dDelta = dOpt?.priceDelta || 0;
      if (dDelta !== 0) {
        priceBreakdown.push({ name: `모헤어 털 전면 교체 패키지`, amount: dDelta });
      }

      const totalTarget = windowTotal + dDelta;
      minCost = Math.round(totalTarget - Math.max(30000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(50000, totalTarget * 0.15));

      inclusions.push('창틀 1층 탈거 후 야외 제작, 고강도 개스킷 고무 롤러 압착');
      inclusions.push('창문 하단 빗물구멍 미세 거름망 스티커 전창 부착 서비스');
      exclusions.push('알루미늄 프레임 자체가 찌그러져 샷시 프레임 신규 제작 시 틀 제작비 별도');
      extraFeeWarnings.push('고층 아파트 샷시 손잡이 간섭으로 탈거 불가 시 현장 타공 공임');
      contractorChecklist.push('30메쉬 규격의 정품 모노필라멘트 섬유망을 사용하는지 확인했는가?');
      contractorChecklist.push('방충망 바퀴(롤러)가 삭아 덜컹거리는 것을 무료로 교체해 주는가?');
      cautions.push('기존 삭은 알루미늄 방충망은 만지면 미세 쇳가루가 날리므로 손대지 마시고 기사님께 맡기세요.');
      break;
    }

    case 'blinds-curtains-installation': {
      const pOpt = service.questions.find((q) => q.id === 'product_type')?.options?.find((o) => o.value === inputs.product_type);
      baseCost = pOpt?.priceDelta || 280000;
      priceBreakdown.push({ name: `제품 및 맞춤 제작 (${pOpt?.label})`, amount: baseCost });

      const wOpt = service.questions.find((q) => q.id === 'window_count')?.options?.find((o) => o.value === inputs.window_count);
      const wDelta = wOpt?.priceDelta || 0;
      if (wDelta !== 0) {
        priceBreakdown.push({ name: `창문 개소 추가 (${wOpt?.label})`, amount: wDelta });
      }

      const cOpt = service.questions.find((q) => q.id === 'ceiling_material')?.options?.find((o) => o.value === inputs.ceiling_material);
      const cDelta = cOpt?.priceDelta || 0;
      if (cDelta !== 0) {
        priceBreakdown.push({ name: `천장 보강 타공 (${cOpt?.label})`, amount: cDelta });
      }

      const totalTarget = baseCost + wDelta + cDelta;
      minCost = Math.round(totalTarget - Math.max(50000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(80000, totalTarget * 0.15));

      inclusions.push('전문 실측 가공, 고강도 알루미늄 커튼 레일 또는 브래킷 부자재');
      inclusions.push('수평계 레이저 레벨링 정밀 시공 및 주름 형태 점검');
      exclusions.push('전동 스마트 모터 레일 및 리모컨 IoT 모듈(15만~25만원 별도)');
      extraFeeWarnings.push('복층 오피스텔 층고 3.5m 이상 시 고소 사다리 작업비 추가');
      contractorChecklist.push('석고보드 천장에 토글앙카로 단단히 고정하여 추락 위험이 없는가?');
      contractorChecklist.push('커튼 하단이 바닥에 끌리지 않도록 1cm 띄움 마감이 되었는가?');
      cautions.push('쉬폰 커튼은 주름을 2배 나비주름으로 잡아야 호텔처럼 풍성한 볼륨감이 완성됩니다.');
      break;
    }

    case 'rooftop-waterproofing': {
      const area = Math.max(10, Math.min(200, Number(inputs.rooftop_area) || 30));
      const mOpt = service.questions.find((q) => q.id === 'waterproof_method')?.options?.find((o) => o.value === inputs.waterproof_method);
      const baseM = mOpt?.priceDelta || 3000000;
      const areaAdjust = Math.round((area / 30) * baseM);
      priceBreakdown.push({ name: `방수 공법 (${mOpt?.label} / ${area}평)`, amount: areaAdjust });

      const gOpt = service.questions.find((q) => q.id === 'surface_grinding')?.options?.find((o) => o.value === inputs.surface_grinding);
      const gDelta = gOpt?.priceDelta || 0;
      if (gDelta !== 0) {
        priceBreakdown.push({ name: `바닥 면갈이 연삭 (${gOpt?.label})`, amount: gDelta });
      }

      const totalTarget = areaAdjust + gDelta;
      minCost = Math.round(totalTarget - Math.max(60000, totalTarget * 0.08));
      maxCost = Math.round(totalTarget + Math.max(100000, totalTarget * 0.16));

      inclusions.push('고압 물세척 바탕정리, 프라이머 하도 도포, 우레탄 실란트 균열 보수');
      inclusions.push('우레탄 중도 3mm 도포, 자외선 차단 상도 탑코트 코팅 마감');
      exclusions.push('옥상 누수로 인한 아래층 가구 실내 피해 배상 공사');
      extraFeeWarnings.push('기존 우레탄에 습기가 가득 차 있어 토치 가열 강제 건조 필요 시 공임 가산');
      contractorChecklist.push('우레탄 중도 도막 두께가 KS 규격인 3mm 이상인지 확인하는가?');
      contractorChecklist.push('시공 후 3년 이상 무상 누수 하자보증서를 발급하는가?');
      cautions.push('시공 전 최소 3일간 비가 오지 않고 콘크리트 바닥이 바짝 마른 상태에서만 작업해야 부풀어 오르지 않습니다.');
      break;
    }

    // F. 생활 설치·교체 (4개)
    case 'smart-lock-installation': {
      const lOpt = service.questions.find((q) => q.id === 'lock_type')?.options?.find((o) => o.value === inputs.lock_type);
      baseCost = lOpt?.priceDelta || 240000;
      priceBreakdown.push({ name: `${lOpt?.label || '푸시풀 도어락'} 본체 및 시공`, amount: baseCost });

      const sOpt = service.questions.find((q) => q.id === 'supply_mode')?.options?.find((o) => o.value === inputs.supply_mode);
      const sDelta = sOpt?.priceDelta || 0;
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `고객 자가 준비 제품 (공임만 정산)`, amount: sDelta });
      }

      const pOpt = service.questions.find((q) => q.id === 'door_plate')?.options?.find((o) => o.value === inputs.door_plate);
      const pDelta = pOpt?.priceDelta || 0;
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `마감 자재 (${pOpt?.label})`, amount: pDelta });
      }

      const totalTarget = baseCost + sDelta + pDelta;
      minCost = totalTarget;
      maxCost = totalTarget + 20000;

      inclusions.push('기존 노후 도어락 탈거, 모티스 결합, 신규 도어락 장착');
      inclusions.push('마그네틱 카드키 4장 등록, 비밀번호 세팅 및 화재감지 테스트');
      exclusions.push('방화문 도어클로저 신규 교체(3만~4만원)');
      extraFeeWarnings.push('문틀 스트라이커 규격 불일치로 그라인더 문틀 확장 시 가공비 발생');
      contractorChecklist.push('문이 닫힐 때 걸림 없이 부드럽게 래치 볼트가 들어가는지 확인했는가?');
      contractorChecklist.push('안쪽 수동 레버 및 비상 열림 기능이 정상 작동하는가?');
      cautions.push('설치 후 문을 닫기 전에 반드시 문을 열어둔 상태에서 비밀번호 변경 및 개폐 테스트를 진행하세요.');
      break;
    }

    case 'wall-mounted-tv-installation': {
      const sOpt = service.questions.find((q) => q.id === 'tv_size')?.options?.find((o) => o.value === inputs.tv_size);
      baseCost = sOpt?.priceDelta || 90000;
      priceBreakdown.push({ name: `벽걸이 TV 시공 (${sOpt?.label || '65~75인치'})`, amount: baseCost });

      const wOpt = service.questions.find((q) => q.id === 'wall_material')?.options?.find((o) => o.value === inputs.wall_material);
      const wDelta = wOpt?.priceDelta || 0;
      if (wDelta !== 0) {
        priceBreakdown.push({ name: `벽면 특수 작업 (${wOpt?.label})`, amount: wDelta });
      }

      const bOpt = service.questions.find((q) => q.id === 'bracket_type')?.options?.find((o) => o.value === inputs.bracket_type);
      const bDelta = bOpt?.priceDelta || 0;
      if (bDelta !== 0) {
        priceBreakdown.push({ name: `브래킷 및 매립 (${bOpt?.label})`, amount: bDelta });
      }

      const totalTarget = baseCost + wDelta + bDelta;
      minCost = Math.round(totalTarget - Math.max(40000, totalTarget * 0.07));
      maxCost = Math.round(totalTarget + Math.max(70000, totalTarget * 0.15));

      inclusions.push('벽면 레이저 수평 타공, 안전 하중 100kg 전용 앙카 체결');
      inclusions.push('셋톱박스 및 와이파이 공유기 전용 거치대 후면 숨김');
      exclusions.push('사운드바 전용 선반 브래킷 자재비(3만~5만원 별도)');
      extraFeeWarnings.push('벽면 내부 콘센트 단자가 아래에 있어 동축/전기선 매립선 신설 필요 시 공임 추가');
      contractorChecklist.push('타일/대리석 타공 시 깨짐 파손 배상책임보험이 가입되어 있는가?');
      contractorChecklist.push('TV 거치 후 각도 조절 시 수평이 흐트러지지 않는지 확인했는가?');
      cautions.push('전월세 임차 주택의 경우 타공 전 집주인 동의를 받거나 무타공 공법을 선택하세요.');
      break;
    }

    case 'lighting-installation': {
      const sOpt = service.questions.find((q) => q.id === 'lighting_scope')?.options?.find((o) => o.value === inputs.lighting_scope);
      baseCost = sOpt?.priceDelta || 60000;
      priceBreakdown.push({ name: `조명 설치 공임 (${sOpt?.label})`, amount: baseCost });

      const pOpt = service.questions.find((q) => q.id === 'product_supply')?.options?.find((o) => o.value === inputs.product_supply);
      const pDelta = pOpt?.priceDelta || 0;
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `고효율 LED 등기구 포함 (${pOpt?.label})`, amount: pDelta });
      }

      const swOpt = service.questions.find((q) => q.id === 'switch_outlet_bundle')?.options?.find((o) => o.value === inputs.switch_outlet_bundle);
      const swDelta = swOpt?.priceDelta || 0;
      if (swDelta !== 0) {
        priceBreakdown.push({ name: `스위치·콘센트 교체 패키지`, amount: swDelta });
      }

      const totalTarget = baseCost + pDelta + swDelta;
      minCost = totalTarget;
      maxCost = totalTarget + 20000;

      inclusions.push('차단기 차단 안전 점검, 기존 등기구 철거 및 신규 등기구 수평 설치');
      inclusions.push('천장 전원선 결선 및 절연 마감, 점등 테스트');
      exclusions.push('스위치 회로 분리 신규 전기 배선 증설 공사');
      extraFeeWarnings.push('천장 석고보드 목상이 없어 보강 합판 지지 작업 필요 시 2만~3만원 추가');
      contractorChecklist.push('전기 기능사 자격을 보유한 전문 기사의 안전 결선인가?');
      contractorChecklist.push('플리커 프리(미세 깜빡임 없음) 인증 LED 칩셋인가?');
      cautions.push('조명 교체 작업 중에는 반드시 세대 분전함의 전등 차단기를 내리고 작업해야 안전합니다.');
      break;
    }

    case 'kitchen-hood-replacement': {
      const hOpt = service.questions.find((q) => q.id === 'hood_type')?.options?.find((o) => o.value === inputs.hood_type);
      baseCost = hOpt?.priceDelta || 90000;
      priceBreakdown.push({ name: `주방후드 본체 및 설치 (${hOpt?.label})`, amount: baseCost });

      const dOpt = service.questions.find((q) => q.id === 'duct_replace')?.options?.find((o) => o.value === inputs.duct_replace);
      const dDelta = dOpt?.priceDelta || 0;
      if (dDelta !== 0) {
        priceBreakdown.push({ name: `난연 알루미늄 배기 주름관 교체`, amount: dDelta });
      }

      const fOpt = service.questions.find((q) => q.id === 'fire_extinguisher')?.options?.find((o) => o.value === inputs.fire_extinguisher);
      const fDelta = fOpt?.priceDelta || 0;
      if (fDelta !== 0) {
        priceBreakdown.push({ name: `자동확산 소화기 안전 이전설치`, amount: fDelta });
      }

      const totalTarget = baseCost + dDelta + fDelta;
      minCost = totalTarget;
      maxCost = totalTarget + 20000;

      inclusions.push('기존 기름때 후드 무료 탈거 및 수거, 신규 후드 본체 조립');
      inclusions.push('배기 자바라 밴드 밀폐 결속, 조명 및 풍량 흡입 시운전');
      exclusions.push('외벽 환기구 코어 타공, 상부장 싱크대 목공 리폼');
      extraFeeWarnings.push('기존 상부장과 후드 규격(가로 60cm/90cm) 불일치 시 싱크대 가공비 발생');
      contractorChecklist.push('아파트 소방시설인 자동식 소화기 센서와 노즐을 정상 이식했는가?');
      contractorChecklist.push('배기 덕트 틈새로 연기와 냄새가 새어나오지 않도록 알루미늄 테이프로 밀봉했는가?');
      cautions.push('기존 후드 규격(슬라이딩 60cm, 통후드 60cm, 침니 90cm)을 줄자로 꼭 확인 후 주문하세요.');
      break;
    }

    case 'sofa-fabric-cleaning': {
      const sOpt = service.questions.find((q) => q.id === 'sofa_size')?.options?.find((o) => o.value === inputs.sofa_size);
      const sDelta = sOpt?.priceDelta || 0;
      const mOpt = service.questions.find((q) => q.id === 'sofa_material')?.options?.find((o) => o.value === inputs.sofa_material);
      const mDelta = mOpt?.priceDelta || 0;
      const cOpt = service.questions.find((q) => q.id === 'cleaning_type')?.options?.find((o) => o.value === inputs.cleaning_type);
      const cDelta = cOpt?.priceDelta || 0;

      baseCost = 90000 + sDelta + mDelta;
      priceBreakdown.push({ name: `소파 규격 및 원단 기본 클리닝 (${sOpt?.label || '3인용'}, ${mOpt?.label || '패브릭'})`, amount: baseCost });
      if (cDelta !== 0) {
        priceBreakdown.push({ name: `작업 방식 선택 (${cOpt?.label})`, amount: cDelta });
      }

      const totalTarget = baseCost + cDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('소파 전체 건식 심층 먼지 및 진드기 흡입');
      inclusions.push('친환경 효소 세제 분사 및 100도 고온 스팀 살균');
      inclusions.push('오염수 강력 습식 추출 회수 및 소파 프레임 하부 먼지 청소');
      exclusions.push('원단 완전 변색/탈색 복원 염색, 찢어진 가죽 가죽갈이 리폼');
      extraFeeWarnings.push('반려동물 심한 소변 냄새나 굳은 페인트/염색약 특수 얼룩은 추가비 발생 가능');
      contractorChecklist.push('작업 후 오염수 통을 직접 확인시켜 주며 잔여 얼룩 상태를 설명하는가?');
      contractorChecklist.push('고온 스팀 세척 후 건조 주의사항(실내 환기 6~12시간)을 안내했는가?');
      cautions.push('습식 세척 후에는 통풍이 잘 되도록 창문을 열고 선풍기나 서큘레이터를 가동해 주세요.');
      break;
    }

    case 'carpet-rug-cleaning': {
      const szOpt = service.questions.find((q) => q.id === 'carpet_size')?.options?.find((o) => o.value === inputs.carpet_size);
      const szDelta = szOpt?.priceDelta || 0;
      const pOpt = service.questions.find((q) => q.id === 'pile_type')?.options?.find((o) => o.value === inputs.pile_type);
      const pDelta = pOpt?.priceDelta || 0;
      const mOpt = service.questions.find((q) => q.id === 'cleaning_method')?.options?.find((o) => o.value === inputs.cleaning_method);
      const mDelta = mOpt?.priceDelta || 0;

      baseCost = 80000 + szDelta;
      priceBreakdown.push({ name: `카펫/러그 규격 기본 세척 (${szOpt?.label || '중형 러그'})`, amount: baseCost });
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `원단 특수 파일 케어 (${pOpt?.label})`, amount: pDelta });
      }
      if (mDelta !== 0) {
        priceBreakdown.push({ name: `수거/배송 공정 (${mOpt?.label})`, amount: mDelta });
      }

      const totalTarget = baseCost + pDelta + mDelta;
      minCost = Math.round(totalTarget * 0.88);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('앞뒷면 초강력 진드기 타격 건식 집진 청소');
      inclusions.push('중성 약품 버핑 샴푸닝 및 습식 고압 린스 추출');
      inclusions.push('피톤치드 항균 연무 소독 및 파일 엉킴 결 정리');
      exclusions.push('오랜 담배빵/탄 자국 복원, 삭은 테두리 오버로크 재봉틀 수선');
      extraFeeWarnings.push('샤기러그 털 엉킴이 극심하거나 수거 세탁 시 엘리베이터 없는 고층 계단 추가금 발생 가능');
      contractorChecklist.push('현장 세척 시 마루 바닥 보호용 방수 매트를 하부에 깔고 작업하는가?');
      contractorChecklist.push('천연 울이나 실크 소재에 알칼리 세제가 아닌 중성 전용 세제를 사용하는가?');
      cautions.push('수거 세탁은 3~5 영업일이 소요되며 비닐 포장 수령 후 즉시 비닐을 벗겨 보관하세요.');
      break;
    }

    case 'refrigerator-cleaning': {
      const fOpt = service.questions.find((q) => q.id === 'fridge_type')?.options?.find((o) => o.value === inputs.fridge_type);
      const fDelta = fOpt?.priceDelta || 0;
      const pOpt = service.questions.find((q) => q.id === 'food_prep')?.options?.find((o) => o.value === inputs.food_prep);
      const pDelta = pOpt?.priceDelta || 0;
      const sOpt = service.questions.find((q) => q.id === 'sterilization_level')?.options?.find((o) => o.value === inputs.sterilization_level);
      const sDelta = sOpt?.priceDelta || 0;

      baseCost = 120000 + fDelta;
      priceBreakdown.push({ name: `냉장고 형태별 분해 스팀세척 (${fOpt?.label || '양문형'})`, amount: baseCost });
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `음식물 임시 보냉 대행 (${pOpt?.label})`, amount: pDelta });
      }
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `정밀 살균/탈취 코팅 (${sOpt?.label})`, amount: sDelta });
      }

      const totalTarget = baseCost + pDelta + sDelta;
      minCost = Math.round(totalTarget * 0.88);
      maxCost = Math.round(totalTarget * 1.2);

      inclusions.push('냉장/냉동실 내부 모든 선반, 서랍 바스켓 전량 탈거 후 물세척');
      inclusions.push('고온 스팀 100도 노즐 살균 및 도어 고무패킹 틈새 세정');
      inclusions.push('냉장고 후면 하부 컴프레서 기계실 먼지 집진 청소');
      exclusions.push('정수기 필터 교체 부품비, 깨진 선반 부품 교체비');
      extraFeeWarnings.push('음식물이 가득 차 있어 아이스박스 분류 시간이 1시간 이상 추가될 경우 현장비 가산');
      contractorChecklist.push('도어 고무 가스켓 안쪽의 굳은 음식물 찌꺼기까지 꼼꼼히 닦았는가?');
      contractorChecklist.push('작업 후 냉기 순환 확인 및 분해 부품을 제자리에 유격 없이 체결했는가?');
      cautions.push('원활하고 빠른 작업을 위해 유통기한 지난 음식물은 사전에 미리 비워주세요.');
      break;
    }

    case 'kitchen-hood-cleaning': {
      const hOpt = service.questions.find((q) => q.id === 'hood_type')?.options?.find((o) => o.value === inputs.hood_type);
      const hDelta = hOpt?.priceDelta || 0;
      const gOpt = service.questions.find((q) => q.id === 'grease_level')?.options?.find((o) => o.value === inputs.grease_level);
      const gDelta = gOpt?.priceDelta || 0;
      const dOpt = service.questions.find((q) => q.id === 'duct_option')?.options?.find((o) => o.value === inputs.duct_option);
      const dDelta = dOpt?.priceDelta || 0;

      baseCost = 150000 + hDelta;
      priceBreakdown.push({ name: `주방후드 모터/팬 완전 분해 세척 (${hOpt?.label || '통후드'})`, amount: baseCost });
      if (gDelta !== 0) {
        priceBreakdown.push({ name: `찌든 기름때 불림 공정 (${gOpt?.label})`, amount: gDelta });
      }
      if (dDelta !== 0) {
        priceBreakdown.push({ name: `배기 자바라 호스 신품 교체`, amount: dDelta });
      }

      const totalTarget = baseCost + gDelta + dDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('알루미늄 금속 필터망 고온 기름때 전용 약품 침적 세척');
      inclusions.push('시로코팬 모터 분해, 팬 날개 및 내부 하우징 기름때 제거');
      inclusions.push('가스레인지 상판 및 주변 벽면 흠집 방지 완벽 비닐 보양');
      exclusions.push('모터 코일 단선 수리, 후드 전면 유리 파손 교체');
      extraFeeWarnings.push('천장 매립 아일랜드 후드이거나 자동소화장치 배선 복합형은 추가 공임 발생 가능');
      contractorChecklist.push('모터 재조립 후 고속 회전 시 진동이나 덜덜거리는 소음이 없는지 확인했는가?');
      contractorChecklist.push('기름때 세척 약품이 주방 인조대리석 상판에 튀어 변색되지 않도록 보양했는가?');
      cautions.push('기기 모터 수명이 다해 소음이 심한 경우 세척으로 소음이 100% 줄지 않을 수 있습니다.');
      break;
    }

    case 'pest-control-service': {
      const dOpt = service.questions.find((q) => q.id === 'dwelling_size')?.options?.find((o) => o.value === inputs.dwelling_size);
      const dDelta = dOpt?.priceDelta || 0;
      const pOpt = service.questions.find((q) => q.id === 'pest_type')?.options?.find((o) => o.value === inputs.pest_type);
      const pDelta = pOpt?.priceDelta || 0;
      const wOpt = service.questions.find((q) => q.id === 'warranty_plan')?.options?.find((o) => o.value === inputs.warranty_plan);
      const wDelta = wOpt?.priceDelta || 0;

      baseCost = 100000 + dDelta;
      priceBreakdown.push({ name: `주거 평수 기준 방역 시공 (${dOpt?.label || '국민 평형'})`, amount: baseCost });
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `타겟 해충 전문 약제 (${pOpt?.label})`, amount: pDelta });
      }
      if (wDelta !== 0) {
        priceBreakdown.push({ name: `시공 보증 플랜 (${wOpt?.label})`, amount: wDelta });
      }

      const totalTarget = baseCost + pDelta + wDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('싱크대, 욕실, 베란다 배수구 주요 거점 식독제 겔 시공');
      inclusions.push('외벽 틈새 및 하수관 유입로 차단 트랩 및 스티커 보강');
      inclusions.push('초미립자 살충 잔류 분무 및 실내 천연 피톤치드 연무');
      exclusions.push('천장 텍스 전체 철거 대공사, 건물 외벽 전체 소독');
      extraFeeWarnings.push('빈대/벼룩 박멸을 위한 매트리스 고온 스팀 다회차 시공 시 추가비 발생');
      contractorChecklist.push('환경부 승인 정품 살충제 및 식독제 등록 번호를 제시하는가?');
      contractorChecklist.push('시공 후 유충 부화 주기(약 2주) 및 A/S 보증 조건을 서면 명시했는가?');
      cautions.push('시공 후 며칠간은 약을 먹은 해충이 비틀거리며 보일 수 있으니 약을 닦아내지 마세요.');
      break;
    }

    case 'window-glass-cleaning': {
      const aOpt = service.questions.find((q) => q.id === 'apartment_pyeong')?.options?.find((o) => o.value === inputs.apartment_pyeong);
      const aDelta = aOpt?.priceDelta || 0;
      const wOpt = service.questions.find((q) => q.id === 'window_type')?.options?.find((o) => o.value === inputs.window_type);
      const wDelta = wOpt?.priceDelta || 0;
      const sOpt = service.questions.find((q) => q.id === 'water_stain_severity')?.options?.find((o) => o.value === inputs.water_stain_severity);
      const sDelta = sOpt?.priceDelta || 0;

      baseCost = 250000 + aDelta;
      priceBreakdown.push({ name: `아파트 평형별 외창 전체 기본 세척 (${aOpt?.label || '20평형대'})`, amount: baseCost });
      if (wDelta !== 0) {
        priceBreakdown.push({ name: `창호 구조 할증 (${wOpt?.label})`, amount: wDelta });
      }
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `석회질 물때 나노 연마 (${sOpt?.label})`, amount: sDelta });
      }

      const totalTarget = baseCost + wDelta + sDelta;
      minCost = Math.round(totalTarget * 0.88);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('거실 및 각 방 외부 유리창 바깥면 전문 자석 스퀴지 세척');
      inclusions.push('유리창 표면 물때/비산먼지 전용 버핑 및 발수 코팅제 도포');
      inclusions.push('창틀 하부 레일 찌든 흙먼지 진공 흡입 및 물청소');
      exclusions.push('창문 시트지/단열 뽁뽁이 대량 제거비, 낡은 방충망 교체비');
      extraFeeWarnings.push('오랜 세월 방치되어 유리 부식이 발생한 경우 완전 투명 복원에 한계가 있을 수 있음');
      contractorChecklist.push('실내에서 작업하며 아랫집 세대로 오염수가 튀지 않도록 집수 처리하는가?');
      contractorChecklist.push('난간대 고정 나사 부식 상태와 방충망 이탈 위험을 사전 점검했는가?');
      cautions.push('태풍이나 강풍, 폭우가 내리는 날씨에는 안전을 위해 작업 일정이 연기될 수 있습니다.');
      break;
    }

    case 'office-moving': {
      type = 'quote_preparation';
      baseCost = 1200000;
      prepTitle = '사무실·상업공간 이전 실측 맞춤 견적 가이드';
      prepExplanation = '사무실 이전은 책상·파티션 수량, 전산서버 특수포장, 빌딩 화물승강기 승인 및 보양 규정에 따라 견적이 결정되므로 사전 현장 실측이 필수적입니다.';

      const oOpt = service.questions.find((q) => q.id === 'office_scale')?.options?.find((o) => o.value === inputs.office_scale);
      const pOpt = service.questions.find((q) => q.id === 'partition_work')?.options?.find((o) => o.value === inputs.partition_work);
      const lOpt = service.questions.find((q) => q.id === 'building_logistics')?.options?.find((o) => o.value === inputs.building_logistics);

      priceBreakdown.push({ name: `사무실 규모 (${oOpt?.label || '표준 오피스'})`, amount: 800000 });
      priceBreakdown.push({ name: `파티션/집기 분해조립 (${pOpt?.label || '파티션 조립'})`, amount: 300000 });
      priceBreakdown.push({ name: `빌딩 반출입 환경 (${lOpt?.label || '화물 승강기'})`, amount: 100000 });

      inclusions.push('사무실 개인 짐 전용 플라스틱 박스 및 라벨 스티커 사전 불출');
      inclusions.push('책상, 회의테이블, 시스템 파티션 분해 및 신규 사무실 배치 조립');
      inclusions.push('로비 바닥 및 승강기 플라베니아 보양 작업');
      exclusions.push('IDC 서버룸 전문 이전비, 폐업/불용 집기 폐기물 처리비');
      extraFeeWarnings.push('야간/주말 철야 작업 진행 시 야간 인건비 할증이 적용될 수 있음');
      contractorChecklist.push('적재물 배상책임보험 및 이사 종합 화물보험에 가입된 정식 허가 업체인가?');
      contractorChecklist.push('파티션 및 전산선 재결선 배치도(도면)를 사전에 숙지하고 작업하는가?');
      cautions.push('개인 PC의 중요 데이터는 사전에 외장하드나 클라우드에 백업해 두세요.');
      break;
    }

    case 'storage-moving': {
      const tOpt = service.questions.find((q) => q.id === 'cargo_tonnage')?.options?.find((o) => o.value === inputs.cargo_tonnage);
      const tDelta = tOpt?.priceDelta || 0;
      const sOpt = service.questions.find((q) => q.id === 'storage_period')?.options?.find((o) => o.value === inputs.storage_period);
      const sDelta = sOpt?.priceDelta || 0;
      const wOpt = service.questions.find((q) => q.id === 'warehouse_type')?.options?.find((o) => o.value === inputs.warehouse_type);
      const wDelta = wOpt?.priceDelta || 0;

      baseCost = 1500000 + tDelta;
      priceBreakdown.push({ name: `포장이사 2회 (반출+반입) 및 기본 창고 적재 (${tOpt?.label || '5톤'})`, amount: baseCost });
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `보관 기간 일수 산정 (${sOpt?.label})`, amount: sDelta });
      }
      if (wDelta !== 0) {
        priceBreakdown.push({ name: `창고 환경 옵션 (${wOpt?.label})`, amount: wDelta });
      }

      const totalTarget = baseCost + sDelta + wDelta;
      minCost = Math.round(totalTarget * 0.88);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('1차 출발지 짐 포장 및 컨테이너 창고 입고 상차');
      inclusions.push('창고 보관 기간 동안 밀폐 보관 및 도난 화재 보험 적용');
      inclusions.push('2차 창고 반출 및 도착지 포장 풀기/가구 배치 정리');
      exclusions.push('사다리차 이용료(양쪽 총 2~4회 별도), 냉장고 음식물 보관');
      extraFeeWarnings.push('보관 일수가 계약 기간을 초과할 경우 일일 컨테이너 연체료 발생');
      contractorChecklist.push('보관 전 컨테이너에 봉인 씰(Seal)을 부착하고 번호를 확인시켜 주는가?');
      contractorChecklist.push('창고 화재보험 및 도난 보상 한도액이 명시된 보관증서를 교부하는가?');
      cautions.push('부패하기 쉬운 음식물, 고가 귀중품, 현금, 화분은 컨테이너 보관이 절대 불가합니다.');
      break;
    }

    case 'piano-moving': {
      const pOpt = service.questions.find((q) => q.id === 'piano_type')?.options?.find((o) => o.value === inputs.piano_type);
      const pDelta = pOpt?.priceDelta || 0;
      const mOpt = service.questions.find((q) => q.id === 'moving_conditions')?.options?.find((o) => o.value === inputs.moving_conditions);
      const mDelta = mOpt?.priceDelta || 0;
      const tOpt = service.questions.find((q) => q.id === 'tuning_service')?.options?.find((o) => o.value === inputs.tuning_service);
      const tDelta = tOpt?.priceDelta || 0;

      baseCost = 150000 + pDelta;
      priceBreakdown.push({ name: `피아노 전문 완충 운반 (${pOpt?.label || '업라이트'})`, amount: baseCost });
      if (mDelta !== 0) {
        priceBreakdown.push({ name: `운반 경로 환경 할증 (${mOpt?.label})`, amount: mDelta });
      }
      if (tDelta !== 0) {
        priceBreakdown.push({ name: `전문 조율 연계 서비스`, amount: tDelta });
      }

      const totalTarget = baseCost + mDelta + tDelta;
      minCost = Math.round(totalTarget * 0.88);
      maxCost = Math.round(totalTarget * 1.2);

      inclusions.push('피아노 전용 두꺼운 패딩 커버 포장 및 전용 운반대 이동');
      inclusions.push('리프트 탑차 안전 결속 운송 및 도착지 수평 안착');
      inclusions.push('바닥 눌림 방지 소음 차단 캐스터 디스크 받침 장착');
      exclusions.push('피아노 외장 도색 재도장 수리, 부러진 현/해머 부품 교체');
      extraFeeWarnings.push('계단 이동 층수가 4층 이상이거나 좁은 나선형 계단은 특수 인력비 추가');
      contractorChecklist.push('피아노 전문 기사 2인 1조로 투입되며 전용 멜빵 장비를 사용하는가?');
      contractorChecklist.push('도착지에서 피아노 수평계를 이용해 흔들림 없이 수평을 잡아주는가?');
      cautions.push('피아노는 습기에 민감하므로 창가 직사광선이나 에어컨 바람 바로 밑은 피해주세요.');
      break;
    }

    case 'furniture-assembly-disassembly': {
      const fOpt = service.questions.find((q) => q.id === 'furniture_category')?.options?.find((o) => o.value === inputs.furniture_category);
      const fDelta = fOpt?.priceDelta || 0;
      const jOpt = service.questions.find((q) => q.id === 'job_type')?.options?.find((o) => o.value === inputs.job_type);
      const jDelta = jOpt?.priceDelta || 0;
      const bOpt = service.questions.find((q) => q.id === 'brand_type')?.options?.find((o) => o.value === inputs.brand_type);
      const bDelta = bOpt?.priceDelta || 0;

      baseCost = 100000 + fDelta;
      priceBreakdown.push({ name: `가구 품목 기본 조립/해체 (${fOpt?.label || '침대 프레임'})`, amount: baseCost });
      if (jDelta !== 0) {
        priceBreakdown.push({ name: `작업 범위 선택 (${jOpt?.label})`, amount: jDelta });
      }
      if (bDelta !== 0) {
        priceBreakdown.push({ name: `브랜드 난이도 가산 (${bOpt?.label})`, amount: bDelta });
      }

      const totalTarget = baseCost + jDelta + bDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('전문 전동 공구 지참 가구 분해 및 부속품 소분 정리');
      inclusions.push('도면 및 설명서 기준 수평 정밀 맞춤 조립 시공');
      inclusions.push('어린이/지진 안전을 위한 전도 방지 벽고정 앙카 시공 (요청 시)');
      exclusions.push('부러진 목재 접착 수리, 다른 주소지로의 용달 차량 운송');
      extraFeeWarnings.push('벽면이 콘크리트가 아닌 특수 대리석/타일 타공 시 비트 소모비 추가 가능');
      contractorChecklist.push('서랍 레일과 도어 경첩 유격을 조절하여 뻑뻑함이나 기울어짐이 없는가?');
      contractorChecklist.push('분해 시 볼트, 너트, 나무 다보를 잃어버리지 않게 지퍼백에 챙겨주는가?');
      cautions.push('조립 전 설치 공간의 가로/세로/높이 사이즈를 미리 확인하여 통로를 확보해 주세요.');
      break;
    }

    case 'water-heater-installation': {
      const hOpt = service.questions.find((q) => q.id === 'heater_type')?.options?.find((o) => o.value === inputs.heater_type);
      const hDelta = hOpt?.priceDelta || 0;
      const cOpt = service.questions.find((q) => q.id === 'capacity_volume')?.options?.find((o) => o.value === inputs.capacity_volume);
      const cDelta = cOpt?.priceDelta || 0;
      const pOpt = service.questions.find((q) => q.id === 'pressure_valve')?.options?.find((o) => o.value === inputs.pressure_valve);
      const pDelta = pOpt?.priceDelta || 0;

      baseCost = 250000 + hDelta;
      priceBreakdown.push({ name: `온수기 기본 설치비 (${hOpt?.label || '저장식 전기온수기'})`, amount: baseCost });
      if (cDelta !== 0) {
        priceBreakdown.push({ name: `용량 규격 가산 (${cOpt?.label})`, amount: cDelta });
      }
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `감압밸브 및 배관 작업 (${pOpt?.label})`, amount: pDelta });
      }

      const totalTarget = baseCost + cDelta + pDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('온수기 본체 벽체 앙카 고정 및 직수/온수 배관 연결');
      inclusions.push('감압밸브 설치 및 1차 누수 검사, 정상 가열 확인');
      exclusions.push('전기 승압 공사 및 옥외 장거리 추가 배관 매립');
      extraFeeWarnings.push('석고보드 가벽의 경우 전용 보강 합판/스탠드 프레임 비용(3~5만원) 추가');
      contractorChecklist.push('가스 온수기: 건설산업기본법상 가스시설시공업(제1종 또는 제2종) 등록업체 소속 자격 기술자가 시공하고 시공기록을 제출하는가?');
      contractorChecklist.push('전기 온수기: 직수 수압에 의한 내통 파손 방지를 위해 감압밸브를 온수기 입구에서 1m 이상 이격 시공했는가?');
      cautions.push('법령 및 규격 고지: 가스 온수기는 건설산업기본법에 따른 가스시설시공업(1종/2종) 등록업체 필수 시공 대상이며, 전기 온수기는 내통 파손 방지를 위한 감압밸브 1m 이격 및 누전차단기 규격 준수가 필수입니다.');
      break;
    }

    case 'induction-cooktop-installation': {
      const sOpt = service.questions.find((q) => q.id === 'installation_style')?.options?.find((o) => o.value === inputs.installation_style);
      const sDelta = sOpt?.priceDelta || 0;
      const cOpt = service.questions.find((q) => q.id === 'countertop_cut')?.options?.find((o) => o.value === inputs.countertop_cut);
      const cDelta = cOpt?.priceDelta || 0;
      const eOpt = service.questions.find((q) => q.id === 'electrical_work')?.options?.find((o) => o.value === inputs.electrical_work);
      const eDelta = eOpt?.priceDelta || 0;

      baseCost = 90000 + sDelta;
      priceBreakdown.push({ name: `인덕션 설치 기본 공임 (${sOpt?.label || '빌트인 매립'})`, amount: baseCost });
      if (cDelta !== 0) {
        priceBreakdown.push({ name: `상판 타공 작업 (${cOpt?.label})`, amount: cDelta });
      }
      if (eDelta !== 0) {
        priceBreakdown.push({ name: `전기 배선/차단기 공사 (${eOpt?.label})`, amount: eDelta });
      }

      const totalTarget = baseCost + cDelta + eDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('인덕션 본체 안착 및 수평 세팅, 밀봉 실링 테이핑');
      inclusions.push('고성능 집진기 연동 분진 최소화 타공 절단 (타공 선택 시)');
      exclusions.push('기존 도시가스 배관 철거 및 가스 막음 시공(도시가스사 별도 신청)');
      extraFeeWarnings.push('천연 대리석(엔지니어드스톤) 타공 시 다이아몬드 습식 특수 날 소모비 추가 가능');
      contractorChecklist.push('소비전력 3.3kW 초과 고출력 수입 인덕션(디트리쉬, 아에게, 밀레 등 6.8~7.4kW)에 대해 분전함 전용 4sq 배선과 20A~30A 전용 누전차단기를 직결했는가?');
      contractorChecklist.push('타공 부위 분진 흡입 집진기를 제대로 가동하여 주방을 보양하는가?');
      cautions.push('전기 안전 규격 고지: 소비전력 3.3kW 초과 수입 고출력 인덕션은 기존 16A 콘센트 직결 시 과부하/화재 위험이 있으므로, 분전함 전용 직결 차단기 및 4sq 배선 시공이 필수입니다.');
      break;
    }

    case 'furniture-relocation-service': {
      const fOpt = service.questions.find((q) => q.id === 'furniture_type')?.options?.find((o) => o.value === inputs.furniture_type);
      const fDelta = fOpt?.priceDelta || 0;
      const mOpt = service.questions.find((q) => q.id === 'move_distance')?.options?.find((o) => o.value === inputs.move_distance);
      const mDelta = mOpt?.priceDelta || 0;
      const dOpt = service.questions.find((q) => q.id === 'disassembly_needed')?.options?.find((o) => o.value === inputs.disassembly_needed);
      const dDelta = dOpt?.priceDelta || 0;

      baseCost = 100000 + fDelta;
      priceBreakdown.push({ name: `대형 가구 기본 이동비 (${fOpt?.label || '장롱/수납장'})`, amount: baseCost });
      if (mDelta !== 0) {
        priceBreakdown.push({ name: `이동 동선 가산 (${mOpt?.label})`, amount: mDelta });
      }
      if (dDelta !== 0) {
        priceBreakdown.push({ name: `분해 결합 공임 (${dOpt?.label})`, amount: dDelta });
      }

      const totalTarget = baseCost + mDelta + dDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('바닥 스크래치 방지 보양 매트 설치 및 전용 이동 슬라이더 사용');
      inclusions.push('도착 위치 안착 후 수평계 정밀 피팅 및 고임목 레벨링');
      exclusions.push('가구 내부 의류·식기류 등 내용물 포장 및 대리 정리');
      extraFeeWarnings.push('엘리베이터 없는 계단 층간 이동 시 층당 2~3만원 인건비 가산');
      contractorChecklist.push('이동 전 가구 파손 여부를 고객과 함께 확인하고 사진을 남기는가?');
      contractorChecklist.push('재배치 완료 후 문짝 간격과 수평이 반듯하게 맞는지 점검해 주는가?');
      cautions.push('가구 이동 전 파손 방지와 기사님 안전을 위해 내부 짐을 모두 비워두셔야 합니다.');
      break;
    }

    case 'ventilation-fan-installation': {
      const gOpt = service.questions.find((q) => q.id === 'fan_grade')?.options?.find((o) => o.value === inputs.fan_grade);
      const gDelta = gOpt?.priceDelta || 0;
      const dOpt = service.questions.find((q) => q.id === 'electric_damper')?.options?.find((o) => o.value === inputs.electric_damper);
      const dDelta = dOpt?.priceDelta || 0;
      const cOpt = service.questions.find((q) => q.id === 'ceiling_hole_expansion')?.options?.find((o) => o.value === inputs.ceiling_hole_expansion);
      const cDelta = cOpt?.priceDelta || 0;

      baseCost = 100000 + gDelta;
      priceBreakdown.push({ name: `환풍기 설치 기본 공임 (${gOpt?.label || '고정압 환풍기'})`, amount: baseCost });
      if (dDelta !== 0) {
        priceBreakdown.push({ name: `역류차단 전동댐퍼 연동 (${dOpt?.label})`, amount: dDelta });
      }
      if (cDelta !== 0) {
        priceBreakdown.push({ name: `천장 타공 확장 (${cOpt?.label})`, amount: cDelta });
      }

      const totalTarget = baseCost + dDelta + cDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('노후 환풍기 탈거 및 고풍량 환풍기 천장 밀착 매립');
      inclusions.push('알루미늄 덕트 호스 은박 테이핑 완벽 밀봉 및 전기 배선 결선');
      exclusions.push('천장 슬래브 환기 구멍 신규 코어 타공(외벽 콘크리트 타공)');
      extraFeeWarnings.push('천장 점검구가 없어 점검구 신설 필요 시 별도 목공비 발생');
      contractorChecklist.push('환풍기 가동 시 전동댐퍼 차단막이 부드럽게 열리고 닫히는지 작동 테스트하는가?');
      contractorChecklist.push('배기 덕트 연결 부위에서 바람이 새지 않도록 밴드와 은박 테이프로 2중 밀봉했는가?');
      cautions.push('아파트 층간 담배 냄새 차단은 환풍기 단독 교체보다 전동댐퍼(MDD) 일체형 시공이 가장 확실합니다.');
      break;
    }

    case 'tile-repair-installation': {
      const wOpt = service.questions.find((q) => q.id === 'tile_work_type')?.options?.find((o) => o.value === inputs.tile_work_type);
      const wDelta = wOpt?.priceDelta || 0;
      const mOpt = service.questions.find((q) => q.id === 'tile_material')?.options?.find((o) => o.value === inputs.tile_material);
      const mDelta = mOpt?.priceDelta || 0;
      const pOpt = service.questions.find((q) => q.id === 'waterproofing_needed')?.options?.find((o) => o.value === inputs.waterproofing_needed);
      const pDelta = pOpt?.priceDelta || 0;

      baseCost = 400000 + wDelta;
      priceBreakdown.push({ name: `타일 시공 기본 공임 (${wOpt?.label || '타일 부분보수'})`, amount: baseCost });
      if (mDelta !== 0) {
        priceBreakdown.push({ name: `타일 규격/재질 가산 (${mOpt?.label})`, amount: mDelta });
      }
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `바닥 하도 방수공사 병행 (${pOpt?.label})`, amount: pDelta });
      }

      const totalTarget = baseCost + mDelta + pDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('손상 부위 정밀 철거 및 타일 접착제(압착/에폭시) 시공');
      inclusions.push('타일 평탄클립 간격 조절 및 백시멘트/탄성 줄눈 마감');
      exclusions.push('욕조 철거 및 욕실 전체 올철거 방수(전체 리모델링 별도 견적)');
      extraFeeWarnings.push('수전·양변기·세면대 탈부착 필요 시 기구당 3~5만원 공임 추가');
      contractorChecklist.push('바닥 덧방 시 배수구 유가(육가) 높이를 맞추고 물매(구배)가 원활한지 확인하는가?');
      contractorChecklist.push('들뜬 벽타일 철거 시 주변 멀쩡한 타일이 함께 떨어지지 않도록 사전 그라인더 커팅하는가?');
      cautions.push('벽 타일 배부름(솟아오름)은 방치 시 갑자기 와르르 무너져 다칠 수 있으므로 즉시 테이핑 후 보수하세요.');
      break;
    }

    case 'furniture-repair-service': {
      const rOpt = service.questions.find((q) => q.id === 'repair_part')?.options?.find((o) => o.value === inputs.repair_part);
      const rDelta = rOpt?.priceDelta || 0;
      const qOpt = service.questions.find((q) => q.id === 'hardware_quality')?.options?.find((o) => o.value === inputs.hardware_quality);
      const qDelta = qOpt?.priceDelta || 0;
      const sOpt = service.questions.find((q) => q.id === 'spots_count')?.options?.find((o) => o.value === inputs.spots_count);
      const sDelta = sOpt?.priceDelta || 0;

      baseCost = 80000 + rDelta;
      priceBreakdown.push({ name: `가구 수리 기본 공임 (${rOpt?.label || '경첩 교체'})`, amount: baseCost });
      if (qDelta !== 0) {
        priceBreakdown.push({ name: `하드웨어 부속 등급 (${qOpt?.label})`, amount: qDelta });
      }
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `수리 수량 가산 (${sOpt?.label})`, amount: sDelta });
      }

      const totalTarget = baseCost + qDelta + sDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('고장 난 노후 경첩/레일 탈거 및 신품 댐퍼 하드웨어 교체');
      inclusions.push('마모된 PB 목재 구멍 전용 보강판 시공 및 3축 미세 유격 조절');
      exclusions.push('부러진 가구 통판 전체 목공 재생 및 도장 리폼');
      extraFeeWarnings.push('단종된 수입 브랜드 특수 하드웨어의 경우 부품 해외 직구비 실비 청구');
      contractorChecklist.push('문짝을 닫았을 때 쾅 소리 없이 댐퍼가 스르륵 끝까지 닫히는지 확인하는가?');
      contractorChecklist.push('좌우 이웃한 문짝 간격과 높낮이가 수평선상에 균일하게 맞춰졌는가?');
      cautions.push('나사가 헛돌 때 억지로 큰 나사를 박으면 PB 합판이 완전히 부스러지므로 전용 보강판 시공을 권장합니다.');
      break;
    }

    case 'balcony-elastic-coating': {
      const bOpt = service.questions.find((q) => q.id === 'balcony_count')?.options?.find((o) => o.value === inputs.balcony_count);
      const bDelta = bOpt?.priceDelta || 0;
      const pOpt = service.questions.find((q) => q.id === 'paint_grade')?.options?.find((o) => o.value === inputs.paint_grade);
      const pDelta = pOpt?.priceDelta || 0;
      const mOpt = service.questions.find((q) => q.id === 'surface_mold_prep')?.options?.find((o) => o.value === inputs.surface_mold_prep);
      const mDelta = mOpt?.priceDelta || 0;

      baseCost = 500000 + bDelta;
      priceBreakdown.push({ name: `탄성코트 기본 뿜칠 시공 (${bOpt?.label || '베란다 2개소'})`, amount: baseCost });
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `도료 기능성 등급 (${pOpt?.label})`, amount: pDelta });
      }
      if (mDelta !== 0) {
        priceBreakdown.push({ name: `곰팡이/크랙 바탕정리 (${mOpt?.label})`, amount: mDelta });
      }

      const totalTarget = baseCost + pDelta + mDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('창호·유리창·보일러·수도꼭지 전면 비닐 커버링 정밀 보양');
      inclusions.push('벽면 크랙 변성 실리콘 퍼티 하도 및 전용 에어건 균일 뿜칠 도포');
      exclusions.push('발코니 외창 샷시 외부 코킹 실리콘 빗물 누수 방수 공사');
      extraFeeWarnings.push('기존 벽면에 시트지/단열벽지가 붙어있어 전체 제거 시 인건비 5~10만원 가산');
      contractorChecklist.push('뿜칠 전 샷시와 콘센트 주변 비닐 마스킹 테이프가 들뜸 없이 완벽히 밀착되었는가?');
      contractorChecklist.push('모서리나 우수관 뒤편 사각지대까지 도료가 뭉침이나 빈틈없이 고르게 분사되었는가?');
      cautions.push('시공 후 최소 2~3일간은 도막 속까지 건조되어야 하므로 물청소와 짐 적재를 삼가고 자연 환기해 주세요.');
      break;
    }

    case 'drain-odor-trap-installation': {
      const sOpt = service.questions.find((q) => q.id === 'installation_spots')?.options?.find((o) => o.value === inputs.installation_spots);
      const sDelta = sOpt?.priceDelta || 0;
      const mOpt = service.questions.find((q) => q.id === 'trap_material')?.options?.find((o) => o.value === inputs.trap_material);
      const mDelta = mOpt?.priceDelta || 0;
      const hOpt = service.questions.find((q) => q.id === 'sink_pipe_replace')?.options?.find((o) => o.value === inputs.sink_pipe_replace);
      const hDelta = hOpt?.priceDelta || 0;

      baseCost = 95000 + sDelta;
      priceBreakdown.push({ name: `악취차단 트랩 기본 설치 (${sOpt?.label || '2개소'})`, amount: baseCost });
      if (mDelta !== 0) {
        priceBreakdown.push({ name: `트랩 특수 소재 가산 (${mOpt?.label})`, amount: mDelta });
      }
      if (hDelta !== 0) {
        priceBreakdown.push({ name: `싱크대 배수호스 신규 교체 (${hOpt?.label})`, amount: hDelta });
      }

      const totalTarget = baseCost + mDelta + hDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('정밀 디지털 풍속계 악취 역류 수치 측정 진단');
      inclusions.push('항공 방탄 TPU/실리콘 볼베어링 트랩 밀폐 안착 및 방수 실리콘 고정');
      exclusions.push('메인 오수관 횡주관 고압세척 및 정화조 준설 작업');
      extraFeeWarnings.push('오래된 규격 외 배수구 구경으로 특수 아답터 제작 시 개소당 1~2만원 추가');
      contractorChecklist.push('트랩 설치 후 풍속계 수치가 0.00m/s로 완벽히 역류가 차단되는지 눈으로 확인시켜 주는가?');
      contractorChecklist.push('물을 틀었을 때 배수가 막힘없이 시원하게 빠져나가는지 통수 확인을 진행하는가?');
      cautions.push('화장실 악취의 70%는 바닥 하수구, 30%는 양변기 정심 틈새나 싱크대 호스 노후화에서 비롯됩니다.');
      break;
    }

    case 'floor-wood-repair': {
      const dOpt = service.questions.find((q) => q.id === 'damage_scope')?.options?.find((o) => o.value === inputs.damage_scope);
      const dDelta = dOpt?.priceDelta || 0;
      const tOpt = service.questions.find((q) => q.id === 'floor_type')?.options?.find((o) => o.value === inputs.floor_type);
      const tDelta = tOpt?.priceDelta || 0;
      const aOpt = service.questions.find((q) => q.id === 'plank_availability')?.options?.find((o) => o.value === inputs.plank_availability);
      const aDelta = aOpt?.priceDelta || 0;

      baseCost = 250000 + dDelta;
      priceBreakdown.push({ name: `마루 보수 기본 공임 (${dOpt?.label || '낱장 교체'})`, amount: baseCost });
      if (tDelta !== 0) {
        priceBreakdown.push({ name: `마루 바닥재 종류 (${tOpt?.label})`, amount: tDelta });
      }
      if (aDelta !== 0) {
        priceBreakdown.push({ name: `자재 매칭/수급비 (${aOpt?.label})`, amount: aDelta });
      }

      const totalTarget = baseCost + tDelta + aDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('손상 부위 집진기 직결 분진 최소화 정밀 컷팅 철거');
      inclusions.push('친환경 황토 에폭시 마루 전용 본드 도포 및 단차 없는 압착 피팅');
      exclusions.push('거실/방 전체 마루 철거 및 샌딩 신규 시공(평당 시공 별도)');
      extraFeeWarnings.push('기존 본드가 바닥에 눌어붙어 바닥 샌딩 면갈이 면적이 넓어질 경우 추가 비용');
      contractorChecklist.push('새로 교체한 마루와 기존 마루 사이에 밟았을 때 걸리는 턱(단차)이 없는가?');
      contractorChecklist.push('교체 후 무거운 압착추로 고정하여 본드가 굳는 24시간 동안 들뜨지 않게 조치하는가?');
      cautions.push('마루 낱장 교체 후 본드가 단단히 굳을 때까지(약 12~24시간) 테이핑을 떼지 마시고 밟지 마세요.');
      break;
    }

    case 'window-sash-replacement': {
      const sOpt = service.questions.find((q) => q.id === 'window_scope')?.options?.find((o) => o.value === inputs.window_scope);
      const sDelta = sOpt?.priceDelta || 0;
      const gOpt = service.questions.find((q) => q.id === 'glass_specification')?.options?.find((o) => o.value === inputs.glass_specification);
      const gDelta = gOpt?.priceDelta || 0;
      const lOpt = service.questions.find((q) => q.id === 'logistics_equipment')?.options?.find((o) => o.value === inputs.logistics_equipment);
      const lDelta = lOpt?.priceDelta || 0;

      baseCost = 2863000 + sDelta;
      priceBreakdown.push({ name: `창호 시공 기본 공임 (${sOpt?.label || '베란다 외창 2개소'})`, amount: baseCost });
      if (gDelta !== 0) {
        priceBreakdown.push({ name: `유리 단열 스펙 (${gOpt?.label})`, amount: gDelta });
      }
      if (lDelta !== 0) {
        priceBreakdown.push({ name: `양중 장비/폐기물 (${lOpt?.label})`, amount: lDelta });
      }

      const totalTarget = baseCost + gDelta + lDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('기존 노후 샷시 철거 및 폐기물 전량 당일 트럭 수거');
      inclusions.push('고단열 우레탄 폼 빈틈 충진 및 외부 전용 비오염성 실리콘 코킹 마감');
      exclusions.push('외벽 균열 보수 및 발코니 천장 단열재(이보드) 목공 단열 추가');
      extraFeeWarnings.push('사다리차 진입 불가 골목 또는 초고층(25층 이상) 윈치 작업 시 장비비 추가');
      contractorChecklist.push('1군 브랜드(LX, KCC 등) 정품 마크와 에너지소비효율 1등급 라벨을 확인해 주는가?');
      contractorChecklist.push('창틀 하부 우레탄 폼을 꽉 채워 겨울철 단열과 바람막이(풍지판)가 제대로 설치되었는가?');
      cautions.push('샷시 교체는 유리 두께(로이유리 여부)와 실리콘 코킹 기밀성이 수명을 좌우하므로 정품 시공 보증서를 꼭 챙기세요.');
      break;
    }

    case 'entrance-middle-door-installation': {
      const dOpt = service.questions.find((q) => q.id === 'door_type')?.options?.find((o) => o.value === inputs.door_type);
      const dDelta = dOpt?.priceDelta || 0;
      const gOpt = service.questions.find((q) => q.id === 'glass_style')?.options?.find((o) => o.value === inputs.glass_style);
      const gDelta = gOpt?.priceDelta || 0;
      const rOpt = service.questions.find((q) => q.id === 'rail_damper')?.options?.find((o) => o.value === inputs.rail_damper);
      const rDelta = rOpt?.priceDelta || 0;

      baseCost = 750000 + dDelta;
      priceBreakdown.push({ name: `중문 제작 및 기본 시공 (${dOpt?.label || '초슬림 3연동'})`, amount: baseCost });
      if (gDelta !== 0) {
        priceBreakdown.push({ name: `유리 사양 가산 (${gOpt?.label})`, amount: gDelta });
      }
      if (rDelta !== 0) {
        priceBreakdown.push({ name: `하부 레일 및 안전 댐퍼 (${rOpt?.label})`, amount: rDelta });
      }

      const totalTarget = baseCost + gDelta + rDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('전문 기사 현장 레이저 정밀 실측 및 공장 맞춤 제작');
      inclusions.push('문틀 수평 레이저 피팅, 상하부 레일 안착 및 바이오 실리콘 마감');
      exclusions.push('현관 가벽 신설 목공 공사(가벽 없는 개구부 별도 목공)');
      extraFeeWarnings.push('현관 너비 1,500mm 초과 광폭 구조 시 자재비 10~15만원 가산');
      contractorChecklist.push('양방향 소프트 댐퍼가 정상 작동하여 손끼임 없이 부드럽게 멈추는가?');
      contractorChecklist.push('하부 레일과 바닥 마루 사이 틈새 실리콘 코킹이 들뜸 없이 마감되었는가?');
      cautions.push('중문은 가로·세로 오차가 3mm만 생겨도 문이 뻑뻑해지므로 전문 실측 기사의 방문 실측이 필수입니다.');
      break;
    }

    case 'door-frame-replacement': {
      const sOpt = service.questions.find((q) => q.id === 'door_scope')?.options?.find((o) => o.value === inputs.door_scope);
      const sDelta = sOpt?.priceDelta || 0;
      const cOpt = service.questions.find((q) => q.id === 'door_count')?.options?.find((o) => o.value === inputs.door_count);
      const cDelta = cOpt?.priceDelta || 0;
      const hOpt = service.questions.find((q) => q.id === 'handle_hardware')?.options?.find((o) => o.value === inputs.handle_hardware);
      const hDelta = hOpt?.priceDelta || 0;

      baseCost = 200000 + sDelta;
      priceBreakdown.push({ name: `도어 교체 기본 공임 (${sOpt?.label || '문짝 교체'})`, amount: baseCost });
      if (cDelta !== 0) {
        priceBreakdown.push({ name: `교체 수량 가산 (${cOpt?.label})`, amount: cDelta });
      }
      if (hDelta !== 0) {
        priceBreakdown.push({ name: `손잡이 및 철물 부속 (${hOpt?.label})`, amount: hDelta });
      }

      const totalTarget = baseCost + cDelta + hDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('노후 문짝 탈거 및 폐도어 트럭 수거 폐기');
      inclusions.push('ABS 방수 도어 정밀 대패 피팅, 이지경첩 및 레버락 손잡이 결합');
      exclusions.push('문틀 철거 후 주변 도배 벽지 뜯김 복구 도배 작업');
      extraFeeWarnings.push('기존 문틀 하부 시멘트 바닥 턱 제거(미장 평탄화) 시 개소당 3~5만원');
      contractorChecklist.push('문이 닫힐 때 문틀 고무 가스켓에 빈틈없이 밀착되어 소음과 외풍이 차단되는가?');
      contractorChecklist.push('손잡이 래치 볼트가 걸쇠 홈에 부드럽게 찰칵 잠기는가?');
      cautions.push('화장실 문은 습기로 썩기 쉬우므로 목재 합판 대신 100% 방수 ABS 도어를 강력 권장합니다.');
      break;
    }

    case 'wood-flooring-installation': {
      const mOpt = service.questions.find((q) => q.id === 'flooring_material')?.options?.find((o) => o.value === inputs.flooring_material);
      const mDelta = mOpt?.priceDelta || 0;
      const pOpt = service.questions.find((q) => q.id === 'floor_pyeong_size')?.options?.find((o) => o.value === inputs.floor_pyeong_size);
      const pDelta = pOpt?.priceDelta || 0;
      const dOpt = service.questions.find((q) => q.id === 'floor_demolition_prep')?.options?.find((o) => o.value === inputs.floor_demolition_prep);
      const dDelta = dOpt?.priceDelta || 0;

      baseCost = 1693000 + mDelta;
      priceBreakdown.push({ name: `마루 시공 기본 자재 및 공임 (${mOpt?.label || '광폭 강마루'})`, amount: baseCost });
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `평형 면적 가산 (${pOpt?.label})`, amount: pDelta });
      }
      if (dDelta !== 0) {
        priceBreakdown.push({ name: `기존 바닥재 철거/샌딩 (${dOpt?.label})`, amount: dDelta });
      }

      const totalTarget = baseCost + pDelta + dDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('친환경 SEO 인증 무독성 황토 에폭시 마루 전용 본드 전면 도포');
      inclusions.push('벽면 슬림 걸레받이 몰딩 시공 및 마루 가장자리 실리콘 코킹');
      exclusions.push('문턱 제거 후 레벨 차이로 인한 방바닥 전체 자동수평몰탈(셀프레벨링)');
      extraFeeWarnings.push('바닥 크랙이 심하거나 단차가 5mm 이상일 경우 바닥 그라인딩 연삭비 추가');
      contractorChecklist.push('친환경 황토 본드 정품 인증 마크와 시험성적서를 확인시켜 주는가?');
      contractorChecklist.push('걸레받이 하부 실리콘 마감이 일정하고 삐져나온 본드가 깨끗이 닦였는가?');
      cautions.push('마루 시공 후 계단식 배열의 팽창 여유 틈새가 필수이며, 본드가 경화되는 24시간 동안 보일러 과열 가동을 피하세요.');
      break;
    }

    case 'interior-paint-coating': {
      const zOpt = service.questions.find((q) => q.id === 'paint_zone')?.options?.find((o) => o.value === inputs.paint_zone);
      const zDelta = zOpt?.priceDelta || 0;
      const bOpt = service.questions.find((q) => q.id === 'paint_product_grade')?.options?.find((o) => o.value === inputs.paint_product_grade);
      const bDelta = bOpt?.priceDelta || 0;
      const pOpt = service.questions.find((q) => q.id === 'surface_putty_prep')?.options?.find((o) => o.value === inputs.surface_putty_prep);
      const pDelta = pOpt?.priceDelta || 0;

      baseCost = 600000 + zDelta;
      priceBreakdown.push({ name: `실내 도장 기본 공임 (${zOpt?.label || '방문/몰딩'})`, amount: baseCost });
      if (bDelta !== 0) {
        priceBreakdown.push({ name: `도료 브랜드 스펙 (${bOpt?.label})`, amount: bDelta });
      }
      if (pDelta !== 0) {
        priceBreakdown.push({ name: `퍼티 바탕정리 수준 (${pOpt?.label})`, amount: pDelta });
      }

      const totalTarget = baseCost + bDelta + pDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('바닥 및 가구, 창문 비닐 커버링 마스킹 전면 보양');
      inclusions.push('친환경 수성 프라이머(젯소) 하도 도포 및 2회 상도 정밀 도장');
      exclusions.push('실크벽지 겉지 박리 없는 상태에서의 무리한 직도포(벽지 박리 별도)');
      extraFeeWarnings.push('기존 유성 페인트 도막이 심하게 박리되어 스크래퍼 전면 긁어내기 시 인건비 가산');
      contractorChecklist.push('눈물 자국(페인트 흘러내림)이나 롤러 자국 없이 표면이 매끄러운가?');
      contractorChecklist.push('콘센트, 스위치, 문 손잡이에 페인트가 묻지 않도록 깔끔하게 분리 후 도장했는가?');
      cautions.push('어린이나 임산부가 거주하는 가정은 유해물질 0%의 친환경 수성 인증 페인트 선택을 권장합니다.');
      break;
    }

    case 'interior-film-wrap': {
      const aOpt = service.questions.find((q) => q.id === 'film_target_area')?.options?.find((o) => o.value === inputs.film_target_area);
      const aDelta = aOpt?.priceDelta || 0;
      const gOpt = service.questions.find((q) => q.id === 'film_spec_grade')?.options?.find((o) => o.value === inputs.film_spec_grade);
      const gDelta = gOpt?.priceDelta || 0;
      const sOpt = service.questions.find((q) => q.id === 'prep_stripping')?.options?.find((o) => o.value === inputs.prep_stripping);
      const sDelta = sOpt?.priceDelta || 0;

      baseCost = 580000 + aDelta;
      priceBreakdown.push({ name: `인테리어 필름 기본 래핑 (${aOpt?.label || '싱크대 상하부장'})`, amount: baseCost });
      if (gDelta !== 0) {
        priceBreakdown.push({ name: `필름 소재 등급 (${gOpt?.label})`, amount: gDelta });
      }
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `바탕 샌딩/프라이머 밑작업 (${sOpt?.label})`, amount: sDelta });
      }

      const totalTarget = baseCost + gDelta + sDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('기존 문짝 탈거 및 경첩 분리, 기름때 탈지 세척');
      inclusions.push('친환경 수성 프라이머 도포 및 열풍기 모서리 라운딩 마감');
      exclusions.push('부서지거나 썩은 싱크대 PB 목재 전면 신규 목공 제작');
      extraFeeWarnings.push('웨인스코팅 등 문짝에 깊은 굴곡 몰딩이 많을 경우 손작업 공임 5~10만원 가산');
      contractorChecklist.push('필름 모서리 들뜸 방지를 위해 프라이머 하도와 열풍기 안착 마감을 꼼꼼히 거쳤는가?');
      contractorChecklist.push('문짝 측면과 후면 꺾임 부위에서 기포나 칼자국 없이 매끈하게 마감되었는가?');
      cautions.push('인테리어 필름은 칼선 마감의 디테일이 완성도를 좌우하므로 숙련된 전용 필름 기사의 시공이 필수입니다.');
      break;
    }

    case 'built-in-closet-custom': {
      const dOpt = service.questions.find((q) => q.id === 'closet_door_type')?.options?.find((o) => o.value === inputs.closet_door_type);
      const dDelta = dOpt?.priceDelta || 0;
      const sOpt = service.questions.find((q) => q.id === 'closet_size_ja')?.options?.find((o) => o.value === inputs.closet_size_ja);
      const sDelta = sOpt?.priceDelta || 0;
      const iOpt = service.questions.find((q) => q.id === 'internal_storage_options')?.options?.find((o) => o.value === inputs.internal_storage_options);
      const iDelta = iOpt?.priceDelta || 0;

      baseCost = 1028485 + dDelta;
      priceBreakdown.push({ name: `붙박이장 기본 제작 시공 (${dOpt?.label || '여닫이 도어'})`, amount: baseCost });
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `너비 자(尺)수 규격 가산 (${sOpt?.label})`, amount: sDelta });
      }
      if (iDelta !== 0) {
        priceBreakdown.push({ name: `내부 수납장 옵션 (${iOpt?.label})`, amount: iDelta });
      }

      const totalTarget = baseCost + sDelta + iDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('현장 레이저 실측, 캐드 도면 설계 및 공장 직영 맞춤 제작');
      inclusions.push('E0 친환경 자재 바디 및 PET 도어 조립, 댐퍼 힌지 수평 정밀 세팅');
      exclusions.push('기존 대형 장롱 철거 후 외부 사다리차 폐기물 반출(가구 이동 별도)');
      extraFeeWarnings.push('천장 높이 2,400mm 초과 고천장 구조 시 비규격 연장 서라운딩 추가');
      contractorChecklist.push('E0 등급 친환경 보드 각인이 몸통 자재에 표기되어 있는가?');
      contractorChecklist.push('천장 몰딩 및 벽면 틈새 서라운딩 마감이 실리콘 없이도 반듯하게 밀착되었는가?');
      cautions.push('안방 벽면 수평이 맞지 않아도 현장에서 서라운딩을 레이저로 재단하여 빈틈없이 완벽히 밀착 마감합니다.');
      break;
    }

    case 'cctv-installation': {
      const uOpt = service.questions.find((q) => q.id === 'camera_units')?.options?.find((o) => o.value === inputs.camera_units);
      const uDelta = uOpt?.priceDelta || 0;
      const rOpt = service.questions.find((q) => q.id === 'camera_resolution')?.options?.find((o) => o.value === inputs.camera_resolution);
      const rDelta = rOpt?.priceDelta || 0;
      const sOpt = service.questions.find((q) => q.id === 'recorder_storage')?.options?.find((o) => o.value === inputs.recorder_storage);
      const sDelta = sOpt?.priceDelta || 0;

      baseCost = 400000 + uDelta;
      priceBreakdown.push({ name: `CCTV 기본 설치 공임 (${uOpt?.label || '2대 표준'})`, amount: baseCost });
      if (rDelta !== 0) {
        priceBreakdown.push({ name: `카메라 화질 스펙 (${rOpt?.label})`, amount: rDelta });
      }
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `녹화기 및 저장 용량 (${sOpt?.label})`, amount: sDelta });
      }

      const totalTarget = baseCost + rDelta + sDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('CCTV 카메라 고정 브라켓 앙카 타공 및 동축/UTP 케이블 포설');
      inclusions.push('녹화기(DVR/NVR) 세팅 및 스마트폰 전용 모니터링 앱 연동');
      inclusions.push('개인정보보호법 법정 의무 규격 CCTV 설치 안내판 무상 제공 및 부착 (공개 장소 대상)');
      exclusions.push('초고층 폴대 신설 작업 및 사유지 외 도로 굴착 배관 공사');
      extraFeeWarnings.push('외벽 케이블 50m 초과 장거리 포설 시 케이블 미터당 추가비 발생');
      contractorChecklist.push('상가, 주차장, 복도 등 공개된 장소 설치 시 법정 4대 필수항목(목적/범위/관리자/연락처) 안내판을 출입구에 부착했는가?');
      contractorChecklist.push('공개된 장소 설치 시 개인정보 보호법 제25조 제5항에 따른 녹음기능 사용 금지 및 마이크 비활성화 여부를 점검했는가?');
      cautions.push('법령 고지: 공개된 장소(상가, 주차장 등)에 설치·운영되는 고정형 CCTV는 개인정보 보호법 제25조에 따라 법정 4대 안내판 부착 요건과 녹음기능 사용 금지가 적용됩니다. 업무상 비공개 장소(사무실 등) 설치 시에는 개인정보 보호법 제15조 수집·이용 요건을 별도 검토해야 하며, 비공개 장소에서의 타인 간 대화 녹음은 통신비밀보호법 등 관련 법령에 저촉될 수 있으므로 각별히 유의해야 합니다.');
      break;
    }

    case 'ev-charger-installation': {
      const sOpt = service.questions.find((q) => q.id === 'charger_spec')?.options?.find((o) => o.value === inputs.charger_spec);
      const sDelta = sOpt?.priceDelta || 0;
      const lOpt = service.questions.find((q) => q.id === 'cable_length')?.options?.find((o) => o.value === inputs.cable_length);
      const lDelta = lOpt?.priceDelta || 0;
      const kOpt = service.questions.find((q) => q.id === 'kepco_paperwork')?.options?.find((o) => o.value === inputs.kepco_paperwork);
      const kDelta = kOpt?.priceDelta || 0;

      baseCost = 900000 + sDelta;
      priceBreakdown.push({ name: `전기차 충전기 기본 설치비 (${sOpt?.label || '7kW 완속'})`, amount: baseCost });
      if (lDelta !== 0) {
        priceBreakdown.push({ name: `배선 거리 가산 (${lOpt?.label})`, amount: lDelta });
      }
      if (kDelta !== 0) {
        priceBreakdown.push({ name: `한전 신청 및 검사 대행 (${kOpt?.label})`, amount: kDelta });
      }

      const totalTarget = baseCost + lDelta + kDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('완속충전기 본체 벽부형 거치 및 CV 6sq 고전압 전선 포설');
      inclusions.push('전용 누전차단기(ELB) 및 외함 분전함 설치, 접지 저항 테스트');
      exclusions.push('한전 표준 시설부담금(한전 납부 불입금 약 40만~50만원은 별도 고지서 납부)');
      extraFeeWarnings.push('아스팔트 바닥 굴착이나 지중 배관 매설 필요 시 포크레인/인력 굴착비 추가');
      contractorChecklist.push('전기공사업법 제3조에 따라 시·도지사에 등록된 전기공사업체(개인 자격 단독 시공 불가)가 시공하고 한국전기안전공사(KESCO) 사용전점검 필증을 발급하는가?');
      contractorChecklist.push('한전 모자분리(전기차 전용 요금제 계량기 신설, 계약전력 7kW 증설) 서류 접수 절차를 정상 완료했는가?');
      cautions.push('법령 및 안전 고지: 7kW 완속충전기 신설 공사는 전기공사업법상 등록된 전기공사업체만 시공 가능하며(개인 전기기능사의 단독 도급 시공 불가), KESCO 사용전점검 승인 및 한전 전기차 전용 계약(모자분리)이 필수입니다.');
      break;
    }

    case 'intercom-doorphone-installation': {
      const pOpt = service.questions.find((q) => q.id === 'system_protocol')?.options?.find((o) => o.value === inputs.system_protocol);
      const pDelta = pOpt?.priceDelta || 0;
      const sOpt = service.questions.find((q) => q.id === 'display_screen_size')?.options?.find((o) => o.value === inputs.display_screen_size);
      const sDelta = sOpt?.priceDelta || 0;
      const fOpt = service.questions.find((q) => q.id === 'finishing_plate_needed')?.options?.find((o) => o.value === inputs.finishing_plate_needed);
      const fDelta = fOpt?.priceDelta || 0;

      baseCost = 130000 + pDelta;
      priceBreakdown.push({ name: `비디오폰 기본 설치 공임 (${pOpt?.label || '아날로그 방식'})`, amount: baseCost });
      if (sDelta !== 0) {
        priceBreakdown.push({ name: `모니터 스펙 가산 (${sOpt?.label})`, amount: sDelta });
      }
      if (fDelta !== 0) {
        priceBreakdown.push({ name: `마감판 자재비 (${fOpt?.label})`, amount: fDelta });
      }

      const totalTarget = baseCost + sDelta + fDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('실내 모니터 본체 결선 및 실외 현관 도어 카메라 세트 교체');
      inclusions.push('경비실 통화 및 1층 로비폰 자동문 문열림 신호 연동 테스트');
      exclusions.push('아파트 단지 메인 주장치(주장치 교환기) 고장 수리');
      extraFeeWarnings.push('기존 매립선 단선으로 천장 배선 재입선 필요 시 입선비 5~8만원 추가');
      contractorChecklist.push('1층 공동현관에서 호출 시 얼굴 영상이 또렷하고 자동문 열림 버튼이 정상 작동하는가?');
      contractorChecklist.push('벽면 마감판이 수평계 기준 기울어짐 없이 반듯하게 고정되었는가?');
      cautions.push('디지털 방식 아파트(코맥스, 코콤, 현대 등)는 제조사 규격이 다르면 1층 문열림이 불가하므로 관리실 시스템 호환 모델 확인이 필수입니다.');
      break;
    }

    case 'electrical-outlet-wiring': {
      const tOpt = service.questions.find((q) => q.id === 'electrical_task_type')?.options?.find((o) => o.value === inputs.electrical_task_type);
      const tDelta = tOpt?.priceDelta || 0;
      const mOpt = service.questions.find((q) => q.id === 'wiring_finish_method')?.options?.find((o) => o.value === inputs.wiring_finish_method);
      const mDelta = mOpt?.priceDelta || 0;
      const gOpt = service.questions.find((q) => q.id === 'ground_wire_presence')?.options?.find((o) => o.value === inputs.ground_wire_presence);
      const gDelta = gOpt?.priceDelta || 0;

      baseCost = 100000 + tDelta;
      priceBreakdown.push({ name: `전기 배선 기본 공임 (${tOpt?.label || '콘센트 증설'})`, amount: baseCost });
      if (mDelta !== 0) {
        priceBreakdown.push({ name: `마감 공법 가산 (${mOpt?.label})`, amount: mDelta });
      }
      if (gDelta !== 0) {
        priceBreakdown.push({ name: `접지선 입선 공사 (${gOpt?.label})`, amount: gDelta });
      }

      const totalTarget = baseCost + mDelta + gDelta;
      minCost = Math.round(totalTarget * 0.85);
      maxCost = Math.round(totalTarget * 1.25);

      inclusions.push('KS 규격 난연 HIV/HFIX 2.5sq 정품 전선 사용 배선 결선');
      inclusions.push('2구 안전 접지 콘센트 부착 및 전압·접지 테스트 계측');
      exclusions.push('전체 세대 메인 인입선 굵기 승압 공사(한전 모선 공사)');
      extraFeeWarnings.push('옹벽 콘크리트 장거리 커팅 홈파기(1m 초과) 시 미장비 추가');
      contractorChecklist.push('전기공사업법 시행령 제5조의 경미한 공사(단순 기구 교체)를 초과하는 배선 신설/차단기 교체 시 등록된 전기공사업체가 시공하는가?');
      contractorChecklist.push('국가공인 전기 자격 기술자가 시공하며 접지 테스터기로 감전 차단 및 전압을 정밀 계측했는가?');
      cautions.push('법령 및 자격 고지: 전기공사업법 시행령 제5조에 따른 단순 기구 1:1 교체 외에 벽체 매립 배선 신설, 누전차단기 신설·교체, 고용량 가전 전용선 포설은 반드시 등록된 전기공사업체(개인 무등록 시공 불가)가 시공해야 합니다.');
      break;
    }

    default: {
      type = 'quote_preparation';
      baseCost = 100000;
      minCost = 100000;
      maxCost = 150000;
      priceBreakdown.push({ name: '현장 실측 및 맞춤 견적 준비 항목', amount: baseCost });
      inclusions.push('서비스 현장 기본 실측 및 상태 정밀 점검');
      exclusions.push('자재비 및 추가 특수 공정');
      extraFeeWarnings.push('현장 작업 난이도 및 자재 선택에 따른 견적 변동 가능');
      contractorChecklist.push('서면 견적서와 작업 내역서를 사전에 전달받았는가?');
      cautions.push('정확한 비용은 현장 상태 실측 후 최종 확정됩니다.');
      break;
    }
  }

  // Handle quote_preparation type explicitly
  if (type === 'quote_preparation') {
    const finalPrepTitle = prepTitle || `${service.title} 현장 실측 맞춤 견적 가이드`;
    const finalExplanation =
      prepExplanation ||
      `${service.title}는 단일 정액가 적용이 어려워 현장 방문 실측 및 복수 업체 비교를 권장하는 맞춤 견적 준비형 서비스입니다.`;

    return {
      type: 'quote_preparation',
      status: 'warning',
      serviceId: service.id,
      minPrice: undefined,
      maxPrice: undefined,
      formattedRange: '현장 실측 맞춤 견적 (단일 정액가 산출 불가)',
      prepTitle: finalPrepTitle,
      inputSummary,
      priceBreakdown,
      inclusions,
      exclusions,
      extraFeeWarnings,
      contractorChecklist,
      verificationDate: service.evidence.lastVerifiedAt,
      cautions,
      // Compatibility fields
      minAmount: undefined,
      maxAmount: undefined,
      basis: {
        breakdown: priceBreakdown.map((p) => ({ label: p.name, amount: p.amount })),
        explanation: finalExplanation,
      },
      includedItems: inclusions,
      excludedItems: exclusions,
      surchargeWarnings: extraFeeWarnings,
      checklist: contractorChecklist,
    };
  }

  // Final sanity validation to ensure 0 errors
  if (minCost > maxCost) {
    const temp = minCost;
    minCost = maxCost;
    maxCost = temp;
  }
  minCost = Math.max(10000, Math.round(minCost / 1000) * 1000);
  maxCost = Math.max(minCost, Math.round(maxCost / 1000) * 1000);

  const formattedRange = minCost === maxCost
    ? formatKoreanWon(minCost)
    : `${formatKoreanWon(minCost)} ~ ${formatKoreanWon(maxCost)}`;

  return {
    type: 'range_estimate',
    status: 'success',
    serviceId: service.id,
    minPrice: minCost,
    maxPrice: maxCost,
    formattedRange,
    inputSummary,
    priceBreakdown,
    inclusions,
    exclusions,
    extraFeeWarnings,
    contractorChecklist,
    verificationDate: service.evidence.lastVerifiedAt,
    cautions,
    // Compatibility fields
    minAmount: minCost,
    maxAmount: maxCost,
    basis: {
      breakdown: priceBreakdown.map((p) => ({ label: p.name, amount: p.amount })),
      explanation: `${service.title} 공식 플랫폼 공개 견적 데이터(실제 체결·지급된 거래가격이 아닌 요청·제안 견적 기반 참고 시세, 기준가: ${formatKoreanWon(service.evidence?.basePrice || 0)}) 및 선택 조건별 가산금을 반영한 시장 참고용 예상 범위입니다. (업체 확정 견적이 아니며, 현장 환경 및 시공 난이도에 따라 변동될 수 있습니다.)`
    },
    includedItems: inclusions,
    excludedItems: exclusions,
    surchargeWarnings: extraFeeWarnings,
    checklist: contractorChecklist,
  };
}

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

export function calculateEstimate(serviceSlugOrId: string, userInputs: Record<string, any> = {}): EstimateResult {
  const service = getServiceBySlug(serviceSlugOrId) || getServiceById(serviceSlugOrId);
  if (!service) {
    throw new Error(`Service not found for: ${serviceSlugOrId}`);
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
  const verificationStatus = userInputs.__forceVerificationStatus || service.evidence?.verificationStatus || 'verified';
  const isOfficeCleaning = service.slug === 'office-cleaning-service';
  const hasInsufficientBasis =
    verificationStatus === 'unverified' ||
    verificationStatus === 'stale' ||
    verificationStatus === 'partially_verified' ||
    isOfficeCleaning ||
    service.estimateType === 'quote_preparation';

  let type: 'range_estimate' | 'quote_preparation' = hasInsufficientBasis ? 'quote_preparation' : 'range_estimate';
  let prepTitle: string | undefined = undefined;
  let prepExplanation: string | undefined = undefined;

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
      explanation: `${service.title} 표준 시장 작업공임 및 선택 옵션 반영 기준`
    },
    includedItems: inclusions,
    excludedItems: exclusions,
    surchargeWarnings: extraFeeWarnings,
    checklist: contractorChecklist,
  };
}

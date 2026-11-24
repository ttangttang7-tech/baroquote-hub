import type { ServiceDefinition } from '../types';

const services = [
  ["tempered-glass-tabletop","테이블 강화유리 맞춤 제작","interior","기존 상판 실측","가로·세로, 두께와 모서리 모양을 기록하세요."],
  ["window-glass-pane-replacement","창문 깨진 유리 교체","interior","손상된 유리 종류","단판·복층 여부와 창틀 안쪽의 유리 폭을 확인하세요."],
  ["automatic-sliding-door-repair","상가 자동문 수리","installation","자동문 작동 상태","모델명과 문이 열리거나 닫힐 때 멈추는 위치를 기록하세요."],
  ["garage-shutter-repair","전동 셔터 수리","installation","셔터 구동 상태","권취함과 셔터 판의 상태, 리모컨과 스위치 반응을 기록하세요."],
  ["awning-fabric-replacement","접이식 어닝 천 교체","interior","어닝 천 손상 범위","펼친 폭과 돌출 길이, 프레임의 휨 여부를 기록하세요."],
  ["outdoor-sign-removal","외벽 간판 철거","installation","간판 설치 높이와 종류","간판 크기, 벽면 고정 방식과 차량 접근 가능 여부를 기록하세요."],
  ["bird-net-installation","실외기실 조류 차단망 설치","installation","차단할 개구부","개구부 치수와 실외기 정비 시 필요한 접근 공간을 기록하세요."],
  ["stair-handrail-installation","계단 손잡이 설치","installation","설치 구간과 벽체 재질","계단 길이와 벽체 재질, 참이 있는지 기록하세요."],
  ["accessibility-ramp-installation","출입구 경사로 설치","interior","출입구 단차와 가용 길이","단차 높이, 출입문 개폐 방향, 경사로 설치에 쓸 수 있는 길이를 기록하세요."],
  ["skylight-shade-installation","천창 차양 설치","installation","천창의 형태와 접근성","창 개구부 크기와 천장 높이, 전원 사용 여부를 기록하세요."],
  ["bathtub-refinishing","욕조 표면 재코팅","interior","욕조 소재와 표면 손상","욕조 재질, 박리와 변색 위치, 주변 환기 상태를 기록하세요."],
  ["epoxy-garage-floor","차고 에폭시 바닥 시공","interior","차고 바닥의 기존 마감","바닥 면적과 기존 코팅 상태, 오일 오염 여부를 기록하세요."],
  ["suspended-ceiling-panel-replacement","텍스 천장 패널 교체","interior","천장 패널 규격","패널 치수와 수량을 기록하고 기존 자재의 종류를 업체에 확인하세요."],
  ["raised-access-floor-repair","이중바닥 패널 보수","interior","이중바닥 패널의 흔들림과 단차","패널 규격과 손상 범위, 하부 배선과 장비 위치를 기록하세요."],
  ["concrete-core-drilling","콘크리트 코어 타공 견적","interior","타공 위치와 목표 직경","타공 위치와 필요한 직경을 표시하고 매립 설비와 구조 검토 범위를 확인하세요."],
  ["commercial-kitchen-grease-trap-cleaning","상가 그리스트랩 청소","cleaning","그리스트랩의 형태와 접근 위치","기름분리조 크기와 뚜껑 위치, 폐기물 수거 포함 여부를 확인하세요."],
  ["post-fire-soot-cleaning","화재 후 그을음 청소","cleaning","그을음이 남은 구역","안전 확인 후 오염된 표면과 면적, 집기 이동 범위를 기록하세요."],
  ["storefront-glass-film-removal","상가 유리 시트지 제거","cleaning","제거 대상 필름 종류와 면적","유리창 개수와 필름 부착 면, 접착제 잔여물 제거 범위를 기록하세요."],
  ["exterior-paver-leveling","보도블록 침하 재포설","interior","침하 구간과 블록 재사용 여부","가라앉은 면적, 물이 고이는 위치, 파손 블록 수를 기록하세요."],
  ["garage-floor-drain-channel-replacement","주차장 트렌치 그레이팅 교체","plumbing","배수로 덮개와 프레임 규격","배수로 폭과 길이, 통과 차량 종류, 프레임 손상 여부를 기록하세요."],
] as const;

export const QUOTE_PREPARATION_SERVICES: ServiceDefinition[] = services.map(
  ([slug, title, categoryId, condition, preparation], index) => {
    const number = String(101 + index);
    const pageTitle = `${title} 견적 준비`;
    return {
      id: `service-${number}`,
      number,
      title,
      slug,
      categoryId,
      categoryName: categoryId,
      ruleId: `rule-${slug}`,
      shortDesc: preparation,
      icon: '🔧',
      estimateType: 'quote_preparation',
      questions: [{
        id: 'condition',
        label: `${condition} 정보를 준비했나요?`,
        type: 'select',
        options: [
          { label: '사진과 현장 정보를 준비함', value: 'ready' },
          { label: '방문 확인이 필요함', value: 'visit' },
        ],
      }],
      evidence: {
        provider: '현장 견적 안내',
        sourceUrl: '',
        basePrice: 0,
        priceUnit: '가격 미산출',
        vatIncluded: false,
        travelFeeIncluded: false,
        materialsIncluded: false,
        surveyedAt: '2026-11-24',
        lastVerifiedAt: '2026-11-24',
        verificationStatus: 'unverified',
        reliabilityLevel: 'low',
        sourceType: 'none',
        notes: '업체가 현장 조건과 작업 범위를 확인한 후 금액을 산정합니다.',
      },
      seo: {
        title: pageTitle,
        description: preparation,
        keywords: [title, pageTitle, '현장 견적'],
        h1: pageTitle,
        canonicalPath: `/estimate/${slug}/`,
        faq: [
          { question: '견적 상담 전에 무엇을 준비하나요?', answer: preparation },
          { question: '업체에 어떤 사진을 보내면 되나요?', answer: `${condition}을 확인할 수 있게 전체와 세부 사진을 함께 준비하세요.` },
          { question: '언제 작업 금액을 알 수 있나요?', answer: '업체가 현장 접근 조건, 작업 범위와 필요한 부품을 확인한 뒤 금액을 제시합니다.' },
          {
            question: '견적서에서 어떤 항목을 확인하나요?',
            answer: '작업 범위, 자재와 인건비, 출장비, 폐기물 반출, 추가 비용 조건을 확인하세요.',
          },
        ],
      },
    };
  },
);
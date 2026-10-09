# 바로견적 (BaroQuote) 디자인 시스템 명세서 (DESIGN.md)

> **Stitch MCP 프로젝트 연동**:
> - **Project ID**: `3112785185112665993` (BaroQuote - 바로견적 생활서비스 견적 플랫폼)
> - **Design System ID**: `assets/42b5266899ae4112a01a1a250fc095a1`
> - **Design System Name**: `Reliable Precision Marketplace`

---

## 1. 브랜드 철학 & 컨셉 (Brand Personality)

바로견적(BaroQuote)은 주택 소유자, 세입자, 자영업자가 청소, 이사, 냉난방, 누수배관, 인테리어, 생활설치 등 일상 생활서비스의 투명하고 객관적인 예상 견적을 즉각 산출할 수 있는 전문 견적 플랫폼입니다.
- **핵심 가치**: 신뢰성(Trust), 정확성(Precision), 즉시성(Promptness), 객관적 투명성(Transparency)
- **UI 지향점**: 시각적 피로감을 주는 과도한 애니메이션이나 불필요한 장식을 배제하고, 높은 정보 위계와 명확한 수치 비교, 신뢰할 수 있는 데이터 출처 배치를 제공하는 **Modern Functionalist** 디자인을 채택합니다.

---

## 2. 컬러 팔레트 & 색상 토큰 (Color Tokens)

### 2.1 핵심 브랜드 컬러
| 토큰명 | HEX / 값 | 용도 |
| :--- | :--- | :--- |
| `--color-primary` | `#1D4ED8` (Sapphire Blue) | 주 액션 버튼, 견적 계산, 활성 탭, 신뢰 뱃지 |
| `--color-primary-hover` | `#1E40AF` | 주 버튼 마우스 호버 상태 |
| `--color-primary-light` | `#EFF6FF` | 선택된 옵션 배경, 활성 필터 칩 |
| `--color-secondary` | `#0D9488` (Deep Teal) | 정액 보증, 견적 절감 요인, 검증 완료 라벨 |
| `--color-tertiary` | `#F59E0B` (Amber) | 추가비용 주의, 현장 확인 경고, 중요 체크리스트 |
| `--color-error` | `#EF4444` | 입력 검증 오류, 위험 경고 |
| `--color-surface` | `#FFFFFF` | 카드 배경, 모달, 입력창 표면 |
| `--color-background` | `#F8FAFC` (Slate 50) | 전체 웹페이지 캔버스 기본 배경 |
| `--color-border` | `#E2E8F0` (Slate 200) | 기본 테두리, 구분선 |
| `--color-border-hover` | `#93C5FD` (Blue 300) | 카드 호버 시 경계선 강조 |

### 2.2 텍스트 위계 (Typography Colors)
| 토큰명 | HEX | 용도 |
| :--- | :--- | :--- |
| `--color-text-main` | `#0F172A` (Slate 900) | H1~H4 제목, 견적 금액 수치, 강조 텍스트 |
| `--color-text-body` | `#334155` (Slate 700) | 본문 내용, 설명문, 질문 옵션 레이블 |
| `--color-text-muted` | `#64748B` (Slate 500) | 부가 설명, 출처 URL, 보조 메타데이터 |
| `--color-text-subtle` | `#94A3B8` (Slate 400) | 비활성 상태, 플레이스홀더, 비활성 아이콘 |

---

## 3. 타이포그래피 체계 (Typography)

폰트 패밀리: `Pretendard`, `Plus Jakarta Sans`, `-apple-system`, `BlinkMacSystemFont`, `system-ui`, `sans-serif`
수치 서체: 금액 및 단위 비교 시 정렬 유지를 위해 `font-variant-numeric: tabular-nums`를 강제 적용합니다.

| 스타일명 | Font Size | Weight | Line Height | Letter Spacing | 적용 요소 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-hero` | 44px (모바일 30px) | 800 (Bold) | 56px | -0.03em | 메인 Hero 헤드라인 |
| `headline-lg` | 32px (모바일 26px) | 700 (Bold) | 40px | -0.025em | 상세 도구 페이지 H1, 주요 섹션 제목 |
| `headline-md` | 24px (모바일 20px) | 700 (Bold) | 32px | -0.02em | 카테고리 제목, 견적 결과 헤더 |
| `headline-sm` | 20px (모바일 18px) | 600 (Semibold)| 28px | -0.015em | 입력 그룹 제목, 카드 제목 |
| `price-xl` | 32px (모바일 26px) | 800 (Bold) | 38px | -0.03em | 최종 예상 금액 범위 (예: 18만 ~ 24만원) |
| `price-md` | 20px | 700 (Bold) | 26px | -0.02em | 기본 작업비, 중간 항목 소계 |
| `body-lg` | 16px | 400 (Regular) | 26px | normal | 리드 문단, 주요 설명 |
| `body-md` | 14px | 400 (Regular) | 22px | normal | 본문 텍스트, FAQ 본문, 체크리스트 |
| `label-md` | 13px | 600 (Semibold)| 18px | +0.01em | 뱃지, 카테고리 태그, 버튼 캡션 |
| `label-sm` | 12px | 500 (Medium) | 16px | +0.01em | 출처 확인일, 부가 안내 |

---

## 4. 컴포넌트 UI 규격 (Components Specs)

### 4.1 버튼 (Buttons)
- **Primary Button**: Background `#1D4ED8`, Text `#FFFFFF`, Font Weight `600`, Border Radius `8px`, Height `48px` (모바일 하단 액션바 `52px`). Hover: `#1E40AF`.
- **Secondary Button**: Background `#FFFFFF`, Border `1px solid #CBD5E1`, Text `#0F172A`. Hover: Background `#F8FAFC`, Border `#94A3B8`.
- **Ghost Button**: Background Transparent, Text `#64748B`, Hover: Text `#0F172A`, Background `#F1F5F9`.

### 4.2 뱃지 & 필터 칩 (Chips & Badges)
- **검증 뱃지 (Verified)**: Background `#ECFDF5`, Text `#065F46`, Border `1px solid #A7F3D0` (예: "공식 가격표 기준").
- **주의 뱃지 (Warning)**: Background `#FEF3C7`, Text `#92400E`, Border `1px solid #FDE68A` (예: "현장 추가요금 가능").
- **선택형 칩 (Selectable Chip)**: 
  - 기본: Background `#FFFFFF`, Border `1px solid #E2E8F0`, Text `#334155`.
  - 선택 시: Background `#EFF6FF`, Border `1.5px solid #1D4ED8`, Text `#1D4ED8`, Font Weight `600`.

### 4.3 견적 입력 UI (Form Controls)
- **터치 영역**: 모든 클릭/터치 대상 높이 `48px` 이상 확보 (모바일 오조작 방지).
- **텍스트/숫자 입력창**: Height `48px`, Padding `0 14px`, Border `1px solid #CBD5E1`, Radius `8px`. 포커스 시 `border-color: #2563EB`, Outer Ring `3px rgba(37, 99, 235, 0.15)`.
- **단일/다중 선택 라디오 및 체크박스**: 카드 형태의 인터랙티브 블록으로 구성하여 모바일에서도 시원하게 탭 가능.

### 4.4 견적 결과 UI (Result Module)
- **카드 표면**: White `#FFFFFF`, Border `1px solid #E2E8F0`, Radius `12px`, Padding `20px ~ 24px`.
- **결과 상단**: 상태 라벨("예상 견적 산출 완료" 또는 "현장 견적 준비형") + 총 예상 범위(price-xl) + 부가세(VAT) 포함 여부 명시.
- **결과 내역 블록**:
  1. 사용자 입력조건 요약 (칩 리스트)
  2. 금액 산정 상세 내역 (기본작업비 + 조건별 가산요금)
  3. 포함 내역 (✓) vs 제외 내역 (✕)
  4. 현장 추가요금 주의 요인 (사다리차, 엘리베이터 유무, 오염도 등)
  5. 업체 문의 필수 체크리스트
  6. 가격 출처 및 최종 확인일
  7. 결과 복사 버튼 (원클릭 클립보드 복사)

### 4.5 서비스 카드 (Service Card)
- 메인 및 카테고리 목록에서 사용.
- Hover 시: Y축 `-2px` 이동, Shadow `0 8px 20px -4px rgba(29, 78, 216, 0.08)`, Border `#93C5FD`.

---

## 5. 레이아웃 & 반응형 기준 (Layout & Responsive)

### 5.1 뷰포트 기준
- **모바일 (Mobile)**: `320px ~ 767px` (1열 스택, 좌우 패딩 `16px`, 가로 스크롤 완전 방지)
- **태블릿 (Tablet)**: `768px ~ 1199px` (2열 그리드, 좌우 패딩 `20px`)
- **데스크톱 (Desktop)**: `1200px 이상` (최대 폭 `1200px` 중앙 정렬, 3열 서비스 그리드)

### 5.2 광고 슬롯 레이아웃 (AdSense Layout)
- 콘텐츠와 명확히 구분되는 독립 컨테이너 구성.
- 상단/하단/본문 내 배치 시 고정 최소 높이(Min-height: 100px / 280px)를 선언하여 CLS(누적 레이아웃 이동) 방지.
- 가로 오버플로우 방지: `overflow: hidden; max-width: 100%;` 강제.
- 계산 버튼이나 견적 결과와 물리적 여백(`margin-top: 24px`)을 두어 오클릭 방지.

---

## 6. 접근성 (Accessibility - a11y)
- 모든 폼 요소에 명시적인 `<label for="...">` 매핑.
- 고대비율 유지: 텍스트와 배경 간 최소 4.5:1 이상 대비 확보.
- 키보드 탭 탐색 지원 (`:focus-visible` 아웃라인 표시).
- 스크린리더를 위한 `aria-live="polite"` 견적 결과 영역 지정.

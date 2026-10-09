# 바로견적 (BaroQuote) 디자인 시스템 명세서 (DESIGN.md)

> **Stitch MCP 프로젝트 연동**:
> - **Project ID**: `3112785185112665993` (BaroQuote - 바로견적 생활서비스 견적 플랫폼)
> - **Design System ID**: `assets/42b5266899ae4112a01a1a250fc095a1`
> - **Design Direction**: **시안 B — Modern Home Service (현대적 생활서비스 포털형)**
> - **Active Revision**: `v2.0` (2026-10-09 UI/UX 2차 전면 리뉴얼)

---

## 1. 브랜드 철학 & 컨셉 (Brand Personality)

바로견적(BaroQuote)은 주택 소유자, 세입자, 자영업자가 청소·이사·냉난방·누수배관·인테리어·생활설치 등 일상 생활서비스의 투명하고 객관적인 예상 견적을 즉각 산출할 수 있는 전문 생활서비스 견적 플랫폼입니다.

- **컨셉**: **Modern Home Service (현대적 생활서비스 포털형)**  
  토스(Toss)나 오늘의집처럼 친근하면서도, 금융·데이터 서비스에 필적하는 투명한 시장 가격과 바가지 예방 체크리스트를 직관적으로 전달합니다.
- **핵심 가치**:
  1. **신뢰성 (Reliability)**: 숨고 실운영 시세 엔드포인트 전수 실검증 기반 투명한 데이터 제공
  2. **친근함 (Approachable Modernity)**: 과도한 복잡도를 걷어내고 부드러운 라운딩과 알약형 컨트롤로 심리적 장벽 완화
  3. **모바일 최적화 (Mobile-First)**: 엄지 영역(Thumb-zone) 중심 48px+ 터치 타깃 및 전 뷰포트 가로 스크롤 0%
  4. **결과 중심 (Result-Driven)**: 조건 선택 즉시 한눈에 들어오는 투명한 예상 비용 범위 및 추가요금 체크리스트

---

## 2. 컬러 팔레트 & 색상 토큰 (Color Tokens)

### 2.1 핵심 브랜드 컬러
| 토큰명 | HEX / 값 | 용도 및 시각적 의미 |
| :--- | :--- | :--- |
| `--color-primary` | `#0D9488` (Deep Teal) | 주 브랜드 컬러, Primary CTA 버튼, 선택 칩 테두리 |
| `--color-primary-hover` | `#0F766E` (Darker Teal) | 주 버튼 마우스 호버 상태 |
| `--color-primary-light` | `#F0FDFA` (Teal 50) | 선택된 옵션 배경, 활성 필터 칩 배경 |
| `--color-secondary` | `#0284C7` (Sky Blue) | 부가 액션, 시장 데이터 분석 배지, 보조 링크 |
| `--color-secondary-hover` | `#0369A1` | 보조 버튼 호버 상태 |
| `--color-secondary-light` | `#F0F9FF` (Sky 50) | 보조 안내 카드 배경 |
| `--color-tertiary` | `#D97706` (Amber 600) | 현장 실측 주의, 추가요금 경고, 체크리스트 강조 |
| `--color-tertiary-light` | `#FEF3C7` (Amber 100) | 주의 배지 배경 |
| `--color-success` | `#059669` (Emerald 600) | 검증 완료 배지, 정액 포함 항목(✓) |
| `--color-success-light` | `#ECFDF5` (Emerald 50) | 검증 완료 칩 배경 |
| `--color-error` | `#EF4444` (Rose 500) | 입력 오류, 미포함 항목(✕), 위험 경고 |
| `--color-surface` | `#FFFFFF` | 카드 배경, 모달, 입력 폼 표면 |
| `--color-background` | `#F8FAFC` (Slate 50) | 전체 웹페이지 캔버스 기본 배경 |
| `--color-border` | `#E2E8F0` (Slate 200) | 기본 카드 테두리, 구분선 |
| `--color-border-hover` | `#99F6E4` (Teal 200) | 인터랙티브 카드 호버 시 강조 |

### 2.2 텍스트 위계 (Typography Colors)
| 토큰명 | HEX | 용도 |
| :--- | :--- | :--- |
| `--color-text-main` | `#0F172A` (Slate 900) | 메인 헤드라인, 최종 견적 금액 수치, 카드 타이틀 |
| `--color-text-body` | `#334155` (Slate 700) | 본문 텍스트, 설명문, 질문 옵션 레이블 |
| `--color-text-muted` | `#64748B` (Slate 500) | 부가 설명, 출처 URL, 보조 메타데이터 |
| `--color-text-subtle` | `#94A3B8` (Slate 400) | 플레이스홀더, 비활성 아이콘, 비활성 캡션 |

---

## 3. 타이포그래피 체계 (Typography)

폰트 패밀리: `Pretendard`, `Plus Jakarta Sans`, `-apple-system`, `BlinkMacSystemFont`, `system-ui`, `sans-serif`  
수치 서체: 금액 및 단위 비교 시 가독성과 자릿수 정렬을 위해 `font-variant-numeric: tabular-nums` 강제 적용.

| 스타일명 | Font Size | Weight | Line Height | Letter Spacing | 적용 요소 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-hero` | 40px (모바일 28px) | 800 (Bold) | 52px (모바일 36px) | -0.025em | 메인 Hero 헤드라인 |
| `headline-lg` | 30px (모바일 24px) | 700 (Bold) | 38px (모바일 32px) | -0.02em | 상세 도구 페이지 H1, 주요 섹션 제목 |
| `headline-md` | 22px (모바일 18px) | 700 (Bold) | 30px (모바일 26px) | -0.015em | 카테고리 제목, 견적 결과 헤더 |
| `headline-sm` | 18px (모바일 16px) | 600 (Semibold)| 26px | -0.01em | 입력 그룹 제목, 카드 제목 |
| `price-xl` | 32px (모바일 24px) | 800 (Bold) | 38px | -0.03em | 최종 예상 금액 범위 (예: 250,000원 ~ 350,000원) |
| `price-md` | 20px | 700 (Bold) | 26px | -0.02em | 기본 작업비, 중간 항목 소계 |
| `body-lg` | 16px | 400 (Regular) | 26px | normal | 리드 문단, 주요 설명문 |
| `body-md` | 14px | 400 (Regular) | 22px | normal | 본문 텍스트, FAQ 본문, 체크리스트 |
| `label-md` | 13px | 600 (Semibold)| 18px | +0.01em | 뱃지, 카테고리 태그, 버튼 캡션 |
| `label-sm` | 12px | 500 (Medium) | 16px | +0.01em | 출처 확인일, 부가 안내 |

---

## 4. 컴포넌트 UI 규격 (Components Specs)

### 4.1 버튼 (Buttons)
- **Primary Button**: Background `#0D9488`, Text `#FFFFFF`, Font Weight `600`, Border Radius `12px` (모바일 하단 액션바 `12px`), Height `48px` (모바일 `52px`). Hover: `#0F766E`, Active: `#115E59`.
- **Secondary Button**: Background `#FFFFFF`, Border `1.5px solid #E2E8F0`, Text `#0F172A`, Border Radius `12px`. Hover: Background `#F8FAFC`, Border `#CBD5E1`.
- **Ghost Button**: Background Transparent, Text `#64748B`, Hover: Text `#0F172A`, Background `#F1F5F9`.

### 4.2 알약형 검색창 및 필터 칩 (Search & Filter Chips)
- **알약형 검색창 (Pill Search Bar)**:
  - Height `56px` (모바일 `50px`), Border Radius `9999px` (완전한 알약 형태).
  - Background `#FFFFFF`, Border `1.5px solid #E2E8F0`, Shadow `0 4px 16px -2px rgba(15, 23, 42, 0.06)`.
  - Focus 시 `border-color: #0D9488`, Ring `3px rgba(13, 148, 136, 0.15)`.
  - Placeholder: `"어떤 서비스 비용이 궁금하세요?"`
- **알약형 필터 칩 (Filter Chips)**:
  - Height `36px`, Padding `0 14px`, Border Radius `9999px`.
  - 기본: Background `#FFFFFF`, Border `1px solid #E2E8F0`, Text `#475569`.
  - 선택/활성 시: Background `#F0FDFA`, Border `1.5px solid #0D9488`, Text `#0D9488`, Font Weight `600`.

### 4.3 서비스 카드 (Service Card)
- Surface `#FFFFFF`, Border `1px solid #E2E8F0`, Border Radius `16px`.
- Padding `20px` (모바일 `16px`).
- 소프트 섀도우: `0 2px 8px rgba(15, 23, 42, 0.04)`.
- Hover 시: Y축 `-3px` 이동, Border `#99F6E4`, Shadow `0 12px 24px -4px rgba(13, 148, 136, 0.10)`.
- 하단: 실거래 시작가 태그(`15만원부터`)와 산뜻한 링크 버튼 배치.

### 4.4 견적 입력 폼 (Form Controls)
- 질문 간 충분한 여백 (`margin-bottom: 24px`).
- 48px+ 터치 높이 확보로 모바일 오조작 완전 차단.
- 단일/다중 선택 카드 블록: 선택 시 `#F0FDFA` 배경과 `#0D9488` 테두리로 명확한 시각 피드백.
- Primary CTA: **"예상 견적 확인하기"** (`#0D9488`, 52px 높이, 굵은 텍스트).

### 4.5 견적 결과 카드 (Result Module)
- **상단 헤더**: **"시장 실거래 빅데이터 기반 예상 범위"** 타이틀 + 검증 배지.
- **금액 수치 (price-xl)**: 큰 폰트(`280,000원 ~ 340,000원`)와 부가세(VAT) 포함 안내.
- **고지 의무화 문구**: `"시공 업체의 확정 견적이 아니며, 현장 조건에 따라 달라질 수 있는 시장 통계 기반 참고용 예상 범위입니다."` 보존.
- **투명한 세부 내역**: 사용자 선택 조건 요약 칩, 기본 작업비 및 옵션 가산 내역, 포함 vs 제외 목록, 현장 추가요금 주의사항, 업체 확인 질문 리스트.
- **가격 출처 링크**: 숨고 실서버 출처 URL 클릭 가능한 외항 링크(`Soomgo 가격정보 ↗`) 유지.
- **견적 준비형(`quote_preparation`)**: 숫자 금액 미노출 유지, 현장 실측 중심의 4대 가이드 명확 제공.
- **90일 만료 방어**: 90일 경과 시 브라우저 진입 즉시 숫자 소거 및 안전 복사 가이드 표출 기능 100% 보존.

---

## 5. 레이아웃 & 반응형 기준 (Layout & Responsive)

### 5.1 뷰포트 기준
- **모바일 (320px ~ 767px)**: 1열 스택 구조, 좌우 패딩 `16px`, 가로 스크롤 완전 0.
- **태블릿 (768px ~ 1023px)**: 2열 그리드 구조, 좌우 패딩 `20px`.
- **데스크톱 (1024px ~ 1280px+)**:
  - 메인/카테고리: 최대 폭 `1200px` 중앙 정렬, 3열 서비스 그리드.
  - 견적 상세 페이지: 좌우 2열 분할 (`grid-template-columns: 1fr 1fr`), 좌측 조건 입력 폼 ↔ 우측 실시간 예상 견적 결과 카드.

### 5.2 광고 슬롯 레이아웃 (AdSense Layout)
- 전 슬롯 고정 최소 높이(`min-height: 100px` / `min-height: 280px`) 선언으로 CLS 제로 유지.
- "광고" 라벨 명확 표기 및 견적 액션 버튼과의 물리적 여백(`margin: 24px 0`) 확보.

---

## 6. 기존 시스템 및 안정화 규칙 보존 확약
1. 30개 서비스 ID, Slug, URL 구조 100% 보존
2. 공식 canonical `/sitemap.xml` 규칙 100% 보존
3. `estimator.ts` 산식 및 상한선 보존
4. 옥상방수(`rooftop-waterproofing`) 반올림 검증 및 하수구 막힘(`drain-unclogging`) 부분검증 보존
5. 사무실 정기청소(`office-cleaning-service`) 견적 준비형 보존
6. 90일 만료 브라우저 재평가 및 금액 누출 차단 클라이언트 스크립트 보존

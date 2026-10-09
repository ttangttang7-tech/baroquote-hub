import type { CategoryDefinition } from './types';

export const CATEGORIES: CategoryDefinition[] = [
  {
    id: 'cleaning',
    name: '청소·가사',
    slug: 'cleaning',
    description: '입주·이사청소, 에어컨·세탁기 분해청소, 가사도우미 및 특수 청소 견적',
    icon: '🧹',
    serviceCount: 7,
  },
  {
    id: 'moving',
    name: '이사·운송·폐기물',
    slug: 'moving',
    description: '원룸·포장이사, 용달 화물, 폐기물 수거 및 사다리차 이용 견적',
    icon: '📦',
    serviceCount: 5,
  },
  {
    id: 'heating-cooling',
    name: '냉난방·설비',
    slug: 'heating-cooling',
    description: '에어컨 이전설치, 보일러 수리·교체 및 배관 세척 견적',
    icon: '❄️',
    serviceCount: 3,
  },
  {
    id: 'plumbing',
    name: '누수·배관·수도',
    slug: 'plumbing',
    description: '누수탐지, 하수구·배관 막힘 통수, 수전 교체 견적',
    icon: '🔧',
    serviceCount: 3,
  },
  {
    id: 'interior',
    name: '인테리어·시공',
    slug: 'interior',
    description: '도배·장판, 욕실·주방 리모델링, 줄눈, 철거, 방수, 방충망·블라인드 시공 견적',
    icon: '🏠',
    serviceCount: 8,
  },
  {
    id: 'installation',
    name: '생활 설치·교체',
    slug: 'installation',
    description: '디지털 도어락, 벽걸이 TV, LED 조명, 주방후드 설치·교체 견적',
    icon: '💡',
    serviceCount: 4,
  },
];

export function getCategoryById(id: string): CategoryDefinition | undefined {
  return CATEGORIES.find((cat) => cat.id === id);
}

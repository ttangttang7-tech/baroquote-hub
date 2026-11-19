import { describe, it, expect } from 'vitest';
import { formatKoreanWon } from '../../src/lib/engine/estimator';

describe('PILOT-002: formatKoreanWon Boundary Defense', () => {
  it('1. 음수 및 NaN 입력 시 0원으로 안전하게 방어되어야 한다', () => {
    expect(formatKoreanWon(-50000)).toBe('0원');
    expect(formatKoreanWon(NaN)).toBe('0원');
    expect(formatKoreanWon(Number.NEGATIVE_INFINITY)).toBe('0원');
  });

  it('2. 소수점 입력 시 반올림 처리되어야 한다', () => {
    expect(formatKoreanWon(12345.6)).toBe('1만 2,346원');
    expect(formatKoreanWon(12345.2)).toBe('1만 2,345원');
  });

  it('3. Infinity 및 1조원 초과 극단값 입력 시 상한선 100000000만원으로 보정되어야 한다', () => {
    expect(formatKoreanWon(Infinity)).toBe('100,000,000만원');
    expect(formatKoreanWon(2_000_000_000_000)).toBe('100,000,000만원');
  });
});

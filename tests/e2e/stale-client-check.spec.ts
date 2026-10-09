import { test, expect } from '@playwright/test';

test.describe('Client-Side Stale Verification & Dynamic DOM Regression', () => {
  // 상황 D: 재배포 없이 시간이 95일 경과한 브라우저에서 정적 페이지를 열었을 때
  test('상황 D: 95 days elapsed in browser automatically hides price range and shows quote_preparation on initial load', async ({ page }) => {
    // Mock browser clock to 95 days in future (2027-01-15)
    await page.addInitScript(() => {
      const fixedTime = new Date('2027-01-15T09:00:00Z').getTime();
      const OriginalDate = window.Date;
      // @ts-ignore
      window.Date = class extends OriginalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(fixedTime);
          } else {
            // @ts-ignore
            super(...args);
          }
        }
        static now() {
          return fixedTime;
        }
      };
    });

    await page.goto('/estimate/move-in-cleaning');

    // Range display must be hidden
    const rangeDisplay = page.locator('#rangeDisplay');
    await expect(rangeDisplay).toBeHidden();

    // Prep display must be visible
    const prepDisplay = page.locator('#prepDisplay');
    await expect(prepDisplay).toBeVisible();

    // Badge must be preparation badge
    const badge = page.locator('#resultTypeBadge');
    await expect(badge).toContainText('현장 진단 및 준비 가이드');

    // Prep title must mention expiration
    const prepTitle = page.locator('#prepTitle');
    await expect(prepTitle).toContainText('유효기간 만료');

    // Amount displays must be blanked out
    const minDisplay = page.locator('#minAmountDisplay');
    await expect(minDisplay).toHaveText('');
  });

  // 상황 E: 만료 상태에서 옵션 변경 및 복사 버튼 클릭
  test('상황 E: Changing inputs keeps preparation mode, and copy button copies guide text without amounts', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.addInitScript(() => {
      const fixedTime = new Date('2027-02-01T09:00:00Z').getTime();
      const OriginalDate = window.Date;
      // @ts-ignore
      window.Date = class extends OriginalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(fixedTime);
          } else {
            // @ts-ignore
            super(...args);
          }
        }
        static now() {
          return fixedTime;
        }
      };
    });

    await page.goto('/estimate/move-in-cleaning');

    // Change input
    const areaInput = page.locator('#input-area_pyeong');
    if (await areaInput.count() > 0) {
      await areaInput.fill('45');
      await areaInput.dispatchEvent('change');
    }

    // Range display must remain hidden
    await expect(page.locator('#rangeDisplay')).toBeHidden();
    await expect(page.locator('#prepDisplay')).toBeVisible();

    // Click copy button
    const copyBtn = page.locator('#copyResultBtn');
    await copyBtn.click();

    // Read clipboard text
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('현장 진단 및 준비 가이드');
    expect(clipboardText).toContain('정액 숫자 견적 미제공');
    expect(clipboardText).not.toContain('예상 비용 범위:');
  });

  // 상황 F: 사무실 정기청소 페이지 브라우저 확인
  test('상황 F: Office cleaning service defaults to quote_preparation and does not leak per-clean market rate as monthly quote', async ({ page }) => {
    await page.goto('/estimate/office-cleaning-service');

    await expect(page.locator('#prepDisplay')).toBeVisible();
    await expect(page.locator('#rangeDisplay')).toBeHidden();
    await expect(page.locator('#prepTitle')).toContainText('현장 실측');
  });
});

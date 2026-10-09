import { test, expect } from '@playwright/test';
import { SERVICES } from '../../src/lib/registry';
import { CATEGORIES } from '../../src/lib/registry/categories';

test.describe('BaroQuote Platform E2E Test Suite', () => {
  test('Home Page — Loads, Hero, Search, Categories & 30 Tools', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/바로견적/);

    // H1 check
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('집수리·청소·이사 비용');

    // 6 Categories exist
    const categoryCards = page.locator('.categories-grid .category-card');
    await expect(categoryCards).toHaveCount(6);

    // Search functionality
    const searchInput = page.locator('#toolSearchInput');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('에어컨');

    const searchResults = page.locator('#searchResultsSection');
    await expect(searchResults).toBeVisible();
    const resultCount = page.locator('#searchResultCount');
    const countText = await resultCount.textContent();
    expect(Number(countText)).toBeGreaterThan(0);

    // Clear search
    await page.locator('#clearSearchBtn').click();
    await expect(searchResults).toBeHidden();

    // Check All 30 tools are listed across category groups
    const allToolsInGroups = page.locator('.category-group .service-card');
    await expect(allToolsInGroups).toHaveCount(30);
  });

  test('Category Pages — All 6 categories load cleanly', async ({ page }) => {
    for (const cat of CATEGORIES) {
      await page.goto(`/category/${cat.id}`);
      await expect(page).toHaveTitle(new RegExp(cat.name));

      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
      await expect(h1).toContainText(cat.name);

      const serviceCards = page.locator('.category-services-section .service-card');
      const count = await serviceCards.count();
      expect(count).toBe(cat.serviceCount);
    }
  });

  test('Detail Estimate Pages — All 30 Tools Full Verification', async ({ page }) => {
    test.setTimeout(180000);
    for (const service of SERVICES) {
      await page.goto(`/estimate/${service.slug}`);
      await expect(page).toHaveTitle(/바로견적/);

      // H1 check
      const h1 = page.locator('h1.service-title');
      await expect(h1).toBeVisible();
      await expect(h1).toHaveText(service.title);

      // Form presence
      const form = page.locator('#estimateForm');
      await expect(form).toBeVisible();

      // Result container presence
      const resultContainer = page.locator('#estimateResultContainer');
      await expect(resultContainer).toBeVisible();

      // Check no NaN or undefined on page
      const pageText = await page.textContent('body');
      expect(pageText).not.toContain('NaN');
      expect(pageText).not.toContain('undefined');

      // Test calculation button
      const calcBtn = page.locator('#calculateBtn');
      await calcBtn.click();

      // Re-verify no NaN after calculation
      const updatedText = await page.textContent('body');
      expect(updatedText).not.toContain('NaN');
      expect(updatedText).not.toContain('undefined');

      // FAQ count check
      const faqs = page.locator('.faq-item');
      const faqCount = await faqs.count();
      expect(faqCount).toBeGreaterThanOrEqual(4);
    }
  });

  test('Static Informational Pages — About, Privacy, Terms', async ({ page }) => {
    const pages = ['/about', '/privacy', '/terms'];
    for (const path of pages) {
      await page.goto(path);
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
    }
  });

  test('Mobile Responsive Viewports — No Horizontal Overflow', async ({ page }) => {
    const mobileViewports = [
      { width: 320, height: 600 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ];

    for (const vp of mobileViewports) {
      await page.setViewportSize(vp);
      await page.goto('/');

      // Evaluate horizontal scroll width vs viewport width
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1); // 1px rounding tolerance
    }
  });
});

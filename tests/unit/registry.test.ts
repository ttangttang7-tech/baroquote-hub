import { describe, it, expect } from 'vitest';
import { SERVICES, getServiceById, getServiceBySlug, getServicesByCategory } from '../../src/lib/registry';
import { CATEGORIES } from '../../src/lib/registry/categories';

describe('Service Registry Unit Tests', () => {
  it('should contain exactly 30 services', () => {
    expect(SERVICES).toHaveLength(30);
  });

  it('should contain exactly 6 categories', () => {
    expect(CATEGORIES).toHaveLength(6);
  });

  it('should ensure all services have unique IDs, slugs, and ruleIds', () => {
    const ids = new Set(SERVICES.map(s => s.id));
    const slugs = new Set(SERVICES.map(s => s.slug));
    const ruleIds = new Set(SERVICES.map(s => s.ruleId));

    expect(ids.size).toBe(30);
    expect(slugs.size).toBe(30);
    expect(ruleIds.size).toBe(30);
  });

  it('should find services by ID, slug, and category', () => {
    const s1 = getServiceById('01');
    expect(s1).toBeDefined();
    expect(s1?.slug).toBe('move-in-cleaning');

    const sSlug = getServiceBySlug('leak-detection');
    expect(sSlug).toBeDefined();
    expect(sSlug?.number).toBe('07');
    expect(sSlug?.id).toBe('service-07');

    const cleaningServices = getServicesByCategory('cleaning');
    expect(cleaningServices).toHaveLength(7);

    const movingServices = getServicesByCategory('moving');
    expect(movingServices).toHaveLength(5);
  });

  it('should ensure every service has price evidence and verified date', () => {
    for (const service of SERVICES) {
      expect(service.priceEvidence).toBeDefined();
      expect(service.priceEvidence?.sourceName.length).toBeGreaterThan(0);
      expect(service.priceEvidence?.conditions.length).toBeGreaterThan(0);
      expect(service.priceEvidence?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('should ensure every service has at least 4 FAQs', () => {
    for (const service of SERVICES) {
      expect(service.faqs?.length).toBeGreaterThanOrEqual(4);
      for (const faq of service.faqs || []) {
        expect(faq.question.length).toBeGreaterThan(0);
        expect(faq.answer.length).toBeGreaterThan(0);
      }
    }
  });
});

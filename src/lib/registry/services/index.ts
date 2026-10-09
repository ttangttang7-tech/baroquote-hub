import type { ServiceDefinition } from '../types';
import { CLEANING_SERVICES } from './cleaning';
import { MOVING_SERVICES } from './moving';
import { HEATING_COOLING_SERVICES } from './heatingCooling';
import { PLUMBING_SERVICES } from './plumbing';
import { INTERIOR_SERVICES } from './interior';
import { INSTALLATION_SERVICES } from './installation';

export const ALL_SERVICES: ServiceDefinition[] = [
  ...CLEANING_SERVICES,
  ...MOVING_SERVICES,
  ...HEATING_COOLING_SERVICES,
  ...PLUMBING_SERVICES,
  ...INTERIOR_SERVICES,
  ...INSTALLATION_SERVICES,
];

export const SERVICES: ServiceDefinition[] = [...ALL_SERVICES]
  .sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10))
  .map(s => ({
    ...s,
    category: s.categoryId,
    shortDescription: s.shortDesc,
    priceEvidence: {
      ...s.evidence,
      sourceName: s.evidence.provider,
      sourceType: s.evidence.reliabilityLevel === 'high' ? 'official_rate_card' : 'platform_average',
      conditions: s.evidence.notes || `${s.evidence.priceUnit} 기준, VAT ${s.evidence.vatIncluded ? '포함' : '별도'}`,
      verifiedAt: s.evidence.lastVerifiedAt,
      verified: true
    },
    faqs: s.seo.faq,
    relatedServiceIds: [],
    defaultMinAmount: s.evidence.basePrice,
    defaultMaxAmount: Math.round(s.evidence.basePrice * 1.3),
    estimateType: 'range_estimate' as const
  }));

export function getServiceBySlug(slug: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function getServiceById(idOrNumber: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.id === idOrNumber || s.number === idOrNumber || s.slug === idOrNumber);
}

export function getServicesByCategory(categoryId: string): ServiceDefinition[] {
  return SERVICES.filter((s) => s.categoryId === categoryId);
}

export function getAllSlugs(): string[] {
  return SERVICES.map((s) => s.slug);
}

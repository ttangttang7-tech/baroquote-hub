export type CategoryId =
  | 'cleaning'
  | 'moving'
  | 'heating-cooling'
  | 'plumbing'
  | 'interior'
  | 'installation';

export interface CategoryDefinition {
  id: CategoryId;
  name: string;
  slug: string;
  description: string;
  icon: string;
  serviceCount?: number;
}

export type QuestionType = 'select' | 'radio' | 'number' | 'checkbox' | 'boolean';

export interface QuestionOption {
  label: string;
  value: string;
  priceFactor?: number;
  priceDelta?: number;
  hint?: string;
}

export interface QuestionDefinition {
  id: string;
  label: string;
  type: QuestionType;
  options?: QuestionOption[];
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  helpText?: string;
  required?: boolean;
}

export type VerificationStatus = 'verified' | 'partially_verified' | 'unverified' | 'stale';

export type SourceType =
  | 'official_standard'
  | 'platform_average'
  | 'market_survey'
  | 'regulatory_guideline';

export interface PriceEvidence {
  provider: string;
  sourceUrl: string;
  basePrice: number;
  minPrice?: number;
  maxPrice?: number;
  priceUnit: string;
  vatIncluded: boolean;
  travelFeeIncluded: boolean;
  materialsIncluded: boolean;
  surveyedAt: string;
  lastVerifiedAt: string;
  verificationStatus: VerificationStatus;
  reliabilityLevel: 'high' | 'medium' | 'low';
  sourceType: SourceType;
  notes: string;
}

export interface InputSummaryItem {
  label: string;
  value: string;
}

export interface PriceBreakdownItem {
  name: string;
  amount: number;
  description?: string;
}

export interface EstimateResult {
  type: 'range_estimate' | 'quote_preparation';
  status: 'success' | 'warning';
  minPrice?: number;
  maxPrice?: number;
  formattedRange?: string;
  inputSummary: InputSummaryItem[];
  priceBreakdown: PriceBreakdownItem[];
  inclusions: string[];
  exclusions: string[];
  extraFeeWarnings: string[];
  contractorChecklist: string[];
  verificationDate: string;
  cautions: string[];
  // Compatibility properties
  serviceId?: string;
  minAmount?: number;
  maxAmount?: number;
  basis: {
    breakdown: { label: string; amount: number | string }[];
    explanation: string;
  };
  includedItems: string[];
  excludedItems: string[];
  surchargeWarnings: string[];
  checklist: string[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface SeoMetadata {
  title: string;
  description: string;
  keywords: string[];
  h1: string;
  canonicalPath: string;
  faq: FaqItem[];
}

export interface ServiceDefinition {
  id: string;
  number: string;
  title: string;
  slug: string;
  categoryId: CategoryId;
  categoryName: string;
  ruleId: string;
  shortDesc: string;
  icon: string;
  questions: QuestionDefinition[];
  evidence: PriceEvidence;
  seo: SeoMetadata;
  // Compatibility properties
  category?: CategoryId;
  shortDescription?: string;
  priceEvidence?: {
    sourceName: string;
    sourceType: string;
    conditions: string;
    verifiedAt: string;
    verified: boolean;
  } & PriceEvidence;
  faqs?: FaqItem[];
  relatedServiceIds?: string[];
  defaultMinAmount?: number;
  defaultMaxAmount?: number;
  estimateType?: 'range_estimate' | 'quote_preparation';
}

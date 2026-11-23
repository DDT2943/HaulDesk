import type { ProductCategory, ProductItem } from '../types/haul';
import { cnyToEur, DEFAULT_CNY_TO_EUR_RATE } from './haulLogic';

export type SuperbuyGoodsCategory = 'ordinary' | 'common_brand' | 'international_brand';

export interface SuperbuyGoodsCategoryMeta {
  id: SuperbuyGoodsCategory;
  label: string;
  superbuyLimitId: number;
  description: string;
}

export const SUPERBUY_GOODS_CATEGORIES: SuperbuyGoodsCategoryMeta[] = [
  {
    id: 'ordinary',
    label: 'Ordinary Goods (No Brand)',
    superbuyLimitId: 0,
    description: 'Unbranded apparel or goods without registered trademarks',
  },
  {
    id: 'common_brand',
    label: 'Common Brands',
    superbuyLimitId: 49,
    description: 'Standard branded apparel, footwear, or accessories',
  },
  {
    id: 'international_brand',
    label: 'International Brands',
    superbuyLimitId: 4,
    description: 'Designer brands, popular sneakers, or official team jerseys',
  },
];

export const CATEGORY_ESTIMATED_WEIGHT_G: Record<ProductCategory, number> = {
  Felpa: 780,
  Giubbini: 1150,
  Maglietta: 280,
  'Maglietta da calcio': 240,
  Pantaloni: 620,
  Scarpe: 1050,
  Borse: 680,
  Cappellini: 140,
  Cinture: 260,
  Accessori: 220,
};

export const SHOEBOX_WEIGHT_G = 320;
export const PACKAGING_BOX_WEIGHT_G = 260;

export interface SuperbuyShippingLine {
  id: string;
  name: string;
  serviceType: 'Tax-Free Air' | 'Express Postal' | 'Economy Postal';
  transitDays: string;
  taxIncluded: boolean;
  firstWeightG: number;
  firstCostCny: number;
  continuedStepG: number;
  continuedCostCny: number;
  customsFeeCny: number;
  volumetricDivisor: number | null; // null = solo peso effettivo (Actual Weight)
  maxWeightG: number;
  supportedGoods: SuperbuyGoodsCategory[];
  recommended?: boolean;
  note: string;
}

/**
 * Tariffe strutturate sul modello ufficiale del calcolatore Superbuy per Italia
 * (Guangdong Warehouse -> Italy areaId 24):
 * First Weight + Continued Weight Step + Customs Fee + Volumetric Divisor (/6000)
 */
export const SUPERBUY_ITALY_LINES: SuperbuyShippingLine[] = [
  {
    id: 'eu-duty-free-air-b',
    name: 'Europe Duty-Free Air Cargo-B',
    serviceType: 'Tax-Free Air',
    transitDays: '8–14 days',
    taxIncluded: true,
    firstWeightG: 500,
    firstCostCny: 138,
    continuedStepG: 500,
    continuedCostCny: 54,
    customsFeeCny: 12,
    volumetricDivisor: 6000,
    maxWeightG: 10000,
    supportedGoods: ['ordinary', 'common_brand', 'international_brand'],
    recommended: true,
    note: 'EU triangular routing with prepaid customs clearance. Recommended for EU.',
  },
  {
    id: 'eu-dhl-duty-free-actual',
    name: 'Europe DHL Duty-Free (Actual Weight)',
    serviceType: 'Tax-Free Air',
    transitDays: '7–12 days',
    taxIncluded: true,
    firstWeightG: 500,
    firstCostCny: 162,
    continuedStepG: 500,
    continuedCostCny: 58,
    customsFeeCny: 15,
    volumetricDivisor: null,
    maxWeightG: 10000,
    supportedGoods: ['ordinary', 'common_brand', 'international_brand'],
    note: 'Billed strictly on actual weight, ideal for bulky boxes or puffers.',
  },
  {
    id: 'eu-duty-free-preferential',
    name: 'EU & US Duty-Free Preferential Air',
    serviceType: 'Tax-Free Air',
    transitDays: '10–16 days',
    taxIncluded: true,
    firstWeightG: 500,
    firstCostCny: 128,
    continuedStepG: 500,
    continuedCostCny: 49,
    customsFeeCny: 10,
    volumetricDivisor: 6000,
    maxWeightG: 8000,
    supportedGoods: ['ordinary', 'common_brand'],
    note: 'Cost-effective rate up to 8 kg for ordinary goods and common brands.',
  },
  {
    id: 'ems-preferential',
    name: 'EMS Preferential Line-HZ',
    serviceType: 'Express Postal',
    transitDays: '10–20 days',
    taxIncluded: false,
    firstWeightG: 500,
    firstCostCny: 155,
    continuedStepG: 500,
    continuedCostCny: 48,
    customsFeeCny: 12,
    volumetricDivisor: 6000,
    maxWeightG: 20000,
    supportedGoods: ['ordinary', 'common_brand', 'international_brand'],
    note: 'Delivered via national postal service; duties/VAT may apply upon arrival.',
  },
  {
    id: 'eub-small-parcel',
    name: 'EUB (China Post Small Parcel)',
    serviceType: 'Economy Postal',
    transitDays: '15–30 days',
    taxIncluded: false,
    firstWeightG: 100,
    firstCostCny: 42,
    continuedStepG: 100,
    continuedCostCny: 10.5,
    customsFeeCny: 8,
    volumetricDivisor: null,
    maxWeightG: 2000,
    supportedGoods: ['ordinary', 'common_brand'],
    note: 'Small parcels up to 2,000 g only, billed in 100 g increments.',
  },
  {
    id: 'china-post-sal',
    name: 'China Post SAL',
    serviceType: 'Economy Postal',
    transitDays: '25–50 days',
    taxIncluded: false,
    firstWeightG: 1000,
    firstCostCny: 145,
    continuedStepG: 1000,
    continuedCostCny: 52,
    customsFeeCny: 8,
    volumetricDivisor: null,
    maxWeightG: 20000,
    supportedGoods: ['ordinary'],
    note: 'Budget economy line for heavy unbranded parcels.',
  },
];

export interface ParcelDimensionsEstimate {
  actualWeightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  shoesCount: number;
}

export function estimateParcelFromItems(
  items: ProductItem[],
  removeShoeBoxes = true,
  customWeights?: Partial<Record<ProductCategory, number>>
): ParcelDimensionsEstimate {
  if (items.length === 0) {
    return {
      actualWeightG: 0,
      lengthCm: 30,
      widthCm: 22,
      heightCm: 12,
      shoesCount: 0,
    };
  }

  let itemsWeight = 0;
  let shoesCount = 0;
  let volumeCm3 = 3500;

  for (const item of items) {
    const customWeight = customWeights?.[item.category];
    let baseW =
      typeof customWeight === 'number' && Number.isFinite(customWeight) && customWeight > 0
        ? Math.round(customWeight)
        : (CATEGORY_ESTIMATED_WEIGHT_G[item.category] ?? 450);

    if (item.category === 'Scarpe') {
      shoesCount += 1;
      if (removeShoeBoxes) {
        baseW = Math.max(400, baseW - SHOEBOX_WEIGHT_G);
      }
      volumeCm3 += removeShoeBoxes ? 4200 : 7500;
    } else if (item.category === 'Giubbini') {
      volumeCm3 += 4200;
    } else if (item.category === 'Felpa') {
      volumeCm3 += 3200;
    } else if (item.category === 'Borse') {
      volumeCm3 += 3200;
    } else if (item.category === 'Pantaloni') {
      volumeCm3 += 2400;
    } else if (item.category === 'Cappellini') {
      volumeCm3 += 1000;
    } else if (item.category === 'Cinture') {
      volumeCm3 += 900;
    } else {
      volumeCm3 += 1400;
    }
    itemsWeight += baseW;
  }

  const actualWeightG = itemsWeight + PACKAGING_BOX_WEIGHT_G;
  // Derive realistic carton proportions from total packed volume
  const cubeSide = Math.cbrt(volumeCm3);
  const lengthCm = Math.max(24, Math.round(cubeSide * 1.35));
  const widthCm = Math.max(18, Math.round(cubeSide * 0.98));
  const heightCm = Math.max(12, Math.round(volumeCm3 / (lengthCm * widthCm)));

  return {
    actualWeightG,
    lengthCm,
    widthCm,
    heightCm,
    shoesCount,
  };
}

export function calculateVolumetricWeightG(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  divisor: number
): number {
  if (
    !Number.isFinite(lengthCm) ||
    !Number.isFinite(widthCm) ||
    !Number.isFinite(heightCm) ||
    lengthCm <= 0 ||
    widthCm <= 0 ||
    heightCm <= 0 ||
    divisor <= 0
  ) {
    return 0;
  }
  return Math.ceil(((lengthCm * widthCm * heightCm) / divisor) * 1000);
}

export interface ShippingQuoteInput {
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  goodsCategory: SuperbuyGoodsCategory;
  exchangeRate?: number;
}

export interface ShippingQuote {
  line: SuperbuyShippingLine;
  available: boolean;
  unavailableReason: string | null;
  chargeableWeightG: number;
  usedVolumetricWeight: boolean;
  volumetricWeightG: number;
  firstCostCny: number;
  continuedCostCny: number;
  customsFeeCny: number;
  totalCny: number;
  totalEur: number;
}

export function calculateSuperbuyQuotes(input: ShippingQuoteInput): ShippingQuote[] {
  const rate =
    input.exchangeRate && input.exchangeRate > 0
      ? input.exchangeRate
      : DEFAULT_CNY_TO_EUR_RATE;
  const safeWeightG = Math.max(0, Math.round(input.weightG));

  return SUPERBUY_ITALY_LINES.map((line) => {
    const volumetricWeightG = line.volumetricDivisor
      ? calculateVolumetricWeightG(
          input.lengthCm,
          input.widthCm,
          input.heightCm,
          line.volumetricDivisor
        )
      : 0;

    const usedVolumetricWeight =
      Boolean(line.volumetricDivisor) && volumetricWeightG > safeWeightG;
    const chargeableWeightG = usedVolumetricWeight ? volumetricWeightG : safeWeightG;

    let unavailableReason: string | null = null;
    if (safeWeightG <= 0) {
      unavailableReason = 'Enter a parcel weight greater than 0 g.';
    } else if (!line.supportedGoods.includes(input.goodsCategory)) {
      unavailableReason = 'Does not support this brand restriction category.';
    } else if (chargeableWeightG > line.maxWeightG) {
      unavailableReason = `Exceeds maximum weight limit of ${(line.maxWeightG / 1000).toFixed(0)} kg.`;
    }

    const extraWeightG = Math.max(0, chargeableWeightG - line.firstWeightG);
    const continuedUnits =
      extraWeightG > 0 ? Math.ceil(extraWeightG / line.continuedStepG) : 0;
    const continuedCostCny =
      Math.round(continuedUnits * line.continuedCostCny * 100) / 100;
    const totalCny =
      safeWeightG > 0
        ? Math.round((line.firstCostCny + continuedCostCny + line.customsFeeCny) * 100) /
          100
        : 0;

    return {
      line,
      available: unavailableReason === null,
      unavailableReason,
      chargeableWeightG,
      usedVolumetricWeight,
      volumetricWeightG,
      firstCostCny: line.firstCostCny,
      continuedCostCny,
      customsFeeCny: line.customsFeeCny,
      totalCny,
      totalEur: cnyToEur(totalCny, rate),
    };
  }).sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.totalCny - b.totalCny;
  });
}

export function buildSuperbuyCalculatorUrl(input: ShippingQuoteInput): string {
  const goodsMeta = SUPERBUY_GOODS_CATEGORIES.find(
    (g) => g.id === input.goodsCategory
  );
  const params = new URLSearchParams({
    tabIndex: '0',
    areaId: '24', // Italy
    warehouseId: '1', // Guangdong Warehouse
    weight: String(Math.max(100, Math.round(input.weightG))),
    length: String(Math.max(10, Math.round(input.lengthCm))),
    width: String(Math.max(10, Math.round(input.widthCm))),
    height: String(Math.max(10, Math.round(input.heightCm))),
    limitIds: String(goodsMeta?.superbuyLimitId ?? 49),
  });
  return `https://www.superbuy.com/en/page/query/freight/?${params.toString()}`;
}

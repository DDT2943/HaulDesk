import type { ProductCategory } from '../types/haul.ts';

export type OutfitBackdropId = 'studio-light' | 'pure-white' | 'warm-cream' | 'studio-dark';

export interface OutfitBackdropPreset {
  id: OutfitBackdropId;
  label: string;
  canvasBg: string;
  isDark: boolean;
  swatchClass: string;
}

export const OUTFIT_BACKDROPS: OutfitBackdropPreset[] = [
  {
    id: 'studio-light',
    label: 'Studio Gray',
    canvasBg: '#F4F4F1',
    isDark: false,
    swatchClass: 'bg-[#F4F4F1] border-[#D6D6CF]',
  },
  {
    id: 'pure-white',
    label: 'Pure White',
    canvasBg: '#FFFFFF',
    isDark: false,
    swatchClass: 'bg-white border-[#D6D6CF]',
  },
  {
    id: 'warm-cream',
    label: 'Warm Cream',
    canvasBg: '#F3EDE2',
    isDark: false,
    swatchClass: 'bg-[#F3EDE2] border-[#DED3C0]',
  },
  {
    id: 'studio-dark',
    label: 'Studio Dark',
    canvasBg: '#161614',
    isDark: true,
    swatchClass: 'bg-[#161614] border-[#343430]',
  },
];

export interface OutfitLayerPlacement {
  xPct: number;
  yPct: number;
  scale: number;
  zIndex: number;
}

const SLOT_GROUP_BY_CATEGORY: Record<ProductCategory, string> = {
  Cappellini: 'head',
  Giubbini: 'top',
  Felpa: 'top',
  Maglietta: 'top',
  'Maglietta da calcio': 'top',
  Pantaloni: 'bottom',
  Scarpe: 'shoes',
  Borse: 'bag',
  Cinture: 'belt',
  Accessori: 'acc',
};

const BASE_PLACEMENT_BY_CATEGORY: Record<ProductCategory, OutfitLayerPlacement> = {
  Cappellini: { xPct: 50, yPct: 14, scale: 0.56, zIndex: 40 },
  Giubbini: { xPct: 48, yPct: 36, scale: 1.0, zIndex: 25 },
  Felpa: { xPct: 49, yPct: 36, scale: 0.96, zIndex: 24 },
  Maglietta: { xPct: 52, yPct: 37, scale: 0.88, zIndex: 23 },
  'Maglietta da calcio': { xPct: 52, yPct: 37, scale: 0.9, zIndex: 23 },
  Pantaloni: { xPct: 50, yPct: 65, scale: 0.96, zIndex: 20 },
  Scarpe: { xPct: 52, yPct: 86, scale: 0.68, zIndex: 32 },
  Borse: { xPct: 80, yPct: 44, scale: 0.62, zIndex: 35 },
  Cinture: { xPct: 23, yPct: 54, scale: 0.52, zIndex: 38 },
  Accessori: { xPct: 21, yPct: 28, scale: 0.48, zIndex: 42 },
};

export function clampOutfitPercentage(value: number, min = 8, max = 92): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(min, Math.min(max, Math.round(value * 10) / 10));
}

export function clampOutfitScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.4, Math.min(1.65, Math.round(value * 100) / 100));
}

export function computeFlatlayPlacements(
  categories: ProductCategory[]
): OutfitLayerPlacement[] {
  const slotTotals = new Map<string, number>();
  for (const cat of categories) {
    const slot = SLOT_GROUP_BY_CATEGORY[cat] ?? 'acc';
    slotTotals.set(slot, (slotTotals.get(slot) ?? 0) + 1);
  }

  const slotSeen = new Map<string, number>();

  return categories.map((cat) => {
    const base = BASE_PLACEMENT_BY_CATEGORY[cat] ?? BASE_PLACEMENT_BY_CATEGORY.Accessori;
    const slot = SLOT_GROUP_BY_CATEGORY[cat] ?? 'acc';
    const indexInSlot = slotSeen.get(slot) ?? 0;
    slotSeen.set(slot, indexInSlot + 1);

    const countInSlot = slotTotals.get(slot) ?? 1;
    if (countInSlot === 1) {
      return { ...base };
    }

    const centeredOffset = indexInSlot - (countInSlot - 1) / 2;
    const xStep = slot === 'top' || slot === 'bottom' ? 18 : 15;
    const yStep = slot === 'top' ? 3 : 2;
    const scaleFactor = countInSlot >= 3 ? 0.82 : 0.9;

    return {
      xPct: clampOutfitPercentage(base.xPct + centeredOffset * xStep, 14, 86),
      yPct: clampOutfitPercentage(base.yPct + (indexInSlot % 2 === 0 ? -yStep : yStep), 12, 88),
      scale: clampOutfitScale(base.scale * scaleFactor),
      zIndex: base.zIndex + indexInSlot,
    };
  });
}

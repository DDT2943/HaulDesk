export type ProductCategory =
  | 'Felpa'
  | 'Giubbini'
  | 'Maglietta'
  | 'Maglietta da calcio'
  | 'Pantaloni'
  | 'Scarpe'
  | 'Borse'
  | 'Cappellini'
  | 'Cinture'
  | 'Accessori';

export interface CategoryMeta {
  id: ProductCategory;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}

export const PRODUCT_CATEGORIES: CategoryMeta[] = [
  {
    id: 'Felpa',
    label: 'Hoodies & Knitwear',
    shortLabel: 'Hoodies',
    color: '#E11D48',
    description: 'Hoodies, zip-ups, crewnecks, and sweaters',
  },
  {
    id: 'Giubbini',
    label: 'Jackets & Coats',
    shortLabel: 'Jackets',
    color: '#0EA5E9',
    description: 'Puffers, bombers, trench coats, and outerwear',
  },
  {
    id: 'Maglietta',
    label: 'T-Shirts',
    shortLabel: 'T-Shirts',
    color: '#2563EB',
    description: 'Casual tees, boxy fits, polos, and long sleeves',
  },
  {
    id: 'Maglietta da calcio',
    label: 'Football Jerseys',
    shortLabel: 'Jerseys',
    color: '#16A34A',
    description: 'Match kits, retro jerseys, training tops, and national teams',
  },
  {
    id: 'Pantaloni',
    label: 'Pants & Shorts',
    shortLabel: 'Pants',
    color: '#D97706',
    description: 'Cargo pants, denim, sweatpants, and shorts',
  },
  {
    id: 'Scarpe',
    label: 'Shoes',
    shortLabel: 'Shoes',
    color: '#7C3AED',
    description: 'Sneakers, runners, boots, and slides',
  },
  {
    id: 'Borse',
    label: 'Bags',
    shortLabel: 'Bags',
    color: '#9333EA',
    description: 'Crossbody bags, backpacks, duffels, and totes',
  },
  {
    id: 'Cappellini',
    label: 'Hats & Caps',
    shortLabel: 'Hats',
    color: '#EA580C',
    description: 'Baseball caps, beanies, and bucket hats',
  },
  {
    id: 'Cinture',
    label: 'Belts',
    shortLabel: 'Belts',
    color: '#65A30D',
    description: 'Leather belts, statement buckles, and woven straps',
  },
  {
    id: 'Accessori',
    label: 'Accessories',
    shortLabel: 'Accessories',
    color: '#475569',
    description: 'Eyewear, socks, wallets, jewelry, and small goods',
  },
];

const CATEGORY_META_MAP = new Map<string, CategoryMeta>(
  PRODUCT_CATEGORIES.map((c) => [c.id, c])
);

export function getCategoryLabel(category: ProductCategory | string): string {
  return CATEGORY_META_MAP.get(category)?.label ?? String(category);
}

export function getCategoryShortLabel(category: ProductCategory | string): string {
  return CATEGORY_META_MAP.get(category)?.shortLabel ?? String(category);
}

export type SourcePlatform = 'yupoo' | 'taobao' | 'weidian' | '1688' | 'superbuy' | 'altro';

export type OrderStatus = 'open' | 'concluded';

export type TrackingMilestone =
  | 'in_preparazione'
  | 'magazzino_cina'
  | 'in_transito'
  | 'dogana_ue'
  | 'in_consegna'
  | 'consegnato';

export interface TrackingEvent {
  id: string;
  milestone: TrackingMilestone;
  location: string;
  description: string;
  timestamp: string;
}

export interface ProductItem {
  id: string;
  orderId: string;
  title: string;
  category: ProductCategory;
  categoryConfidence: 'alta' | 'media' | 'bassa' | 'manuale';
  needsCategoryConfirmation: boolean;
  priceCny: number;
  link: string;
  platform: SourcePlatform;
  vendor: string;
  sizeNote: string;
  imageUrl: string;
  imageUrls?: string[];
  detectedDetails?: string;
  rating?: number;
  createdAt: string;
  savedAt?: string;
}

export interface HaulOrder {
  id: string;
  title: string;
  status: OrderStatus;
  createdAt: string;
  concludedAt: string | null;
  agentNote: string;
  exchangeRate: number;
  trackingNumber?: string;
  shippingLine?: string;
  trackingStatus?: TrackingMilestone;
  trackingEvents?: TrackingEvent[];
  trackingUpdatedAt?: string | null;
  trackingCarrier?: string;
  trackingLiveSource?: 'live_api' | 'manual';
  trackingLastSyncMessage?: string;
}

export interface ProductDraftInput {
  orderId: string;
  title: string;
  category: ProductCategory | '';
  priceCny: string | number;
  link: string;
  vendor: string;
  sizeNote?: string;
  imageUrl?: string;
  imageUrls?: string[];
  categoryConfidence?: 'alta' | 'media' | 'bassa' | 'manuale';
  needsCategoryConfirmation?: boolean;
  detectedDetails?: string;
}

export interface AnalyzeProductResult {
  title: string;
  suggestedCategory: ProductCategory | null;
  confidence: 'alta' | 'media' | 'bassa';
  needsUserConfirmation: boolean;
  detectedColor: string;
  detectedDetails: string;
  mode: 'gemini' | 'fallback';
  message?: string;
  disabled?: boolean;
}

export interface HaulDatabaseState {
  orders: HaulOrder[];
  items: ProductItem[];
  savedItems?: ProductItem[];
  trashOrders?: HaulOrder[];
  trashItems?: ProductItem[];
  estimatedExchangeRate?: number;
}

export interface HaulBackupData {
  format: 'hauldesk-full-backup';
  version: number;
  exportedAt: string;
  estimatedExchangeRate?: number;
  categories?: {
    id: ProductCategory;
    label: string;
    shortLabel: string;
    color: string;
    description: string;
  }[];
  stats: {
    totalOrders: number;
    openOrders: number;
    concludedOrders: number;
    totalItems: number;
    savedItemsCount?: number;
    totalPhotos: number;
    byCategory?: Record<ProductCategory, number>;
  };
  orders: HaulOrder[];
  items: ProductItem[];
  savedItems?: ProductItem[];
}


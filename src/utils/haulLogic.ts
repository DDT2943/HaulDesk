import {
  getCategoryLabel,
  PRODUCT_CATEGORIES,
  type HaulBackupData,
  type HaulDatabaseState,
  type HaulOrder,
  type ProductCategory,
  type ProductDraftInput,
  type ProductItem,
  type SourcePlatform,
  type TrackingMilestone,
} from '../types/haul.ts';

export const DEFAULT_CNY_TO_EUR_RATE = 0.13;

export type DisplayCurrencyCode = 'EUR' | 'USD' | 'GBP' | 'JPY' | 'INR' | 'CNY';

export interface CurrencyMeta {
  code: DisplayCurrencyCode;
  symbol: string;
  name: string;
  ratePerUsd: number;
  decimals: number;
}

export const DISPLAY_CURRENCIES: CurrencyMeta[] = [
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', ratePerUsd: 7.08, decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', ratePerUsd: 0.92, decimals: 2 },
  { code: 'USD', symbol: '$', name: 'US Dollar', ratePerUsd: 1, decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', ratePerUsd: 0.79, decimals: 2 },
  { code: 'JPY', symbol: 'JP¥', name: 'Japanese Yen', ratePerUsd: 150.2, decimals: 0 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', ratePerUsd: 83.12, decimals: 2 },
];

const DISPLAY_CURRENCY_MAP = new Map<DisplayCurrencyCode, CurrencyMeta>(
  DISPLAY_CURRENCIES.map((c) => [c.code, c])
);

export function isDisplayCurrencyCode(code: string): code is DisplayCurrencyCode {
  return DISPLAY_CURRENCY_MAP.has(code as DisplayCurrencyCode);
}

export function getCurrencyMeta(code: DisplayCurrencyCode | string = 'EUR'): CurrencyMeta {
  return (
    DISPLAY_CURRENCY_MAP.get(code as DisplayCurrencyCode) ??
    DISPLAY_CURRENCY_MAP.get('EUR')!
  );
}

export function getCurrenciesWithEstimatedRate(
  estimatedRate = DEFAULT_CNY_TO_EUR_RATE
): CurrencyMeta[] {
  const safeRate =
    Number.isFinite(estimatedRate) && estimatedRate > 0 ? estimatedRate : DEFAULT_CNY_TO_EUR_RATE;
  const eurRatePerUsd = 0.92;
  const cnyRatePerUsd = Math.round((eurRatePerUsd / safeRate) * 10000) / 10000;
  return DISPLAY_CURRENCIES.map((c) => {
    if (c.code === 'CNY') {
      return { ...c, ratePerUsd: cnyRatePerUsd };
    }
    return c;
  });
}

export const PLATFORM_LABELS: Record<SourcePlatform, string> = {
  yupoo: 'Yupoo',
  taobao: 'Taobao',
  weidian: 'Weidian',
  '1688': '1688',
  superbuy: 'Superbuy',
  altro: 'External Link',
};

export function detectPlatformFromUrl(rawUrl: string): SourcePlatform {
  const normalized = rawUrl.trim().toLowerCase();
  if (!normalized) return 'altro';
  if (normalized.includes('yupoo.com')) return 'yupoo';
  if (normalized.includes('taobao.com') || normalized.includes('tb.cn') || normalized.includes('tmall.com')) {
    return 'taobao';
  }
  if (normalized.includes('weidian.com')) return 'weidian';
  if (normalized.includes('1688.com')) return '1688';
  if (normalized.includes('superbuy.com')) return 'superbuy';
  return 'altro';
}

export function extractVendorHintFromUrl(rawUrl: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(rawUrl.trim())
      ? rawUrl.trim()
      : `https://${rawUrl.trim()}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();

    // Common pattern: <vendor>.x.yupoo.com or <vendor>.yupoo.com
    if (host.endsWith('.yupoo.com')) {
      const parts = host.split('.');
      const subdomain = parts[0];
      if (subdomain && subdomain !== 'x' && subdomain !== 'www' && subdomain !== 'photo') {
        return subdomain
          .split(/[-_]/g)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function isValidHttpUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function cnyToEur(priceCny: number, exchangeRate = DEFAULT_CNY_TO_EUR_RATE): number {
  if (!Number.isFinite(priceCny) || priceCny < 0) return 0;
  const safeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : DEFAULT_CNY_TO_EUR_RATE;
  return Math.round(priceCny * safeRate * 100) / 100;
}

export function convertEurToCurrency(
  amountEur: number,
  targetCurrency: DisplayCurrencyCode = 'EUR'
): number {
  if (!Number.isFinite(amountEur) || amountEur < 0) return 0;
  if (targetCurrency === 'EUR') {
    return Math.round(amountEur * 100) / 100;
  }
  const eurMeta = getCurrencyMeta('EUR');
  const targetMeta = getCurrencyMeta(targetCurrency);
  const raw = amountEur * (targetMeta.ratePerUsd / eurMeta.ratePerUsd);
  return targetMeta.decimals === 0
    ? Math.round(raw)
    : Math.round(raw * 100) / 100;
}

export function convertCnyToCurrency(
  priceCny: number,
  orderExchangeRate = DEFAULT_CNY_TO_EUR_RATE,
  targetCurrency: DisplayCurrencyCode = 'EUR'
): number {
  if (!Number.isFinite(priceCny) || priceCny < 0) return 0;
  if (targetCurrency === 'CNY') {
    return Math.round(priceCny * 100) / 100;
  }
  const eurAmount = cnyToEur(priceCny, orderExchangeRate);
  if (targetCurrency === 'EUR') return eurAmount;
  return convertEurToCurrency(eurAmount, targetCurrency);
}

export function formatCny(amount: number): string {
  return `¥${amount.toLocaleString('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatEur(amount: number): string {
  return `€${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCurrency(
  amount: number,
  currencyCode: DisplayCurrencyCode = 'EUR'
): string {
  const meta = getCurrencyMeta(currencyCode);
  return `${meta.symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  })}`;
}

function formatEurRateDigits(rate: number): string {
  const rounded = Math.round(rate * 10000) / 10000;
  const raw = rounded.toString();
  const [, dec = ''] = raw.split('.');
  if (dec.length <= 2) return rounded.toFixed(2);
  return raw;
}

export function formatExchangeRateLabel(
  orderExchangeRate = DEFAULT_CNY_TO_EUR_RATE,
  targetCurrency: DisplayCurrencyCode = 'EUR'
): string {
  const safeRate =
    Number.isFinite(orderExchangeRate) && orderExchangeRate > 0
      ? orderExchangeRate
      : DEFAULT_CNY_TO_EUR_RATE;
  const meta = getCurrencyMeta(targetCurrency);
  if (targetCurrency === 'EUR') {
    return `1 ¥ = €${formatEurRateDigits(safeRate)}`;
  }
  if (targetCurrency === 'CNY') {
    return '1 ¥ = ¥1.00';
  }
  const eurMeta = getCurrencyMeta('EUR');
  const converted = safeRate * (meta.ratePerUsd / eurMeta.ratePerUsd);
  return `1 ¥ = ${meta.symbol}${converted.toFixed(meta.decimals)}`;
}

export function canModifyOrder(order: HaulOrder | undefined | null): boolean {
  return Boolean(order && order.status === 'open');
}

export interface CategoryBreakdown {
  category: ProductCategory;
  color: string;
  count: number;
  totalCny: number;
  totalEur: number;
  sharePercent: number;
}

export interface VendorGroup {
  vendor: string;
  items: ProductItem[];
  itemCount: number;
  totalCny: number;
  totalEur: number;
  platforms: SourcePlatform[];
  averageRating: number | null;
  ratedItemCount: number;
}

export interface OrderSummaryMetrics {
  itemCount: number;
  totalCny: number;
  totalEur: number;
  uniqueVendors: number;
  byCategory: CategoryBreakdown[];
  byVendor: VendorGroup[];
}

export function normalizeProductRating(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const rounded = Math.round(raw);
  if (rounded < 1 || rounded > 5) return undefined;
  return rounded;
}

export function groupItemsByVendor(
  items: ProductItem[],
  exchangeRate = DEFAULT_CNY_TO_EUR_RATE
): VendorGroup[] {
  const map = new Map<string, ProductItem[]>();
  for (const item of items) {
    const vendorKey = item.vendor.trim() || 'Unknown Vendor';
    const existing = map.get(vendorKey);
    if (existing) {
      existing.push(item);
    } else {
      map.set(vendorKey, [item]);
    }
  }

  const groups: VendorGroup[] = [];
  for (const [vendor, vendorItems] of map.entries()) {
    const totalCny = Math.round(vendorItems.reduce((sum, it) => sum + it.priceCny, 0) * 100) / 100;
    const platforms = Array.from(new Set(vendorItems.map((it) => it.platform)));
    const ratings = vendorItems
      .map((it) => normalizeProductRating(it.rating))
      .filter((r): r is number => r !== undefined);
    const ratedItemCount = ratings.length;
    const averageRating =
      ratedItemCount > 0
        ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratedItemCount) * 10) / 10
        : null;
    groups.push({
      vendor,
      items: vendorItems,
      itemCount: vendorItems.length,
      totalCny,
      totalEur: cnyToEur(totalCny, exchangeRate),
      platforms,
      averageRating,
      ratedItemCount,
    });
  }

  return groups.sort((a, b) => b.totalCny - a.totalCny || a.vendor.localeCompare(b.vendor, 'en'));
}

export function calculateOrderTotals(
  items: ProductItem[],
  exchangeRate = DEFAULT_CNY_TO_EUR_RATE
): OrderSummaryMetrics {
  const totalCny = Math.round(items.reduce((sum, it) => sum + it.priceCny, 0) * 100) / 100;
  const totalEur = cnyToEur(totalCny, exchangeRate);
  const byVendor = groupItemsByVendor(items, exchangeRate);

  const byCategory: CategoryBreakdown[] = PRODUCT_CATEGORIES.map((cat) => {
    const catItems = items.filter((it) => it.category === cat.id);
    const catCny = Math.round(catItems.reduce((sum, it) => sum + it.priceCny, 0) * 100) / 100;
    return {
      category: cat.id,
      color: cat.color,
      count: catItems.length,
      totalCny: catCny,
      totalEur: cnyToEur(catCny, exchangeRate),
      sharePercent: totalCny > 0 ? Math.round((catCny / totalCny) * 100) : 0,
    };
  });

  return {
    itemCount: items.length,
    totalCny,
    totalEur,
    uniqueVendors: byVendor.length,
    byCategory,
    byVendor,
  };
}

export function filterItems(
  items: ProductItem[],
  options: {
    search?: string;
    category?: ProductCategory | 'All' | 'Tutte';
    vendor?: string | 'All' | 'Tutti';
  }
): ProductItem[] {
  const searchNorm = (options.search ?? '').trim().toLowerCase();
  const catFilter = options.category ?? 'All';
  const vendorFilter = options.vendor ?? 'All';

  return items.filter((item) => {
    if (catFilter !== 'All' && catFilter !== 'Tutte' && item.category !== catFilter) return false;
    if (
      vendorFilter !== 'All' &&
      vendorFilter !== 'Tutti' &&
      item.vendor.toLowerCase() !== vendorFilter.toLowerCase()
    ) {
      return false;
    }
    if (searchNorm) {
      const catLabel = getCategoryLabel(item.category);
      const haystack = `${item.title} ${item.vendor} ${item.category} ${catLabel} ${item.sizeNote} ${item.platform}`.toLowerCase();
      if (!haystack.includes(searchNorm)) return false;
    }
    return true;
  });
}

export interface ValidationErrors {
  title?: string;
  category?: string;
  priceCny?: string;
  link?: string;
  vendor?: string;
}

export function validateProductDraft(input: ProductDraftInput): {
  valid: boolean;
  errors: ValidationErrors;
} {
  const errors: ValidationErrors = {};

  if (!input.title.trim()) {
    errors.title = 'Please enter a product name or description.';
  }

  const validCategoryIds = PRODUCT_CATEGORIES.map((c) => c.id);
  if (!input.category || !validCategoryIds.includes(input.category as ProductCategory)) {
    errors.category = 'Please select a product category.';
  }

  const parsedPrice = typeof input.priceCny === 'number' ? input.priceCny : Number(String(input.priceCny).replace(',', '.'));
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    errors.priceCny = 'Please enter a valid price greater than 0 in ¥ CNY.';
  }

  if (input.link.trim() && !isValidHttpUrl(input.link)) {
    errors.link = 'Please enter a valid Yupoo, Taobao, Weidian, or Superbuy URL.';
  }

  if (!input.vendor.trim()) {
    errors.vendor = 'Please enter the vendor or store name.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateOrderTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return 'Please enter a name to create the new order.';
  if (trimmed.length < 2) return 'Order name must be at least 2 characters.';
  return null;
}

export function extractUniqueVendors(items: ProductItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const v = item.vendor.trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'en'));
}

export function formatShortDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

export const formatShortItalianDate = formatShortDate;

export interface TrackingMilestoneMeta {
  id: TrackingMilestone;
  label: string;
  shortLabel: string;
  defaultLocation: string;
  defaultDescription: string;
}

export const TRACKING_MILESTONES: TrackingMilestoneMeta[] = [
  {
    id: 'in_preparazione',
    label: 'Preparing',
    shortLabel: 'Prep',
    defaultLocation: 'Superbuy Guangdong',
    defaultDescription: 'Items being consolidated and packed.',
  },
  {
    id: 'magazzino_cina',
    label: 'Dispatched to Carrier',
    shortLabel: 'Dispatched',
    defaultLocation: 'Shenzhen / HK Hub',
    defaultDescription: 'Parcel picked up by the international carrier.',
  },
  {
    id: 'in_transito',
    label: 'In Transit (Air)',
    shortLabel: 'In Flight',
    defaultLocation: 'International Transit',
    defaultDescription: 'Shipment en route to destination sorting hub.',
  },
  {
    id: 'dogana_ue',
    label: 'Customs Clearance',
    shortLabel: 'Customs',
    defaultLocation: 'Destination Customs Hub',
    defaultDescription: 'Customs clearance completed, forwarding to local courier.',
  },
  {
    id: 'in_consegna',
    label: 'Out for Delivery',
    shortLabel: 'Delivery',
    defaultLocation: 'Local Delivery Hub',
    defaultDescription: 'Handed over to local courier for final delivery.',
  },
  {
    id: 'consegnato',
    label: 'Delivered',
    shortLabel: 'Delivered',
    defaultLocation: 'Destination',
    defaultDescription: 'Parcel delivered to recipient.',
  },
];

export function getTrackingStepIndex(milestone?: TrackingMilestone): number {
  const idx = TRACKING_MILESTONES.findIndex((m) => m.id === milestone);
  return idx >= 0 ? idx : 0;
}

export function buildExternalTrackingUrls(trackingNumber: string): {
  seventeenTrack: string;
  parcelsApp: string;
  cainiao: string;
} {
  const cleaned = encodeURIComponent(trackingNumber.trim());
  return {
    seventeenTrack: `https://t.17track.net/en#nums=${cleaned}`,
    parcelsApp: `https://parcelsapp.com/en/tracking/${cleaned}`,
    cainiao: `https://global.cainiao.com/newDetail.htm?mailNoList=${cleaned}`,
  };
}

export function getItemImages(item: {
  imageUrl?: string;
  imageUrls?: string[];
}): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const pushUnique = (val?: string) => {
    const trimmed = (val ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  };
  pushUnique(item.imageUrl);
  if (Array.isArray(item.imageUrls)) {
    for (const u of item.imageUrls) {
      pushUnique(u);
    }
  }
  return result;
}

export function detectCarrierFromTrackingNumber(trackingNumber: string): string {
  const code = trackingNumber.trim().toUpperCase();
  if (!code) return 'Not specified';
  if (/^YT\d+/.test(code)) return 'YunExpress / DHL Europe';
  if (/^(LD|LV|LX|EB|EV|CP|EA|EE|RR)\d+CN$/.test(code)) return 'China Post / ePacket / EMS';
  if (/^(LP|CA|CN)\d+/.test(code)) return 'Cainiao Global';
  if (/^(JJD|0034)\d+/.test(code) || /^\d{10}$/.test(code)) return 'DHL Paket / Express';
  if (/^1Z[0-9A-Z]+$/.test(code)) return 'UPS';
  if (/^SF\d+/.test(code)) return 'SF Express';
  if (/^(PN|SB)\d+/.test(code)) return 'Superbuy Parcel Network';
  return 'International Carrier';
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateHaulCsv(orders: HaulOrder[], items: ProductItem[]): string {
  const headers = [
    'Order',
    'Order Status',
    'Created Date',
    'Concluded Date',
    'Tracking Number',
    'Shipping Line',
    'Shipping Status',
    'Product',
    'Category',
    'Price CNY',
    'Price EUR',
    'Rate CNY->EUR',
    'Vendor',
    'Platform',
    'Size / Notes',
    'Product Link',
    'Photos Saved',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  for (const order of orders) {
    const orderItems = items.filter((it) => it.orderId === order.id);
    const trackingLabel =
      TRACKING_MILESTONES.find((m) => m.id === (order.trackingStatus ?? 'in_preparazione'))
        ?.label ?? 'Preparing';

    if (orderItems.length === 0) {
      rows.push(
        [
          order.title,
          order.status === 'open' ? 'Open' : 'Concluded',
          order.createdAt,
          order.concludedAt ?? '',
          order.trackingNumber ?? '',
          order.shippingLine ?? '',
          trackingLabel,
          '',
          '',
          '',
          '',
          order.exchangeRate,
          '',
          '',
          order.agentNote,
          '',
          0,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
      continue;
    }

    for (const item of orderItems) {
      const eur = cnyToEur(item.priceCny, order.exchangeRate);
      const imageCount = getItemImages(item).length;
      rows.push(
        [
          order.title,
          order.status === 'open' ? 'Open' : 'Concluded',
          order.createdAt,
          order.concludedAt ?? '',
          order.trackingNumber ?? '',
          order.shippingLine ?? '',
          trackingLabel,
          item.title,
          getCategoryLabel(item.category),
          item.priceCny.toFixed(2),
          eur.toFixed(2),
          order.exchangeRate,
          item.vendor,
          PLATFORM_LABELS[item.platform],
          item.sizeNote,
          item.link,
          imageCount,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
  }

  return `\uFEFF${rows.join('\r\n')}`;
}

export function formatRelativeTime(isoDate?: string | null): string {
  if (!isoDate) return 'Never synced';
  const ts = new Date(isoDate).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'Updated just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hr' : 'hrs'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
}

export const formatRelativeTimeItalian = formatRelativeTime;

export function createHaulBackup(
  orders: HaulOrder[],
  items: ProductItem[],
  savedItems: ProductItem[] = [],
  estimatedExchangeRate?: number
): HaulBackupData {
  const normalizeItemList = (list: ProductItem[]): ProductItem[] =>
    list.map((item) => {
      const allImages = getItemImages(item);
      const primary = allImages[0] || item.imageUrl || '';
      return {
        ...item,
        category: normalizeLegacyCategory(item.category),
        imageUrl: primary,
        imageUrls: allImages.length > 0 ? allImages : primary ? [primary] : undefined,
      };
    });

  const normalizedItems = normalizeItemList(items);
  const normalizedSavedItems = normalizeItemList(savedItems);

  const countPhotos = (list: ProductItem[]) =>
    list.reduce(
      (sum, it) => sum + (it.imageUrls?.length ?? (it.imageUrl ? 1 : 0)),
      0
    );

  const totalPhotos = countPhotos(normalizedItems) + countPhotos(normalizedSavedItems);

  const byCategory: Record<ProductCategory, number> = {
    Felpa: 0,
    Giubbini: 0,
    Maglietta: 0,
    'Maglietta da calcio': 0,
    Pantaloni: 0,
    Scarpe: 0,
    Borse: 0,
    Cappellini: 0,
    Cinture: 0,
    Accessori: 0,
  };
  for (const it of [...normalizedItems, ...normalizedSavedItems]) {
    byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
  }

  return {
    format: 'hauldesk-full-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    estimatedExchangeRate:
      typeof estimatedExchangeRate === 'number' && estimatedExchangeRate > 0
        ? Math.round(estimatedExchangeRate * 10000) / 10000
        : orders.find((o) => o.status === 'open')?.exchangeRate ?? DEFAULT_CNY_TO_EUR_RATE,
    categories: PRODUCT_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      shortLabel: c.shortLabel,
      color: c.color,
      description: c.description,
    })),
    stats: {
      totalOrders: orders.length,
      openOrders: orders.filter((o) => o.status === 'open').length,
      concludedOrders: orders.filter((o) => o.status === 'concluded').length,
      totalItems: normalizedItems.length,
      savedItemsCount: normalizedSavedItems.length,
      totalPhotos,
      byCategory,
    },
    orders: structuredClone(orders),
    items: normalizedItems,
    savedItems: normalizedSavedItems,
  };
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  stats?: {
    totalOrders: number;
    openOrders: number;
    concludedOrders: number;
    totalItems: number;
    savedItemsCount: number;
    totalPhotos: number;
    byCategory?: Record<ProductCategory, number>;
  };
  state?: HaulDatabaseState;
}

const VALID_PLATFORMS = new Set<SourcePlatform>([
  'yupoo',
  'taobao',
  'weidian',
  '1688',
  'superbuy',
  'altro',
]);

export const LEGACY_CATEGORY_ALIASES: Record<string, ProductCategory> = {
  // Felpa
  felpa: 'Felpa',
  felpe: 'Felpa',
  hoodie: 'Felpa',
  hoodies: 'Felpa',
  crewneck: 'Felpa',
  crewnecks: 'Felpa',
  maglione: 'Felpa',
  maglioni: 'Felpa',
  sweater: 'Felpa',
  sweaters: 'Felpa',
  sweatshirt: 'Felpa',
  sweatshirts: 'Felpa',
  zipup: 'Felpa',
  'zip-up': 'Felpa',
  cardigan: 'Felpa',
  cardigans: 'Felpa',

  // Giubbini
  giubbini: 'Giubbini',
  giubbino: 'Giubbini',
  giubbotto: 'Giubbini',
  giubbotti: 'Giubbini',
  giacca: 'Giubbini',
  giacche: 'Giubbini',
  jacket: 'Giubbini',
  jackets: 'Giubbini',
  puffer: 'Giubbini',
  puffers: 'Giubbini',
  bomber: 'Giubbini',
  bombers: 'Giubbini',
  piumino: 'Giubbini',
  piumini: 'Giubbini',
  'down jacket': 'Giubbini',
  'down jackets': 'Giubbini',
  windbreaker: 'Giubbini',
  antivento: 'Giubbini',
  cappotto: 'Giubbini',
  cappotti: 'Giubbini',
  coat: 'Giubbini',
  coats: 'Giubbini',
  trench: 'Giubbini',
  smanicato: 'Giubbini',
  gilet: 'Giubbini',
  vest: 'Giubbini',

  // Maglietta
  maglietta: 'Maglietta',
  magliette: 'Maglietta',
  tshirt: 'Maglietta',
  't-shirt': 'Maglietta',
  tee: 'Maglietta',
  tees: 'Maglietta',
  polo: 'Maglietta',
  camicia: 'Maglietta',
  camicie: 'Maglietta',
  shirt: 'Maglietta',
  shirts: 'Maglietta',

  // Maglietta da calcio
  'maglietta da calcio': 'Maglietta da calcio',
  'maglia da calcio': 'Maglietta da calcio',
  'maglie da calcio': 'Maglietta da calcio',
  'maglie calcio': 'Maglietta da calcio',
  'maglia calcio': 'Maglietta da calcio',
  calcio: 'Maglietta da calcio',
  jersey: 'Maglietta da calcio',
  jerseys: 'Maglietta da calcio',
  kit: 'Maglietta da calcio',
  'soccer jersey': 'Maglietta da calcio',
  'football jersey': 'Maglietta da calcio',

  // Pantaloni
  pantaloni: 'Pantaloni',
  pantalone: 'Pantaloni',
  pant: 'Pantaloni',
  pants: 'Pantaloni',
  trousers: 'Pantaloni',
  cargo: 'Pantaloni',
  jeans: 'Pantaloni',
  denim: 'Pantaloni',
  shorts: 'Pantaloni',
  bermuda: 'Pantaloni',
  pantaloncini: 'Pantaloni',
  sweatpants: 'Pantaloni',
  joggers: 'Pantaloni',
  jogger: 'Pantaloni',
  tuta: 'Pantaloni',

  // Scarpe
  scarpe: 'Scarpe',
  scarpa: 'Scarpe',
  sneakers: 'Scarpe',
  sneaker: 'Scarpe',
  shoes: 'Scarpe',
  shoe: 'Scarpe',
  kicks: 'Scarpe',
  boots: 'Scarpe',
  stivali: 'Scarpe',
  slides: 'Scarpe',
  ciabatte: 'Scarpe',
  sandali: 'Scarpe',
  runner: 'Scarpe',
  runners: 'Scarpe',

  // Borse
  borse: 'Borse',
  borsa: 'Borse',
  bag: 'Borse',
  bags: 'Borse',
  handbag: 'Borse',
  handbags: 'Borse',
  zaino: 'Borse',
  zaini: 'Borse',
  backpack: 'Borse',
  backpacks: 'Borse',
  tracolla: 'Borse',
  tracolle: 'Borse',
  'shoulder bag': 'Borse',
  marsupio: 'Borse',
  marsupi: 'Borse',
  crossbody: 'Borse',
  'cross body': 'Borse',
  tote: 'Borse',
  'tote bag': 'Borse',
  duffle: 'Borse',
  'duffle bag': 'Borse',
  borsone: 'Borse',
  borsoni: 'Borse',

  // Cappellini
  cappellini: 'Cappellini',
  cappellino: 'Cappellini',
  cappello: 'Cappellini',
  cappelli: 'Cappellini',
  cap: 'Cappellini',
  caps: 'Cappellini',
  hat: 'Cappellini',
  hats: 'Cappellini',
  beanie: 'Cappellini',
  beanies: 'Cappellini',
  berretto: 'Cappellini',
  berretti: 'Cappellini',
  bucket: 'Cappellini',
  'bucket hat': 'Cappellini',

  // Cinture
  cinture: 'Cinture',
  cintura: 'Cinture',
  belt: 'Cinture',
  belts: 'Cinture',
  buckle: 'Cinture',
  fibbia: 'Cinture',

  // Accessori
  accessori: 'Accessori',
  accessorio: 'Accessori',
  accessories: 'Accessori',
  accessory: 'Accessori',
  wallet: 'Accessori',
  portafoglio: 'Accessori',
  portafogli: 'Accessori',
  cardholder: 'Accessori',
  calze: 'Accessori',
  socks: 'Accessori',
  calzini: 'Accessori',
  jewelry: 'Accessori',
  gioielli: 'Accessori',
  ring: 'Accessori',
  anello: 'Accessori',
  necklace: 'Accessori',
  collana: 'Accessori',
  bracelet: 'Accessori',
  bracciale: 'Accessori',
  glasses: 'Accessori',
  sunglasses: 'Accessori',
  occhiali: 'Accessori',
  scarf: 'Accessori',
  sciarpa: 'Accessori',
  gloves: 'Accessori',
  guanti: 'Accessori',
  keychain: 'Accessori',
  portachiavi: 'Accessori',
};

export function normalizeLegacyCategory(rawCategory: unknown): ProductCategory {
  if (typeof rawCategory === 'string') {
    const trimmed = rawCategory.trim();
    const exact = PRODUCT_CATEGORIES.find(
      (c) => c.id.toLowerCase() === trimmed.toLowerCase()
    );
    if (exact) return exact.id;
    const mapped = LEGACY_CATEGORY_ALIASES[trimmed.toLowerCase()];
    if (mapped) return mapped;
  }
  return 'Accessori';
}

function parseFlexiblePositiveNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(',', '.');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeBackupId(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return null;
}

function normalizeLegacyOrderStatus(raw: unknown): 'open' | 'concluded' {
  if (typeof raw === 'string') {
    const norm = raw.trim().toLowerCase();
    if (norm === 'concluded' || norm === 'chiuso' || norm === 'closed' || norm === 'completed') {
      return 'concluded';
    }
  }
  return 'open';
}

export function validateHaulBackup(parsed: unknown): BackupValidationResult {
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'The selected file does not contain valid JSON.' };
  }

  const rootObj = parsed as Record<string, unknown>;
  const nestedState =
    rootObj.state && typeof rootObj.state === 'object'
      ? (rootObj.state as Record<string, unknown>)
      : rootObj.data && typeof rootObj.data === 'object'
      ? (rootObj.data as Record<string, unknown>)
      : null;

  const obj =
    Array.isArray(rootObj.orders) && Array.isArray(rootObj.items)
      ? rootObj
      : nestedState && Array.isArray(nestedState.orders) && Array.isArray(nestedState.items)
      ? nestedState
      : rootObj;

  const ordersRaw = obj.orders;
  const itemsRaw = obj.items;
  const savedItemsRaw = Array.isArray(obj.savedItems) ? obj.savedItems : [];
  const trashOrdersRaw = Array.isArray(obj.trashOrders) ? obj.trashOrders : [];
  const trashItemsRaw = Array.isArray(obj.trashItems) ? obj.trashItems : [];
  const backupEstimatedRate = parseFlexiblePositiveNumber(obj.estimatedExchangeRate);

  if (!Array.isArray(ordersRaw) || !Array.isArray(itemsRaw)) {
    return {
      valid: false,
      error: 'Invalid backup format: "orders" or "items" sections are missing.',
    };
  }

  const validOrders: HaulOrder[] = [];
  const seenOrderIds = new Set<string>();
  const orderIdRemap = new Map<string, string>();

  const parseOrderList = (
    list: unknown[],
    options: { trackPrimaryIds: boolean }
  ): { orders?: HaulOrder[]; error?: string } => {
    const out: HaulOrder[] = [];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o || typeof o !== 'object') {
        return { error: `Order at index ${i} is not a valid object.` };
      }
      const ord = o as Partial<HaulOrder>;
      const rawId = normalizeBackupId(ord.id);
      if (!rawId) {
        return { error: `Order #${i + 1} is missing an identifier ID.` };
      }
      if (!ord.title || typeof ord.title !== 'string' || !ord.title.trim()) {
        return { error: `Order #${i + 1} is missing a title.` };
      }

      let finalId = rawId;
      if (options.trackPrimaryIds) {
        if (seenOrderIds.has(finalId)) {
          let suffix = 2;
          while (seenOrderIds.has(`${rawId}-${suffix}`)) suffix++;
          finalId = `${rawId}-${suffix}`;
        }
        seenOrderIds.add(finalId);
        if (!orderIdRemap.has(rawId)) {
          orderIdRemap.set(rawId, finalId);
        }
      }

      const status = normalizeLegacyOrderStatus(ord.status);
      const parsedRate = parseFlexiblePositiveNumber(ord.exchangeRate);

      out.push({
        id: finalId,
        title: ord.title.trim(),
        status,
        createdAt: typeof ord.createdAt === 'string' && ord.createdAt.trim() ? ord.createdAt : new Date().toISOString(),
        concludedAt:
          typeof ord.concludedAt === 'string' && ord.concludedAt.trim()
            ? ord.concludedAt
            : status === 'concluded'
            ? new Date().toISOString()
            : null,
        agentNote: typeof ord.agentNote === 'string' ? ord.agentNote : '',
        exchangeRate:
          parsedRate !== null && parsedRate > 0 ? parsedRate : DEFAULT_CNY_TO_EUR_RATE,
        trackingNumber: typeof ord.trackingNumber === 'string' ? ord.trackingNumber : '',
        shippingLine: typeof ord.shippingLine === 'string' ? ord.shippingLine : '',
        trackingStatus: ord.trackingStatus,
        trackingEvents: Array.isArray(ord.trackingEvents) ? ord.trackingEvents : [],
        trackingUpdatedAt: ord.trackingUpdatedAt ?? null,
        trackingCarrier: typeof ord.trackingCarrier === 'string' ? ord.trackingCarrier : undefined,
        trackingLiveSource: ord.trackingLiveSource,
        trackingLastSyncMessage:
          typeof ord.trackingLastSyncMessage === 'string' ? ord.trackingLastSyncMessage : undefined,
      });
    }
    return { orders: out };
  };

  const primaryOrdersResult = parseOrderList(ordersRaw, { trackPrimaryIds: true });
  if (!primaryOrdersResult.orders) {
    return { valid: false, error: primaryOrdersResult.error };
  }
  validOrders.push(...primaryOrdersResult.orders);

  const parsedTrashOrders = parseOrderList(trashOrdersRaw, { trackPrimaryIds: false });
  const fallbackOrderId =
    validOrders.find((o) => o.status === 'open')?.id ?? validOrders[0]?.id ?? null;

  let totalPhotos = 0;
  const seenItemIds = new Set<string>();

  const parseItemArray = (
    rawList: unknown[],
    options: {
      forceOrderId?: string;
      labelPrefix: string;
      countPhotosInStats: boolean;
      allowFallbackOrderId: boolean;
    }
  ): { items?: ProductItem[]; error?: string } => {
    const out: ProductItem[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const it = rawList[i];
      if (!it || typeof it !== 'object') {
        return { error: `Invalid ${options.labelPrefix} entry at index ${i}.` };
      }
      const item = it as Partial<ProductItem>;
      const rawItemId = normalizeBackupId(item.id);
      if (!rawItemId) {
        return { error: `${options.labelPrefix} #${i + 1} is missing an identifier ID.` };
      }

      let resolvedOrderId = options.forceOrderId;
      if (!resolvedOrderId) {
        const rawOrderId = normalizeBackupId(item.orderId);
        if (rawOrderId && orderIdRemap.has(rawOrderId)) {
          resolvedOrderId = orderIdRemap.get(rawOrderId)!;
        } else if (rawOrderId && seenOrderIds.has(rawOrderId)) {
          resolvedOrderId = rawOrderId;
        } else if (options.allowFallbackOrderId && fallbackOrderId) {
          resolvedOrderId = fallbackOrderId;
        } else if (rawOrderId) {
          resolvedOrderId = rawOrderId;
        } else {
          return {
            error: `${options.labelPrefix} #${i + 1} is missing an order reference (orderId).`,
          };
        }
      }

      let finalItemId = rawItemId;
      if (seenItemIds.has(finalItemId)) {
        let suffix = 2;
        while (seenItemIds.has(`${rawItemId}-${suffix}`)) suffix++;
        finalItemId = `${rawItemId}-${suffix}`;
      }
      seenItemIds.add(finalItemId);

      const allImages = getItemImages({ imageUrl: item.imageUrl, imageUrls: item.imageUrls });
      const primary = allImages[0] || (typeof item.imageUrl === 'string' ? item.imageUrl.trim() : '');
      if (options.countPhotosInStats) {
        totalPhotos += allImages.length > 0 ? allImages.length : primary ? 1 : 0;
      }

      const parsedPrice = parseFlexiblePositiveNumber(item.priceCny);
      const linkStr = typeof item.link === 'string' ? item.link.trim() : '';
      const rawPlatform = typeof item.platform === 'string' ? (item.platform.trim().toLowerCase() as SourcePlatform) : null;
      const platform =
        rawPlatform && VALID_PLATFORMS.has(rawPlatform)
          ? rawPlatform
          : detectPlatformFromUrl(linkStr);

      out.push({
        id: finalItemId,
        orderId: resolvedOrderId,
        title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Untitled Item',
        category: normalizeLegacyCategory(item.category),
        categoryConfidence:
          item.categoryConfidence === 'alta' ||
          item.categoryConfidence === 'media' ||
          item.categoryConfidence === 'bassa' ||
          item.categoryConfidence === 'manuale'
            ? item.categoryConfidence
            : 'manuale',
        needsCategoryConfirmation: Boolean(item.needsCategoryConfirmation),
        priceCny:
          parsedPrice !== null && parsedPrice >= 0
            ? Math.round(parsedPrice * 100) / 100
            : 0,
        link: linkStr,
        platform,
        vendor: typeof item.vendor === 'string' && item.vendor.trim() ? item.vendor.trim() : 'Vendor',
        sizeNote: typeof item.sizeNote === 'string' ? item.sizeNote : '',
        imageUrl: primary,
        imageUrls: allImages.length > 0 ? allImages : primary ? [primary] : undefined,
        detectedDetails: typeof item.detectedDetails === 'string' ? item.detectedDetails : '',
        ...(normalizeProductRating(item.rating) !== undefined
          ? { rating: normalizeProductRating(item.rating) }
          : {}),
        createdAt:
          typeof item.createdAt === 'string' && item.createdAt.trim()
            ? item.createdAt
            : new Date().toISOString(),
        ...(typeof item.savedAt === 'string' && item.savedAt.trim() ? { savedAt: item.savedAt } : {}),
      });
    }
    return { items: out };
  };

  const parsedItems = parseItemArray(itemsRaw, {
    labelPrefix: 'item',
    countPhotosInStats: true,
    allowFallbackOrderId: true,
  });
  if (!parsedItems.items) {
    return { valid: false, error: parsedItems.error };
  }

  const parsedSavedItems = parseItemArray(savedItemsRaw, {
    forceOrderId: 'saved',
    labelPrefix: 'saved item',
    countPhotosInStats: true,
    allowFallbackOrderId: false,
  });
  if (!parsedSavedItems.items) {
    return { valid: false, error: parsedSavedItems.error };
  }

  const parsedTrashItems = parseItemArray(trashItemsRaw, {
    labelPrefix: 'trash item',
    countPhotosInStats: false,
    allowFallbackOrderId: false,
  });

  const byCategory: Record<ProductCategory, number> = {
    Felpa: 0,
    Giubbini: 0,
    Maglietta: 0,
    'Maglietta da calcio': 0,
    Pantaloni: 0,
    Scarpe: 0,
    Borse: 0,
    Cappellini: 0,
    Cinture: 0,
    Accessori: 0,
  };
  for (const it of [...parsedItems.items, ...parsedSavedItems.items]) {
    byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
  }

  return {
    valid: true,
    stats: {
      totalOrders: validOrders.length,
      openOrders: validOrders.filter((o) => o.status === 'open').length,
      concludedOrders: validOrders.filter((o) => o.status === 'concluded').length,
      totalItems: parsedItems.items.length,
      savedItemsCount: parsedSavedItems.items.length,
      totalPhotos,
      byCategory,
    },
    state: {
      orders: validOrders,
      items: parsedItems.items,
      savedItems: parsedSavedItems.items,
      ...(backupEstimatedRate !== null && backupEstimatedRate > 0
        ? { estimatedExchangeRate: backupEstimatedRate }
        : {}),
      ...(parsedTrashOrders.orders && parsedTrashOrders.orders.length > 0
        ? { trashOrders: parsedTrashOrders.orders }
        : {}),
      ...(parsedTrashItems.items && parsedTrashItems.items.length > 0
        ? { trashItems: parsedTrashItems.items }
        : {}),
    },
  };
}

export function toggleSelectionId(selectedIds: string[], id: string): string[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter((item) => item !== id);
  }
  return [...selectedIds, id];
}

export function areAllVisibleSelected(
  selectedIds: string[],
  visibleIds: string[]
): boolean {
  if (visibleIds.length === 0) return false;
  const set = new Set(selectedIds);
  return visibleIds.every((id) => set.has(id));
}

export function toggleSelectAllVisible(
  selectedIds: string[],
  visibleIds: string[]
): string[] {
  if (visibleIds.length === 0) return selectedIds;
  const visibleSet = new Set(visibleIds);
  if (areAllVisibleSelected(selectedIds, visibleIds)) {
    return selectedIds.filter((id) => !visibleSet.has(id));
  }
  const merged = new Set(selectedIds);
  for (const id of visibleIds) {
    merged.add(id);
  }
  return Array.from(merged);
}

export function summarizeSelectedItems(
  items: ProductItem[],
  selectedIds: string[],
  exchangeRate = DEFAULT_CNY_TO_EUR_RATE
): { count: number; totalCny: number; totalEur: number } {
  const idSet = new Set(selectedIds);
  const selected = items.filter((it) => idSet.has(it.id));
  const totalCny =
    Math.round(selected.reduce((sum, it) => sum + it.priceCny, 0) * 100) / 100;
  return {
    count: selected.length,
    totalCny,
    totalEur: cnyToEur(totalCny, exchangeRate),
  };
}




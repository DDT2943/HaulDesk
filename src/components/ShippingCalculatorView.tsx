import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ExternalLink,
  Package,
  Scale,
  ShieldCheck,
  Truck,
  AlertCircle,
  Radar,
  Calculator,
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  PRODUCT_CATEGORIES,
  type HaulOrder,
  type ProductCategory,
  type ProductItem,
  type TrackingMilestone,
} from '../types/haul';
import {
  calculateOrderTotals,
  convertEurToCurrency,
  DEFAULT_CNY_TO_EUR_RATE,
  formatCny,
  formatCurrency,
  formatExchangeRateLabel,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import {
  buildSuperbuyCalculatorUrl,
  calculateSuperbuyQuotes,
  calculateVolumetricWeightG,
  CATEGORY_ESTIMATED_WEIGHT_G,
  estimateParcelFromItems,
  SUPERBUY_GOODS_CATEGORIES,
  type SuperbuyGoodsCategory,
} from '../utils/shippingCalculator';
import { CategoryIcon } from './CategoryIcons';
import { OrderTrackingPanel } from './OrderTrackingPanel';

interface ShippingCalculatorViewProps {
  orders: HaulOrder[];
  items: ProductItem[];
  initialOrderId: string | null;
  displayCurrency?: DisplayCurrencyCode;
  estimatedExchangeRate?: number;
  onUpdateTracking: (
    orderId: string,
    payload: {
      trackingNumber: string;
      shippingLine: string;
      trackingStatus: TrackingMilestone;
      location?: string;
      note?: string;
    }
  ) => Promise<void>;
  onSyncLiveTracking?: (
    orderId: string,
    trackingNumber: string
  ) => Promise<{ liveFound: boolean; message: string }>;
}

type ShippingSubTab = 'calculator' | 'tracking';

const CATEGORY_WEIGHTS_STORAGE_KEY = 'hauldesk-category-weights-g';

function loadSavedCategoryWeights(): Record<ProductCategory, number> {
  const defaults = { ...CATEGORY_ESTIMATED_WEIGHT_G };
  try {
    const raw = window.localStorage.getItem(CATEGORY_WEIGHTS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<ProductCategory, unknown>>;
    for (const cat of PRODUCT_CATEGORIES) {
      const val = parsed?.[cat.id];
      if (typeof val === 'number' && Number.isFinite(val) && val > 0 && val <= 20000) {
        defaults[cat.id] = Math.round(val);
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return defaults;
}

export function ShippingCalculatorView({
  orders,
  items,
  initialOrderId,
  displayCurrency = 'EUR',
  estimatedExchangeRate,
  onUpdateTracking,
  onSyncLiveTracking,
}: ShippingCalculatorViewProps) {
  const [subTab, setSubTab] = useState<ShippingSubTab>('calculator');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => {
    if (initialOrderId && orders.some((o) => o.id === initialOrderId)) {
      return initialOrderId;
    }
    return orders[0]?.id ?? 'manual';
  });

  const [removeShoeBoxes, setRemoveShoeBoxes] = useState(true);
  const [goodsCategory, setGoodsCategory] =
    useState<SuperbuyGoodsCategory>('common_brand');
  const [customWeights, setCustomWeights] = useState<Record<ProductCategory, number>>(
    loadSavedCategoryWeights
  );
  const [weightsEditorOpen, setWeightsEditorOpen] = useState(false);

  const [weightG, setWeightG] = useState<number>(2500);
  const [lengthCm, setLengthCm] = useState<number>(38);
  const [widthCm, setWidthCm] = useState<number>(28);
  const [heightCm, setHeightCm] = useState<number>(18);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CATEGORY_WEIGHTS_STORAGE_KEY,
        JSON.stringify(customWeights)
      );
    } catch {
      // Ignore storage write errors
    }
  }, [customWeights]);

  const hasCustomWeights = PRODUCT_CATEGORIES.some(
    (cat) => customWeights[cat.id] !== CATEGORY_ESTIMATED_WEIGHT_G[cat.id]
  );

  const handleCategoryWeightChange = (cat: ProductCategory, raw: string) => {
    const parsed = Number(raw);
    const safe = Number.isFinite(parsed) && parsed > 0 ? Math.min(20000, Math.round(parsed)) : 10;
    setCustomWeights((prev) => ({
      ...prev,
      [cat]: safe,
    }));
  };

  const handleResetCategoryWeights = () => {
    setCustomWeights({ ...CATEGORY_ESTIMATED_WEIGHT_G });
  };

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  const selectedOrderItems = useMemo(
    () =>
      selectedOrder
        ? items.filter((item) => item.orderId === selectedOrder.id)
        : [],
    [items, selectedOrder]
  );

  const parcelEstimate = useMemo(
    () => estimateParcelFromItems(selectedOrderItems, removeShoeBoxes, customWeights),
    [selectedOrderItems, removeShoeBoxes, customWeights]
  );

  useEffect(() => {
    if (!selectedOrder) return;
    if (selectedOrderItems.length === 0) {
      setWeightG(0);
      setLengthCm(30);
      setWidthCm(22);
      setHeightCm(12);
      return;
    }
    setWeightG(parcelEstimate.actualWeightG);
    setLengthCm(parcelEstimate.lengthCm);
    setWidthCm(parcelEstimate.widthCm);
    setHeightCm(parcelEstimate.heightCm);
  }, [
    selectedOrder,
    selectedOrderItems.length,
    parcelEstimate.actualWeightG,
    parcelEstimate.lengthCm,
    parcelEstimate.widthCm,
    parcelEstimate.heightCm,
  ]);

  const exchangeRate =
    selectedOrder?.exchangeRate ?? estimatedExchangeRate ?? DEFAULT_CNY_TO_EUR_RATE;

  const orderMetrics = useMemo(
    () =>
      selectedOrder
        ? calculateOrderTotals(selectedOrderItems, exchangeRate)
        : null,
    [selectedOrder, selectedOrderItems, exchangeRate]
  );

  const volumetric6000G = useMemo(
    () => calculateVolumetricWeightG(lengthCm, widthCm, heightCm, 6000),
    [lengthCm, widthCm, heightCm]
  );

  const quoteInput = useMemo(
    () => ({
      weightG,
      lengthCm,
      widthCm,
      heightCm,
      goodsCategory,
      exchangeRate,
    }),
    [weightG, lengthCm, widthCm, heightCm, goodsCategory, exchangeRate]
  );

  const quotes = useMemo(
    () => calculateSuperbuyQuotes(quoteInput),
    [quoteInput]
  );

  const availableQuotes = quotes.filter((q) => q.available);
  const unavailableQuotes = quotes.filter((q) => !q.available);
  const bestTaxFreeQuote =
    availableQuotes.find((q) => q.line.recommended) ??
    availableQuotes.find((q) => q.line.taxIncluded) ??
    availableQuotes[0] ??
    null;

  const superbuyOfficialUrl = buildSuperbuyCalculatorUrl(quoteInput);

  const trackedOrdersCount = orders.filter(
    (o) => Boolean(o.trackingNumber?.trim()) || (o.trackingStatus && o.trackingStatus !== 'in_preparazione')
  ).length;
  const inTransitCount = orders.filter(
    (o) =>
      o.trackingStatus === 'in_transito' ||
      o.trackingStatus === 'dogana_ue' ||
      o.trackingStatus === 'in_consegna'
  ).length;
  const deliveredCount = orders.filter((o) => o.trackingStatus === 'consegnato').length;

  const handleNumberInput = (
    raw: string,
    setter: (val: number) => void,
    max = 50000
  ) => {
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      setter(0);
      return;
    }
    setter(Math.min(max, Math.round(num)));
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111110] dark:text-[#F4F4F0] tracking-tight">
            {subTab === 'calculator'
              ? 'Superbuy Shipping Estimator'
              : 'Arrival Monitoring & Tracking'}
          </h1>
          <p className="text-sm text-[#6E6E68] dark:text-[#9A9A92] mt-1">
            {subTab === 'calculator'
              ? 'Estimated shipping from Guangdong Warehouse · Actual vs volumetric weight (/6000) and brand restrictions.'
              : 'Track your Superbuy parcels, customs milestones, and delivery status.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sub-tab Switcher */}
          <div
            className="inline-flex items-center p-1 bg-[#EFEFEA] dark:bg-[#242422] rounded-xl"
            role="tablist"
            aria-label="Shipping sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'calculator'}
              onClick={() => setSubTab('calculator')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'calculator'
                  ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                  : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              Rate Calculator
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'tracking'}
              onClick={() => setSubTab('tracking')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'tracking'
                  ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                  : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
              }`}
            >
              <Radar className="w-3.5 h-3.5" />
              Arrival Tracking ({trackedOrdersCount})
            </button>
          </div>

          {subTab === 'calculator' && (
            <a
              href={superbuyOfficialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-white dark:bg-[#222220] text-[#111110] dark:text-[#F4F4F0] border border-[#E5E5E0] dark:border-[#343430] hover:bg-[#EFEFEA] dark:hover:bg-[#2C2C2A] shadow-[0_1px_0_0_rgba(17,17,16,0.08)] transition-colors whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-4 h-4 text-[#E11D48]" />
              Open Superbuy Calculator
            </a>
          )}
        </div>
      </div>

      {subTab === 'tracking' ? (
        <div className="space-y-5">
          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
              <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Tracked Parcels</p>
              <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
                {trackedOrdersCount}
              </p>
            </div>
            <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
              <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">In Transit / Customs</p>
              <p className="text-xl font-mono font-bold text-[#E11D48] tabular-nums mt-1">
                {inTransitCount}
              </p>
            </div>
            <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
              <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Delivered</p>
              <p className="text-xl font-mono font-bold text-[#16A34A] tabular-nums mt-1">
                {deliveredCount}
              </p>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-10 text-center">
              <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
                No orders yet
              </p>
              <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] mt-1">
                Create an order to start tracking Superbuy shipments.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((ord) => {
                const ordItems = items.filter((i) => i.orderId === ord.id);
                const ordTotals = calculateOrderTotals(ordItems, ord.exchangeRate);
                return (
                  <div key={ord.id} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
                          {ord.title}
                        </h2>
                        <span
                          className={`text-xs font-medium ${
                            ord.status === 'open'
                              ? 'text-[#16A34A]'
                              : 'text-[#6E6E68] dark:text-[#9A9A92]'
                          }`}
                        >
                          · {ord.status === 'open' ? 'Open' : 'Concluded'}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                        {ordTotals.itemCount}{' '}
                        {ordTotals.itemCount === 1 ? 'item' : 'items'} ·{' '}
                        {formatCurrency(
                          displayCurrency === 'CNY'
                            ? ordTotals.totalCny
                            : convertEurToCurrency(ordTotals.totalEur, displayCurrency),
                          displayCurrency
                        )}
                      </span>
                    </div>

                    <OrderTrackingPanel
                      order={ord}
                      onUpdateTracking={onUpdateTracking}
                      onSyncLiveTracking={onSyncLiveTracking}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Config Panel */}
          <section className="lg:col-span-4 bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-5 space-y-5">
            <div>
              <label
                htmlFor="shipping-order-select"
                className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
              >
                Parcel data source
              </label>
              <select
                id="shipping-order-select"
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              >
                {orders.map((ord) => {
                  const count = items.filter((i) => i.orderId === ord.id).length;
                  return (
                    <option key={ord.id} value={ord.id}>
                      {ord.title} ({count} {count === 1 ? 'item' : 'items'})
                    </option>
                  );
                })}
                <option value="manual">Manual calculation</option>
              </select>
            </div>

            {selectedOrder && (
              <div className="rounded-xl bg-[#F7F7F5] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#343430] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6E6E68] dark:text-[#9A9A92] flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[#111110] dark:text-[#F4F4F0]" />
                    Auto estimate from order
                  </span>
                  <span className="font-mono font-semibold text-[#111110] dark:text-[#F4F4F0] tabular-nums">
                    {selectedOrderItems.length} pcs
                  </span>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={removeShoeBoxes}
                    onChange={(e) => setRemoveShoeBoxes(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[#D6D6CF] accent-[#E11D48]"
                  />
                  <span className="text-xs text-[#111110] dark:text-[#F4F4F0] leading-snug">
                    Remove shoe boxes (-320g &amp; smaller volume per pair)
                    {parcelEstimate.shoesCount > 0 && (
                      <span className="block text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mt-0.5 tabular-nums">
                        {parcelEstimate.shoesCount}{' '}
                        {parcelEstimate.shoesCount === 1
                          ? 'pair detected'
                          : 'pairs detected'}{' '}
                        in this order
                      </span>
                    )}
                  </span>
                </label>
              </div>
            )}

            {/* Weight & Dimensions */}
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="shipping-weight-g"
                  className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                >
                  Actual parcel weight (grams)
                </label>
                <div className="relative">
                  <input
                    id="shipping-weight-g"
                    type="number"
                    min={0}
                    max={30000}
                    step={50}
                    value={weightG}
                    onChange={(e) => handleNumberInput(e.target.value, setWeightG, 30000)}
                    className="w-full px-3 py-2 pr-10 text-sm font-mono tabular-nums bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                    g
                  </span>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5">
                  Box dimensions (cm)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="shipping-length"
                      className="block text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mb-1"
                    >
                      Length (L)
                    </label>
                    <input
                      id="shipping-length"
                      type="number"
                      min={1}
                      max={200}
                      value={lengthCm}
                      onChange={(e) =>
                        handleNumberInput(e.target.value, setLengthCm, 200)
                      }
                      className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="shipping-width"
                      className="block text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mb-1"
                    >
                      Width (W)
                    </label>
                    <input
                      id="shipping-width"
                      type="number"
                      min={1}
                      max={200}
                      value={widthCm}
                      onChange={(e) =>
                        handleNumberInput(e.target.value, setWidthCm, 200)
                      }
                      className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="shipping-height"
                      className="block text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mb-1"
                    >
                      Height (H)
                    </label>
                    <input
                      id="shipping-height"
                      type="number"
                      min={1}
                      max={200}
                      value={heightCm}
                      onChange={(e) =>
                        handleNumberInput(e.target.value, setHeightCm, 200)
                      }
                      className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Goods Category (Superbuy Limit ID) */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]">
                Superbuy Customs Restrictions
              </span>
              <div className="space-y-1.5">
                {SUPERBUY_GOODS_CATEGORIES.map((cat) => {
                  const active = goodsCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setGoodsCategory(cat.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                        active
                          ? 'border-[#111110] dark:border-[#F4F4F0] bg-[#F7F7F5] dark:bg-[#242422]'
                          : 'border-[#E5E5E0] dark:border-[#2C2C2A] bg-white dark:bg-[#191918] hover:bg-[#F7F7F5] dark:hover:bg-[#222220]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]">
                          {cat.label}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            active ? 'bg-[#E11D48]' : 'bg-[#D6D6CF] dark:bg-[#4A4A45]'
                          }`}
                        />
                      </div>
                      <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mt-0.5">
                        {cat.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Customizable Category Weights */}
            <div className="pt-4 border-t border-[#E5E5E0] dark:border-[#2C2C2A] space-y-2.5">
              <button
                type="button"
                onClick={() => setWeightsEditorOpen((prev) => !prev)}
                aria-expanded={weightsEditorOpen}
                className="w-full flex items-center justify-between gap-2 text-left text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#E11D48]" />
                  <span>Estimated Category Weights</span>
                  {hasCustomWeights && (
                    <span className="text-[10px] font-medium text-[#E11D48]">
                      · Customized
                    </span>
                  )}
                </span>
                {weightsEditorOpen ? (
                  <ChevronUp className="w-4 h-4 text-[#6E6E68]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#6E6E68]" />
                )}
              </button>

              {weightsEditorOpen && (
                <div
                  className="space-y-2.5 pt-1"
                  data-testid="category-weights-editor"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                      Edit the average weight (g) used for automatic order estimates.
                    </p>
                    {hasCustomWeights && (
                      <button
                        type="button"
                        onClick={handleResetCategoryWeights}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48] hover:underline shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto pr-1">
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#F7F7F5] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#343430]"
                      >
                        <label
                          htmlFor={`cat-weight-${cat.id}`}
                          className="flex items-center gap-1.5 text-xs font-medium text-[#111110] dark:text-[#F4F4F0] min-w-0 truncate"
                        >
                          <CategoryIcon category={cat.id} className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{cat.label}</span>
                        </label>
                        <div className="relative w-24 shrink-0">
                          <input
                            id={`cat-weight-${cat.id}`}
                            type="number"
                            min={10}
                            max={20000}
                            step={10}
                            value={customWeights[cat.id]}
                            onChange={(e) => handleCategoryWeightChange(cat.id, e.target.value)}
                            className="w-full px-2 py-1 pr-6 text-right text-xs font-mono tabular-nums bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] rounded-lg text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-1 focus:ring-[#E11D48]"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                            g
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Weight Comparison Box */}
            <div className="pt-4 border-t border-[#E5E5E0] dark:border-[#2C2C2A] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#6E6E68] dark:text-[#9A9A92] flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5" />
                  Actual Weight
                </span>
                <span className="font-mono font-semibold text-[#111110] dark:text-[#F4F4F0] tabular-nums">
                  {weightG.toLocaleString('en-US')} g
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#6E6E68] dark:text-[#9A9A92]">
                  Volumetric Weight (/6000)
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    volumetric6000G > weightG
                      ? 'text-[#D97706]'
                      : 'text-[#111110] dark:text-[#F4F4F0]'
                  }`}
                >
                  {volumetric6000G.toLocaleString('en-US')} g
                </span>
              </div>
              <p className="text-[11px] text-[#8E8E87] dark:text-[#7E7E77] leading-relaxed">
                {volumetric6000G > weightG
                  ? 'Volumetric lines bill by volumetric weight; Actual Weight lines bill by actual parcel weight.'
                  : 'Actual weight exceeds volumetric weight: most lines will bill by actual weight.'}
              </p>
            </div>
          </section>

          {/* Right Quotes List */}
          <section className="lg:col-span-8 space-y-4">
            {/* Combined Order + Recommended Shipping Banner */}
            {bestTaxFreeQuote && (
              <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#16A34A]">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Recommended line</span>
                  </div>
                  <h2 className="text-base font-bold text-[#111110] dark:text-[#F4F4F0]">
                    {bestTaxFreeQuote.line.name}
                  </h2>
                  <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                    {bestTaxFreeQuote.line.transitDays} · Chargeable weight{' '}
                    {bestTaxFreeQuote.chargeableWeightG.toLocaleString('en-US')} g ·{' '}
                    {bestTaxFreeQuote.line.taxIncluded
                      ? 'Tax-Free (prepaid customs)'
                      : 'Possible VAT/duties at customs'}
                  </p>
                </div>

                <div className="sm:text-right tabular-nums shrink-0">
                  <div className="text-2xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0]">
                    {formatCurrency(
                      displayCurrency === 'CNY'
                        ? bestTaxFreeQuote.totalCny
                        : convertEurToCurrency(bestTaxFreeQuote.totalEur, displayCurrency),
                      displayCurrency
                    )}
                  </div>
                  <div className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                    Shipping: {formatCny(bestTaxFreeQuote.totalCny)}
                  </div>
                  {orderMetrics && selectedOrder && (
                    <div className="text-xs font-medium text-[#111110] dark:text-[#F4F4F0] mt-1 pt-1 border-t border-[#E5E5E0] dark:border-[#2C2C2A]">
                      Order + Shipping:{' '}
                      <span className="font-mono font-bold text-[#E11D48]">
                        {formatCurrency(
                          displayCurrency === 'CNY'
                            ? orderMetrics.totalCny + bestTaxFreeQuote.totalCny
                            : convertEurToCurrency(
                                orderMetrics.totalEur + bestTaxFreeQuote.totalEur,
                                displayCurrency
                              ),
                          displayCurrency
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Available Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
                  Available Lines ({availableQuotes.length})
                </h3>
                <span className="text-xs text-[#6E6E68] dark:text-[#9A9A92] font-mono tabular-nums">
                  Rate: {formatExchangeRateLabel(exchangeRate, displayCurrency)}
                </span>
              </div>

              {availableQuotes.length === 0 ? (
                <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-8 text-center space-y-2">
                  <AlertCircle className="w-6 h-6 text-[#D97706] mx-auto" />
                  <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
                    No lines available for these parameters
                  </p>
                  <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                    Enter a weight above 0 g or check weight and brand category limits.
                  </p>
                </div>
              ) : (
                availableQuotes.map((quote, idx) => {
                  const isBest = bestTaxFreeQuote?.line.id === quote.line.id;
                  return (
                    <motion.div
                      key={quote.line.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: idx * 0.03 }}
                      className={`bg-white dark:bg-[#191918] rounded-2xl p-4 sm:p-5 border transition-colors ${
                        isBest
                          ? 'border-[#111110] dark:border-[#F4F4F0]'
                          : 'border-[#E5E5E0] dark:border-[#2C2C2A]'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Truck className="w-4 h-4 text-[#111110] dark:text-[#F4F4F0] shrink-0" />
                            <h4 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
                              {quote.line.name}
                            </h4>
                            {quote.line.recommended && (
                              <span className="text-xs font-semibold text-[#E11D48]">
                                · Recommended
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                            {quote.line.serviceType} · {quote.line.transitDays} ·{' '}
                            {quote.line.taxIncluded
                              ? 'EU Tax-Free'
                              : 'Customs excluded'}{' '}
                            ·{' '}
                            {quote.usedVolumetricWeight
                              ? `Volumetric (${quote.chargeableWeightG.toLocaleString('en-US')} g)`
                              : `Actual weight (${quote.chargeableWeightG.toLocaleString('en-US')} g)`}
                          </p>

                          <p className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                            First {quote.line.firstWeightG}g:{' '}
                            {formatCny(quote.firstCostCny)} + Additional:{' '}
                            {formatCny(quote.continuedCostCny)} + Customs fee:{' '}
                            {formatCny(quote.customsFeeCny)}
                          </p>

                          <p className="text-xs text-[#8E8E87] dark:text-[#7E7E77]">
                            {quote.line.note}
                          </p>
                        </div>

                        <div className="sm:text-right shrink-0 tabular-nums">
                          <div className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0]">
                            {formatCurrency(
                              displayCurrency === 'CNY'
                                ? quote.totalCny
                                : convertEurToCurrency(quote.totalEur, displayCurrency),
                              displayCurrency
                            )}
                          </div>
                          {displayCurrency !== 'CNY' && (
                            <div className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                              {formatCny(quote.totalCny)}
                            </div>
                          )}
                          {orderMetrics && selectedOrder && (
                            <div className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] mt-1">
                              Est. Haul:{' '}
                              <span className="text-[#111110] dark:text-[#F4F4F0] font-semibold">
                                {formatCurrency(
                                  displayCurrency === 'CNY'
                                    ? orderMetrics.totalCny + quote.totalCny
                                    : convertEurToCurrency(
                                        orderMetrics.totalEur + quote.totalEur,
                                        displayCurrency
                                      ),
                                  displayCurrency
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Unavailable Lines */}
            {unavailableQuotes.length > 0 && (
              <div className="space-y-2.5 pt-2">
                <h3 className="text-xs font-semibold text-[#6E6E68] dark:text-[#9A9A92]">
                  Unavailable lines due to weight or brand limits ({unavailableQuotes.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {unavailableQuotes.map((quote) => (
                    <div
                      key={quote.line.id}
                      className="bg-[#EFEFEA]/70 dark:bg-[#222220]/70 border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-xl p-3.5 opacity-85"
                    >
                      <p className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]">
                        {quote.line.name}
                      </p>
                      <p className="text-[11px] text-[#DC2626] dark:text-[#F87171] mt-1">
                        {quote.unavailableReason}
                      </p>
                      <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mt-0.5 tabular-nums">
                        Max {(quote.line.maxWeightG / 1000).toFixed(0)} kg ·{' '}
                        {quote.line.transitDays}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

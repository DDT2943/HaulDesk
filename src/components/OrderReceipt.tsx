import { useEffect, useState } from 'react';
import { RotateCcw, CheckCircle2, Truck, Printer, Pencil, Check, X } from 'lucide-react';
import type { HaulOrder, ProductItem } from '../types/haul';
import {
  calculateOrderTotals,
  convertEurToCurrency,
  formatCny,
  formatCurrency,
  formatExchangeRateLabel,
  formatShortDate,
  TRACKING_MILESTONES,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import {
  calculateSuperbuyQuotes,
  estimateParcelFromItems,
} from '../utils/shippingCalculator';
import { HoldToConcludeButton, TactileButton } from './TactileButtons';

interface OrderReceiptProps {
  order: HaulOrder;
  items: ProductItem[];
  displayCurrency?: DisplayCurrencyCode;
  onConcludeOrder: (orderId: string) => Promise<void>;
  onReopenOrder: (orderId: string) => Promise<void>;
  onUpdateExchangeRate?: (orderId: string, exchangeRate: number) => Promise<void>;
  onOpenShippingEstimator?: () => void;
  onOpenReceiptPrinter?: () => void;
}

export function OrderReceipt({
  order,
  items,
  displayCurrency = 'EUR',
  onConcludeOrder,
  onReopenOrder,
  onUpdateExchangeRate,
  onOpenShippingEstimator,
  onOpenReceiptPrinter,
}: OrderReceiptProps) {
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState(String(order.exchangeRate));
  const [savingRate, setSavingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  useEffect(() => {
    setEditingRate(false);
    setRateInput(String(order.exchangeRate));
    setRateError(null);
  }, [order.id, order.exchangeRate]);

  const handleSaveRate = async () => {
    if (!onUpdateExchangeRate) return;
    const parsed = Number(rateInput.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 50) {
      setRateError('Enter a valid rate (e.g. 0.13)');
      return;
    }
    setSavingRate(true);
    setRateError(null);
    try {
      await onUpdateExchangeRate(order.id, parsed);
      setEditingRate(false);
    } catch (err) {
      setRateError(err instanceof Error ? err.message : 'Error saving exchange rate');
    } finally {
      setSavingRate(false);
    }
  };

  const metrics = calculateOrderTotals(items, order.exchangeRate);
  const isOpen = order.status === 'open';

  const parcelEstimate = estimateParcelFromItems(items, true);
  const quotes =
    items.length > 0
      ? calculateSuperbuyQuotes({
          weightG: parcelEstimate.actualWeightG,
          lengthCm: parcelEstimate.lengthCm,
          widthCm: parcelEstimate.widthCm,
          heightCm: parcelEstimate.heightCm,
          goodsCategory: 'common_brand',
          exchangeRate: order.exchangeRate,
        })
      : [];
  const recommendedQuote =
    quotes.find((q) => q.available && q.line.recommended) ??
    quotes.find((q) => q.available && q.line.taxIncluded) ??
    quotes.find((q) => q.available) ??
    null;

  const convertedProductsTotal =
    displayCurrency === 'CNY'
      ? metrics.totalCny
      : convertEurToCurrency(metrics.totalEur, displayCurrency);

  const convertedShippingTotal = recommendedQuote
    ? displayCurrency === 'CNY'
      ? recommendedQuote.totalCny
      : convertEurToCurrency(recommendedQuote.totalEur, displayCurrency)
    : 0;

  const trackingStepMeta = TRACKING_MILESTONES.find(
    (m) => m.id === (order.trackingStatus ?? 'in_preparazione')
  );

  return (
    <div className="relative">
      <div className="receipt-paper border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-t-2xl p-5 shadow-[0_1px_2px_rgba(17,17,16,0.04)]">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-dashed border-[#D6D6CF] dark:border-[#343430]">
          <div>
            <p className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92]">
              SUPERBUY ORDER SUMMARY
            </p>
            <h3 className="text-base font-bold text-[#111110] dark:text-[#F4F4F0] mt-0.5">
              {order.title}
            </h3>
            <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] mt-0.5">
              Opened {formatShortDate(order.createdAt)}
            </p>
          </div>
          <span
            className={`text-xs font-medium whitespace-nowrap shrink-0 ${
              isOpen ? 'text-[#16A34A]' : 'text-[#52524E] dark:text-[#B4B4AC]'
            }`}
          >
            {isOpen ? 'Open' : 'Concluded'}
          </span>
        </div>

        {/* Receipt Line Items */}
        <div className="py-4 border-b border-dashed border-[#D6D6CF] dark:border-[#343430] space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] py-2">
              No items cataloged in this order yet.
            </p>
          ) : (
            items.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="text-[#111110] dark:text-[#F4F4F0] truncate">
                  {item.title}
                </span>
                <span className="font-mono text-[#111110] dark:text-[#F4F4F0] tabular-nums shrink-0">
                  {formatCny(item.priceCny)}
                </span>
              </div>
            ))
          )}
          {items.length > 6 && (
            <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] font-mono">
              + {items.length - 6} more items in order
            </p>
          )}
        </div>

        {/* Totals */}
        <div className="py-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#6E6E68] dark:text-[#9A9A92]">
            <span>Total items</span>
            <span className="font-mono tabular-nums text-[#111110] dark:text-[#F4F4F0]">
              {metrics.itemCount}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#6E6E68] dark:text-[#9A9A92]">
            <span>Distinct vendors</span>
            <span className="font-mono tabular-nums text-[#111110] dark:text-[#F4F4F0]">
              {metrics.uniqueVendors}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs text-[#6E6E68] dark:text-[#9A9A92]">
              <div className="flex items-center gap-1.5">
                <span>Est. Exchange Rate</span>
                <span
                  title="Estimated exchange rate applies across the entire app"
                  className="text-[10px] font-mono px-1 py-0.5 rounded bg-[#F7F7F5] dark:bg-[#242422] text-[#6E6E68] dark:text-[#9A9A92] border border-[#E5E5E0] dark:border-[#343430]"
                >
                  Global
                </span>
              </div>
              {editingRate && isOpen && onUpdateExchangeRate ? (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                    1¥=€
                  </span>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    max="50"
                    value={rateInput}
                    onChange={(e) => {
                      setRateInput(e.target.value);
                      setRateError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSaveRate();
                      } else if (e.key === 'Escape') {
                        setEditingRate(false);
                        setRateInput(String(order.exchangeRate));
                        setRateError(null);
                      }
                    }}
                    aria-label="CNY to EUR exchange rate"
                    autoFocus
                    className="w-20 px-2 py-0.5 text-xs font-mono tabular-nums bg-[#F7F7F5] dark:bg-[#242422] border border-[#111110] dark:border-[#F4F4F0] rounded-lg text-[#111110] dark:text-[#F4F4F0] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={savingRate}
                    onClick={() => void handleSaveRate()}
                    aria-label="Save exchange rate"
                    className="p-1 rounded-lg bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={savingRate}
                    onClick={() => {
                      setEditingRate(false);
                      setRateInput(String(order.exchangeRate));
                      setRateError(null);
                    }}
                    aria-label="Cancel exchange rate edit"
                    className="p-1 rounded-lg bg-[#EFEFEA] dark:bg-[#2A2A27] text-[#52524E] dark:text-[#B4B4AC] hover:text-[#111110] dark:hover:text-[#F4F4F0] cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span
                    data-testid="order-exchange-rate-label"
                    className="font-mono tabular-nums text-[#111110] dark:text-[#F4F4F0]"
                  >
                    {formatExchangeRateLabel(order.exchangeRate, displayCurrency)}
                  </span>
                  {isOpen && onUpdateExchangeRate && (
                    <button
                      type="button"
                      onClick={() => {
                        setRateInput(String(order.exchangeRate));
                        setRateError(null);
                        setEditingRate(true);
                      }}
                      aria-label="Edit exchange rate"
                      title="Edit conversion rate"
                      className="p-1 rounded-md text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#E11D48] hover:bg-[#FFF1F2] dark:hover:bg-[#3A1620] transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {rateError && (
              <p className="text-[11px] text-[#DC2626] dark:text-[#F87171] text-right">
                {rateError}
              </p>
            )}
          </div>

          {order.trackingNumber && (
            <div className="flex items-center justify-between gap-2 text-xs text-[#6E6E68] dark:text-[#9A9A92]">
              <span>Tracking</span>
              <span className="font-mono text-[#111110] dark:text-[#F4F4F0] truncate">
                {order.trackingNumber}
                {trackingStepMeta ? ` · ${trackingStepMeta.shortLabel}` : ''}
              </span>
            </div>
          )}

          <div className="pt-3 mt-2 border-t border-[#E5E5E0] dark:border-[#2C2C2A] flex items-baseline justify-between">
            <span className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
              Products Total
            </span>
            <div className="text-right tabular-nums">
              <div className="text-lg font-mono font-bold text-[#111110] dark:text-[#F4F4F0]">
                {formatCny(metrics.totalCny)}
              </div>
              {displayCurrency !== 'CNY' && (
                <div className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                  {formatCurrency(convertedProductsTotal, displayCurrency)}
                </div>
              )}
            </div>
          </div>

          {recommendedQuote && (
            <div className="mt-3 pt-3 border-t border-dashed border-[#D6D6CF] dark:border-[#343430] space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[#6E6E68] dark:text-[#9A9A92] flex items-center gap-1.5 min-w-0">
                  <Truck className="w-3.5 h-3.5 text-[#111110] dark:text-[#F4F4F0] shrink-0" />
                  <span className="truncate">
                    Est. Shipping (~{parcelEstimate.actualWeightG.toLocaleString('en-US')} g)
                  </span>
                </span>
                <span className="font-mono font-semibold text-[#111110] dark:text-[#F4F4F0] tabular-nums shrink-0">
                  {formatCurrency(convertedShippingTotal, displayCurrency)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                <span className="truncate pr-2">{recommendedQuote.line.name}</span>
                <span className="font-mono tabular-nums shrink-0">
                  {formatCny(recommendedQuote.totalCny)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] pt-1">
                <span>Est. Total (+ Shipping)</span>
                <span className="font-mono tabular-nums text-[#E11D48]">
                  {formatCurrency(convertedProductsTotal + convertedShippingTotal, displayCurrency)}
                </span>
              </div>

              {onOpenShippingEstimator && (
                <button
                  type="button"
                  onClick={onOpenShippingEstimator}
                  className="w-full mt-1.5 py-1.5 px-3 text-xs font-medium text-[#111110] dark:text-[#F4F4F0] bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#30302C] border border-[#E5E5E0] dark:border-[#343430] rounded-lg transition-colors cursor-pointer"
                >
                  Simulate Superbuy shipping
                </button>
              )}
            </div>
          )}
        </div>

        {/* Order Lifecycle Action */}
        <div className="pt-3 border-t border-[#E5E5E0] dark:border-[#2C2C2A]">
          {isOpen ? (
            <HoldToConcludeButton
              orderTitle={order.title}
              onConclude={() => onConcludeOrder(order.id)}
            />
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs text-[#52524E] dark:text-[#B4B4AC] bg-[#F7F7F5] dark:bg-[#222220] rounded-xl px-3 py-2.5 border border-[#E5E5E0] dark:border-[#343430]">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                <span>
                  Concluded{' '}
                  {order.concludedAt
                    ? formatShortDate(order.concludedAt)
                    : '—'}
                </span>
              </div>
              {onOpenReceiptPrinter && (
                <TactileButton
                  variant="dark"
                  className="w-full"
                  onClick={onOpenReceiptPrinter}
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </TactileButton>
              )}
              <TactileButton
                variant="secondary"
                className="w-full"
                onClick={() => onReopenOrder(order.id)}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reopen Order
              </TactileButton>
            </div>
          )}
        </div>
      </div>

      {/* Serrated thermal receipt bottom edge inspired by Dqnamo Kitchen */}
      <svg
        viewBox="0 0 320 12"
        preserveAspectRatio="none"
        className="w-full h-3 block text-white dark:text-[#191918] drop-shadow-[0_1px_0_#E5E5E0] dark:drop-shadow-[0_1px_0_#2C2C2A]"
        aria-hidden="true"
      >
        <path
          d="M0,0 L320,0 L320,4 L312,12 L304,4 L296,12 L288,4 L280,12 L272,4 L264,12 L256,4 L248,12 L240,4 L232,12 L224,4 L216,12 L208,4 L200,12 L192,4 L184,12 L176,4 L168,12 L160,4 L152,12 L144,4 L136,12 L128,4 L120,12 L112,4 L104,12 L96,4 L88,12 L80,4 L72,12 L64,4 L56,12 L48,4 L40,12 L32,4 L24,12 L16,4 L8,12 L0,4 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

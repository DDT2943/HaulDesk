import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Images,
  Printer,
  RotateCcw,
  Truck,
} from 'lucide-react';
import { getCategoryLabel, type HaulOrder, type ProductCategory, type ProductItem } from '../types/haul';
import {
  calculateOrderTotals,
  convertCnyToCurrency,
  convertEurToCurrency,
  formatCny,
  formatCurrency,
  formatShortDate,
  getItemImages,
  TRACKING_MILESTONES,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import { CategoryIcon } from './CategoryIcons';
import { TactileButton } from './TactileButtons';

interface ConcludedOrdersViewProps {
  orders: HaulOrder[];
  items: ProductItem[];
  displayCurrency?: DisplayCurrencyCode;
  onExportCsv: (ordersSubset: HaulOrder[], filename: string) => void;
  onOpenReceiptPrinter: (orderId: string) => void;
  onReopenOrder: (orderId: string) => Promise<void>;
  onSelectOrder: (orderId: string) => void;
}

interface CarouselSlide {
  src: string;
  title: string;
  vendor: string;
  category: ProductCategory;
  priceCny: number;
  priceEur: number;
  sizeNote: string;
}

function ConcludedOrderCard({
  order,
  orderItems,
  displayCurrency,
  onExportCsv,
  onOpenReceiptPrinter,
  onReopenOrder,
  onSelectOrder,
}: {
  order: HaulOrder;
  orderItems: ProductItem[];
  displayCurrency: DisplayCurrencyCode;
  onExportCsv: (ordersSubset: HaulOrder[], filename: string) => void;
  onOpenReceiptPrinter: (orderId: string) => void;
  onReopenOrder: (orderId: string) => Promise<void>;
  onSelectOrder: (orderId: string) => void;
}) {
  const slides: CarouselSlide[] = useMemo(() => {
    const out: CarouselSlide[] = [];
    for (const item of orderItems) {
      const imgs = getItemImages(item).filter(Boolean);
      for (const src of imgs) {
        out.push({
          src,
          title: item.title,
          vendor: item.vendor,
          category: item.category,
          priceCny: item.priceCny,
          priceEur: convertCnyToCurrency(item.priceCny, order.exchangeRate, displayCurrency),
          sizeNote: item.sizeNote,
        });
      }
    }
    return out;
  }, [orderItems, order.exchangeRate, displayCurrency]);

  const [slideIdx, setSlideIdx] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const safeIdx = slides.length > 0 ? slideIdx % slides.length : 0;
  const activeSlide = slides[safeIdx] ?? null;
  const metrics = calculateOrderTotals(orderItems, order.exchangeRate);
  const totalDisplay =
    displayCurrency === 'CNY'
      ? metrics.totalCny
      : convertEurToCurrency(metrics.totalEur, displayCurrency);
  const trackingStep = TRACKING_MILESTONES.find(
    (m) => m.id === (order.trackingStatus ?? 'in_preparazione')
  );

  const goPrev = () => {
    if (slides.length <= 1) return;
    setDirection(-1);
    setSlideIdx((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goNext = () => {
    if (slides.length <= 1) return;
    setDirection(1);
    setSlideIdx((prev) => (prev + 1) % slides.length);
  };

  return (
    <article className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left: Product Photo Carousel */}
        <div className="lg:col-span-6 p-5 bg-[#F7F7F5] dark:bg-[#222220] border-b lg:border-b-0 lg:border-r border-[#E5E5E0] dark:border-[#2C2C2A] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Images className="w-4 h-4 text-[#E11D48] shrink-0" />
              <span className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                Purchased Products Gallery
              </span>
            </div>
            {slides.length > 0 && (
              <span className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums shrink-0">
                {safeIdx + 1} / {slides.length}
              </span>
            )}
          </div>

          {activeSlide ? (
            <div className="space-y-3">
              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.img
                    key={`${activeSlide.src}-${safeIdx}`}
                    src={activeSlide.src}
                    alt={activeSlide.title}
                    referrerPolicy="no-referrer"
                    initial={{ opacity: 0, x: direction * 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction * -24 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full h-full object-cover"
                  />
                </AnimatePresence>

                {slides.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      aria-label={`Previous photo for ${order.title}`}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 dark:bg-[#191918]/90 text-[#111110] dark:text-[#F4F4F0] border border-[#E5E5E0] dark:border-[#343430] shadow-sm flex items-center justify-center hover:scale-105 transition-transform cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      aria-label={`Next photo for ${order.title}`}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 dark:bg-[#191918]/90 text-[#111110] dark:text-[#F4F4F0] border border-[#E5E5E0] dark:border-[#343430] shadow-sm flex items-center justify-center hover:scale-105 transition-transform cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Clean typographic slide caption */}
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0] truncate">
                    {activeSlide.title}
                  </p>
                  <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
                    {getCategoryLabel(activeSlide.category)} · {activeSlide.vendor}
                    {activeSlide.sizeNote ? ` · ${activeSlide.sizeNote}` : ''}
                  </p>
                </div>
                <div className="text-right tabular-nums shrink-0">
                  <span className="text-xs font-mono font-semibold text-[#111110] dark:text-[#F4F4F0]">
                    {formatCny(activeSlide.priceCny)}
                  </span>
                  {displayCurrency !== 'CNY' && (
                    <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] ml-1.5">
                      {formatCurrency(activeSlide.priceEur, displayCurrency)}
                    </span>
                  )}
                </div>
              </div>

              {/* Thumbnail Strip */}
              {slides.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {slides.map((s, idx) => {
                    const active = idx === safeIdx;
                    return (
                      <button
                        key={`${s.src}-${idx}`}
                        type="button"
                        onClick={() => {
                          setDirection(idx >= safeIdx ? 1 : -1);
                          setSlideIdx(idx);
                        }}
                        aria-label={`Show photo ${idx + 1}: ${s.title}`}
                        className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                          active
                            ? 'border-[#E11D48] scale-105'
                            : 'border-transparent opacity-65 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={s.src}
                          alt={s.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[4/3] w-full rounded-xl bg-white dark:bg-[#191918] border border-dashed border-[#D6D6CF] dark:border-[#343430] flex flex-col items-center justify-center text-center p-6">
              <Images className="w-7 h-7 text-[#8E8E87] mb-2" />
              <p className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]">
                No photos available
              </p>
              <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mt-1">
                Reopen the order to upload QC photos for your purchased items.
              </p>
            </div>
          )}
        </div>

        {/* Right: Order Metadata, Products Summary & Actions */}
        <div className="lg:col-span-6 p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-[#16A34A] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    Concluded{' '}
                    {order.concludedAt
                      ? formatShortDate(order.concludedAt)
                      : formatShortDate(order.createdAt)}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[#111110] dark:text-[#F4F4F0] mt-1">
                  {order.title}
                </h2>
                {order.agentNote && (
                  <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] mt-0.5">
                    {order.agentNote}
                  </p>
                )}
              </div>

              <div className="text-right tabular-nums shrink-0">
                <div className="text-lg font-mono font-bold text-[#111110] dark:text-[#F4F4F0]">
                  {formatCurrency(totalDisplay, displayCurrency)}
                </div>
                {displayCurrency !== 'CNY' && (
                  <div className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                    {formatCny(metrics.totalCny)}
                  </div>
                )}
              </div>
            </div>

            {/* Tracking Status Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 px-3.5 rounded-xl bg-[#F7F7F5] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#343430] text-xs">
              <span className="inline-flex items-center gap-2 text-[#111110] dark:text-[#F4F4F0] font-medium">
                <Truck className="w-3.5 h-3.5 text-[#E11D48]" />
                {trackingStep?.label ?? 'In preparation'}
              </span>
              <span className="font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                {order.trackingNumber || 'No tracking'}
              </span>
            </div>

            {/* Products Checklist */}
            <div className="divide-y divide-[#EFEFEA] dark:divide-[#262624] max-h-56 overflow-y-auto pr-1">
              {orderItems.map((it) => {
                const countPhotos = getItemImages(it).length;
                return (
                  <div
                    key={it.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                        {it.title}
                      </p>
                      <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] flex items-center gap-1.5">
                        <CategoryIcon category={it.category} className="w-3 h-3 shrink-0" />
                        <span>{getCategoryLabel(it.category)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{it.vendor}</span>
                        {countPhotos > 1 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{countPhotos} photos</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                      <span className="font-mono font-semibold text-[#111110] dark:text-[#F4F4F0]">
                        {formatCurrency(
                          convertCnyToCurrency(it.priceCny, order.exchangeRate, displayCurrency),
                          displayCurrency
                        )}
                      </span>
                      {(it.link ?? '').trim() && (
                        <a
                          href={it.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open link for ${it.title}`}
                          className="p-1 text-[#6E6E68] hover:text-[#111110] dark:hover:text-[#F4F4F0]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#E5E5E0] dark:border-[#2C2C2A]">
            <TactileButton
              variant="dark"
              size="sm"
              onClick={() => onOpenReceiptPrinter(order.id)}
            >
              <Printer className="w-3.5 h-3.5" />
              Print Receipt
            </TactileButton>
            <TactileButton
              variant="secondary"
              size="sm"
              onClick={() =>
                onExportCsv(
                  [order],
                  `hauldesk-${order.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`
                )
              }
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </TactileButton>
            <TactileButton
              variant="secondary"
              size="sm"
              onClick={() => onSelectOrder(order.id)}
            >
              Details &amp; Tracking
            </TactileButton>
            <TactileButton
              variant="ghost"
              size="sm"
              onClick={() => void onReopenOrder(order.id)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reopen
            </TactileButton>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ConcludedOrdersView({
  orders,
  items,
  displayCurrency = 'EUR',
  onExportCsv,
  onOpenReceiptPrinter,
  onReopenOrder,
  onSelectOrder,
}: ConcludedOrdersViewProps) {
  const concludedOrders = orders.filter((o) => o.status === 'concluded');
  const concludedIds = new Set(concludedOrders.map((o) => o.id));
  const concludedItems = items.filter((it) => concludedIds.has(it.orderId));

  const totalDisplay = concludedOrders.reduce((sum, ord) => {
    const ordItems = concludedItems.filter((it) => it.orderId === ord.id);
    const metrics = calculateOrderTotals(ordItems, ord.exchangeRate);
    return (
      sum +
      (displayCurrency === 'CNY'
        ? metrics.totalCny
        : convertEurToCurrency(metrics.totalEur, displayCurrency))
    );
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111110] dark:text-[#F4F4F0] tracking-tight">
            Concluded Orders &amp; Haul Gallery
          </h1>
          <p className="text-xs sm:text-sm text-[#6E6E68] dark:text-[#9A9A92] mt-1">
            Archive of concluded orders with photo carousel, tracking, and receipts.
          </p>
        </div>

        {concludedOrders.length > 0 && (
          <TactileButton
            variant="secondary"
            size="sm"
            onClick={() => onExportCsv(concludedOrders, 'hauldesk-concluded-orders.csv')}
          >
            <Download className="w-4 h-4" />
            Export Concluded CSV
          </TactileButton>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-[11px] sm:text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
            Concluded Orders
          </p>
          <p className="text-base sm:text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {concludedOrders.length}
          </p>
        </div>
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-[11px] sm:text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
            Purchased Items
          </p>
          <p className="text-base sm:text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {concludedItems.length}
          </p>
        </div>
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-[11px] sm:text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
            Total Spent
          </p>
          <p className="text-base sm:text-xl font-mono font-bold text-[#E11D48] tabular-nums mt-1 truncate">
            {formatCurrency(totalDisplay, displayCurrency)}
          </p>
        </div>
      </div>

      {concludedOrders.length === 0 ? (
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-12 text-center space-y-2">
          <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
            No concluded orders yet
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
            When you close an open order, it will be archived here with a full photo carousel of all items.
          </p>
        </div>
      ) : (
        <div className="space-y-6" data-testid="concluded-orders-list">
          {concludedOrders.map((ord) => (
            <ConcludedOrderCard
              key={ord.id}
              order={ord}
              orderItems={concludedItems.filter((it) => it.orderId === ord.id)}
              displayCurrency={displayCurrency}
              onExportCsv={onExportCsv}
              onOpenReceiptPrinter={onOpenReceiptPrinter}
              onReopenOrder={onReopenOrder}
              onSelectOrder={onSelectOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

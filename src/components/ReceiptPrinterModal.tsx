import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Download, Printer, X } from 'lucide-react';
import { getCategoryLabel, type HaulOrder, type ProductItem } from '../types/haul';
import {
  calculateOrderTotals,
  convertCnyToCurrency,
  convertEurToCurrency,
  formatCny,
  formatCurrency,
  formatShortDate,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import { downloadOrderReceiptPng } from '../utils/receiptExport';
import { ReceiptPrinter, type ReceiptPrinterStage } from './ReceiptPrinter';
import { TactileButton } from './TactileButtons';

interface ReceiptPrinterModalProps {
  open: boolean;
  order: HaulOrder | null;
  items: ProductItem[];
  displayCurrency?: DisplayCurrencyCode;
  onClose: () => void;
}

interface ReceiptPrinterSessionProps {
  order: HaulOrder;
  items: ProductItem[];
  displayCurrency: DisplayCurrencyCode;
  onClose: () => void;
}

function ReceiptPrinterSession({
  order,
  items,
  displayCurrency,
  onClose,
}: ReceiptPrinterSessionProps) {
  const [stage, setStage] = useState<ReceiptPrinterStage>('processing');
  const [exported, setExported] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setStage('printing');
    }, 650);

    const t2 = window.setTimeout(() => {
      setStage('complete');
    }, 2550);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [order.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const metrics = calculateOrderTotals(items, order.exchangeRate);
  const convertedTotal =
    displayCurrency === 'CNY'
      ? metrics.totalCny
      : convertEurToCurrency(metrics.totalEur, displayCurrency);

  const handleExportPng = () => {
    downloadOrderReceiptPng(order, items, displayCurrency);
    setExported(true);
    window.setTimeout(() => setExported(false), 2400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111110]/80 dark:bg-black/85 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-printer-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-md my-auto flex flex-col items-center gap-4"
      >
        {/* Top Modal Bar */}
        <div className="w-full flex items-center justify-between px-1 text-white">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-[#E11D48]" />
            <h2
              id="receipt-printer-modal-title"
              className="text-sm font-bold tracking-tight"
            >
              Concluded Order Receipt
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt modal"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Animated Receipt Printer */}
        <ReceiptPrinter.Root
          stage={stage}
          feedMotion="stepped"
          className="w-full"
        >
          <ReceiptPrinter.Machine>
            <ReceiptPrinter.Header>
              <ReceiptPrinter.Screen>
                <ReceiptPrinter.Status />
              </ReceiptPrinter.Screen>
            </ReceiptPrinter.Header>

            <ReceiptPrinter.Output>
              <ReceiptPrinter.Paper>
                <div className="text-center border-b border-dashed border-[#D6D6CF] pb-3 space-y-0.5">
                  <p className="text-[10px] tracking-widest uppercase text-[#6E6E68]">
                    HAULDESK SUPERBUY RECEIPT
                  </p>
                  <h3 className="text-sm font-bold text-[#111110]">
                    {order.title}
                  </h3>
                  <p className="text-[11px] text-[#6E6E68]">
                    Closed{' '}
                    {formatShortDate(
                      order.concludedAt ?? new Date().toISOString()
                    )}
                  </p>
                  {order.trackingNumber && (
                    <p className="text-[11px] font-semibold text-[#111110] pt-0.5">
                      TRK: {order.trackingNumber}
                    </p>
                  )}
                </div>

                {/* Full Itemized Product List */}
                <div className="space-y-2 border-b border-dashed border-[#D6D6CF] pb-3 max-h-60 overflow-y-auto pr-1">
                  {items.length === 0 ? (
                    <p className="text-[11px] text-[#6E6E68] text-center py-2">
                      No items in this order.
                    </p>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 text-[11px]"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[#111110] leading-snug">
                            {item.title}
                          </p>
                          <p className="text-[10px] text-[#6E6E68]">
                            {getCategoryLabel(item.category)} · {item.vendor}
                          </p>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <div className="font-semibold text-[#111110]">
                            {formatCny(item.priceCny)}
                          </div>
                          {displayCurrency !== 'CNY' && (
                            <div className="text-[10px] text-[#6E6E68]">
                              {formatCurrency(
                                convertCnyToCurrency(item.priceCny, order.exchangeRate, displayCurrency),
                                displayCurrency
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Totals */}
                <div className="space-y-1.5 pt-1 tabular-nums">
                  <div className="flex items-center justify-between text-[11px] text-[#6E6E68]">
                    <span>Items ({metrics.itemCount})</span>
                    <span>{metrics.uniqueVendors} {metrics.uniqueVendors === 1 ? 'vendor' : 'vendors'}</span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm font-bold text-[#111110] pt-1">
                    <span>ORDER TOTAL</span>
                    <div className="text-right">
                      <div>{formatCny(metrics.totalCny)}</div>
                      {displayCurrency !== 'CNY' && (
                        <div className="text-xs font-semibold text-[#E11D48]">
                          {formatCurrency(convertedTotal, displayCurrency)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-center border-t border-dashed border-[#D6D6CF]">
                  <p className="text-[10px] tracking-widest text-[#8E8E87]">
                    * THANK YOU · READY TO SHIP *
                  </p>
                </div>
              </ReceiptPrinter.Paper>
            </ReceiptPrinter.Output>
          </ReceiptPrinter.Machine>
        </ReceiptPrinter.Root>

        <div className="w-full flex flex-wrap items-center justify-center gap-2.5">
          <TactileButton
            variant="primary"
            onClick={handleExportPng}
            className="min-w-[180px]"
          >
            {exported ? (
              <>
                <Check className="w-4 h-4" />
                Receipt Exported
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Receipt (PNG)
              </>
            )}
          </TactileButton>
          <TactileButton
            variant="secondary"
            onClick={onClose}
            className="min-w-[120px]"
          >
            Close
          </TactileButton>
        </div>
      </motion.div>
    </div>
  );
}

export function ReceiptPrinterModal({
  open,
  order,
  items,
  displayCurrency = 'EUR',
  onClose,
}: ReceiptPrinterModalProps) {
  return (
    <AnimatePresence>
      {open && order && (
        <ReceiptPrinterSession
          key={order.id}
          order={order}
          items={items}
          displayCurrency={displayCurrency}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}

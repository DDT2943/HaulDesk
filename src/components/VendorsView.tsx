import { useState } from 'react';
import { ExternalLink, Star, Store } from 'lucide-react';
import { getCategoryLabel, type HaulOrder, type ProductItem } from '../types/haul';
import {
  convertEurToCurrency,
  DEFAULT_CNY_TO_EUR_RATE,
  formatCny,
  formatCurrency,
  groupItemsByVendor,
  normalizeProductRating,
  PLATFORM_LABELS,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import { ProductThumb } from './ProductThumb';
import { CategoryIcon } from './CategoryIcons';

interface VendorsViewProps {
  orders: HaulOrder[];
  items: ProductItem[];
  displayCurrency?: DisplayCurrencyCode;
  estimatedExchangeRate?: number;
  onSelectOrder: (orderId: string) => void;
}

export function VendorsView({
  orders,
  items,
  displayCurrency = 'EUR',
  estimatedExchangeRate,
  onSelectOrder,
}: VendorsViewProps) {
  const [scope, setScope] = useState<'all' | 'open'>('all');

  const openOrderIds = new Set(
    orders.filter((o) => o.status === 'open').map((o) => o.id)
  );
  const scopedItems =
    scope === 'open'
      ? items.filter((it) => openOrderIds.has(it.orderId))
      : items;

  const effectiveRate = estimatedExchangeRate ?? DEFAULT_CNY_TO_EUR_RATE;
  const vendorGroups = groupItemsByVendor(scopedItems, effectiveRate);
  const orderTitleById = new Map(orders.map((o) => [o.id, o.title]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111110] dark:text-[#F4F4F0] tracking-tight">
            Vendors Overview
          </h1>
          <p className="text-sm text-[#6E6E68] dark:text-[#9A9A92] mt-1">
            All Yupoo, Taobao, and Weidian stores sorted by total spend.
          </p>
        </div>

        <div className="inline-flex items-center p-1 bg-[#EFEFEA] dark:bg-[#242422] rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              scope === 'all'
                ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
            }`}
          >
            All orders
          </button>
          <button
            type="button"
            onClick={() => setScope('open')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              scope === 'open'
                ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
            }`}
          >
            Open orders only
          </button>
        </div>
      </div>

      {vendorGroups.length === 0 ? (
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-12 text-center">
          <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
            No vendors match this filter
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] mt-1">
            Add a product to an open order to see it grouped here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {vendorGroups.map((group) => (
            <section
              key={group.vendor}
              className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="px-5 py-4 bg-[#F7F7F5] dark:bg-[#222220] border-b border-[#E5E5E0] dark:border-[#2C2C2A] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] shrink-0">
                    <Store className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-[#111110] dark:text-[#F4F4F0] truncate">
                        {group.vendor}
                      </h2>
                      {group.averageRating !== null && group.ratedItemCount > 0 && (
                        <span
                          data-testid={`vendor-rating-${group.vendor}`}
                          title={`Average rating: ${group.averageRating.toFixed(1)} out of 5 (${group.ratedItemCount} rated ${
                            group.ratedItemCount === 1 ? 'item' : 'items'
                          })`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 text-[11px] font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums shrink-0"
                        >
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span>{group.averageRating.toFixed(1)}</span>
                          <span className="font-normal opacity-75">
                            ({group.ratedItemCount})
                          </span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                      {group.itemCount} {group.itemCount === 1 ? 'item' : 'items'} ·{' '}
                      {group.platforms.map((p) => PLATFORM_LABELS[p]).join(', ')}
                    </p>
                  </div>
                </div>

                <div className="text-right tabular-nums shrink-0">
                  <div className="text-base font-mono font-bold text-[#111110] dark:text-[#F4F4F0]">
                    {formatCny(group.totalCny)}
                  </div>
                  {displayCurrency !== 'CNY' && (
                    <div className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                      {formatCurrency(
                        convertEurToCurrency(group.totalEur, displayCurrency),
                        displayCurrency
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="divide-y divide-[#EFEFEA] dark:divide-[#262624]">
                {group.items.map((item) => {
                  const itemRating = normalizeProductRating(item.rating);
                  return (
                    <div
                      key={item.id}
                      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#F7F7F5]/60 dark:hover:bg-[#222220]/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumb
                          imageUrl={item.imageUrl}
                          title={item.title}
                          category={item.category}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                            {item.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mt-0.5">
                            <span className="inline-flex items-center gap-1 text-[#111110] dark:text-[#F4F4F0]">
                              <CategoryIcon category={item.category} className="w-3 h-3" />
                              {getCategoryLabel(item.category)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => onSelectOrder(item.orderId)}
                              className="hover:text-[#E11D48] underline underline-offset-2 cursor-pointer"
                            >
                              {orderTitleById.get(item.orderId) ?? 'Order'}
                            </button>
                            {itemRating !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-amber-600 dark:text-amber-400">
                                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                  {itemRating}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-mono font-semibold text-[#111110] dark:text-[#F4F4F0] tabular-nums">
                          {formatCny(item.priceCny)}
                        </span>
                        {(item.link ?? '').trim() && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open link for ${item.title}`}
                            className="p-1.5 rounded-lg text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

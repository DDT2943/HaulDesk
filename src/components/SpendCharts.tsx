import { motion } from 'motion/react';
import type { CategoryBreakdown, VendorGroup } from '../utils/haulLogic';
import {
  convertEurToCurrency,
  formatCny,
  formatCurrency,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import { getCategoryLabel, type ProductCategory } from '../types/haul';
import { CategoryIcon } from './CategoryIcons';

interface CategorySpendChartProps {
  breakdown: CategoryBreakdown[];
  activeCategory: ProductCategory | 'All';
  displayCurrency?: DisplayCurrencyCode;
  onSelectCategory?: (category: ProductCategory | 'All') => void;
}

export function CategorySpendChart({
  breakdown,
  activeCategory,
  displayCurrency = 'EUR',
  onSelectCategory,
}: CategorySpendChartProps) {
  const maxCny = Math.max(1, ...breakdown.map((b) => b.totalCny));

  return (
    <div className="space-y-3">
      {breakdown.map((slice, idx) => {
        const ratio = slice.totalCny > 0 ? Math.max(0.04, slice.totalCny / maxCny) : 0;
        const isSelected = activeCategory === slice.category;

        return (
          <button
            key={slice.category}
            type="button"
            onClick={() =>
              onSelectCategory?.(isSelected ? 'All' : slice.category)
            }
            className={`w-full text-left group rounded-xl p-2 -mx-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] cursor-pointer ${
              isSelected
                ? 'bg-[#EFEFEA] dark:bg-[#242422]'
                : 'hover:bg-[#F7F7F5] dark:hover:bg-[#222220]'
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] shrink-0"
                  style={isSelected ? { borderColor: slice.color, color: slice.color } : undefined}
                >
                  <CategoryIcon category={slice.category} className="w-3.5 h-3.5" active={isSelected} />
                </span>
                <span className="text-xs font-medium text-[#111110] dark:text-[#F4F4F0] truncate">
                  {getCategoryLabel(slice.category)}
                </span>
                <span className="text-xs text-[#6E6E68] dark:text-[#9A9A92] tabular-nums shrink-0">
                  {slice.count} pcs
                </span>
              </div>
              <div className="flex items-baseline gap-2 shrink-0 tabular-nums">
                <span className="text-xs font-mono font-semibold text-[#111110] dark:text-[#F4F4F0]">
                  {formatCurrency(
                    displayCurrency === 'CNY'
                      ? slice.totalCny
                      : convertEurToCurrency(slice.totalEur, displayCurrency),
                    displayCurrency
                  )}
                </span>
                <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                  {slice.sharePercent}%
                </span>
              </div>
            </div>

            <div className="h-2 w-full rounded-full bg-[#EFEFEA] dark:bg-[#262624] overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: ratio }}
                transition={{
                  type: 'spring',
                  stiffness: 240,
                  damping: 26,
                  delay: idx * 0.04,
                }}
                style={{
                  transformOrigin: 'left',
                  backgroundColor: slice.color,
                }}
                className="h-full w-full rounded-full"
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface VendorSpendChartProps {
  vendors: VendorGroup[];
  displayCurrency?: DisplayCurrencyCode;
  onSelectVendor?: (vendor: string) => void;
}

export function VendorSpendChart({
  vendors,
  displayCurrency = 'EUR',
  onSelectVendor,
}: VendorSpendChartProps) {
  if (vendors.length === 0) {
    return (
      <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] py-4">
        No vendors recorded in this order.
      </p>
    );
  }

  const maxCny = Math.max(1, ...vendors.map((v) => v.totalCny));

  return (
    <div className="space-y-3">
      {vendors.map((group, idx) => {
        const ratio = Math.max(0.06, group.totalCny / maxCny);
        return (
          <button
            key={group.vendor}
            type="button"
            onClick={() => onSelectVendor?.(group.vendor)}
            className="w-full text-left rounded-xl p-2 -mx-2 hover:bg-[#F7F7F5] dark:hover:bg-[#222220] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="min-w-0 flex items-baseline gap-2">
                <span className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                  {group.vendor}
                </span>
                <span className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] tabular-nums shrink-0">
                  {group.itemCount} {group.itemCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <div className="flex items-baseline gap-2 shrink-0 tabular-nums">
                <span className="text-xs font-mono font-semibold text-[#111110] dark:text-[#F4F4F0]">
                  {formatCny(group.totalCny)}
                </span>
                {displayCurrency !== 'CNY' && (
                  <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                    {formatCurrency(
                      convertEurToCurrency(group.totalEur, displayCurrency),
                      displayCurrency
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-[#EFEFEA] dark:bg-[#262624] overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: ratio }}
                transition={{
                  type: 'spring',
                  stiffness: 220,
                  damping: 24,
                  delay: idx * 0.05,
                }}
                style={{ transformOrigin: 'left' }}
                className="h-full w-full rounded-full bg-[#111110] dark:bg-[#F4F4F0]"
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

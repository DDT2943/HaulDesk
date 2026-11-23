import { PRODUCT_CATEGORIES, type HaulOrder, type ProductItem } from '../types/haul';
import {
  calculateOrderTotals,
  convertEurToCurrency,
  DEFAULT_CNY_TO_EUR_RATE,
  formatCny,
  formatCurrency,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import { CategorySpendChart, VendorSpendChart } from './SpendCharts';
import { SwapCurrencyCard } from './SwapCurrencyCard';

interface AnalyticsViewProps {
  orders: HaulOrder[];
  items: ProductItem[];
  displayCurrency?: DisplayCurrencyCode;
  estimatedExchangeRate?: number;
  onUpdateEstimatedExchangeRate?: (nextRate: number) => Promise<void> | void;
  onChangeDisplayCurrency?: (code: DisplayCurrencyCode) => void;
}

export function AnalyticsView({
  orders,
  items,
  displayCurrency = 'EUR',
  estimatedExchangeRate,
  onUpdateEstimatedExchangeRate,
  onChangeDisplayCurrency,
}: AnalyticsViewProps) {
  const globalMetrics = calculateOrderTotals(
    items,
    estimatedExchangeRate ?? DEFAULT_CNY_TO_EUR_RATE
  );
  const openCount = orders.filter((o) => o.status === 'open').length;
  const concludedCount = orders.filter((o) => o.status === 'concluded').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#111110] dark:text-[#F4F4F0] tracking-tight">
          Haul Analytics &amp; Categories
        </h1>
        <p className="text-sm text-[#6E6E68] dark:text-[#9A9A92] mt-1">
          Spend distribution across all {PRODUCT_CATEGORIES.length} product categories and top vendors.
        </p>
      </div>

      {/* Dynamic Currency Swap on Mobile inside Analytics */}
      <SwapCurrencyCard
        estimatedExchangeRate={estimatedExchangeRate}
        onUpdateEstimatedExchangeRate={onUpdateEstimatedExchangeRate}
        defaultAmount="100"
        defaultFromCode="CNY"
        toCode={displayCurrency}
        onToCodeChange={onChangeDisplayCurrency}
        className="lg:hidden"
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Total Cataloged Spend</p>
          <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {formatCny(globalMetrics.totalCny)}
          </p>
          {displayCurrency !== 'CNY' && (
            <p className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
              {formatCurrency(
                convertEurToCurrency(globalMetrics.totalEur, displayCurrency),
                displayCurrency
              )}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Managed Orders</p>
          <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {orders.length}
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
            {openCount} open · {concludedCount} concluded
          </p>
        </div>

        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Total Items</p>
          <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {globalMetrics.itemCount}
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Across {PRODUCT_CATEGORIES.length} categories</p>
        </div>

        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Unique Vendors</p>
          <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {globalMetrics.uniqueVendors}
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Yupoo / Taobao / Weidian</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0] mb-1">
            Category Breakdown
          </h2>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] mb-4">
            Spend share across {PRODUCT_CATEGORIES.map((c) => c.label).join(', ')}.
          </p>
          <CategorySpendChart
            breakdown={globalMetrics.byCategory}
            activeCategory="All"
            displayCurrency={displayCurrency}
          />
        </div>

        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0] mb-1">
            Top Vendors by Spend
          </h2>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] mb-4">
            Comparison of your most ordered sellers across Superbuy hauls.
          </p>
          <VendorSpendChart
            vendors={globalMetrics.byVendor}
            displayCurrency={displayCurrency}
          />
        </div>
      </div>
    </div>
  );
}

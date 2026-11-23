import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bookmark,
  CheckSquare,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Square,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  getCategoryLabel,
  PRODUCT_CATEGORIES,
  type HaulOrder,
  type ProductCategory,
  type ProductItem,
} from '../types/haul';
import {
  areAllVisibleSelected,
  convertCnyToCurrency,
  convertEurToCurrency,
  DEFAULT_CNY_TO_EUR_RATE,
  extractUniqueVendors,
  filterItems,
  formatCny,
  formatCurrency,
  formatShortDate,
  getItemImages,
  PLATFORM_LABELS,
  summarizeSelectedItems,
  toggleSelectAllVisible,
  toggleSelectionId,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import { CategoryIcon } from './CategoryIcons';
import { ProductThumb } from './ProductThumb';
import { TactileButton } from './TactileButtons';
import { TimedUndoAction } from './TimedUndoAction';
import { CATEGORY_FILTER_ITEMS, FilterDisclosure } from './FilterDisclosure';
import { EditProductModal, type EditProductPatch } from './EditProductModal';

export interface SavedBulkActionPayload {
  action: 'update_category' | 'move_to_order' | 'delete';
  itemIds: string[];
  category?: ProductCategory;
  targetOrderId?: string;
}

interface SavedForLaterViewProps {
  savedItems: ProductItem[];
  openOrders: HaulOrder[];
  existingVendors?: string[];
  displayCurrency?: DisplayCurrencyCode;
  estimatedExchangeRate?: number;
  onOpenAddSavedProduct: () => void;
  onOpenNewOrder: () => void;
  onMoveToOrder: (itemId: string, orderId: string) => Promise<void>;
  onUpdateSavedItem?: (itemId: string, patch: EditProductPatch) => Promise<void>;
  onDeleteSavedItem: (itemId: string) => Promise<void>;
  onBulkAction?: (payload: SavedBulkActionPayload) => Promise<void>;
}

export function SavedForLaterView({
  savedItems,
  openOrders,
  existingVendors = [],
  displayCurrency = 'EUR',
  estimatedExchangeRate,
  onOpenAddSavedProduct,
  onOpenNewOrder,
  onMoveToOrder,
  onUpdateSavedItem,
  onDeleteSavedItem,
  onBulkAction,
}: SavedForLaterViewProps) {
  const effectiveRate = estimatedExchangeRate ?? DEFAULT_CNY_TO_EUR_RATE;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ProductCategory | 'All'>('All');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(() => openOrders[0]?.id ?? '');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<ProductCategory>(PRODUCT_CATEGORIES[0].id);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPendingDelete, setBulkPendingDelete] = useState(false);

  useEffect(() => {
    if (openOrders.length === 0) {
      setSelectedOrderId('');
      return;
    }
    if (!openOrders.some((o) => o.id === selectedOrderId)) {
      setSelectedOrderId(openOrders[0].id);
    }
  }, [openOrders, selectedOrderId]);

  useEffect(() => {
    if (savedItems.length === 0) {
      setSelectionMode(false);
      setSelectedIds([]);
      setBulkPendingDelete(false);
    }
  }, [savedItems.length]);

  const editingItem = useMemo(
    () => (editingItemId ? savedItems.find((it) => it.id === editingItemId) ?? null : null),
    [savedItems, editingItemId]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of savedItems) {
      counts[it.category] = (counts[it.category] ?? 0) + 1;
    }
    return counts;
  }, [savedItems]);

  const filteredItems = useMemo(
    () =>
      filterItems(savedItems, {
        search: searchQuery,
        category: activeCategory,
      }),
    [savedItems, searchQuery, activeCategory]
  );

  const validSavedIdSet = useMemo(() => new Set(savedItems.map((it) => it.id)), [savedItems]);
  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => validSavedIdSet.has(id)),
    [selectedIds, validSavedIdSet]
  );

  useEffect(() => {
    if (activeSelectedIds.length === 0 && bulkPendingDelete) {
      setBulkPendingDelete(false);
    }
  }, [activeSelectedIds.length, bulkPendingDelete]);

  const visibleIds = useMemo(() => filteredItems.map((it) => it.id), [filteredItems]);
  const allVisibleSelected = areAllVisibleSelected(activeSelectedIds, visibleIds);
  const selectedSummary = useMemo(
    () => summarizeSelectedItems(savedItems, activeSelectedIds, effectiveRate),
    [savedItems, activeSelectedIds, effectiveRate]
  );
  const selectedDisplayTotal =
    displayCurrency === 'CNY'
      ? selectedSummary.totalCny
      : convertEurToCurrency(selectedSummary.totalEur, displayCurrency);

  const uniqueVendors = useMemo(
    () => extractUniqueVendors(savedItems),
    [savedItems]
  );

  const totalCny = useMemo(
    () => Math.round(savedItems.reduce((sum, it) => sum + it.priceCny, 0) * 100) / 100,
    [savedItems]
  );

  const totalDisplay = useMemo(
    () =>
      displayCurrency === 'CNY'
        ? totalCny
        : convertEurToCurrency(
            Math.round(totalCny * effectiveRate * 100) / 100,
            displayCurrency
          ),
    [totalCny, displayCurrency, effectiveRate]
  );

  const handleMove = async (itemId: string) => {
    if (!selectedOrderId) return;
    setActionError(null);
    setMovingId(itemId);
    try {
      await onMoveToOrder(itemId, selectedOrderId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Error moving item to order'
      );
    } finally {
      setMovingId(null);
    }
  };

  const handleDeleteSaved = async (itemId: string) => {
    setActionError(null);
    try {
      await onDeleteSavedItem(itemId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Error deleting saved item'
      );
    }
  };

  const runBulkAction = async (payload: Omit<SavedBulkActionPayload, 'itemIds'>) => {
    if (!onBulkAction || activeSelectedIds.length === 0) return;
    setActionError(null);
    setBulkBusy(true);
    try {
      await onBulkAction({
        ...payload,
        itemIds: activeSelectedIds,
      });
      setBulkPendingDelete(false);
      if (payload.action !== 'update_category') {
        setSelectedIds((prev) => prev.filter((id) => !activeSelectedIds.includes(id)));
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Error executing bulk action'
      );
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:flex-nowrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111110] dark:text-[#F4F4F0] tracking-tight">
            Save for Later
          </h1>
          <p className="text-xs sm:text-sm text-[#6E6E68] dark:text-[#9A9A92] mt-1">
            Items saved for upcoming hauls: move them into an open order whenever you are ready to buy.
          </p>
        </div>

        <div className="shrink-0">
          <TactileButton
            variant="primary"
            size="sm"
            onClick={onOpenAddSavedProduct}
          >
            <Plus className="w-4 h-4" />
            Save New Product
          </TactileButton>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-[11px] sm:text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
            Saved Items
          </p>
          <p className="text-base sm:text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {savedItems.length}
          </p>
        </div>

        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-[11px] sm:text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
            Estimated Value
          </p>
          <p className="text-base sm:text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1 truncate">
            {formatCny(totalCny)}
          </p>
          {displayCurrency !== 'CNY' && (
            <p className="text-[11px] sm:text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums truncate">
              {formatCurrency(totalDisplay, displayCurrency)}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-[11px] sm:text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
            Unique Vendors
          </p>
          <p className="text-base sm:text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {uniqueVendors.length}
          </p>
        </div>
      </div>

      {/* Main Card Container */}
      <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl overflow-visible">
        {/* Toolbar: FilterDisclosure + Search + Destination Open Order */}
        <div className="p-4 sm:p-5 border-b border-[#E5E5E0] dark:border-[#2C2C2A] space-y-3.5 rounded-t-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:flex-nowrap">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FilterDisclosure
                items={CATEGORY_FILTER_ITEMS}
                activeId={activeCategory}
                onSelect={(id) => setActiveCategory(id as ProductCategory | 'All')}
                counts={categoryCounts}
                totalCount={savedItems.length}
              />

              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-[#8E8E87] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search saved items..."
                  aria-label="Search saved items"
                  className="w-full pl-9 pr-3 py-2 text-sm sm:text-xs bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-nowrap min-w-0">
              {openOrders.length > 0 ? (
                <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-0">
                  <label
                    htmlFor="saved-target-order"
                    className="text-xs font-medium text-[#6E6E68] dark:text-[#9A9A92] whitespace-nowrap shrink-0"
                  >
                    Move to:
                  </label>
                  <select
                    id="saved-target-order"
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="min-w-0 max-w-full flex-1 sm:flex-initial px-3 py-2 text-xs font-medium bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                  >
                    {openOrders.map((ord) => (
                      <option key={ord.id} value={ord.id}>
                        {ord.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                    No open orders
                  </span>
                  <TactileButton
                    variant="secondary"
                    size="sm"
                    onClick={onOpenNewOrder}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Open Order
                  </TactileButton>
                </div>
              )}

              {savedItems.length > 0 && onBulkAction && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode((prev) => {
                      const next = !prev;
                      if (!next) {
                        setSelectedIds([]);
                        setBulkPendingDelete(false);
                      }
                      return next;
                    });
                  }}
                  aria-pressed={selectionMode}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                    selectionMode
                      ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110] dark:border-[#F4F4F0]'
                      : 'bg-[#F7F7F5] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border-[#E5E5E0] dark:border-[#343430] hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27]'
                  }`}
                >
                  {selectionMode ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  {selectionMode ? 'Done' : 'Select'}
                </button>
              )}
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {selectionMode && savedItems.length > 0 && (
            <div
              data-testid="saved-bulk-bar"
              className="p-3.5 rounded-xl bg-[#F7F7F5] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#343430] space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <button
                    type="button"
                    disabled={visibleIds.length === 0 || bulkBusy}
                    onClick={() => {
                      setBulkPendingDelete(false);
                      setSelectedIds((prev) => toggleSelectAllVisible(prev, visibleIds));
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {allVisibleSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[#E11D48]" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                  </button>

                  <span className="text-xs font-medium text-[#111110] dark:text-[#F4F4F0] tabular-nums whitespace-nowrap">
                    {selectedSummary.count} selected
                  </span>

                  {selectedSummary.count > 0 && (
                    <span className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                      · {formatCny(selectedSummary.totalCny)}
                      {displayCurrency !== 'CNY' &&
                        ` (${formatCurrency(selectedDisplayTotal, displayCurrency)})`}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedIds([]);
                    setBulkPendingDelete(false);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  Close
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {openOrders.length > 0 && selectedOrderId && (
                  <TactileButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={bulkBusy || activeSelectedIds.length === 0}
                    onClick={() =>
                      void runBulkAction({
                        action: 'move_to_order',
                        targetOrderId: selectedOrderId,
                      })
                    }
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-[#E11D48]" />
                    Move to Order ({activeSelectedIds.length})
                  </TactileButton>
                )}

                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto min-w-0">
                  <select
                    aria-label="Target category for saved items"
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value as ProductCategory)}
                    disabled={bulkBusy || activeSelectedIds.length === 0}
                    className="min-w-0 max-w-full flex-1 sm:flex-initial px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] rounded-lg text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48] disabled:opacity-50"
                  >
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <TactileButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={bulkBusy || activeSelectedIds.length === 0}
                    onClick={() =>
                      void runBulkAction({
                        action: 'update_category',
                        category: bulkCategory,
                      })
                    }
                  >
                    <Tag className="w-3.5 h-3.5" />
                    Apply category
                  </TactileButton>
                </div>

                {bulkPendingDelete ? (
                  <TimedUndoAction
                    compact
                    autoStart
                    undoDuration={5}
                    cancelText="Cancel"
                    onCancel={() => setBulkPendingDelete(false)}
                    onExpire={() => {
                      void runBulkAction({ action: 'delete' });
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={bulkBusy || activeSelectedIds.length === 0}
                    onClick={() => setBulkPendingDelete(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#FEF2F2] dark:bg-[#3A161A] text-[#DC2626] dark:text-[#F87171] border border-[#FECACA] dark:border-[#7F1D1D] hover:bg-[#FEE2E2] dark:hover:bg-[#4B1D22] disabled:opacity-45 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {actionError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 text-xs text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#3A161A] border border-[#FECACA] dark:border-[#7F1D1D] rounded-xl px-3 py-2"
            >
              <span>{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                aria-label="Dismiss error"
                className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Saved Items List */}
        {filteredItems.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3 rounded-b-2xl">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-[#EFEFEA] dark:bg-[#242422] text-[#6E6E68] dark:text-[#9A9A92]">
              <Bookmark className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
              {savedItems.length === 0
                ? 'No items saved for later'
                : 'No saved items match your filters'}
            </p>
            <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] max-w-md mx-auto">
              {savedItems.length === 0
                ? 'Save finds from Yupoo, Taobao, or Weidian here, or move an item from an open order to defer it to a future haul.'
                : 'Try changing the category filter or adjusting your search.'}
            </p>
            {savedItems.length === 0 && (
              <div className="pt-1">
                <TactileButton variant="primary" onClick={onOpenAddSavedProduct}>
                  <Plus className="w-4 h-4" />
                  Save First Product
                </TactileButton>
              </div>
            )}
          </div>
        ) : (
          <div data-testid="saved-for-later-list" className="rounded-b-2xl">
            {filteredItems.map((item) => {
              const convertedPrice = convertCnyToCurrency(
                item.priceCny,
                effectiveRate,
                displayCurrency
              );
              const itemImages = getItemImages(item);
              const isPendingDelete = pendingDeleteId === item.id;
              const isMoving = movingId === item.id;
              const isSelected = selectionMode && activeSelectedIds.includes(item.id);

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className={`py-3.5 px-3.5 sm:px-4 border-b border-[#EFEFEA] dark:border-[#262624] last:border-b-0 last:rounded-b-2xl transition-colors ${
                    isSelected
                      ? 'bg-[#FFF1F2]/55 dark:bg-[#3A1620]/30'
                      : 'hover:bg-[#F7F7F5]/60 dark:hover:bg-[#222220]/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 min-w-0">
                      {selectionMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setBulkPendingDelete(false);
                            setSelectedIds((prev) => toggleSelectionId(prev, item.id));
                          }}
                          aria-label={`Select ${item.title}`}
                          className="mt-1 sm:mt-0 w-4 h-4 rounded border-[#D4D4CE] dark:border-[#444440] accent-[#E11D48] shrink-0 cursor-pointer"
                        />
                      )}
                      <ProductThumb
                        imageUrl={item.imageUrl}
                        imageUrls={item.imageUrls}
                        title={item.title}
                        category={item.category}
                        size="md"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0] line-clamp-2 sm:truncate">
                          {item.title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                          <span className="inline-flex items-center gap-1 font-medium text-[#111110] dark:text-[#F4F4F0]">
                            <CategoryIcon category={item.category} className="w-3.5 h-3.5" />
                            {getCategoryLabel(item.category)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.vendor}</span>
                          {(item.link ?? '').trim() && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{PLATFORM_LABELS[item.platform]}</span>
                            </>
                          )}
                          {item.sizeNote && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.sizeNote}</span>
                            </>
                          )}
                          {itemImages.length > 1 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {itemImages.length} photos
                              </span>
                            </>
                          )}
                          {item.savedAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Saved {formatShortDate(item.savedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0 pt-1 sm:pt-0 border-t border-[#F2F2ED] dark:border-[#242422] sm:border-t-0">
                      <div className="text-left sm:text-right tabular-nums">
                        <div className="text-sm font-mono font-semibold text-[#111110] dark:text-[#F4F4F0]">
                          {formatCny(item.priceCny)}
                        </div>
                        {displayCurrency !== 'CNY' && (
                          <div className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                            {formatCurrency(convertedPrice, displayCurrency)}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isPendingDelete && onUpdateSavedItem && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setEditingItemId(item.id);
                            }}
                            aria-label={`Edit ${item.title}`}
                            className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-[#111110] dark:text-[#F4F4F0] bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#2E2E2B] border border-[#E5E5E0] dark:border-[#343430] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}

                        {!isPendingDelete && openOrders.length > 0 && selectedOrderId && (
                          <TactileButton
                            variant="secondary"
                            size="sm"
                            disabled={isMoving}
                            onClick={() => void handleMove(item.id)}
                          >
                            <ArrowRight className="w-3.5 h-3.5 text-[#E11D48]" />
                            {isMoving ? 'Moving...' : 'Move to Order'}
                          </TactileButton>
                        )}

                        {(item.link ?? '').trim() && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open product link for ${item.title}`}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[#52524E] dark:text-[#B4B4AC] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        {isPendingDelete ? (
                          <TimedUndoAction
                            compact
                            autoStart
                            undoDuration={5}
                            cancelText="Cancel"
                            onCancel={() => setPendingDeleteId(null)}
                            onExpire={() => {
                              setPendingDeleteId(null);
                              void handleDeleteSaved(item.id);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(item.id)}
                            aria-label={`Delete ${item.title} from saved`}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[#8E8E87] hover:text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#3A161A] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {onUpdateSavedItem && (
        <EditProductModal
          open={Boolean(editingItem)}
          item={editingItem}
          existingVendors={existingVendors}
          displayCurrency={displayCurrency}
          exchangeRate={effectiveRate}
          onClose={() => setEditingItemId(null)}
          onSaveItem={onUpdateSavedItem}
        />
      )}
    </div>
  );
}

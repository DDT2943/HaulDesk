import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckSquare,
  ExternalLink,
  Lock,
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
  type TrackingMilestone,
} from '../types/haul';
import {
  areAllVisibleSelected,
  canModifyOrder,
  convertCnyToCurrency,
  convertEurToCurrency,
  filterItems,
  formatCny,
  formatCurrency,
  getItemImages,
  groupItemsByVendor,
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
import { OrderTrackingPanel } from './OrderTrackingPanel';
import { CATEGORY_FILTER_ITEMS, FilterDisclosure } from './FilterDisclosure';
import { EditProductModal, type EditProductPatch } from './EditProductModal';

export interface OrderBulkActionPayload {
  action: 'update_category' | 'move_to_order' | 'save_for_later' | 'delete';
  itemIds: string[];
  category?: ProductCategory;
  targetOrderId?: string;
}

interface OrderDetailViewProps {
  order: HaulOrder;
  items: ProductItem[];
  openOrders?: HaulOrder[];
  existingVendors?: string[];
  activeCategory: ProductCategory | 'All';
  displayCurrency?: DisplayCurrencyCode;
  hideTracking?: boolean;
  onCategoryChange: (cat: ProductCategory | 'All') => void;
  onOpenAddProduct: () => void;
  onDeleteItem: (itemId: string) => Promise<void>;
  onSaveItemForLater?: (itemId: string) => Promise<void>;
  onUpdateItem: (itemId: string, patch: EditProductPatch) => Promise<void>;
  onBulkAction?: (payload: OrderBulkActionPayload) => Promise<void>;
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
  onBack?: () => void;
}

export function OrderDetailView({
  order,
  items,
  openOrders = [],
  existingVendors = [],
  activeCategory,
  displayCurrency = 'EUR',
  hideTracking = false,
  onCategoryChange,
  onOpenAddProduct,
  onDeleteItem,
  onSaveItemForLater,
  onUpdateItem,
  onBulkAction,
  onUpdateTracking,
  onSyncLiveTracking,
  onBack,
}: OrderDetailViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [savingForLaterId, setSavingForLaterId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<ProductCategory>(PRODUCT_CATEGORIES[0].id);
  const [bulkTargetOrderId, setBulkTargetOrderId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPendingDelete, setBulkPendingDelete] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const isEditable = canModifyOrder(order);

  const otherOpenOrders = useMemo(
    () => openOrders.filter((o) => o.id !== order.id && o.status === 'open'),
    [openOrders, order.id]
  );

  useEffect(() => {
    setPendingDeleteId(null);
    setEditingItemId(null);
    setSavingForLaterId(null);
    setActionError(null);
    setSelectionMode(false);
    setSelectedIds([]);
    setBulkPendingDelete(false);
    setBulkError(null);
  }, [order.id]);

  useEffect(() => {
    if (!isEditable || items.length === 0) {
      setSelectionMode(false);
      setSelectedIds([]);
      setBulkPendingDelete(false);
    }
  }, [isEditable, items.length]);

  useEffect(() => {
    if (otherOpenOrders.length === 0) {
      setBulkTargetOrderId('');
      return;
    }
    if (!otherOpenOrders.some((o) => o.id === bulkTargetOrderId)) {
      setBulkTargetOrderId(otherOpenOrders[0].id);
    }
  }, [otherOpenOrders, bulkTargetOrderId]);

  const editingItem = useMemo(
    () => (editingItemId ? items.find((it) => it.id === editingItemId) ?? null : null),
    [items, editingItemId]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) {
      counts[it.category] = (counts[it.category] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const filtered = filterItems(items, {
    search: searchQuery,
    category: activeCategory,
  });

  const validItemIdSet = useMemo(() => new Set(items.map((it) => it.id)), [items]);
  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => validItemIdSet.has(id)),
    [selectedIds, validItemIdSet]
  );

  useEffect(() => {
    if (activeSelectedIds.length === 0 && bulkPendingDelete) {
      setBulkPendingDelete(false);
    }
  }, [activeSelectedIds.length, bulkPendingDelete]);

  const visibleIds = useMemo(() => filtered.map((it) => it.id), [filtered]);
  const allVisibleSelected = areAllVisibleSelected(activeSelectedIds, visibleIds);
  const selectedSummary = useMemo(
    () => summarizeSelectedItems(items, activeSelectedIds, order.exchangeRate),
    [items, activeSelectedIds, order.exchangeRate]
  );
  const selectedDisplayTotal =
    displayCurrency === 'CNY'
      ? selectedSummary.totalCny
      : convertEurToCurrency(selectedSummary.totalEur, displayCurrency);

  const vendorGroups = groupItemsByVendor(filtered, order.exchangeRate);

  const runBulkAction = async (payload: Omit<OrderBulkActionPayload, 'itemIds'>) => {
    if (!onBulkAction || activeSelectedIds.length === 0) return;
    setBulkError(null);
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
      setBulkError(
        err instanceof Error ? err.message : 'Error executing bulk action.'
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSaveForLater = async (itemId: string) => {
    if (!onSaveItemForLater) return;
    setActionError(null);
    setSavingForLaterId(itemId);
    try {
      await onSaveItemForLater(itemId);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Could not save product for later. Please try again.'
      );
    } finally {
      setSavingForLaterId(null);
    }
  };

  const handleDelete = async (itemId: string) => {
    setActionError(null);
    try {
      await onDeleteItem(itemId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Error deleting product.'
      );
    }
  };

  const renderProductRow = (item: ProductItem) => {
    const convertedPrice = convertCnyToCurrency(item.priceCny, order.exchangeRate, displayCurrency);
    const isPendingDelete = pendingDeleteId === item.id;
    const isSavingLater = savingForLaterId === item.id;
    const isSelected = selectionMode && isEditable && activeSelectedIds.includes(item.id);
    const itemImages = getItemImages(item);

    return (
      <motion.div
        key={item.id}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.16 }}
        className={`group py-3.5 px-3.5 sm:px-4 border-b border-[#EFEFEA] dark:border-[#262624] last:border-b-0 last:rounded-b-2xl transition-colors ${
          isSelected
            ? 'bg-[#FFF1F2]/55 dark:bg-[#3A1620]/30'
            : 'hover:bg-[#F7F7F5]/60 dark:hover:bg-[#222220]/60'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 min-w-0">
            {selectionMode && isEditable && (
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
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0] line-clamp-2 sm:truncate">
                  {item.title}
                </h4>
                {item.needsCategoryConfirmation && (
                  <span className="text-[11px] font-medium text-[#E11D48]">
                    Needs review
                  </span>
                )}
              </div>

              {/* Zero-Pill unboxed metadata with typographic separators */}
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
                    <span className="font-mono tabular-nums">{itemImages.length} photos</span>
                  </>
                )}
              </div>

              {item.detectedDetails && (
                <p className="text-[11px] text-[#8E8E87] dark:text-[#7E7E77] line-clamp-1">
                  {item.detectedDetails}
                </p>
              )}
            </div>
          </div>

          {/* Right actions & price */}
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

            <div className="flex flex-wrap items-center gap-1">
              {isEditable && !isPendingDelete && (
                <>
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
                  {onSaveItemForLater && (
                    <button
                      type="button"
                      disabled={isSavingLater}
                      onClick={() => void handleSaveForLater(item.id)}
                      aria-label={`Save ${item.title} for later`}
                      className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-[#52524E] dark:text-[#B4B4AC] hover:text-[#E11D48] hover:bg-[#FFF1F2] dark:hover:bg-[#3A1620] disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      {isSavingLater ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </>
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
              {isEditable && (
                isPendingDelete ? (
                  <TimedUndoAction
                    compact
                    autoStart
                    undoDuration={5}
                    cancelText="Cancel"
                    onCancel={() => setPendingDeleteId(null)}
                    onExpire={() => {
                      setPendingDeleteId(null);
                      void handleDelete(item.id);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(item.id)}
                    aria-label={`Delete ${item.title}`}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[#8E8E87] hover:text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#3A161A] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl overflow-visible">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-[#E5E5E0] dark:border-[#2C2C2A] space-y-3.5 rounded-t-2xl">
          <div className="flex items-center justify-between gap-2.5">
            {/* Left: Back button + Title */}
            <div className="min-w-0 flex items-center gap-2 flex-1">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Go back"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-[#111110] dark:text-[#F4F4F0] bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#2E2E2B] border border-[#E5E5E0] dark:border-[#343430] transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-4 h-4 text-[#E11D48]" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-[#111110] dark:text-[#F4F4F0] tracking-tight truncate">
                    {order.title}
                  </h2>
                  {!isEditable && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#6E6E68] dark:text-[#9A9A92] shrink-0">
                      <Lock className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Closed order</span>
                    </span>
                  )}
                </div>
                {order.agentNote && (
                  <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate mt-0.5 hidden sm:block">
                    {order.agentNote}
                  </p>
                )}
              </div>
            </div>

            {/* Mobile Actions: Square Selection + Red Square Add Button */}
            <div className="flex sm:hidden items-center gap-2 shrink-0">
              {isEditable && items.length > 0 && onBulkAction && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode((prev) => {
                      const next = !prev;
                      if (!next) {
                        setSelectedIds([]);
                        setBulkPendingDelete(false);
                        setBulkError(null);
                      }
                      return next;
                    });
                  }}
                  aria-pressed={selectionMode}
                  aria-label={selectionMode ? 'Done selecting' : 'Select'}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                    selectionMode
                      ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110] dark:border-[#F4F4F0]'
                      : 'bg-[#F7F7F5] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border-[#E5E5E0] dark:border-[#343430]'
                  }`}
                >
                  {selectionMode ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              )}

              {isEditable && (
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={onOpenAddProduct}
                  aria-label="Add Product"
                  className="w-9 h-9 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white flex items-center justify-center shadow-md cursor-pointer transition-colors shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Desktop Actions: Select Toggle Button + Primary Add Product TactileButton */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {isEditable && items.length > 0 && onBulkAction && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode((prev) => {
                      const next = !prev;
                      if (!next) {
                        setSelectedIds([]);
                        setBulkPendingDelete(false);
                        setBulkError(null);
                      }
                      return next;
                    });
                  }}
                  aria-pressed={selectionMode}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
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

              <TactileButton
                variant="primary"
                size="sm"
                disabled={!isEditable}
                onClick={onOpenAddProduct}
              >
                <Plus className="w-4 h-4" />
                Add Product
              </TactileButton>
            </div>
          </div>

          {/* FilterDisclosure (left) + Search Bar (right) */}
          <div className="flex items-center gap-2 min-w-0">
            <FilterDisclosure
              items={CATEGORY_FILTER_ITEMS}
              activeId={activeCategory}
              onSelect={(id) => onCategoryChange(id as ProductCategory | 'All')}
              counts={categoryCounts}
              totalCount={items.length}
            />

            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-[#8E8E87] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, vendor, or size..."
                aria-label="Search products in order"
                className="w-full pl-9 pr-3 py-2 text-sm sm:text-xs bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
              />
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {selectionMode && isEditable && (
            <div
              data-testid="order-bulk-bar"
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
                    setBulkError(null);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  Close
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto min-w-0">
                  <select
                    aria-label="Target category for bulk action"
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

                <TactileButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy || activeSelectedIds.length === 0}
                  onClick={() => void runBulkAction({ action: 'save_for_later' })}
                >
                  <Bookmark className="w-3.5 h-3.5 text-[#E11D48]" />
                  Save for later
                </TactileButton>

                {otherOpenOrders.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto min-w-0">
                    <select
                      aria-label="Target order for bulk action"
                      value={bulkTargetOrderId}
                      onChange={(e) => setBulkTargetOrderId(e.target.value)}
                      disabled={bulkBusy || activeSelectedIds.length === 0}
                      className="min-w-0 max-w-full flex-1 sm:flex-initial sm:max-w-[200px] px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] rounded-lg text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48] disabled:opacity-50"
                    >
                      {otherOpenOrders.map((ord) => (
                        <option key={ord.id} value={ord.id}>
                          {ord.title}
                        </option>
                      ))}
                    </select>
                    <TactileButton
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={bulkBusy || activeSelectedIds.length === 0 || !bulkTargetOrderId}
                      onClick={() =>
                        void runBulkAction({
                          action: 'move_to_order',
                          targetOrderId: bulkTargetOrderId,
                        })
                      }
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Move to order
                    </TactileButton>
                  </div>
                )}

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

              {bulkError && (
                <p className="text-xs text-[#DC2626] dark:text-[#F87171]">{bulkError}</p>
              )}
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

        {/* Product List or Vendor Grouped View */}
        {filtered.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3 rounded-b-2xl">
            <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
              {items.length === 0
                ? 'This order is still empty'
                : 'No products match your filters'}
            </p>
            <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] max-w-md mx-auto">
              {items.length === 0
                ? isEditable
                  ? 'Add your first product from Yupoo, Taobao, or Weidian to start cataloging this order.'
                  : 'Concluded order with no recorded items.'
                : 'Try changing the category filter or clearing your search query.'}
            </p>
            {items.length === 0 && isEditable && (
              <div className="pt-1">
                <TactileButton variant="primary" onClick={onOpenAddProduct}>
                  <Plus className="w-4 h-4" />
                  Add First Product
                </TactileButton>
              </div>
            )}
          </div>
        ) : (
          <div data-testid="product-list" className="rounded-b-2xl">
            {filtered.map(renderProductRow)}
          </div>
        )}
      </div>

      {/* Inline Shipment Tracking & Arrival Panel */}
      {!hideTracking && (
        <OrderTrackingPanel
          order={order}
          onUpdateTracking={onUpdateTracking}
          onSyncLiveTracking={onSyncLiveTracking}
          compact
        />
      )}

      <EditProductModal
        open={Boolean(editingItem)}
        item={editingItem}
        existingVendors={existingVendors}
        exchangeRate={order.exchangeRate}
        displayCurrency={displayCurrency}
        onClose={() => setEditingItemId(null)}
        onSaveItem={onUpdateItem}
      />
    </div>
  );
}

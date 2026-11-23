/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Sparkles,
  Star,
  Check,
} from 'lucide-react';
import type { HaulOrder, ProductCategory, ProductItem } from '../types/haul';
import { getCategoryLabel, PRODUCT_CATEGORIES } from '../types/haul';
import {
  cnyToEur,
  convertCnyToCurrency,
  convertEurToCurrency,
  filterItems,
  formatCny,
  formatCurrency,
  getCurrencyMeta,
  normalizeProductRating,
  PLATFORM_LABELS,
  getItemImages,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import { CategoryIcon } from './CategoryIcons';
import { ProductPhotoEditorModal } from './ProductPhotoEditorModal';
import { WardrobeOutfitBuilderModal } from './WardrobeOutfitBuilderModal';
import { TactileButton } from './TactileButtons';

interface WardrobeViewProps {
  orders: HaulOrder[];
  items: ProductItem[];
  displayCurrency?: DisplayCurrencyCode;
  estimatedExchangeRate?: number;
  onSelectOrder: (orderId: string) => void;
  onUpdateItemImages?: (itemId: string, imageUrls: string[]) => Promise<void>;
  onUpdateWardrobeItem?: (
    itemId: string,
    patch: { rating?: number | null; sizeNote?: string; detectedDetails?: string }
  ) => Promise<void>;
}

export function WardrobeView({
  orders,
  items,
  displayCurrency = 'EUR',
  estimatedExchangeRate,
  onSelectOrder,
  onUpdateItemImages,
  onUpdateWardrobeItem,
}: WardrobeViewProps) {
  const [activeCategory, setActiveCategory] = useState<ProductCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string>('All');
  const [activeItem, setActiveItem] = useState<ProductItem | null>(null);
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
  const [isOutfitBuilderOpen, setIsOutfitBuilderOpen] = useState(false);

  // "Modifica" section state for manual 1-5 star rating + notes
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [draftRating, setDraftRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [draftSizeNote, setDraftSizeNote] = useState('');
  const [draftDetails, setDraftDetails] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSavedFeedback, setEditSavedFeedback] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isOutfitBuilderOpen) {
          return;
        }
        if (isPhotoEditorOpen) {
          setIsPhotoEditorOpen(false);
        } else {
          setActiveItem(null);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPhotoEditorOpen, isOutfitBuilderOpen]);

  const orderMap = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const orderExchangeRates = useMemo(
    () => new Map(orders.map((o) => [o.id, o.exchangeRate])),
    [orders]
  );

  // Wardrobe items: exclusively items belonging to concluded orders (status === 'concluded')
  const concludedItems = useMemo(() => {
    return items.filter((it) => {
      const ord = orderMap.get(it.orderId);
      return ord?.status === 'concluded';
    });
  }, [items, orderMap]);

  const synchronizedActiveItem = useMemo(() => {
    if (!activeItem) return null;
    return concludedItems.find((it) => it.id === activeItem.id) ?? null;
  }, [activeItem, concludedItems]);

  const activeItemImages = useMemo(() => {
    if (!synchronizedActiveItem) return [];
    return getItemImages(synchronizedActiveItem).filter(Boolean);
  }, [synchronizedActiveItem]);

  useEffect(() => {
    if (!synchronizedActiveItem) {
      setIsEditingDetails(false);
      setEditError(null);
      setEditSavedFeedback(false);
      return;
    }
    setDraftRating(normalizeProductRating(synchronizedActiveItem.rating) ?? null);
    setHoverRating(null);
    setDraftSizeNote(synchronizedActiveItem.sizeNote ?? '');
    setDraftDetails(synchronizedActiveItem.detectedDetails ?? '');
    setIsEditingDetails(false);
    setEditError(null);
    setEditSavedFeedback(false);
  }, [synchronizedActiveItem?.id]);

  const handleSaveWardrobeEdit = async () => {
    if (!synchronizedActiveItem || !onUpdateWardrobeItem) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await onUpdateWardrobeItem(synchronizedActiveItem.id, {
        rating: draftRating,
        sizeNote: draftSizeNote.trim(),
        detectedDetails: draftDetails.trim(),
      });
      setIsEditingDetails(false);
      setEditSavedFeedback(true);
      window.setTimeout(() => setEditSavedFeedback(false), 2200);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Error saving changes.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const safePhotoIdx = activeItemImages.length > 0 ? currentPhotoIdx % activeItemImages.length : 0;
  const currentPhotoUrl = activeItemImages[safePhotoIdx] || '';

  const uniqueVendors = useMemo(() => {
    const set = new Set<string>();
    for (const it of concludedItems) {
      if (it.vendor.trim()) set.add(it.vendor.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'en'));
  }, [concludedItems]);

  const filteredItems = useMemo(() => {
    let result = filterItems(concludedItems, {
      search: searchQuery,
      category: activeCategory,
    });
    if (selectedVendor !== 'All') {
      result = result.filter(
        (it) => it.vendor.toLowerCase() === selectedVendor.toLowerCase()
      );
    }
    return result;
  }, [concludedItems, searchQuery, activeCategory, selectedVendor]);

  const totalCny = useMemo(
    () => Math.round(filteredItems.reduce((sum, it) => sum + it.priceCny, 0) * 100) / 100,
    [filteredItems]
  );

  const totalEur = useMemo(() => {
    return filteredItems.reduce((sum, it) => {
      const ord = orderMap.get(it.orderId);
      const rate = ord?.exchangeRate ?? estimatedExchangeRate ?? 0.13;
      return sum + cnyToEur(it.priceCny, rate);
    }, 0);
  }, [filteredItems, orderMap, estimatedExchangeRate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111110] dark:text-[#F4F4F0] tracking-tight">
            Wardrobe &amp; Haul Inventory
          </h1>
          <p className="text-sm text-[#6E6E68] dark:text-[#9A9A92] mt-1">
            All items from concluded orders, filterable by category and vendor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] px-3 py-1.5 rounded-xl tabular-nums">
            {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} shown
          </span>
          <TactileButton
            type="button"
            variant="primary"
            size="sm"
            disabled={concludedItems.length === 0}
            onClick={() => setIsOutfitBuilderOpen(true)}
            data-testid="open-outfit-builder-btn"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Build Outfit
          </TactileButton>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Wardrobe Items</p>
          <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {concludedItems.length}
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">From concluded orders</p>
        </div>
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Total Wardrobe Value</p>
          <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {formatCny(totalCny)}
          </p>
          {displayCurrency !== 'CNY' && (
            <p className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
              {formatCurrency(convertEurToCurrency(totalEur, displayCurrency), displayCurrency)}
            </p>
          )}
        </div>
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Vendors</p>
          <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {uniqueVendors.length}
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Yupoo / Taobao / Weidian</p>
        </div>
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4">
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Concluded Orders</p>
          <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] tabular-nums mt-1">
            {orders.filter((o) => o.status === 'concluded').length}
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
            Delivered hauls
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 text-[#8E8E87] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search item name, vendor, platform, or size..."
              aria-label="Search wardrobe items"
              className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C]"
            />
          </div>

          <div className="md:col-span-4">
            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              aria-label="Filter by vendor"
              className="w-full px-3 py-2.5 text-xs bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none"
            >
              <option value="All">All Vendors ({uniqueVendors.length})</option>
              {uniqueVendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Segmented Filter Buttons */}
        <div className="flex items-center gap-1 bg-[#F7F7F5] dark:bg-[#242422] p-1 rounded-xl border border-[#E5E5E0] dark:border-[#343430] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveCategory('All')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeCategory === 'All'
                ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
            }`}
          >
            All ({concludedItems.length})
          </button>
          {PRODUCT_CATEGORIES.map((cat) => {
            const count = concludedItems.filter((it: ProductItem) => it.category === cat.id).length;
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(active ? 'All' : cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                    : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                }`}
              >
                <CategoryIcon category={cat.id} className="w-3.5 h-3.5" active={active} />
                <span>{cat.shortLabel}</span>
                <span className="text-[10px] font-mono tabular-nums opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Wardrobe Item Cards Grid */}
      {concludedItems.length === 0 ? (
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-14 text-center space-y-3">
          <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
            No items in wardrobe yet
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] max-w-md mx-auto">
            Items automatically appear in your wardrobe once their order is marked as concluded.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-14 text-center space-y-3">
          <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
            No wardrobe items match these filters
          </p>
          <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] max-w-sm mx-auto">
            Try adjusting your search or category filter.
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4.5"
          data-testid="wardrobe-grid"
        >
          {filteredItems.map((item) => {
            const allImages = getItemImages(item);
            const mainImg = allImages[0] ?? item.imageUrl;
            return (
              <motion.article
                key={item.id}
                layout={false}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  setCurrentPhotoIdx(0);
                  setActiveItem(item);
                }}
                className="group flex flex-col cursor-pointer transition-transform duration-150 active:scale-[0.98]"
              >
                <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-[#F7F7F5] dark:bg-[#1E1E1C] border border-[#E5E5E0] dark:border-[#2C2C2A] group-hover:border-[#111110] dark:group-hover:border-[#F4F4F0] transition-colors shadow-xs">
                  {mainImg ? (
                    <img
                      src={mainImg}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#8E8E87]">
                      <CategoryIcon category={item.category} className="w-12 h-12" />
                    </div>
                  )}
                  {normalizeProductRating(item.rating) !== undefined && (
                    <div
                      data-testid={`wardrobe-card-rating-${item.id}`}
                      className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-black/70 text-amber-300 text-[10px] font-mono tabular-nums backdrop-blur-xs"
                    >
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="text-white font-semibold">{item.rating}</span>
                    </div>
                  )}
                  {allImages.length > 1 && (
                    <div className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-lg bg-black/60 text-white text-[10px] font-mono tabular-nums backdrop-blur-xs">
                      {allImages.length}
                    </div>
                  )}
                </div>
                <div className="pt-2 px-1">
                  <h3
                    className="text-xs font-medium text-[#111110] dark:text-[#F4F4F0] line-clamp-2 leading-snug tracking-tight group-hover:text-[#E11D48] transition-colors"
                    title={item.title}
                  >
                    {item.title}
                  </h3>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      {/* Expanded Modal (Desktop Enhanced & 100% Jitter-Free) */}
      <AnimatePresence>
        {synchronizedActiveItem && (
          <motion.div
            key="wardrobe-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setActiveItem(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/55 backdrop-blur-xs"
          >
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-4xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-3xl shadow-2xl overflow-y-auto md:overflow-hidden flex flex-col md:flex-row z-10 my-auto max-h-[92vh]"
            >
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="absolute top-4 right-4 z-30 w-8 h-8 rounded-full bg-white/90 dark:bg-[#2A2A28]/90 border border-[#E5E5E0] dark:border-[#343430] flex items-center justify-center text-[#111110] dark:text-[#F4F4F0] hover:bg-[#111110] hover:text-white transition-colors cursor-pointer shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Left Column: Enhanced Desktop Image Viewer & Carousel */}
              <div className="w-full md:w-1/2 bg-[#F7F7F5] dark:bg-[#141413] p-4 sm:p-6 flex flex-col justify-between relative border-b md:border-b-0 md:border-r border-[#E5E5E0] dark:border-[#2C2C2A] shrink-0">
                <div className="space-y-3 sm:space-y-4 flex flex-col h-full justify-between">
                  <div className="relative w-full h-60 sm:h-72 md:h-[420px] rounded-2xl overflow-hidden border border-[#E5E5E0] dark:border-[#343430] bg-black/5 flex items-center justify-center">
                    {currentPhotoUrl ? (
                      <img
                        src={currentPhotoUrl}
                        alt={synchronizedActiveItem.title}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <CategoryIcon category={synchronizedActiveItem.category} className="w-16 h-16 text-[#8E8E87]" />
                    )}

                    {/* Image Navigation Arrows */}
                    {activeItemImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCurrentPhotoIdx((prev) => (prev - 1 + activeItemImages.length) % activeItemImages.length)}
                          aria-label="Previous photo"
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentPhotoIdx((prev) => (prev + 1) % activeItemImages.length)}
                          aria-label="Next photo"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 text-white rounded-lg text-xs font-mono">
                          {safePhotoIdx + 1} / {activeItemImages.length}
                        </div>
                      </>
                    )}

                    {/* Pencil Icon Button in Bottom Left of Image Container: opens Photo Editor with Crop, Reorder, Delete & Add */}
                    {onUpdateItemImages && (
                      <button
                        type="button"
                        onClick={() => setIsPhotoEditorOpen(true)}
                        title="Manage photos (crop, reorder, delete, or add)"
                        aria-label="Manage product photos"
                        className="absolute bottom-3 left-3 px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-[#222220]/95 border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] flex items-center gap-1.5 shadow-md hover:bg-[#111110] hover:text-white transition-all cursor-pointer group"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[#E11D48] group-hover:text-white transition-colors" />
                        <span className="text-xs font-medium">Edit Photos</span>
                      </button>
                    )}
                  </div>

                  {/* Thumbnails strip for fast navigation */}
                  {activeItemImages.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {activeItemImages.map((thumbUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCurrentPhotoIdx(idx)}
                          className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                            safePhotoIdx === idx
                              ? 'border-[#E11D48] scale-105'
                              : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Details, Pricing, & CTAs */}
              <div className="w-full md:w-1/2 p-5 sm:p-6 md:p-8 flex flex-col justify-between space-y-5 md:max-h-[85vh] md:overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-[#F7F7F5] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] rounded-lg">
                        <CategoryIcon category={synchronizedActiveItem.category} className="w-3.5 h-3.5" />
                        {getCategoryLabel(synchronizedActiveItem.category)}
                      </span>
                      <span className="text-xs font-medium px-2.5 py-1 bg-[#F7F7F5] dark:bg-[#242422] text-[#6E6E68] dark:text-[#9A9A92] rounded-lg">
                        {PLATFORM_LABELS[synchronizedActiveItem.platform]}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-[#111110] dark:text-[#F4F4F0] leading-snug">
                      {synchronizedActiveItem.title}
                    </h2>
                  </div>

                  {/* Price Block */}
                  <div className="p-4 bg-[#F7F7F5] dark:bg-[#242422] rounded-2xl border border-[#E5E5E0] dark:border-[#343430] flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Purchase Price</p>
                      <p className="text-xl font-mono font-bold text-[#111110] dark:text-[#F4F4F0] mt-0.5">
                        {formatCny(synchronizedActiveItem.priceCny)}
                      </p>
                    </div>
                    {displayCurrency !== 'CNY' && (
                      <div className="text-right">
                        <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                          In {getCurrencyMeta(displayCurrency).name} ({displayCurrency})
                        </p>
                        <p className="text-xl font-mono font-bold text-[#E11D48] mt-0.5">
                          {formatCurrency(
                            convertCnyToCurrency(
                              synchronizedActiveItem.priceCny,
                              orderMap.get(synchronizedActiveItem.orderId)?.exchangeRate,
                              displayCurrency
                            ),
                            displayCurrency
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Vendor & Size */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-[#F7F7F5] dark:bg-[#242422] rounded-xl border border-[#E5E5E0] dark:border-[#343430]">
                      <p className="text-[#6E6E68] dark:text-[#9A9A92]">Vendor</p>
                      <p className="font-semibold text-[#111110] dark:text-[#F4F4F0] mt-0.5 text-sm">{synchronizedActiveItem.vendor}</p>
                    </div>
                    {synchronizedActiveItem.sizeNote ? (
                      <div className="p-3 bg-[#F7F7F5] dark:bg-[#242422] rounded-xl border border-[#E5E5E0] dark:border-[#343430]">
                        <p className="text-[#6E6E68] dark:text-[#9A9A92]">Size / Notes</p>
                        <p className="font-semibold text-[#111110] dark:text-[#F4F4F0] mt-0.5 text-sm">{synchronizedActiveItem.sizeNote}</p>
                      </div>
                    ) : (
                      <div className="p-3 bg-[#F7F7F5] dark:bg-[#242422] rounded-xl border border-[#E5E5E0] dark:border-[#343430]">
                        <p className="text-[#6E6E68] dark:text-[#9A9A92]">Product ID</p>
                        <p className="font-mono text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mt-0.5 truncate">{synchronizedActiveItem.id}</p>
                      </div>
                    )}
                  </div>

                  {/* Edit & Rating Section (1-5 stars) */}
                  {onUpdateWardrobeItem && (
                    <div
                      data-testid="wardrobe-edit-section"
                      className="p-4 bg-[#F7F7F5] dark:bg-[#242422] rounded-2xl border border-[#E5E5E0] dark:border-[#343430] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#111110] dark:text-[#F4F4F0]">
                            Edit
                          </span>
                          {normalizeProductRating(synchronizedActiveItem.rating) !== undefined ? (
                            <span
                              data-testid="wardrobe-active-rating"
                              className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-amber-600 dark:text-amber-300 tabular-nums"
                            >
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              {synchronizedActiveItem.rating}/5
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                              No rating
                            </span>
                          )}
                          {editSavedFeedback && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#16A34A]">
                              <Check className="w-3 h-3" />
                              Saved
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!isEditingDetails) {
                              setDraftRating(
                                normalizeProductRating(synchronizedActiveItem.rating) ?? null
                              );
                              setDraftSizeNote(synchronizedActiveItem.sizeNote ?? '');
                              setDraftDetails(synchronizedActiveItem.detectedDetails ?? '');
                              setEditError(null);
                            }
                            setIsEditingDetails((prev) => !prev);
                          }}
                          aria-expanded={isEditingDetails}
                          data-testid="wardrobe-edit-toggle"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#2E2E2B] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#E11D48]" />
                          {isEditingDetails ? 'Close edit' : 'Edit'}
                        </button>
                      </div>

                      {isEditingDetails && (
                        <div
                          data-testid="wardrobe-edit-panel"
                          className="space-y-3 pt-2 border-t border-[#E5E5E0] dark:border-[#343430]"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-[#111110] dark:text-[#F4F4F0]">
                                Item rating (1–5 stars)
                              </span>
                              {draftRating !== null && (
                                <button
                                  type="button"
                                  onClick={() => setDraftRating(null)}
                                  className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#DC2626] cursor-pointer"
                                >
                                  Clear rating
                                </button>
                              )}
                            </div>

                            <div
                              className="flex items-center gap-1.5"
                              onMouseLeave={() => setHoverRating(null)}
                            >
                              {[1, 2, 3, 4, 5].map((starValue) => {
                                const filled = (hoverRating ?? draftRating ?? 0) >= starValue;
                                return (
                                  <button
                                    key={starValue}
                                    type="button"
                                    onClick={() => setDraftRating(starValue)}
                                    onMouseEnter={() => setHoverRating(starValue)}
                                    aria-label={`Rate ${starValue} ${starValue === 1 ? 'star' : 'stars'}`}
                                    aria-pressed={draftRating === starValue}
                                    data-testid={`wardrobe-star-${starValue}`}
                                    className="p-1.5 rounded-lg bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] hover:border-amber-400 transition-colors cursor-pointer"
                                  >
                                    <Star
                                      className={`w-5 h-5 transition-colors ${
                                        filled
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-[#B8B8B0] dark:text-[#52524E]'
                                      }`}
                                    />
                                  </button>
                                );
                              })}
                              <span className="ml-1 text-xs font-mono tabular-nums text-[#6E6E68] dark:text-[#9A9A92]">
                                {draftRating ? `${draftRating}/5` : '—'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-medium text-[#6E6E68] dark:text-[#9A9A92] mb-1">
                                Size / Notes
                              </label>
                              <input
                                type="text"
                                value={draftSizeNote}
                                onChange={(e) => setDraftSizeNote(e.target.value)}
                                placeholder="e.g. L · Boxy fit"
                                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] rounded-lg text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-[#6E6E68] dark:text-[#9A9A92] mb-1">
                                Details / Review
                              </label>
                              <input
                                type="text"
                                value={draftDetails}
                                onChange={(e) => setDraftDetails(e.target.value)}
                                placeholder="e.g. Great quality, solid stitching"
                                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] rounded-lg text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                              />
                            </div>
                          </div>

                          {editError && (
                            <p className="text-xs text-[#DC2626] dark:text-[#F87171]">
                              {editError}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            {onUpdateItemImages && (
                              <button
                                type="button"
                                onClick={() => setIsPhotoEditorOpen(true)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] cursor-pointer"
                              >
                                <Pencil className="w-3 h-3 text-[#E11D48]" />
                                Edit Photos
                              </button>
                            )}

                            <div className="flex items-center gap-2 ml-auto">
                              <button
                                type="button"
                                disabled={savingEdit}
                                onClick={() => setIsEditingDetails(false)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] cursor-pointer"
                              >
                                Cancel
                              </button>
                              <TactileButton
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={savingEdit}
                                onClick={() => void handleSaveWardrobeEdit()}
                                data-testid="wardrobe-save-edit-btn"
                              >
                                {savingEdit ? 'Saving...' : 'Save changes'}
                              </TactileButton>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Linked Order */}
                  {orderMap.get(synchronizedActiveItem.orderId) && (
                    <div className="p-4 bg-[#F7F7F5] dark:bg-[#242422] rounded-2xl border border-[#E5E5E0] dark:border-[#343430] flex items-center justify-between">
                      <div>
                        <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">Linked Order</p>
                        <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0] mt-0.5">
                          {orderMap.get(synchronizedActiveItem.orderId)?.title}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const ordId = synchronizedActiveItem.orderId;
                          setActiveItem(null);
                          onSelectOrder(ordId);
                        }}
                        className="px-3.5 py-2 bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] text-xs font-medium rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        Open Order
                      </button>
                    </div>
                  )}
                </div>

                {/* External Link CTA */}
                {(synchronizedActiveItem.link ?? '').trim() && (
                  <div className="pt-2">
                    <a
                      href={synchronizedActiveItem.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors text-sm shadow-sm cursor-pointer"
                    >
                      <span>Open Link on Superbuy / Source</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo Editor Modal (Cropping, Reordering, Deleting & Adding Photos) */}
      {synchronizedActiveItem && (
        <ProductPhotoEditorModal
          isOpen={isPhotoEditorOpen}
          onClose={() => setIsPhotoEditorOpen(false)}
          productTitle={synchronizedActiveItem.title}
          initialImages={getItemImages(synchronizedActiveItem)}
          onSave={async (newImages) => {
            if (onUpdateItemImages && synchronizedActiveItem) {
              await onUpdateItemImages(synchronizedActiveItem.id, newImages);
            }
          }}
        />
      )}

      {/* Build Outfit Studio Modal */}
      <WardrobeOutfitBuilderModal
        open={isOutfitBuilderOpen}
        onClose={() => setIsOutfitBuilderOpen(false)}
        items={concludedItems}
        orderExchangeRates={orderExchangeRates}
        estimatedExchangeRate={estimatedExchangeRate}
        displayCurrency={displayCurrency}
      />
    </div>
  );
}

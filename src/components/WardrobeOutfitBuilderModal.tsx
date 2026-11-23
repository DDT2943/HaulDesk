import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Eraser,
  Layers,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { ProductCategory, ProductItem } from '../types/haul';
import { getCategoryLabel, PRODUCT_CATEGORIES } from '../types/haul';
import {
  cnyToEur,
  convertEurToCurrency,
  formatCny,
  formatCurrency,
  getItemImages,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import {
  generateStyledEditorialFrame,
  removeImageBackground,
  resolveCorsSafeImageSrc,
  type GarmentPresentationMode,
} from '../utils/backgroundRemoval';
import {
  clampOutfitPercentage,
  clampOutfitScale,
  computeFlatlayPlacements,
  OUTFIT_BACKDROPS,
  type OutfitBackdropId,
} from '../utils/outfitLayout';
import { CategoryIcon } from './CategoryIcons';
import { TactileButton } from './TactileButtons';

interface WardrobeOutfitBuilderModalProps {
  open: boolean;
  onClose: () => void;
  items: ProductItem[];
  orderExchangeRates?: Map<string, number>;
  estimatedExchangeRate?: number;
  displayCurrency?: DisplayCurrencyCode;
}

interface OutfitCanvasLayer {
  itemId: string;
  xPct: number;
  yPct: number;
  scale: number;
  zIndex: number;
  mode: GarmentPresentationMode;
}

interface CutoutCacheEntry {
  status: 'loading' | 'ready' | 'error';
  dataUrl?: string;
  cutoutApplied?: boolean;
  error?: string;
}

interface StyledCacheEntry {
  status: 'loading' | 'ready' | 'error';
  dataUrl?: string;
  error?: string;
}

function loadExportImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Error loading export image'));
    img.src = src;
  });
}

export function WardrobeOutfitBuilderModal({
  open,
  onClose,
  items,
  orderExchangeRates,
  estimatedExchangeRate,
  displayCurrency = 'EUR',
}: WardrobeOutfitBuilderModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ProductCategory | 'All'>('All');
  const [layers, setLayers] = useState<OutfitCanvasLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [backdropId, setBackdropId] = useState<OutfitBackdropId>('studio-light');
  const [tolerance, setTolerance] = useState<number>(38);
  const [cutoutCache, setCutoutCache] = useState<Record<string, CutoutCacheEntry>>({});
  const [styledCache, setStyledCache] = useState<Record<string, StyledCacheEntry>>({});
  const [exporting, setExporting] = useState(false);
  const [exportedDone, setExportedDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    itemId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
  } | null>(null);

  const requestedCutoutKeysRef = useRef<Set<string>>(new Set());
  const requestedStyledKeysRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const itemsWithPhotos = useMemo(
    () => items.filter((it) => getItemImages(it).length > 0),
    [items]
  );

  const itemById = useMemo(
    () => new Map(itemsWithPhotos.map((it) => [it.id, it])),
    [itemsWithPhotos]
  );

  // Sync layers when items list shrinks
  useEffect(() => {
    setLayers((prev) => prev.filter((l) => itemById.has(l.itemId)));
  }, [itemById]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  // Automatic background removal whenever a layer is set to 'cutout' or tolerance changes
  useEffect(() => {
    if (!open || layers.length === 0) return;

    for (const layer of layers) {
      if (layer.mode !== 'cutout') continue;
      const item = itemById.get(layer.itemId);
      const src = item ? getItemImages(item)[0] : '';
      if (!src) continue;

      const cacheKey = `${src}::${tolerance}`;
      if (requestedCutoutKeysRef.current.has(cacheKey)) {
        continue;
      }

      requestedCutoutKeysRef.current.add(cacheKey);
      setCutoutCache((prev) => ({
        ...prev,
        [cacheKey]: { status: 'loading' },
      }));

      void removeImageBackground(src, { tolerance })
        .then((res) => {
          if (!mountedRef.current) return;
          setCutoutCache((prev) => ({
            ...prev,
            [cacheKey]: {
              status: 'ready',
              dataUrl: res.dataUrl,
              cutoutApplied: res.cutoutApplied,
            },
          }));
        })
        .catch((err) => {
          requestedCutoutKeysRef.current.delete(cacheKey);
          if (!mountedRef.current) return;
          setCutoutCache((prev) => ({
            ...prev,
            [cacheKey]: {
              status: 'error',
              error: err instanceof Error ? err.message : 'Background cutout failed',
            },
          }));
        });
    }
  }, [open, layers, tolerance, itemById]);

  // Generate styled lookbook frames whenever a layer is set to 'styled'
  useEffect(() => {
    if (!open || layers.length === 0) return;

    for (const layer of layers) {
      if (layer.mode !== 'styled') continue;
      const item = itemById.get(layer.itemId);
      const src = item ? getItemImages(item)[0] : '';
      if (!src) continue;

      if (requestedStyledKeysRef.current.has(src)) {
        continue;
      }

      requestedStyledKeysRef.current.add(src);
      setStyledCache((prev) => ({
        ...prev,
        [src]: { status: 'loading' },
      }));

      void generateStyledEditorialFrame(src, { cornerRadius: 22 })
        .then((res) => {
          if (!mountedRef.current) return;
          setStyledCache((prev) => ({
            ...prev,
            [src]: {
              status: 'ready',
              dataUrl: res.dataUrl,
            },
          }));
        })
        .catch((err) => {
          requestedStyledKeysRef.current.delete(src);
          if (!mountedRef.current) return;
          setStyledCache((prev) => ({
            ...prev,
            [src]: {
              status: 'error',
              error: err instanceof Error ? err.message : 'Styled frame creation failed',
            },
          }));
        });
    }
  }, [open, layers, itemById]);

  const filteredSelectorItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return itemsWithPhotos.filter((it) => {
      if (activeCategory !== 'All' && it.category !== activeCategory) return false;
      if (q) {
        const hay = `${it.title} ${it.vendor} ${it.category} ${it.sizeNote}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [itemsWithPhotos, activeCategory, searchQuery]);

  const selectedBackdrop =
    OUTFIT_BACKDROPS.find((b) => b.id === backdropId) ?? OUTFIT_BACKDROPS[0];

  const toggleItemInOutfit = (item: ProductItem) => {
    setExportError(null);
    setLayers((prev) => {
      const exists = prev.some((l) => l.itemId === item.id);
      if (exists) {
        const remaining = prev.filter((l) => l.itemId !== item.id);
        if (selectedLayerId === item.id) {
          setSelectedLayerId(remaining[remaining.length - 1]?.itemId ?? null);
        }
        return remaining;
      }

      const nextItems = [...prev.map((l) => itemById.get(l.itemId)!).filter(Boolean), item];
      const placements = computeFlatlayPlacements(nextItems.map((it) => it.category));
      const newPlacement = placements[placements.length - 1];

      const updatedExisting = prev.map((existingLayer, idx) => {
        if (prev.length === 1 && placements[idx]) {
          return {
            ...existingLayer,
            xPct: placements[idx].xPct,
            yPct: placements[idx].yPct,
            scale: placements[idx].scale,
          };
        }
        return existingLayer;
      });

      setSelectedLayerId(item.id);
      return [
        ...updatedExisting,
        {
          itemId: item.id,
          xPct: newPlacement.xPct,
          yPct: newPlacement.yPct,
          scale: newPlacement.scale,
          zIndex: newPlacement.zIndex,
          mode: 'cutout',
        },
      ];
    });
  };

  const handleAutoArrangeFlatlay = () => {
    setLayers((prev) => {
      const orderedItems = prev
        .map((l) => itemById.get(l.itemId))
        .filter((it): it is ProductItem => Boolean(it));
      const placements = computeFlatlayPlacements(orderedItems.map((it) => it.category));
      return prev.map((layer, idx) => ({
        ...layer,
        xPct: placements[idx]?.xPct ?? layer.xPct,
        yPct: placements[idx]?.yPct ?? layer.yPct,
        scale: placements[idx]?.scale ?? layer.scale,
        zIndex: placements[idx]?.zIndex ?? layer.zIndex,
      }));
    });
  };

  const selectedLayer = layers.find((l) => l.itemId === selectedLayerId) ?? null;
  const selectedItem = selectedLayer ? itemById.get(selectedLayer.itemId) ?? null : null;

  const updateLayer = (itemId: string, updater: (prev: OutfitCanvasLayer) => OutfitCanvasLayer) => {
    setLayers((prev) => prev.map((l) => (l.itemId === itemId ? updater(l) : l)));
  };

  const outfitTotals = useMemo(() => {
    let totalCny = 0;
    let totalEur = 0;
    const fallbackRate = estimatedExchangeRate ?? 0.13;
    for (const l of layers) {
      const it = itemById.get(l.itemId);
      if (!it) continue;
      totalCny += it.priceCny;
      const rate = orderExchangeRates?.get(it.orderId) ?? fallbackRate;
      totalEur += cnyToEur(it.priceCny, rate);
    }
    return {
      totalCny: Math.round(totalCny * 100) / 100,
      totalEur: Math.round(totalEur * 100) / 100,
    };
  }, [layers, itemById, orderExchangeRates, estimatedExchangeRate]);

  const outfitConvertedTotal =
    displayCurrency === 'CNY'
      ? outfitTotals.totalCny
      : convertEurToCurrency(outfitTotals.totalEur, displayCurrency);

  const handlePointerDownLayer = (
    e: React.PointerEvent<HTMLDivElement>,
    layer: OutfitCanvasLayer
  ) => {
    e.stopPropagation();
    setSelectedLayerId(layer.itemId);
    if (!canvasRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      itemId: layer.itemId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXPct: layer.xPct,
      startYPct: layer.yPct,
    };
  };

  const handlePointerMoveLayer = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;

    updateLayer(drag.itemId, (prev) => ({
      ...prev,
      xPct: clampOutfitPercentage(drag.startXPct + dxPct, 8, 92),
      yPct: clampOutfitPercentage(drag.startYPct + dyPct, 8, 92),
    }));
  };

  const handlePointerUpLayer = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore capture errors
    }
  };

  const getLayerDisplaySrc = (layer: OutfitCanvasLayer, origUrl: string): string => {
    if (layer.mode === 'cutout') {
      const cacheKey = `${origUrl}::${tolerance}`;
      const entry = cutoutCache[cacheKey];
      if (entry?.status === 'ready' && entry.dataUrl) {
        return entry.dataUrl;
      }
    } else if (layer.mode === 'styled') {
      const entry = styledCache[origUrl];
      if (entry?.status === 'ready' && entry.dataUrl) {
        return entry.dataUrl;
      }
    }
    return resolveCorsSafeImageSrc(origUrl);
  };

  const handleExportPng = async () => {
    if (layers.length === 0 || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const W = 1000;
      const H = 1250;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = W;
      outCanvas.height = H;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable.');

      ctx.fillStyle = selectedBackdrop.canvasBg;
      ctx.fillRect(0, 0, W, H);

      // Subtle editorial backdrop gradient vignette
      const grad = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.75);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Sort layers by zIndex for proper bottom-to-top rendering
      const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

      for (const layer of sortedLayers) {
        const it = itemById.get(layer.itemId);
        if (!it) continue;
        const images = getItemImages(it);
        const origUrl = images[0];
        if (!origUrl) continue;

        const effectiveSrc = getLayerDisplaySrc(layer, origUrl);
        const img = await loadExportImage(effectiveSrc);

        const cx = (layer.xPct / 100) * W;
        const cy = (layer.yPct / 100) * H;
        const targetBaseDim = W * 0.38;
        const scaleFactor = layer.scale;
        const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);

        let drawW = targetBaseDim * scaleFactor;
        let drawH = drawW / imgAspect;
        if (drawH > H * 0.45 * scaleFactor) {
          drawH = H * 0.45 * scaleFactor;
          drawW = drawH * imgAspect;
        }

        ctx.save();
        ctx.shadowColor = selectedBackdrop.isDark
          ? 'rgba(0, 0, 0, 0.55)'
          : 'rgba(17, 17, 16, 0.16)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 12;
        ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
        ctx.restore();
      }

      // Minimal bottom editorial watermark
      ctx.fillStyle = selectedBackdrop.isDark
        ? 'rgba(244, 244, 240, 0.5)'
        : 'rgba(17, 17, 16, 0.45)';
      ctx.font = '600 20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`HAULDESK OUTFIT · ${layers.length} ${layers.length === 1 ? 'ITEM' : 'ITEMS'}`, 36, H - 36);
      ctx.textAlign = 'right';
      ctx.fillText(
        formatCurrency(outfitConvertedTotal, displayCurrency),
        W - 36,
        H - 36
      );

      const url = outCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `hauldesk-outfit-${layers.length}-items.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportedDone(true);
      window.setTimeout(() => setExportedDone(false), 2400);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Could not export outfit image.'
      );
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  const loadingCutoutsCount = layers.filter((l) => {
    if (l.mode !== 'cutout') return false;
    const item = itemById.get(l.itemId);
    const src = item ? getItemImages(item)[0] : '';
    if (!src) return false;
    const entry = cutoutCache[`${src}::${tolerance}`];
    return !entry || entry.status === 'loading';
  }).length;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="outfit-builder-title"
      data-testid="outfit-builder-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-6xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-[#E5E5E0] dark:border-[#2C2C2A] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#E11D48] shrink-0" />
              <h2
                id="outfit-builder-title"
                className="text-base sm:text-lg font-bold text-[#111110] dark:text-[#F4F4F0] truncate"
              >
                Build Outfit Studio
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] text-[#6E6E68] dark:text-[#9A9A92] tabular-nums shrink-0">
                {layers.length} {layers.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] hidden sm:block mt-0.5">
              Select purchased items: backgrounds are removed with an edge-protected cutout or styled lookbook frame. Drag to compose.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {loadingCutoutsCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#E11D48] font-medium px-2.5 py-1 rounded-xl bg-[#FFF1F2] dark:bg-[#3A1620]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing ({loadingCutoutsCount})...
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Build Outfit"
              className="w-9 h-9 rounded-xl bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#2E2E2B] border border-[#E5E5E0] dark:border-[#343430] flex items-center justify-center text-[#111110] dark:text-[#F4F4F0] cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Studio Body */}
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 lg:grid-cols-[310px_minmax(0,1fr)_280px]">
          {/* Column 1: Wardrobe Garment Picker */}
          <div className="border-b lg:border-b-0 lg:border-r border-[#E5E5E0] dark:border-[#2C2C2A] p-4 flex flex-col gap-3 lg:max-h-[74vh]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E6E68] dark:text-[#9A9A92]">
                Purchased Items ({itemsWithPhotos.length})
              </h3>
              {layers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLayers([]);
                    setSelectedLayerId(null);
                  }}
                  className="text-xs font-medium text-[#DC2626] hover:underline cursor-pointer"
                >
                  Clear outfit
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8E8E87] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search item or vendor..."
                aria-label="Search items for outfit"
                className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveCategory('All')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  activeCategory === 'All'
                    ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110]'
                    : 'bg-[#F7F7F5] dark:bg-[#242422] text-[#6E6E68] dark:text-[#9A9A92]'
                }`}
              >
                All
              </button>
              {PRODUCT_CATEGORIES.filter((c) =>
                itemsWithPhotos.some((it) => it.category === c.id)
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    setActiveCategory(activeCategory === cat.id ? 'All' : cat.id)
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110]'
                      : 'bg-[#F7F7F5] dark:bg-[#242422] text-[#6E6E68] dark:text-[#9A9A92]'
                  }`}
                >
                  <CategoryIcon category={cat.id} className="w-3 h-3" active={activeCategory === cat.id} />
                  {cat.shortLabel}
                </button>
              ))}
            </div>

            {itemsWithPhotos.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                No items with photos found in concluded orders.
              </div>
            ) : filteredSelectorItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                No items match this search.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[50vh] lg:max-h-none">
                {filteredSelectorItems.map((item) => {
                  const isSelected = layers.some((l) => l.itemId === item.id);
                  const images = getItemImages(item);
                  const cover = images[0];

                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`outfit-pick-item-${item.id}`}
                      onClick={() => toggleItemInOutfit(item)}
                      className={`w-full text-left p-2 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#FFF1F2] dark:bg-[#3A1620]/60 border-[#E11D48] text-[#111110] dark:text-[#F4F4F0]'
                          : 'bg-white dark:bg-[#191918] border-[#E5E5E0] dark:border-[#343430] hover:bg-[#F7F7F5] dark:hover:bg-[#242422]'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#F0F0EC] dark:bg-[#282826] shrink-0 border border-[#E5E5E0] dark:border-[#343430]">
                        <img
                          src={resolveCorsSafeImageSrc(cover)}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] truncate">
                          {getCategoryLabel(item.category)} · {item.vendor}
                        </p>
                        <p className="text-xs font-mono font-bold text-[#E11D48] tabular-nums">
                          {formatCny(item.priceCny)}
                        </p>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-colors ${
                          isSelected
                            ? 'bg-[#E11D48] border-[#E11D48] text-white'
                            : 'border-[#D6D6CF] dark:border-[#3E3E3B]'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column 2: Lookbook Canvas */}
          <div className="p-4 flex flex-col gap-3 min-h-[460px] lg:min-h-0">
            {/* Canvas Quick Actions Bar */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                Outfit Canvas · {selectedBackdrop.label}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={layers.length === 0}
                  onClick={handleAutoArrangeFlatlay}
                  title="Automatically arrange items vertically (Top -> Pants -> Shoes)"
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] disabled:opacity-45 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Auto Flatlay
                </button>
              </div>
            </div>

            {/* Interactive Canvas */}
            <div
              ref={canvasRef}
              data-testid="outfit-studio-canvas"
              onClick={() => setSelectedLayerId(null)}
              style={{ background: selectedBackdrop.canvasBg }}
              className="relative flex-1 rounded-2xl border border-[#E5E5E0] dark:border-[#343430] min-h-[380px] lg:min-h-[500px] overflow-hidden select-none"
            >
              {layers.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-[#6E6E68] dark:text-[#9A9A92]">
                  <Layers className="w-10 h-10 stroke-[1.4] opacity-50 mb-2" />
                  <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
                    Outfit canvas is empty
                  </p>
                  <p className="text-xs max-w-xs mt-1">
                    Click items on the left to add them to the lookbook. Backgrounds are removed automatically for a clean composition.
                  </p>
                </div>
              ) : (
                layers.map((layer) => {
                  const item = itemById.get(layer.itemId);
                  if (!item) return null;
                  const images = getItemImages(item);
                  const origUrl = images[0];
                  if (!origUrl) return null;

                  const isCutoutLoading =
                    layer.mode === 'cutout' &&
                    cutoutCache[`${origUrl}::${tolerance}`]?.status === 'loading';
                  const isStyledLoading =
                    layer.mode === 'styled' &&
                    styledCache[origUrl]?.status === 'loading';

                  const displaySrc = getLayerDisplaySrc(layer, origUrl);
                  const isSelected = selectedLayerId === layer.itemId;

                  return (
                    <div
                      key={layer.itemId}
                      data-testid={`outfit-layer-${layer.itemId}`}
                      onPointerDown={(e) => handlePointerDownLayer(e, layer)}
                      onPointerMove={handlePointerMoveLayer}
                      onPointerUp={handlePointerUpLayer}
                      onPointerCancel={handlePointerUpLayer}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLayerId(layer.itemId);
                      }}
                      style={{
                        left: `${layer.xPct}%`,
                        top: `${layer.yPct}%`,
                        zIndex: layer.zIndex,
                        width: `${Math.round(38 * layer.scale)}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className={`absolute cursor-grab active:cursor-grabbing rounded-xl transition-shadow ${
                        isSelected
                          ? 'ring-2 ring-[#E11D48] ring-offset-2 ring-offset-transparent'
                          : 'hover:ring-1 hover:ring-[#111110]/30 dark:hover:ring-white/30'
                      }`}
                    >
                      <img
                        src={displaySrc}
                        alt={item.title}
                        draggable={false}
                        className="w-full h-auto max-h-[250px] object-contain pointer-events-none drop-shadow-[0_10px_16px_rgba(17,17,16,0.18)]"
                      />
                      {(isCutoutLoading || isStyledLoading) && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/25 backdrop-blur-[1px]">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Bottom Outfit Canvas Metadata */}
              {layers.length > 0 && (
                <div
                  className={`pointer-events-none absolute bottom-2.5 inset-x-3.5 flex items-center justify-between text-[10px] font-mono ${
                    selectedBackdrop.isDark ? 'text-white/60' : 'text-[#111110]/55'
                  }`}
                >
                  <span>
                    {layers.length} {layers.length === 1 ? 'ITEM' : 'ITEMS'}
                  </span>
                  <span className="tabular-nums">
                    {formatCny(outfitTotals.totalCny)}
                    {displayCurrency !== 'CNY' &&
                      ` · ${formatCurrency(outfitConvertedTotal, displayCurrency)}`}
                  </span>
                </div>
              )}
            </div>

            {exportError && (
              <p className="text-xs text-[#DC2626] dark:text-[#F87171] text-center">
                {exportError}
              </p>
            )}
          </div>

          {/* Column 3: Studio Controls & Selected Layer Inspector */}
          <div className="border-t lg:border-t-0 lg:border-l border-[#E5E5E0] dark:border-[#2C2C2A] p-4 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              {/* Backdrop Presets */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#6E6E68] dark:text-[#9A9A92]">
                  Studio Backdrop
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {OUTFIT_BACKDROPS.map((b) => {
                    const active = b.id === backdropId;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBackdropId(b.id)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                          active
                            ? 'border-[#E11D48] bg-[#FFF1F2]/60 dark:bg-[#3A1620]/40 text-[#111110] dark:text-[#F4F4F0]'
                            : 'border-[#E5E5E0] dark:border-[#343430] text-[#52524E] dark:text-[#B4B4AC] hover:bg-[#F7F7F5] dark:hover:bg-[#242422]'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full border shrink-0 ${b.swatchClass}`}
                        />
                        <span className="truncate">{b.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Automatic Background Removal Sensitivity */}
              <div className="p-3 rounded-2xl bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#111110] dark:text-[#F4F4F0] inline-flex items-center gap-1.5">
                    <Eraser className="w-3.5 h-3.5 text-[#E11D48]" />
                    Edge-Barrier Cutout
                  </span>
                  <span className="font-mono text-[11px] text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                    {tolerance}
                  </span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={68}
                  step={2}
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  aria-label="Background removal sensitivity"
                  className="w-full accent-[#E11D48] cursor-pointer"
                />
                <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                  Sobel edge protection with internal hole closing and soft edge feathering.
                </p>
              </div>

              {/* Selected Layer Inspector */}
              {selectedLayer && selectedItem ? (
                <div
                  data-testid="outfit-layer-inspector"
                  className="p-3.5 rounded-2xl bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0] truncate">
                        {selectedItem.title}
                      </p>
                      <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                        {getCategoryLabel(selectedItem.category)} · {selectedItem.vendor}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleItemInOutfit(selectedItem)}
                      aria-label={`Remove ${selectedItem.title} from outfit`}
                      className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEE2E2] dark:hover:bg-[#3A161A] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Presentation Mode Selector */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-[#6E6E68] dark:text-[#9A9A92] block">
                      Presentation style
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateLayer(selectedLayer.itemId, (prev) => ({
                            ...prev,
                            mode: 'cutout',
                          }))
                        }
                        className={`py-1.5 px-1 text-[11px] font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                          selectedLayer.mode === 'cutout'
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110] dark:border-[#F4F4F0]'
                            : 'bg-white dark:bg-[#191918] text-[#6E6E68] dark:text-[#9A9A92] border-[#E5E5E0] dark:border-[#343430]'
                        }`}
                      >
                        Auto Cutout
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateLayer(selectedLayer.itemId, (prev) => ({
                            ...prev,
                            mode: 'styled',
                          }))
                        }
                        className={`py-1.5 px-1 text-[11px] font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                          selectedLayer.mode === 'styled'
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110] dark:border-[#F4F4F0]'
                            : 'bg-white dark:bg-[#191918] text-[#6E6E68] dark:text-[#9A9A92] border-[#E5E5E0] dark:border-[#343430]'
                        }`}
                      >
                        Framed
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateLayer(selectedLayer.itemId, (prev) => ({
                            ...prev,
                            mode: 'original',
                          }))
                        }
                        className={`py-1.5 px-1 text-[11px] font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                          selectedLayer.mode === 'original'
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110] dark:border-[#F4F4F0]'
                            : 'bg-white dark:bg-[#191918] text-[#6E6E68] dark:text-[#9A9A92] border-[#E5E5E0] dark:border-[#343430]'
                        }`}
                      >
                        Original
                      </button>
                    </div>
                  </div>

                  {/* Size Scale Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                      <span>Scale</span>
                      <span className="font-mono tabular-nums">
                        {Math.round(selectedLayer.scale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.45}
                      max={1.55}
                      step={0.05}
                      value={selectedLayer.scale}
                      onChange={(e) =>
                        updateLayer(selectedLayer.itemId, (prev) => ({
                          ...prev,
                          scale: clampOutfitScale(Number(e.target.value)),
                        }))
                      }
                      aria-label="Item scale in outfit"
                      className="w-full accent-[#E11D48] cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateLayer(selectedLayer.itemId, (prev) => ({
                          ...prev,
                          zIndex: Math.min(90, prev.zIndex + 1),
                        }))
                      }
                      className="inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-medium rounded-lg bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                      Bring Forward
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateLayer(selectedLayer.itemId, (prev) => ({
                          ...prev,
                          zIndex: Math.max(1, prev.zIndex - 1),
                        }))
                      }
                      className="inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-medium rounded-lg bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                      Send Backward
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl border border-dashed border-[#D6D6CF] dark:border-[#343430] text-center">
                  <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                    Click an item on the canvas to resize it, change its cutout style, or adjust layering.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Action Buttons */}
            <div className="space-y-2 pt-3 border-t border-[#E5E5E0] dark:border-[#2C2C2A]">
              <button
                type="button"
                disabled={layers.length === 0}
                onClick={handleAutoArrangeFlatlay}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#2C2C2A] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] disabled:opacity-45 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Auto-Arrange Flatlay
              </button>

              <TactileButton
                type="button"
                variant="primary"
                disabled={layers.length === 0 || exporting}
                onClick={() => void handleExportPng()}
                className="w-full"
                data-testid="outfit-export-png-btn"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : exportedDone ? (
                  <>
                    <Check className="w-4 h-4" />
                    Outfit PNG Exported
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export Outfit PNG
                  </>
                )}
              </TactileButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

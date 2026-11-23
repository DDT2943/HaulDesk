import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Crop, Link2, Tag, Upload, X } from 'lucide-react';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type ProductItem,
} from '../types/haul';
import {
  convertCnyToCurrency,
  DEFAULT_CNY_TO_EUR_RATE,
  detectPlatformFromUrl,
  formatCurrency,
  getItemImages,
  isValidHttpUrl,
  normalizeUrl,
  PLATFORM_LABELS,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';
import { CategoryIcon } from './CategoryIcons';
import { TactileButton } from './TactileButtons';
import { ScrollFadeList } from './ScrollFadeList';
import { SaveToggle } from './SaveToggle';
import { ProductPhotoEditorModal } from './ProductPhotoEditorModal';
import {
  extractDroppedImageInput,
  isLikelyImageFile,
  resolveImageUrlsToBlobs,
} from '../utils/dragDropImage';

export interface EditProductPatch {
  title: string;
  category: ProductCategory;
  priceCny: number;
  vendor: string;
  link: string;
  sizeNote: string;
  imageUrl: string;
  imageUrls: string[];
  needsCategoryConfirmation: boolean;
}

interface EditProductModalProps {
  open: boolean;
  item: ProductItem | null;
  existingVendors: string[];
  exchangeRate?: number;
  displayCurrency?: DisplayCurrencyCode;
  onClose: () => void;
  onSaveItem: (itemId: string, patch: EditProductPatch) => Promise<void>;
}

interface EditFieldErrors {
  title?: string;
  category?: string;
  priceCny?: string;
  vendor?: string;
  link?: string;
}

async function fileToResizedDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = String(reader.result ?? '');
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 900;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function EditProductModalInner({
  item,
  existingVendors,
  exchangeRate = DEFAULT_CNY_TO_EUR_RATE,
  displayCurrency = 'EUR',
  onClose,
  onSaveItem,
}: Omit<EditProductModalProps, 'open' | 'item'> & { item: ProductItem }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<EditProductPatch | null>(null);

  const [imagePreviews, setImagePreviews] = useState<string[]>(() => getItemImages(item));
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState<ProductCategory>(item.category);
  const [priceCny, setPriceCny] = useState(String(item.priceCny));
  const [vendor, setVendor] = useState(item.vendor);
  const [link, setLink] = useState(item.link ?? '');
  const [sizeNote, setSizeNote] = useState(item.sizeNote ?? '');
  const [errors, setErrors] = useState<EditFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importingDrop, setImportingDrop] = useState(false);
  const dragDepthRef = useRef(0);
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);

  const primaryImage = imagePreviews[0] ?? '';

  const processImageBlobs = async (blobs: Blob[]) => {
    if (blobs.length === 0) return;
    try {
      const converted = await Promise.all(blobs.map((blob) => fileToResizedDataUrl(blob)));
      setImagePreviews((prev) => {
        const merged = Array.from(new Set([...prev, ...converted]));
        return merged.slice(0, 8);
      });
      setSubmitError(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to load image.');
    }
  };

  const handleDropDataTransfer = async (dt: DataTransfer | null | undefined) => {
    const { files, urls } = extractDroppedImageInput(dt);
    const collected: Blob[] = [...files];

    if (urls.length > 0) {
      setImportingDrop(true);
      try {
        const fetched = await resolveImageUrlsToBlobs(urls);
        collected.push(...fetched);
      } finally {
        setImportingDrop(false);
      }
    }

    if (collected.length > 0) {
      await processImageBlobs(collected);
    } else {
      setSubmitError(
        'No valid image detected from drop. Try dropping an image file or pasting a photo with Ctrl+V.'
      );
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (photoEditorOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageBlobs: Blob[] = [];
      for (const clipItem of Array.from(items)) {
        if (clipItem.type.startsWith('image/')) {
          const blob = clipItem.getAsFile();
          if (blob) imageBlobs.push(blob);
        }
      }
      if (imageBlobs.length > 0) {
        void processImageBlobs(imageBlobs);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !photoEditorOpen) {
        onClose();
      }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('keydown', handleKeyDown);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [photoEditorOpen, onClose]);

  const handleRemoveImage = (index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetPrimaryImage = (index: number) => {
    setImagePreviews((prev) => {
      if (index <= 0 || index >= prev.length) return prev;
      const chosen = prev[index];
      return [chosen, ...prev.filter((_, i) => i !== index)];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: EditFieldErrors = {};

    if (!title.trim()) {
      nextErrors.title = 'Enter a valid product name.';
    }
    if (!PRODUCT_CATEGORIES.some((c) => c.id === category)) {
      nextErrors.category = 'Select a valid category.';
    }
    const parsedPrice = Number(priceCny.replace(',', '.'));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      nextErrors.priceCny = 'Enter a valid price greater than 0 in ¥ CNY.';
    }
    if (!vendor.trim()) {
      nextErrors.vendor = 'Enter the vendor / store name.';
    }
    const trimmedLink = link.trim();
    if (trimmedLink && !isValidHttpUrl(trimmedLink)) {
      nextErrors.link = 'Enter a valid Yupoo, Taobao, or Superbuy link.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const cleanImages = imagePreviews.map((u) => u.trim()).filter(Boolean);
    const normalizedLink = trimmedLink ? normalizeUrl(trimmedLink) : '';

    setErrors({});
    setSubmitError(null);
    pendingPatchRef.current = {
      title: title.trim(),
      category,
      priceCny: Math.round(parsedPrice * 100) / 100,
      vendor: vendor.trim(),
      link: normalizedLink,
      sizeNote: sizeNote.trim(),
      imageUrl: cleanImages[0] ?? '',
      imageUrls: cleanImages,
      needsCategoryConfirmation: false,
    };
    setSaveTrigger((c) => c + 1);
  };

  const executeSave = async (): Promise<boolean> => {
    const patch = pendingPatchRef.current;
    if (!patch) return false;
    try {
      await onSaveItem(item.id, patch);
      return true;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error saving changes.');
      return false;
    }
  };

  const detectedPlatform = detectPlatformFromUrl(link);
  const numericPrice = Number(priceCny.replace(',', '.'));
  const convertedEstimate =
    Number.isFinite(numericPrice) && numericPrice > 0 && displayCurrency !== 'CNY'
      ? convertCnyToCurrency(numericPrice, exchangeRate, displayCurrency)
      : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-[#111110]/65 dark:bg-black/75 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-product-title"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="w-full max-w-2xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#E5E5E0] dark:border-[#2C2C2A] shrink-0">
            <div className="min-w-0">
              <h2
                id="edit-product-title"
                className="text-base font-bold text-[#111110] dark:text-[#F4F4F0] truncate"
              >
                Edit Product
              </h2>
              <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
                {item.title}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit product modal"
              className="p-2 rounded-lg text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#242422] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Step 1: Product Photos */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]">
                  Product Photos
                </span>
                <span className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                  {imagePreviews.length} / 8 photos
                </span>
              </div>

              <div
                data-testid="edit-product-dropzone"
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current += 1;
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                  }
                  if (!dragOver) setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                  if (dragDepthRef.current === 0) {
                    setDragOver(false);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current = 0;
                  setDragOver(false);
                  void handleDropDataTransfer(e.dataTransfer);
                }}
                className={`relative rounded-2xl border-2 border-dashed transition-colors p-3.5 sm:p-4 ${
                  dragOver
                    ? 'border-[#E11D48] bg-[#FFF1F2] dark:bg-[#3A1620]'
                    : 'border-[#D6D6CF] dark:border-[#343430] bg-[#F7F7F5] dark:bg-[#222220]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-label="Add photos to product"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).filter((f) =>
                      isLikelyImageFile(f)
                    );
                    if (files.length > 0) void processImageBlobs(files);
                    e.target.value = '';
                  }}
                />

                <div className="flex flex-col sm:flex-row items-center gap-3.5">
                  {primaryImage ? (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#191918] shrink-0">
                      <img
                        src={primaryImage}
                        alt={`${title || item.title} preview`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#191918] flex items-center justify-center text-[#6E6E68] dark:text-[#9A9A92] shrink-0">
                      <Upload className="w-5 h-5" />
                    </div>
                  )}

                  <div className="flex-1 text-center sm:text-left space-y-2">
                    <p className="text-xs text-[#52524E] dark:text-[#B4B4AC]">
                      {importingDrop
                        ? 'Importing dropped image...'
                        : 'Upload new photos, drag files or browser images here, or set the cover.'}
                    </p>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <TactileButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={importingDrop}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {imagePreviews.length > 0 ? 'Add photos' : 'Choose photos'}
                      </TactileButton>

                      {imagePreviews.length > 0 && (
                        <TactileButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setPhotoEditorOpen(true)}
                        >
                          <Crop className="w-3.5 h-3.5" />
                          Crop / Reorder
                        </TactileButton>
                      )}
                    </div>
                  </div>
                </div>

                {imagePreviews.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#E5E5E0] dark:border-[#343430]">
                    <ScrollFadeList
                      items={imagePreviews.map((url, idx) => ({ url, idx }))}
                      getKey={(entry) => `${entry.idx}-${entry.url.slice(0, 24)}`}
                      maxFadeHeight={28}
                      scrollClassName="max-h-40 overflow-y-auto overscroll-contain"
                      renderItem={(entry) => (
                        <div
                          className={`flex items-center justify-between gap-3 p-2 rounded-xl border ${
                            entry.idx === 0
                              ? 'border-[#E11D48] bg-[#FFF1F2] dark:bg-[#3A1620]'
                              : 'border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#1E1E1C]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={entry.url}
                              alt={`Photo ${entry.idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] truncate block">
                                {entry.idx === 0 ? 'Primary Photo (Cover)' : `Photo ${entry.idx + 1}`}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {entry.idx !== 0 && (
                              <button
                                type="button"
                                onClick={() => handleSetPrimaryImage(entry.idx)}
                                className="px-2 py-1 text-[11px] font-medium rounded-lg bg-[#EFEFEA] dark:bg-[#2A2A27] text-[#111110] dark:text-[#F4F4F0] hover:bg-[#E5E5E0] dark:hover:bg-[#32322F] cursor-pointer"
                              >
                                Cover
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(entry.idx)}
                              aria-label={`Remove photo ${entry.idx + 1}`}
                              className="p-1.5 rounded-lg text-[#8E8E87] hover:text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#3A161A] cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Product Name */}
            <div>
              <label
                htmlFor="edit-product-title-input"
                className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
              >
                Product Name
              </label>
              <input
                id="edit-product-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Boxy Fit Washed Charcoal Hoodie"
                className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
              />
              {errors.title && (
                <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Product Category */}
            <div>
              <span className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-2">
                Product Category
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRODUCT_CATEGORIES.map((cat) => {
                  const selected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      aria-pressed={selected}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] ${
                        selected
                          ? 'border-[#111110] dark:border-[#F4F4F0] bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] shadow-sm'
                          : 'border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#222220] hover:bg-[#F7F7F5] dark:hover:bg-[#2C2C2A] text-[#111110] dark:text-[#F4F4F0]'
                      }`}
                    >
                      <CategoryIcon
                        category={cat.id}
                        active={selected}
                        className="w-4 h-4 shrink-0"
                      />
                      <span className="text-xs font-medium truncate">
                        {cat.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.category && (
                <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1.5">
                  {errors.category}
                </p>
              )}
            </div>

            {/* Price & Vendor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="edit-product-price-input"
                  className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                >
                  Price (¥ CNY)
                </label>
                <div className="relative">
                  <input
                    id="edit-product-price-input"
                    type="text"
                    inputMode="decimal"
                    value={priceCny}
                    onChange={(e) => setPriceCny(e.target.value)}
                    placeholder="e.g. 240"
                    className="w-full pl-3.5 pr-20 py-2.5 text-base sm:text-sm font-mono tabular-nums bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                    {convertedEstimate !== null
                      ? `≈ ${formatCurrency(convertedEstimate, displayCurrency)}`
                      : 'CNY'}
                  </span>
                </div>
                {errors.priceCny && (
                  <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1">
                    {errors.priceCny}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="edit-product-vendor-input"
                  className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                >
                  Vendor / Seller
                </label>
                <input
                  id="edit-product-vendor-input"
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. TopStoney, AAAABull, WWTOP"
                  className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                />
                {existingVendors.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {existingVendors.slice(0, 5).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVendor(v)}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-[#EFEFEA] dark:bg-[#242422] hover:bg-[#E5E5E0] dark:hover:bg-[#30302C] text-[#52524E] dark:text-[#B4B4AC] hover:text-[#111110] dark:hover:text-[#F4F4F0] transition-colors cursor-pointer"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {errors.vendor && (
                  <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1">
                    {errors.vendor}
                  </p>
                )}
              </div>
            </div>

            {/* Link & Taglia */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="edit-product-link-input"
                    className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]"
                  >
                    Product Link (Optional)
                  </label>
                  {link.trim() && (
                    <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      {PLATFORM_LABELS[detectedPlatform]}
                    </span>
                  )}
                </div>
                <input
                  id="edit-product-link-input"
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://item.taobao.com/item.htm?id=..."
                  className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                />
                {errors.link && (
                  <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1">
                    {errors.link}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="edit-product-size-input"
                  className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                >
                  Size / Notes
                </label>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-[#8E8E87] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="edit-product-size-input"
                    type="text"
                    value={sizeNote}
                    onChange={(e) => setSizeNote(e.target.value)}
                    placeholder="e.g. L · Black"
                    className="w-full pl-8 pr-3 py-2.5 text-base sm:text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                  />
                </div>
              </div>
            </div>

            {submitError && (
              <p className="text-xs text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#3A161A] border border-[#FECACA] dark:border-[#7F1D1D] rounded-xl px-3.5 py-2.5">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5E5E0] dark:border-[#2C2C2A]">
              <TactileButton type="button" variant="secondary" onClick={onClose}>
                Cancel
              </TactileButton>
              <SaveToggle
                type="submit"
                size="xs"
                idleText="Save Changes"
                savedText="Saved"
                idleWidth={148}
                savedWidth={114}
                autoResetDelay={0}
                triggerCount={saveTrigger}
                onSave={executeSave}
                onStatusChange={(st) => {
                  if (st === 'saved') {
                    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
                    closeTimerRef.current = window.setTimeout(() => {
                      onClose();
                    }, 420);
                  }
                }}
              />
            </div>
          </form>
        </motion.div>
      </motion.div>

      <ProductPhotoEditorModal
        isOpen={photoEditorOpen}
        onClose={() => setPhotoEditorOpen(false)}
        productTitle={title || item.title}
        initialImages={imagePreviews}
        onSave={async (updatedImages) => {
          setImagePreviews(updatedImages);
        }}
      />
    </>
  );
}

export function EditProductModal({
  open,
  item,
  existingVendors,
  exchangeRate,
  displayCurrency,
  onClose,
  onSaveItem,
}: EditProductModalProps) {
  if (!open || !item) return null;

  return (
    <EditProductModalInner
      key={item.id}
      item={item}
      existingVendors={existingVendors}
      exchangeRate={exchangeRate}
      displayCurrency={displayCurrency}
      onClose={onClose}
      onSaveItem={onSaveItem}
    />
  );
}

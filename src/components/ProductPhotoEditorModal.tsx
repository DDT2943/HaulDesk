/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  Trash2,
  Crop,
  Plus,
  RotateCcw,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { TimedUndoAction } from './TimedUndoAction';
import { SaveToggle } from './SaveToggle';
import { extractDroppedImageInput, resolveImageUrlsToBlobs } from '../utils/dragDropImage';
import { resolveCorsSafeImageSrc } from '../utils/backgroundRemoval';

interface ProductPhotoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productTitle: string;
  initialImages: string[];
  onSave: (images: string[]) => Promise<void>;
}

export type AspectRatioOption = 'original' | '1:1' | '4:5' | '3:4';

async function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

export async function cropImageToCanvas(
  src: string,
  aspectRatio: number | null,
  zoom: number = 1,
  offsetY: number = 0.5,
  offsetX: number = 0.5
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      if (!aspectRatio) {
        // No crop - resize to maximum 1000px dimension for performance
        const MAX_DIM = 1000;
        let targetW = origW;
        let targetH = origH;
        if (targetW > MAX_DIM || targetH > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / targetW, MAX_DIM / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        return resolve(canvas.toDataURL('image/jpeg', 0.88));
      }

      // Calculate crop box in original coordinates
      let cropW: number;
      let cropH: number;

      if (origW / origH > aspectRatio) {
        cropH = origH / zoom;
        cropW = cropH * aspectRatio;
      } else {
        cropW = origW / zoom;
        cropH = cropW / aspectRatio;
      }

      cropW = Math.min(cropW, origW);
      cropH = Math.min(cropH, origH);

      const maxStartX = origW - cropW;
      const maxStartY = origH - cropH;

      const startX = Math.max(0, Math.min(maxStartX, maxStartX * offsetX));
      const startY = Math.max(0, Math.min(maxStartY, maxStartY * offsetY));

      const outputWidth = Math.min(900, Math.round(cropW));
      const outputHeight = Math.round(outputWidth / aspectRatio);

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(src);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, outputWidth, outputHeight);

      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(src);
    img.src = resolveCorsSafeImageSrc(src);
  });
}

export function ProductPhotoEditorModal({
  isOpen,
  onClose,
  productTitle,
  initialImages,
  onSave,
}: ProductPhotoEditorModalProps) {
  const [images, setImages] = useState<string[]>([]);
  // Keep original uncropped source in case user reverts crop
  const [originalSources, setOriginalSources] = useState<Record<string, string>>({});
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'gallery' | 'crop'>('gallery');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeletePhotoIdx, setPendingDeletePhotoIdx] = useState<number | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  // Crop controls state
  const [cropAspect, setCropAspect] = useState<AspectRatioOption>('1:1');
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffsetY, setCropOffsetY] = useState(0.5); // 0=top, 0.5=center, 1=bottom
  const [cropOffsetX, setCropOffsetX] = useState(0.5); // 0=left, 0.5=center, 1=right
  const [previewCroppedUrl, setPreviewCroppedUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const zoomId = useId();
  const offsetYId = useId();
  const offsetXId = useId();

  // Initialize images when modal opens
  useEffect(() => {
    if (isOpen) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      const clean = initialImages.length > 0 ? [...initialImages] : [];
      setImages(clean);
      const origins: Record<string, string> = {};
      clean.forEach((img) => {
        origins[img] = img;
      });
      setOriginalSources(origins);
      setSelectedPhotoIdx(0);
      setActiveTab('gallery');
      setCropAspect('1:1');
      setCropZoom(1);
      setCropOffsetY(0.5);
      setCropOffsetX(0.5);
      setPreviewCroppedUrl(null);
      setPendingDeletePhotoIdx(null);
      setDeleteNotice(null);
    }
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isOpen, initialImages]);

  const currentPhoto = images[selectedPhotoIdx] ?? images[0] ?? '';
  const originalOfCurrent = originalSources[currentPhoto] || currentPhoto;

  // Compute live crop preview whenever crop controls change
  useEffect(() => {
    let active = true;
    if (!originalOfCurrent) return;

    if (cropAspect === 'original') {
      setPreviewCroppedUrl(originalOfCurrent);
      return;
    }

    let aspectVal: number | null = 1;
    if (cropAspect === '1:1') aspectVal = 1;
    else if (cropAspect === '4:5') aspectVal = 4 / 5;
    else if (cropAspect === '3:4') aspectVal = 3 / 4;

    void cropImageToCanvas(
      originalOfCurrent,
      aspectVal,
      cropZoom,
      cropOffsetY,
      cropOffsetX
    ).then((url) => {
      if (active) {
        setPreviewCroppedUrl(url);
      }
    });

    return () => {
      active = false;
    };
  }, [originalOfCurrent, cropAspect, cropZoom, cropOffsetY, cropOffsetX]);

  // Reorder actions
  const handleMoveLeft = (idx: number) => {
    if (idx <= 0) return;
    setImages((prev) => {
      const next = [...prev];
      const temp = next[idx - 1];
      next[idx - 1] = next[idx];
      next[idx] = temp;
      return next;
    });
    if (selectedPhotoIdx === idx) setSelectedPhotoIdx(idx - 1);
    else if (selectedPhotoIdx === idx - 1) setSelectedPhotoIdx(idx);
  };

  const handleMoveRight = (idx: number) => {
    if (idx >= images.length - 1) return;
    setImages((prev) => {
      const next = [...prev];
      const temp = next[idx + 1];
      next[idx + 1] = next[idx];
      next[idx] = temp;
      return next;
    });
    if (selectedPhotoIdx === idx) setSelectedPhotoIdx(idx + 1);
    else if (selectedPhotoIdx === idx + 1) setSelectedPhotoIdx(idx);
  };

  const handleSetCover = (idx: number) => {
    if (idx === 0) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
    setSelectedPhotoIdx(0);
  };

  const handleDeletePhoto = (idx: number) => {
    if (images.length <= 1) {
      setDeleteNotice('Products must have at least one main photo. Add a new one before deleting this photo.');
      window.setTimeout(() => setDeleteNotice(null), 3500);
      setPendingDeletePhotoIdx(null);
      return;
    }
    const target = images[idx];
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setOriginalSources((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
    if (selectedPhotoIdx >= images.length - 1) {
      setSelectedPhotoIdx(Math.max(0, images.length - 2));
    }
    setPendingDeletePhotoIdx(null);
  };

  const appendImageBlobs = async (blobs: Blob[]) => {
    if (blobs.length === 0) return;
    const newUrls = await Promise.all(blobs.map((f) => readFileAsDataUrl(f)));
    setImages((prev) => [...prev, ...newUrls].slice(0, 12));
    setOriginalSources((prev) => {
      const next = { ...prev };
      newUrls.forEach((u) => {
        next[u] = u;
      });
      return next;
    });
  };

  const handleAddFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await appendImageBlobs(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDropInEditor = async (dt: DataTransfer | null | undefined) => {
    const { files, urls } = extractDroppedImageInput(dt);
    const collected: Blob[] = [...files];
    if (urls.length > 0) {
      const fetched = await resolveImageUrlsToBlobs(urls);
      collected.push(...fetched);
    }
    if (collected.length > 0) {
      await appendImageBlobs(collected);
    } else {
      setDeleteNotice('No valid image detected from drag-and-drop.');
      window.setTimeout(() => setDeleteNotice(null), 3500);
    }
  };

  const handleApplyCrop = () => {
    if (!previewCroppedUrl || selectedPhotoIdx < 0 || selectedPhotoIdx >= images.length) return;
    const oldUrl = images[selectedPhotoIdx];
    const newImages = [...images];
    newImages[selectedPhotoIdx] = previewCroppedUrl;
    setImages(newImages);

    // Keep pointer to original so user can re-crop later
    setOriginalSources((prev) => ({
      ...prev,
      [previewCroppedUrl]: originalSources[oldUrl] || oldUrl,
    }));

    setActiveTab('gallery');
  };

  const handleResetToOriginal = () => {
    if (selectedPhotoIdx < 0 || selectedPhotoIdx >= images.length) return;
    const current = images[selectedPhotoIdx];
    const orig = originalSources[current];
    if (orig && orig !== current) {
      const newImages = [...images];
      newImages[selectedPhotoIdx] = orig;
      setImages(newImages);
    }
    setCropAspect('original');
    setCropZoom(1);
    setCropOffsetY(0.5);
    setCropOffsetX(0.5);
  };

  const executeSave = async (): Promise<boolean> => {
    try {
      setIsSaving(true);
      await onSave(images);
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-3xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E0] dark:border-[#2C2C2A] shrink-0">
            <div>
              <h2 className="text-base font-bold text-[#111110] dark:text-[#F4F4F0] flex items-center gap-2">
                <span>Photo Manager &amp; Editor</span>
                <span className="text-xs font-normal text-[#6E6E68] dark:text-[#9A9A92] font-mono tabular-nums">
                  ({images.length} {images.length === 1 ? 'photo' : 'photos'})
                </span>
              </h2>
              <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate max-w-md mt-0.5">
                {productTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close photo editor"
              className="w-8 h-8 rounded-full bg-[#F7F7F5] dark:bg-[#2A2A28] border border-[#E5E5E0] dark:border-[#343430] flex items-center justify-center text-[#111110] dark:text-[#F4F4F0] hover:bg-[#111110] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Subheader Navigation: Gallery & Reorder vs Crop */}
          <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-[#EFEFEA] dark:border-[#262624] bg-[#F7F7F5] dark:bg-[#151514] shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('gallery')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                activeTab === 'gallery'
                  ? 'bg-white dark:bg-[#222220] text-[#111110] dark:text-[#F4F4F0] shadow-xs border border-[#E5E5E0] dark:border-[#343430]'
                  : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
              }`}
            >
              Gallery, Order &amp; Delete
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('crop')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                activeTab === 'crop'
                  ? 'bg-white dark:bg-[#222220] text-[#111110] dark:text-[#F4F4F0] shadow-xs border border-[#E5E5E0] dark:border-[#343430]'
                  : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Crop Tool</span>
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {activeTab === 'gallery' ? (
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current += 1;
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                  if (!dragOver) setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                  if (dragDepthRef.current === 0) setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current = 0;
                  setDragOver(false);
                  void handleDropInEditor(e.dataTransfer);
                }}
                className={`space-y-4 rounded-2xl border-2 border-dashed p-3 transition-colors ${
                  dragOver
                    ? 'border-[#E11D48] bg-[#FFF1F2]/70 dark:bg-[#3A1620]/50'
                    : 'border-transparent'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                    Drag and drop new photos here or use the arrows to reorder them. The first photo is the main cover.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add new photos</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleAddFiles}
                  />
                </div>

                {deleteNotice && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between animate-fadeIn">
                    <span>{deleteNotice}</span>
                  </div>
                )}

                {/* Grid of Photos with Reorder / Delete / Crop actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map((imgSrc, idx) => {
                    const isCover = idx === 0;
                    const isPendingDelete = pendingDeletePhotoIdx === idx;
                    return (
                      <div
                        key={idx}
                        className={`relative rounded-2xl border p-2 flex flex-col justify-between gap-2.5 transition-all ${
                          isPendingDelete
                            ? 'border-[#E11D48]/70 bg-[#FEF2F2]/60 dark:bg-[#2C1518]/60 shadow-sm'
                            : isCover
                            ? 'border-[#E11D48] bg-[#FFF5F5] dark:bg-[#221618]'
                            : 'border-[#E5E5E0] dark:border-[#2C2C2A] bg-[#F7F7F5] dark:bg-[#20201E]'
                        }`}
                      >
                        {/* Thumbnail View */}
                        <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-white dark:bg-[#141413] border border-[#E5E5E0] dark:border-[#343430]">
                          <img
                            src={imgSrc}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-black/75 text-white flex items-center gap-1">
                            {isCover ? (
                              <>
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                <span>Cover</span>
                              </>
                            ) : (
                              <span>#{idx + 1}</span>
                            )}
                          </div>

                          {isPendingDelete && (
                            <div className="absolute inset-0 bg-[#E11D48]/20 backdrop-blur-[1px] flex items-center justify-center p-2 text-center">
                              <span className="text-[11px] font-bold text-[#E11D48] dark:text-[#F87171] bg-white/95 dark:bg-[#191918]/95 px-2.5 py-1 rounded-lg border border-[#E11D48]/30 shadow-xs">
                                Deleting...
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Controls Toolbar with TimedUndoAction */}
                        {isPendingDelete ? (
                          <div className="w-full flex items-center justify-center pt-1 min-h-[36px]">
                            <TimedUndoAction
                              compact
                              autoStart
                              undoDuration={5}
                              cancelText="Cancel"
                              onCancel={() => setPendingDeletePhotoIdx(null)}
                              onExpire={() => {
                                handleDeletePhoto(idx);
                              }}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1 pt-1 min-h-[36px]">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveLeft(idx)}
                                title="Move left"
                                aria-label={`Move photo ${idx + 1} earlier`}
                                className="w-7 h-7 rounded-lg bg-white dark:bg-[#2A2A28] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#EFEFEA] dark:hover:bg-[#343430] transition-colors cursor-pointer"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === images.length - 1}
                                onClick={() => handleMoveRight(idx)}
                                title="Move right"
                                aria-label={`Move photo ${idx + 1} later`}
                                className="w-7 h-7 rounded-lg bg-white dark:bg-[#2A2A28] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#EFEFEA] dark:hover:bg-[#343430] transition-colors cursor-pointer"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                              {!isCover && (
                                <button
                                  type="button"
                                  onClick={() => handleSetCover(idx)}
                                  title="Set as first photo (cover)"
                                  className="px-2 py-1 text-[11px] font-medium rounded-lg bg-white dark:bg-[#2A2A28] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] hover:text-[#E11D48] transition-colors cursor-pointer"
                                >
                                  Cover
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPhotoIdx(idx);
                                  setActiveTab('crop');
                                }}
                                title="Crop this photo"
                                aria-label={`Crop photo ${idx + 1}`}
                                className="w-7 h-7 rounded-lg bg-white dark:bg-[#2A2A28] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] flex items-center justify-center hover:bg-[#111110] hover:text-white transition-colors cursor-pointer"
                              >
                                <Crop className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (images.length <= 1) {
                                    setDeleteNotice('Products must have at least one main photo.');
                                    window.setTimeout(() => setDeleteNotice(null), 3500);
                                    return;
                                  }
                                  setPendingDeletePhotoIdx(idx);
                                }}
                                title="Delete photo"
                                aria-label={`Delete photo ${idx + 1}`}
                                className="w-7 h-7 rounded-lg bg-white dark:bg-[#2A2A28] border border-[#E5E5E0] dark:border-[#343430] text-[#8E8E87] hover:text-red-600 hover:border-red-300 dark:hover:border-red-900 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Crop Tab View */
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Left Side: Photo Selector + Interactive Preview */}
                <div className="md:col-span-7 space-y-3">
                  {/* Small photo selector strip */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {images.map((imgSrc, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedPhotoIdx(i)}
                        className={`w-12 h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                          selectedPhotoIdx === i
                            ? 'border-[#E11D48] scale-105 shadow-xs'
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>

                  {/* Main Crop Preview Canvas Area */}
                  <div className="relative w-full aspect-square bg-[#0D0D0C] rounded-2xl overflow-hidden border border-[#E5E5E0] dark:border-[#2C2C2A] flex items-center justify-center shadow-inner">
                    {previewCroppedUrl ? (
                      <img
                        src={previewCroppedUrl}
                        alt="Crop preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-[#8E8E87]">Loading preview...</span>
                    )}

                    <div className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-black/70 text-white text-[11px] font-mono">
                      Photo #{selectedPhotoIdx + 1} · {cropAspect === 'original' ? 'Uncropped' : `Crop ${cropAspect}`}
                    </div>
                  </div>
                </div>

                {/* Right Side: Crop Aspect Ratio, Zoom & Alignment Controls */}
                <div className="md:col-span-5 space-y-5 bg-[#F7F7F5] dark:bg-[#1E1E1C] p-4 rounded-2xl border border-[#E5E5E0] dark:border-[#2C2C2A]">
                  <div>
                    <label className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0] block mb-2">
                      1. Crop Mode (Aspect Ratio)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCropAspect('1:1')}
                        className={`p-2.5 text-xs font-medium rounded-xl border text-center transition-all cursor-pointer ${
                          cropAspect === '1:1'
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110]'
                            : 'bg-white dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border-[#E5E5E0] dark:border-[#343430] hover:bg-[#EFEFEA]'
                        }`}
                      >
                        <span className="block font-bold">1:1 Square</span>
                        <span className="text-[10px] opacity-75">Ideal for catalog</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropAspect('4:5')}
                        className={`p-2.5 text-xs font-medium rounded-xl border text-center transition-all cursor-pointer ${
                          cropAspect === '4:5'
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110]'
                            : 'bg-white dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border-[#E5E5E0] dark:border-[#343430] hover:bg-[#EFEFEA]'
                        }`}
                      >
                        <span className="block font-bold">4:5 Outfit</span>
                        <span className="text-[10px] opacity-75">Vertical portrait</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropAspect('3:4')}
                        className={`p-2.5 text-xs font-medium rounded-xl border text-center transition-all cursor-pointer ${
                          cropAspect === '3:4'
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110]'
                            : 'bg-white dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border-[#E5E5E0] dark:border-[#343430] hover:bg-[#EFEFEA]'
                        }`}
                      >
                        <span className="block font-bold">3:4 Standard</span>
                        <span className="text-[10px] opacity-75">Standard QC photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropAspect('original')}
                        className={`p-2.5 text-xs font-medium rounded-xl border text-center transition-all cursor-pointer ${
                          cropAspect === 'original'
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110]'
                            : 'bg-white dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border-[#E5E5E0] dark:border-[#343430] hover:bg-[#EFEFEA]'
                        }`}
                      >
                        <span className="block font-bold">Uncropped</span>
                        <span className="text-[10px] opacity-75">Keep original</span>
                      </button>
                    </div>
                  </div>

                  {/* Zoom Slider */}
                  {cropAspect !== 'original' && (
                    <div className="space-y-3 pt-2 border-t border-[#E5E5E0] dark:border-[#343430]">
                      <div className="flex items-center justify-between">
                        <label htmlFor={zoomId} className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0]">
                          2. Image Zoom
                        </label>
                        <span className="text-xs font-mono font-semibold text-[#111110] dark:text-[#F4F4F0]">
                          {cropZoom.toFixed(1)}x
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ZoomOut className="w-3.5 h-3.5 text-[#8E8E87]" />
                        <input
                          id={zoomId}
                          type="range"
                          min="1"
                          max="2.5"
                          step="0.05"
                          value={cropZoom}
                          onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                          aria-label="Adjust crop zoom"
                          className="w-full h-1.5 bg-[#E5E5E0] dark:bg-[#343430] rounded-lg appearance-none cursor-pointer accent-[#E11D48]"
                        />
                        <ZoomIn className="w-3.5 h-3.5 text-[#8E8E87]" />
                      </div>

                      {/* Positioning offsets */}
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor={offsetYId} className="text-xs font-medium text-[#6E6E68] dark:text-[#9A9A92]">
                            Vertical Alignment
                          </label>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setCropOffsetY(0)}
                              className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-[#242422] rounded border border-[#E5E5E0] dark:border-[#343430]"
                            >
                              Top
                            </button>
                            <button
                              type="button"
                              onClick={() => setCropOffsetY(0.5)}
                              className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-[#242422] rounded border border-[#E5E5E0] dark:border-[#343430]"
                            >
                              Center
                            </button>
                            <button
                              type="button"
                              onClick={() => setCropOffsetY(1)}
                              className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-[#242422] rounded border border-[#E5E5E0] dark:border-[#343430]"
                            >
                              Bottom
                            </button>
                          </div>
                        </div>
                        <input
                          id={offsetYId}
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          value={cropOffsetY}
                          onChange={(e) => setCropOffsetY(parseFloat(e.target.value))}
                          aria-label="Vertical alignment"
                          className="w-full h-1.5 bg-[#E5E5E0] dark:bg-[#343430] rounded-lg appearance-none cursor-pointer accent-[#E11D48]"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor={offsetXId} className="text-xs font-medium text-[#6E6E68] dark:text-[#9A9A92]">
                            Horizontal Alignment
                          </label>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setCropOffsetX(0)}
                              className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-[#242422] rounded border border-[#E5E5E0] dark:border-[#343430]"
                            >
                              Left
                            </button>
                            <button
                              type="button"
                              onClick={() => setCropOffsetX(0.5)}
                              className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-[#242422] rounded border border-[#E5E5E0] dark:border-[#343430]"
                            >
                              Center
                            </button>
                            <button
                              type="button"
                              onClick={() => setCropOffsetX(1)}
                              className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-[#242422] rounded border border-[#E5E5E0] dark:border-[#343430]"
                            >
                              Right
                            </button>
                          </div>
                        </div>
                        <input
                          id={offsetXId}
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          value={cropOffsetX}
                          onChange={(e) => setCropOffsetX(parseFloat(e.target.value))}
                          aria-label="Horizontal alignment"
                          className="w-full h-1.5 bg-[#E5E5E0] dark:bg-[#343430] rounded-lg appearance-none cursor-pointer accent-[#E11D48]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Crop Action Buttons */}
                  <div className="space-y-2 pt-3 border-t border-[#E5E5E0] dark:border-[#343430]">
                    <button
                      type="button"
                      onClick={handleApplyCrop}
                      className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>Apply Crop to Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetToOriginal}
                      className="w-full py-2 bg-white dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] text-[#111110] dark:text-[#F4F4F0] font-medium rounded-xl flex items-center justify-center gap-1.5 text-xs hover:bg-[#EFEFEA] transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Original Photo</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#E5E5E0] dark:border-[#2C2C2A] bg-[#F7F7F5] dark:bg-[#151514] shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <SaveToggle
              size="xs"
              idleText="Save Photos"
              savedText="Saved"
              idleWidth={128}
              savedWidth={114}
              onSave={executeSave}
              onStatusChange={(st) => {
                if (st === 'saved') {
                  if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
                  closeTimerRef.current = window.setTimeout(() => {
                    onClose();
                  }, 560);
                }
              }}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export interface BackgroundRemovalResult {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  removedRatio: number;
  bbox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  applied: boolean;
}

export type GarmentPresentationMode = 'cutout' | 'styled' | 'original';

interface RgbSample {
  r: number;
  g: number;
  b: number;
}

/**
 * Perceptually weighted squared RGB Euclidean distance.
 */
function colorDistSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
}

/**
 * Compute grayscale luminance for an RGB pixel.
 */
function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/**
 * Compute 3x3 Sobel luminance gradient magnitude for all pixels.
 * High gradient values indicate sharp boundaries (fabric outlines, folds, seams).
 */
export function computeSobelGradientMap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const total = width * height;
  const grad = new Uint8Array(total);
  if (width < 3 || height < 3) return grad;

  const lum = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    lum[i] = rgba[idx] * 0.299 + rgba[idx + 1] * 0.587 + rgba[idx + 2] * 0.114;
  }

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const p = rowOffset + x;
      // 3x3 window around (x, y)
      const tl = lum[p - width - 1];
      const tc = lum[p - width];
      const tr = lum[p - width + 1];
      const ml = lum[p - 1];
      const mr = lum[p + 1];
      const bl = lum[p + width - 1];
      const bc = lum[p + width];
      const br = lum[p + width + 1];

      // Sobel kernel X: [-1 0 1; -2 0 2; -1 0 1]
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      // Sobel kernel Y: [-1 -2 -1; 0 0 0; 1 2 1]
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      const mag = Math.sqrt(gx * gx + gy * gy) / 4;
      grad[p] = Math.min(255, Math.round(mag));
    }
  }

  return grad;
}

/**
 * Collect dominant background color samples from image perimeter.
 * Strongly weights the top edge and top corners so garments touching the bottom frame
 * don't pollute the background model.
 */
function collectBorderBackgroundSamples(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): RgbSample[] {
  const clusters: Array<{ r: number; g: number; b: number; count: number }> = [];
  const stepX = Math.max(1, Math.floor(width / 28));
  const stepY = Math.max(1, Math.floor(height / 28));
  let totalSamples = 0;

  const addSample = (x: number, y: number, weight = 1) => {
    const idx = (y * width + x) * 4;
    const a = rgba[idx + 3];
    if (a < 32) return;
    totalSamples += weight;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];

    for (const c of clusters) {
      if (colorDistSq(r, g, b, c.r, c.g, c.b) <= 320) {
        const nextCount = c.count + weight;
        c.r = (c.r * c.count + r * weight) / nextCount;
        c.g = (c.g * c.count + g * weight) / nextCount;
        c.b = (c.b * c.count + b * weight) / nextCount;
        c.count = nextCount;
        return;
      }
    }
    clusters.push({ r, g, b, count: weight });
  };

  // Top edge (strongly weighted)
  for (let x = 0; x < width; x += stepX) {
    addSample(x, 0, 3);
    if (height > 3) addSample(x, 1, 2);
  }
  // Top corners (extra weight)
  addSample(0, 0, 4);
  addSample(width - 1, 0, 4);

  // Left & right upper borders (down to 75% height)
  const maxSideY = Math.floor(height * 0.75);
  for (let y = 0; y < maxSideY; y += stepY) {
    addSample(0, y, 2);
    addSample(width - 1, y, 2);
  }

  // Bottom corners
  addSample(0, height - 1, 1);
  addSample(width - 1, height - 1, 1);

  clusters.sort((a, b) => b.count - a.count);
  const dominant = clusters.filter((c) => c.count >= Math.max(2, totalSamples * 0.14));
  return (dominant.length > 0 ? dominant : clusters)
    .slice(0, 3)
    .map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
}

/**
 * High-precision edge-bounded background segmentation over an RGBA buffer.
 * Features:
 *  - Sobel edge-gradient barrier (flood fill will not cross strong fabric contours)
 *  - Multi-point perimeter background sampling
 *  - Center foreground prior (guards against swallowing monochrome garments)
 *  - Morphological hole filling (ensures internal pockets, logos, zippers stay solid)
 *  - Despeckling and anti-aliased edge feathering
 */
export function removeBackgroundFromRgba(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { tolerance?: number; feather?: boolean }
): BackgroundRemovalResult {
  const out = new Uint8ClampedArray(input);
  const totalPixels = width * height;
  if (width <= 2 || height <= 2 || totalPixels === 0) {
    return {
      rgba: out,
      width,
      height,
      removedRatio: 0,
      bbox: { minX: 0, minY: 0, maxX: Math.max(0, width - 1), maxY: Math.max(0, height - 1) },
      applied: false,
    };
  }

  const samples = collectBorderBackgroundSamples(input, width, height);
  if (samples.length === 0) {
    return {
      rgba: out,
      width,
      height,
      removedRatio: 0,
      bbox: { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 },
      applied: false,
    };
  }

  // Compute Sobel gradient map for contour detection
  const gradMap = computeSobelGradientMap(input, width, height);

  const rawTolerance = options?.tolerance ?? 38;
  const tolerance = Math.max(12, Math.min(85, rawTolerance));
  // Background distance threshold (quadratic)
  const bgDistThresholdSq = tolerance * tolerance * 0.92;
  // Local neighbor stepping threshold
  const localStepThresholdSq = Math.min(220, Math.max(65, tolerance * tolerance * 0.22));
  // High Sobel edge barrier: flood fill cannot penetrate sharp garment contours
  const edgeBarrier = Math.max(24, Math.min(68, 48 - (tolerance - 35) * 0.25));

  const minDistToSamplesSq = (r: number, g: number, b: number): number => {
    let best = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const d = colorDistSq(r, g, b, s.r, s.g, s.b);
      if (d < best) best = d;
    }
    return best;
  };

  // Center prior: calculate center 40% bounding box dominant color
  let centerR = 0;
  let centerG = 0;
  let centerB = 0;
  let centerCount = 0;
  const cMinX = Math.floor(width * 0.3);
  const cMaxX = Math.floor(width * 0.7);
  const cMinY = Math.floor(height * 0.25);
  const cMaxY = Math.floor(height * 0.75);

  for (let cy = cMinY; cy <= cMaxY; cy += 2) {
    for (let cx = cMinX; cx <= cMaxX; cx += 2) {
      const pIdx = (cy * width + cx) * 4;
      if (input[pIdx + 3] > 64) {
        centerR += input[pIdx];
        centerG += input[pIdx + 1];
        centerB += input[pIdx + 2];
        centerCount++;
      }
    }
  }
  if (centerCount > 0) {
    centerR /= centerCount;
    centerG /= centerCount;
    centerB /= centerCount;
  }

  const visited = new Uint8Array(totalPixels);
  const bgCandidateMask = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const trySeed = (x: number, y: number) => {
    const pos = y * width + x;
    if (visited[pos]) return;
    const idx = pos * 4;
    if (input[idx + 3] < 24) {
      visited[pos] = 1;
      bgCandidateMask[pos] = 1;
      queue[tail++] = pos;
      return;
    }
    const r = input[idx];
    const g = input[idx + 1];
    const b = input[idx + 2];
    const dSq = minDistToSamplesSq(r, g, b);

    // If pixel is on the perimeter and matches background samples closely, seed it
    if (dSq <= bgDistThresholdSq) {
      visited[pos] = 1;
      bgCandidateMask[pos] = 1;
      queue[tail++] = pos;
    }
  };

  // Seed strictly from the image perimeter
  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  // Flood-fill traversal bounded by Sobel contour barrier
  while (head < tail) {
    const pos = queue[head++];
    const px = pos % width;
    const py = (pos - px) / width;
    const pIdx = pos * 4;
    const pr = input[pIdx];
    const pg = input[pIdx + 1];
    const pb = input[pIdx + 2];
    const pa = input[pIdx + 3];

    for (let dir = 0; dir < 4; dir++) {
      const nx = px + dx[dir];
      const ny = py + dy[dir];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nPos = ny * width + nx;
      if (visited[nPos]) continue;

      const nIdx = nPos * 4;
      const na = input[nIdx + 3];
      if (na < 24) {
        visited[nPos] = 1;
        bgCandidateMask[nPos] = 1;
        queue[tail++] = nPos;
        continue;
      }

      const nr = input[nIdx];
      const ng = input[nIdx + 1];
      const nb = input[nIdx + 2];

      const distToBg = minDistToSamplesSq(nr, ng, nb);
      const distToNeighbor = pa < 24 ? distToBg : colorDistSq(pr, pg, pb, nr, ng, nb);

      if (distToBg <= bgDistThresholdSq && distToNeighbor <= localStepThresholdSq) {
        // High edge gradient acts as barrier only when transitioning towards foreground boundary
        const nGrad = gradMap[nPos];
        if (nGrad >= edgeBarrier && distToBg > bgDistThresholdSq * 0.4) {
          continue;
        }

        visited[nPos] = 1;
        bgCandidateMask[nPos] = 1;
        queue[tail++] = nPos;
      }
    }
  }

  // Morphological Hole-Filling & Perimeter-Connection Verification:
  // Strictly enforce that background can only be connected to outer borders.
  // Any internal pixel that was somehow tagged as background but is surrounded
  // by foreground (e.g. white logo, pocket opening, interior fold) is restored!
  const finalBgMask = new Uint8Array(totalPixels);
  const outerQueue = new Int32Array(totalPixels);
  let outerHead = 0;
  let outerTail = 0;

  const trySeedOuter = (x: number, y: number) => {
    const pos = y * width + x;
    if (bgCandidateMask[pos] && !finalBgMask[pos]) {
      finalBgMask[pos] = 1;
      outerQueue[outerTail++] = pos;
    }
  };

  for (let x = 0; x < width; x++) {
    trySeedOuter(x, 0);
    trySeedOuter(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeedOuter(0, y);
    trySeedOuter(width - 1, y);
  }

  while (outerHead < outerTail) {
    const pos = outerQueue[outerHead++];
    const px = pos % width;
    const py = (pos - px) / width;

    for (let dir = 0; dir < 4; dir++) {
      const nx = px + dx[dir];
      const ny = py + dy[dir];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nPos = ny * width + nx;
      if (bgCandidateMask[nPos] && !finalBgMask[nPos]) {
        finalBgMask[nPos] = 1;
        outerQueue[outerTail++] = nPos;
      }
    }
  }

  const removedCount = outerTail;
  const removedRatio = removedCount / totalPixels;

  // Guard against over-segmentation (erasing nearly the entire garment)
  if (removedRatio >= 0.88 || removedCount === 0) {
    return {
      rgba: out,
      width,
      height,
      removedRatio: 0,
      bbox: { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 },
      applied: false,
    };
  }

  // Apply transparency to verified outer background
  for (let i = 0; i < totalPixels; i++) {
    if (finalBgMask[i]) {
      out[i * 4 + 3] = 0;
    }
  }

  // Smooth edge anti-aliasing / feathering (1-2px boundary)
  if (options?.feather !== false) {
    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      for (let x = 1; x < width - 1; x++) {
        const pos = rowOffset + x;
        if (finalBgMask[pos]) continue;
        const idx = pos * 4;
        if (out[idx + 3] === 0) continue;

        let bgNeighbors = 0;
        if (finalBgMask[pos - 1]) bgNeighbors++;
        if (finalBgMask[pos + 1]) bgNeighbors++;
        if (finalBgMask[pos - width]) bgNeighbors++;
        if (finalBgMask[pos + width]) bgNeighbors++;

        if (bgNeighbors > 0) {
          const dist = Math.sqrt(minDistToSamplesSq(out[idx], out[idx + 1], out[idx + 2]));
          const norm = Math.min(1, Math.max(0.3, dist / Math.max(20, tolerance * 1.2)));
          const alphaFactor = bgNeighbors >= 3 ? norm * 0.6 : bgNeighbors === 2 ? norm * 0.8 : norm;
          out[idx + 3] = Math.round(out[idx + 3] * Math.min(1, alphaFactor));
        }
      }
    }
  }

  // Calculate tight bounding box
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const alpha = out[(rowOffset + x) * 4 + 3];
      if (alpha > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      rgba: input.slice(),
      width,
      height,
      removedRatio: 0,
      bbox: { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 },
      applied: false,
    };
  }

  return {
    rgba: out,
    width,
    height,
    removedRatio,
    bbox: { minX, minY, maxX, maxY },
    applied: true,
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load image for background removal.'));
    img.src = src;
  });
}

export function resolveCorsSafeImageSrc(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

/**
 * Remove image background with automatic edge protection and tight cropping.
 * First calls the server AI background removal endpoint (/api/remove-background)
 * with automatic fallback to client-side Sobel edge barrier segmentation.
 */
export async function removeImageBackground(
  src: string,
  options?: { tolerance?: number }
): Promise<{ dataUrl: string; width: number; height: number; cutoutApplied: boolean }> {
  const safeSrc = resolveCorsSafeImageSrc(src);
  if (!safeSrc) {
    throw new Error('Image not available.');
  }

  // 1. Try server-side AI segmentation endpoint first for studio-grade results
  try {
    const payload = safeSrc.startsWith('data:')
      ? { imageDataUrl: safeSrc }
      : { imageUrl: safeSrc };

    const apiRes = await fetch('/api/remove-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (apiRes.ok) {
      const data = (await apiRes.json()) as {
        ok?: boolean;
        dataUrl?: string;
        width?: number;
        height?: number;
        cutoutApplied?: boolean;
      };
      if (data.ok && typeof data.dataUrl === 'string' && data.dataUrl.startsWith('data:image/')) {
        return {
          dataUrl: data.dataUrl,
          width: data.width ?? 500,
          height: data.height ?? 500,
          cutoutApplied: data.cutoutApplied ?? true,
        };
      }
    }
  } catch {
    // Network or server error - gracefully fall back to local canvas algorithm
  }

  // 2. Client-side canvas Sobel edge-gradient fallback
  const img = await loadImageElement(safeSrc);
  const origW = img.naturalWidth || img.width || 400;
  const origH = img.naturalHeight || img.height || 400;

  const MAX_DIM = 640;
  let w = origW;
  let h = origH;
  if (w > MAX_DIM || h > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
    w = Math.max(1, Math.round(w * ratio));
    h = Math.max(1, Math.round(h * ratio));
  }

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const workCtx = workCanvas.getContext('2d');
  if (!workCtx) {
    return { dataUrl: safeSrc, width: w, height: h, cutoutApplied: false };
  }

  workCtx.drawImage(img, 0, 0, w, h);
  const imgData = workCtx.getImageData(0, 0, w, h);
  const result = removeBackgroundFromRgba(imgData.data, w, h, {
    tolerance: options?.tolerance ?? 38,
    feather: true,
  });

  if (!result.applied) {
    return {
      dataUrl: workCanvas.toDataURL('image/png'),
      width: w,
      height: h,
      cutoutApplied: false,
    };
  }

  const nextImgData = new ImageData(new Uint8ClampedArray(result.rgba), w, h);
  workCtx.putImageData(nextImgData, 0, 0);

  const pad = 6;
  const cropX = Math.max(0, result.bbox.minX - pad);
  const cropY = Math.max(0, result.bbox.minY - pad);
  const cropW = Math.min(w - cropX, result.bbox.maxX - result.bbox.minX + 1 + pad * 2);
  const cropH = Math.min(h - cropY, result.bbox.maxY - result.bbox.minY + 1 + pad * 2);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = Math.max(1, cropW);
  outCanvas.height = Math.max(1, cropH);
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return {
      dataUrl: workCanvas.toDataURL('image/png'),
      width: w,
      height: h,
      cutoutApplied: true,
    };
  }

  outCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return {
    dataUrl: outCanvas.toDataURL('image/png'),
    width: cropW,
    height: cropH,
    cutoutApplied: true,
  };
}

/**
 * Generate a styled squircle editorial portrait badge with rounded corners and drop shadow.
 * Ideal for complex real-world environmental photos (stadium shots, street style) where
 * the user wants an editorial lookbook frame without harsh perimeter clipping.
 */
export async function generateStyledEditorialFrame(
  src: string,
  options?: { cornerRadius?: number }
): Promise<{ dataUrl: string; width: number; height: number }> {
  const safeSrc = resolveCorsSafeImageSrc(src);
  if (!safeSrc) {
    throw new Error('Image not available.');
  }

  const img = await loadImageElement(safeSrc);
  const origW = img.naturalWidth || img.width || 400;
  const origH = img.naturalHeight || img.height || 400;

  const MAX_DIM = 500;
  let w = origW;
  let h = origH;
  if (w > MAX_DIM || h > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
    w = Math.max(1, Math.round(w * ratio));
    h = Math.max(1, Math.round(h * ratio));
  }

  const pad = 12;
  const canvasW = w + pad * 2;
  const canvasH = h + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: safeSrc, width: origW, height: origH };
  }

  const radius = Math.min(28, options?.cornerRadius ?? 22);

  // Soft editorial shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.roundRect(pad, pad, w, h, radius);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  // Clipped portrait image
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pad, pad, w, h, radius);
  ctx.clip();
  ctx.drawImage(img, pad, pad, w, h);

  // Subtle inner border highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Subtle outer hairline frame
  ctx.beginPath();
  ctx.roundRect(pad, pad, w, h, radius);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvasW,
    height: canvasH,
  };
}

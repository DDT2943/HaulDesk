import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type * as OrtTypes from 'onnxruntime-node';
import sharp from 'sharp';
import { resolveDataDir } from './storage.ts';

/**
 * U-2-Net Lightweight Salient Object Segmentation (u2netp.onnx)
 * Architecture & weights: Xuebin Qin et al., U-2-Net (Apache License 2.0)
 * Runtime: onnxruntime-node (MIT License) + sharp (Apache License 2.0)
 *
 * This replaces the AGPL-3.0 background removal dependency so the entire
 * HaulDesk project remains cleanly compatible with the MIT License.
 */
export const U2NETP_MODEL_URL =
  'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx';
export const U2NETP_SHA256 =
  '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';

const MODEL_INPUT_SIZE = 320;
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

let ortModulePromise: Promise<typeof OrtTypes> | null = null;
let sessionPromise: Promise<OrtTypes.InferenceSession> | null = null;
let modelDownloadPromise: Promise<string> | null = null;

async function loadOrtModule(): Promise<typeof OrtTypes> {
  if (!ortModulePromise) {
    ortModulePromise = import('onnxruntime-node').catch((err) => {
      ortModulePromise = null;
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `ONNX Runtime native binary unavailable on ${process.platform}/${process.arch}: ${reason}`
      );
    });
  }
  return ortModulePromise;
}

function resolveModelFilePath(): string {
  const customPath = process.env.BG_REMOVAL_MODEL_PATH?.trim();
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.join(resolveDataDir(), 'models', 'u2netp.onnx');
}

async function verifyFileSha256(filePath: string, expectedSha256: string): Promise<boolean> {
  const buf = await fs.readFile(filePath);
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  return digest === expectedSha256;
}

async function ensureModelOnDisk(): Promise<string> {
  if (modelDownloadPromise) {
    return modelDownloadPromise;
  }

  modelDownloadPromise = (async () => {
    const customPath = process.env.BG_REMOVAL_MODEL_PATH?.trim();
    const modelPath = resolveModelFilePath();

    try {
      const stat = await fs.stat(modelPath);
      if (stat.isFile() && stat.size > 1_000_000) {
        const valid = await verifyFileSha256(modelPath, U2NETP_SHA256);
        if (valid) {
          return modelPath;
        }
        if (customPath) {
          throw new Error('Custom BG_REMOVAL_MODEL_PATH failed SHA-256 verification.');
        }
        await fs.rm(modelPath, { force: true }).catch(() => undefined);
      }
    } catch (err) {
      if (
        customPath &&
        err instanceof Error &&
        err.message.includes('SHA-256 verification')
      ) {
        throw err;
      }
      // Model not yet downloaded or corrupted default cache removed above
    }

    if (customPath) {
      throw new Error(`Custom BG_REMOVAL_MODEL_PATH not found or invalid: ${modelPath}`);
    }

    if (process.env.DISABLE_AI_BG_REMOVAL === 'true') {
      throw new Error('AI background removal disabled via DISABLE_AI_BG_REMOVAL');
    }

    await fs.mkdir(path.dirname(modelPath), { recursive: true });
    const tmpPath = `${modelPath}.${process.pid}.${Date.now()}.${crypto
      .randomBytes(4)
      .toString('hex')}.download`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(U2NETP_MODEL_URL, {
        signal: controller.signal,
        headers: { 'User-Agent': 'HaulDesk/1.0' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} downloading segmentation model`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
      if (actualHash !== U2NETP_SHA256) {
        throw new Error('Model SHA-256 verification failed');
      }
      await fs.writeFile(tmpPath, buf);
      await fs.rename(tmpPath, modelPath);
      return modelPath;
    } catch (err) {
      await fs.rm(tmpPath, { force: true }).catch(() => undefined);
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => {
    modelDownloadPromise = null;
  });

  return modelDownloadPromise;
}

async function getInferenceSession(): Promise<{
  ort: typeof OrtTypes;
  session: OrtTypes.InferenceSession;
}> {
  const ort = await loadOrtModule();
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const modelPath = await ensureModelOnDisk();
      if (!(await verifyFileSha256(modelPath, U2NETP_SHA256))) {
        if (!process.env.BG_REMOVAL_MODEL_PATH?.trim()) {
          await fs.rm(modelPath, { force: true }).catch(() => undefined);
        }
        throw new Error('Model checksum verification failed before inference.');
      }
      return ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
      });
    })().catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  const session = await sessionPromise;
  return { ort, session };
}

export function buildSaliencyAlphaMask(
  rawPred: ArrayLike<number>,
  pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE
): Buffer {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < rawPred.length; i++) {
    if (rawPred[i] < min) min = rawPred[i];
    if (rawPred[i] > max) max = rawPred[i];
  }
  const span = max - min || 1;

  const maskSmall = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const norm = (rawPred[i] - min) / span;
    let alpha: number;
    if (norm <= 0.18) {
      alpha = 0;
    } else if (norm >= 0.72) {
      alpha = 255;
    } else {
      const t = (norm - 0.18) / (0.72 - 0.18);
      alpha = Math.round(t * t * (3 - 2 * t) * 255);
    }
    maskSmall[i] = alpha;
  }
  return maskSmall;
}

export async function applyUpscaledMaskToPng(
  normalizedPng: Buffer,
  origWidth: number,
  origHeight: number,
  maskSmall: Buffer,
  maskSize = MODEL_INPUT_SIZE
): Promise<Buffer> {
  const { data: alphaFull, info: alphaInfo } = await sharp(maskSmall, {
    raw: { width: maskSize, height: maskSize, channels: 1 },
  })
    .toColorspace('b-w')
    .resize(origWidth, origHeight, { kernel: 'cubic' })
    .toColorspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: origRgba, info: origInfo } = await sharp(normalizedPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = origWidth * origHeight;
  const alphaStride = Math.max(1, alphaInfo.channels);
  const rgbaStride = Math.max(4, origInfo.channels);
  for (let i = 0; i < pixelCount; i++) {
    const existingAlpha = origRgba[i * rgbaStride + 3];
    const predAlpha = alphaFull[i * alphaStride];
    origRgba[i * rgbaStride + 3] = Math.min(existingAlpha, predAlpha);
  }

  return sharp(origRgba, {
    raw: { width: origWidth, height: origHeight, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function removeBackgroundWithOnnx(sourceBuffer: Buffer): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  if (process.env.DISABLE_AI_BG_REMOVAL === 'true') {
    throw new Error('AI background removal disabled via environment');
  }

  // Normalize orientation & cap max dimensions to keep memory/latency crisp
  const normalizedPng = await sharp(sourceBuffer)
    .rotate()
    .resize({
      width: 760,
      height: 760,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .png()
    .toBuffer();

  const normalizedMeta = await sharp(normalizedPng).metadata();
  const origWidth = normalizedMeta.width ?? 500;
  const origHeight = normalizedMeta.height ?? 500;

  // Prepare 320x320 RGB tensor normalized with ImageNet stats
  const { data: rgbSmall } = await sharp(normalizedPng)
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const planeSize = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const tensorData = new Float32Array(3 * planeSize);
  for (let i = 0; i < planeSize; i++) {
    const r = rgbSmall[i * 3] / 255;
    const g = rgbSmall[i * 3 + 1] / 255;
    const b = rgbSmall[i * 3 + 2] / 255;
    tensorData[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    tensorData[planeSize + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    tensorData[2 * planeSize + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }

  const { ort, session } = await getInferenceSession();
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const inputTensor = new ort.Tensor('float32', tensorData, [
    1,
    3,
    MODEL_INPUT_SIZE,
    MODEL_INPUT_SIZE,
  ]);
  const results = await session.run({ [inputName]: inputTensor });
  const rawPred = results[outputName].data as Float32Array;

  const maskSmall = buildSaliencyAlphaMask(rawPred, planeSize);
  let finalBuffer = await applyUpscaledMaskToPng(
    normalizedPng,
    origWidth,
    origHeight,
    maskSmall,
    MODEL_INPUT_SIZE
  );

  try {
    const trimmed = await sharp(finalBuffer).trim({ threshold: 12 }).png().toBuffer();
    if (trimmed.byteLength > 200) {
      finalBuffer = trimmed;
    }
  } catch {
    // Keep untrimmed buffer if trim encounters uniform edges
  }

  const finalMeta = await sharp(finalBuffer).metadata();
  return {
    dataUrl: `data:image/png;base64,${finalBuffer.toString('base64')}`,
    width: finalMeta.width ?? origWidth,
    height: finalMeta.height ?? origHeight,
  };
}

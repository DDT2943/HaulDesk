import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  addProductItem,
  addSavedItem,
  bulkOrderItemsAction,
  bulkSavedItemsAction,
  createOrder,
  deleteOrder,
  deleteProductItem,
  deleteSavedItem,
  getDbState,
  moveSavedItemToOrder,
  restoreDbState,
  saveExistingItemForLater,
  syncOrderLiveTracking,
  updateGlobalExchangeRate,
  updateOrderExchangeRate,
  updateOrderStatus,
  updateOrderTracking,
  updateProductItem,
  updateSavedItem,
  type ProductItemUpdatePatch,
  restoreTrashOrder,
  restoreTrashItem,
  permanentDeleteTrashOrder,
  permanentDeleteTrashItem,
  emptyTrash,
} from './server/storage.ts';

import { removeBackgroundWithOnnx } from './server/backgroundRemoval.ts';
import {
  applySecurityHeaders,
  fetchSafeRemoteBuffer,
  resolveCorsOrigin,
  sanitizeSafeAssetPath,
  validateTrackingNumberInput,
} from './server/security.ts';
import { fetchLiveCarrierTracking } from './server/tracking.ts';
import {
  createHaulBackup,
  DEFAULT_CNY_TO_EUR_RATE,
  detectPlatformFromUrl,
  isValidHttpUrl,
  normalizeUrl,
  TRACKING_MILESTONES,
  validateHaulBackup,
  validateOrderTitle,
  validateProductDraft,
} from './src/utils/haulLogic.ts';
import {
  PRODUCT_CATEGORIES,
  type HaulOrder,
  type ProductCategory,
  type ProductItem,
  type TrackingMilestone,
} from './src/types/haul.ts';

function getCliArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return null;
}

const cliPort = getCliArg('--port');
const cliHost = getCliArg('--host');
const rawPortStr = cliPort ?? process.env.PORT;
const parsedPort = rawPortStr !== undefined && rawPortStr !== '' ? Number(rawPortStr) : 3000;
const PORT = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 3000;
const HOST = cliHost || process.env.HOST || '0.0.0.0';

const VALID_TRACKING_STATUSES = new Set(TRACKING_MILESTONES.map((m) => m.id));
const VALID_CATEGORY_SET = new Set<string>(PRODUCT_CATEGORIES.map((c) => c.id));

function buildItemUpdatePatch(body: Record<string, unknown>): {
  patch?: ProductItemUpdatePatch;
  error?: string;
} {
  const patch: ProductItemUpdatePatch = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return { error: 'Enter a valid product name.' };
    }
    patch.title = body.title.trim();
  }

  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !VALID_CATEGORY_SET.has(body.category)) {
      return { error: 'Select a valid category.' };
    }
    patch.category = body.category as ProductCategory;
  }

  if (body.priceCny !== undefined) {
    const parsed =
      typeof body.priceCny === 'number'
        ? body.priceCny
        : Number(String(body.priceCny).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: 'Enter a valid price greater than 0 in ¥ CNY.' };
    }
    patch.priceCny = Math.round(parsed * 100) / 100;
  }

  if (body.vendor !== undefined) {
    if (typeof body.vendor !== 'string' || !body.vendor.trim()) {
      return { error: 'Enter the vendor or store name.' };
    }
    patch.vendor = body.vendor.trim();
  }

  if (typeof body.sizeNote === 'string') {
    patch.sizeNote = body.sizeNote.trim();
  }

  if (typeof body.detectedDetails === 'string') {
    patch.detectedDetails = body.detectedDetails.trim();
  }

  if (typeof body.imageUrl === 'string') {
    patch.imageUrl = body.imageUrl.trim();
  }

  if (Array.isArray(body.imageUrls)) {
    const cleaned = body.imageUrls.filter(
      (u): u is string => typeof u === 'string' && u.trim().length > 0
    );
    patch.imageUrls = cleaned;
    if (!patch.imageUrl && cleaned.length > 0) {
      patch.imageUrl = cleaned[0];
    } else if (cleaned.length === 0) {
      patch.imageUrl = '';
    }
  }

  if (typeof body.needsCategoryConfirmation === 'boolean') {
    patch.needsCategoryConfirmation = body.needsCategoryConfirmation;
  }

  if (typeof body.link === 'string') {
    const trimmedLink = body.link.trim();
    if (!trimmedLink) {
      patch.link = '';
      patch.platform = 'altro';
    } else {
      if (!isValidHttpUrl(trimmedLink)) {
        return { error: 'Enter a valid Yupoo, Taobao, or Superbuy link.' };
      }
      const normalized = normalizeUrl(trimmedLink);
      patch.link = normalized;
      patch.platform = detectPlatformFromUrl(normalized);
    }
  }

  if (body.rating !== undefined) {
    if (body.rating === null || body.rating === '') {
      patch.rating = null;
    } else {
      const parsedRating =
        typeof body.rating === 'number' ? body.rating : Number(String(body.rating));
      if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return { error: 'Rating must be between 1 and 5 stars.' };
      }
      patch.rating = parsedRating;
    }
  }

  return { patch };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50mb' }));

  app.use('/api', (req, res, next) => {
    applySecurityHeaders(res);
    const cors = resolveCorsOrigin({
      origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      host: typeof req.headers.host === 'string' ? req.headers.host : undefined,
      appUrl: process.env.APP_URL,
      allowedOrigins: process.env.ALLOWED_ORIGINS,
    });

    if (cors.allowOriginHeader) {
      res.setHeader('Access-Control-Allow-Origin', cors.allowOriginHeader);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      if (!cors.allowed) {
        res.status(403).end();
        return;
      }
      res.status(204).end();
      return;
    }

    if (!cors.allowed && req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(403).json({ error: 'Cross-site origin not allowed.' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Accept-Encoding, Origin');

    const origJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const accept = String(req.headers['accept-encoding'] ?? '');
      if (!accept.includes('gzip')) {
        return origJson(body);
      }
      const jsonStr = JSON.stringify(body);
      if (jsonStr.length < 1024) {
        return origJson(body);
      }
      zlib.gzip(Buffer.from(jsonStr, 'utf-8'), { level: 6 }, (err, compressed) => {
        if (res.headersSent) return;
        if (err) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.send(jsonStr);
          return;
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.send(compressed);
      });
      return res;
    }) as typeof res.json;

    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/proxy-image', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Missing url parameter.' });
      return;
    }

    const fetchRes = await fetchSafeRemoteBuffer(rawUrl, {
      timeoutMs: 10000,
      maxBytes: 12 * 1024 * 1024,
      maxRedirects: 4,
      requireImageMime: true,
    });

    if ('error' in fetchRes) {
      res.status(fetchRes.status).json({ error: fetchRes.error });
      return;
    }

    res.setHeader('Content-Type', fetchRes.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(fetchRes.buffer);
  });

  const bgRemovalCache = new Map<
    string,
    { dataUrl: string; width: number; height: number }
  >();
  let bgRemovalQueue: Promise<unknown> = Promise.resolve();

  function enqueueBgRemoval<T>(task: () => Promise<T>): Promise<T> {
    const next = bgRemovalQueue.then(task, task);
    bgRemovalQueue = next.catch(() => undefined);
    return next;
  }

  app.post('/api/remove-background', async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        imageUrl?: unknown;
        imageDataUrl?: unknown;
      };
      const rawDataUrl =
        typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
      const rawUrl =
        typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';

      if (!rawDataUrl && !rawUrl) {
        res.status(400).json({ error: 'Missing image.' });
        return;
      }

      let sourceBuffer: Buffer | null = null;
      let cacheSeed = '';

      if (rawDataUrl) {
        const match = rawDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
        if (!match) {
          res.status(400).json({ error: 'Invalid image Data URL format.' });
          return;
        }
        sourceBuffer = Buffer.from(match[2], 'base64');
        if (sourceBuffer.byteLength === 0 || sourceBuffer.byteLength > 15 * 1024 * 1024) {
          res.status(400).json({ error: 'Image too large (max 15 MB).' });
          return;
        }
        cacheSeed = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
      } else {
        let targetUrl = rawUrl;
        if (targetUrl.startsWith('/api/proxy-image')) {
          try {
            const proxyParsed = new URL(targetUrl, 'http://localhost');
            const extracted = proxyParsed.searchParams.get('url');
            if (extracted) targetUrl = extracted;
          } catch {
            // ignore
          }
        }

        cacheSeed = crypto.createHash('sha256').update(targetUrl).digest('hex');
        const cachedEarly = bgRemovalCache.get(cacheSeed);
        if (cachedEarly) {
          res.json({
            ok: true,
            dataUrl: cachedEarly.dataUrl,
            width: cachedEarly.width,
            height: cachedEarly.height,
            cutoutApplied: true,
            engine: 'ai',
          });
          return;
        }

        if (targetUrl.startsWith('/')) {
          const publicRoot = path.resolve(process.cwd(), 'public');
          const relPath = targetUrl.replace(/^\/+/, '');
          const resolvedFile = sanitizeSafeAssetPath(relPath, publicRoot);
          if (!resolvedFile) {
            res.status(400).json({ error: 'Local image path not allowed.' });
            return;
          }
          try {
            const stat = await fs.stat(resolvedFile);
            if (!stat.isFile()) {
              res.status(400).json({ error: 'Invalid resource.' });
              return;
            }
            sourceBuffer = await fs.readFile(resolvedFile);
          } catch {
            res.status(404).json({ error: 'Local image not found.' });
            return;
          }
        } else {
          const fetchRes = await fetchSafeRemoteBuffer(targetUrl, {
            timeoutMs: 12000,
            maxBytes: 12 * 1024 * 1024,
            maxRedirects: 4,
            requireImageMime: true,
          });
          if ('error' in fetchRes) {
            res.status(fetchRes.status).json({ error: fetchRes.error });
            return;
          }
          sourceBuffer = fetchRes.buffer;
        }
      }

      const cached = bgRemovalCache.get(cacheSeed);
      if (cached) {
        res.json({
          ok: true,
          dataUrl: cached.dataUrl,
          width: cached.width,
          height: cached.height,
          cutoutApplied: true,
          engine: 'ai',
        });
        return;
      }

      const processed = await enqueueBgRemoval(() =>
        removeBackgroundWithOnnx(sourceBuffer!)
      );

      if (bgRemovalCache.size >= 60) {
        const oldestKey = bgRemovalCache.keys().next().value;
        if (oldestKey) bgRemovalCache.delete(oldestKey);
      }
      bgRemovalCache.set(cacheSeed, processed);

      res.json({
        ok: true,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        cutoutApplied: true,
        engine: 'ai',
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'AI background removal error',
      });
    }
  });

  app.get('/api/state', async (_req, res) => {
    try {
      const state = await getDbState();
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read database state' });
    }
  });

  app.get('/api/backup/export', async (_req, res) => {
    try {
      const state = await getDbState();
      const backup = createHaulBackup(
        state.orders,
        state.items,
        state.savedItems ?? [],
        state.estimatedExchangeRate
      );
      res.json(backup);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to export backup',
      });
    }
  });

  app.post('/api/backup/import', async (req, res) => {
    try {
      const validation = validateHaulBackup(req.body);
      if (!validation.valid || !validation.state) {
        res.status(400).json({ error: validation.error || 'Invalid backup data.' });
        return;
      }
      const restored = await restoreDbState(validation.state);
      res.json({ ok: true, state: restored, stats: validation.stats });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to restore backup',
      });
    }
  });

  app.post('/api/orders', async (req, res) => {
    try {
      const { title, agentNote, exchangeRate } = req.body as {
        title?: string;
        agentNote?: string;
        exchangeRate?: number;
      };
      const titleErr = validateOrderTitle(title ?? '');
      if (titleErr) {
        res.status(400).json({ error: titleErr });
        return;
      }

      const currentState = await getDbState();
      const defaultRate =
        typeof currentState.estimatedExchangeRate === 'number' && currentState.estimatedExchangeRate > 0
          ? currentState.estimatedExchangeRate
          : DEFAULT_CNY_TO_EUR_RATE;
      const rate =
        typeof exchangeRate === 'number' && Number.isFinite(exchangeRate) && exchangeRate > 0
          ? exchangeRate
          : defaultRate;

      const newOrder: HaulOrder = {
        id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: (title ?? '').trim(),
        status: 'open',
        createdAt: new Date().toISOString(),
        concludedAt: null,
        agentNote: (agentNote ?? '').trim(),
        exchangeRate: rate,
      };

      const state = await createOrder(newOrder);
      res.status(201).json({ order: newOrder, state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create order' });
    }
  });

  app.patch('/api/orders/:id/conclude', async (req, res) => {
    try {
      const { state, updated } = await updateOrderStatus(req.params.id, 'concluded');
      if (!updated) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      res.json({ order: updated, state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to conclude order' });
    }
  });

  app.patch('/api/orders/:id/reopen', async (req, res) => {
    try {
      const { state, updated } = await updateOrderStatus(req.params.id, 'open');
      if (!updated) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      res.json({ order: updated, state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to reopen order' });
    }
  });

  app.patch('/api/orders/:id/rate', async (req, res) => {
    try {
      const rawRate = (req.body as { exchangeRate?: unknown })?.exchangeRate;
      const parsed =
        typeof rawRate === 'number'
          ? rawRate
          : Number(String(rawRate ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 50) {
        res.status(400).json({ error: 'Enter a valid conversion rate (e.g. 0.13).' });
        return;
      }
      const { state, updated, error } = await updateOrderExchangeRate(req.params.id, parsed);
      if (error || !updated) {
        res.status(updated === null && error === 'Order not found.' ? 404 : 400).json({
          error: error || 'Unable to update conversion rate.',
        });
        return;
      }
      res.json({ order: updated, state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update conversion rate',
      });
    }
  });

  app.patch('/api/exchange-rate', async (req, res) => {
    try {
      const rawRate = (req.body as { exchangeRate?: unknown })?.exchangeRate;
      const parsed =
        typeof rawRate === 'number'
          ? rawRate
          : Number(String(rawRate ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 50) {
        res.status(400).json({ error: 'Enter a valid conversion rate (e.g. 0.13).' });
        return;
      }
      const result = await updateGlobalExchangeRate(parsed);
      res.json({ ok: true, exchangeRate: result.exchangeRate, state: result.state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update global exchange rate',
      });
    }
  });

  app.patch('/api/orders/:id/tracking', async (req, res) => {
    try {
      const {
        trackingNumber,
        shippingLine,
        trackingStatus,
        eventNote,
        eventLocation,
      } = req.body as {
        trackingNumber?: string;
        shippingLine?: string;
        trackingStatus?: TrackingMilestone;
        eventNote?: string;
        eventLocation?: string;
      };

      if (trackingStatus && !VALID_TRACKING_STATUSES.has(trackingStatus)) {
        res.status(400).json({ error: 'Invalid shipping status.' });
        return;
      }

      const { state, updated } = await updateOrderTracking(req.params.id, {
        trackingNumber,
        shippingLine,
        trackingStatus,
        eventNote,
        eventLocation,
      });

      if (!updated) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      res.json({ order: updated, state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update shipment tracking',
      });
    }
  });

  app.post('/api/orders/:id/tracking/sync', async (req, res) => {
    try {
      const db = await getDbState();
      const target = db.orders.find((o) => o.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }

      const reqCode =
        typeof (req.body as { trackingNumber?: string })?.trackingNumber === 'string'
          ? (req.body as { trackingNumber?: string }).trackingNumber?.trim()
          : '';
      const codeToCheck = reqCode || target.trackingNumber || '';
      if (!codeToCheck) {
        res.status(400).json({ error: 'No tracking number entered for this order.' });
        return;
      }
      const trackingCheck = validateTrackingNumberInput(codeToCheck);
      if (!trackingCheck.valid) {
        res.status(400).json({ error: trackingCheck.error || 'Invalid tracking number.' });
        return;
      }

      const liveResult = await fetchLiveCarrierTracking(trackingCheck.trackingNumber);
      const { state, updated } = await syncOrderLiveTracking(req.params.id, liveResult);

      res.json({
        order: updated,
        state,
        sync: liveResult,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to sync live tracking',
      });
    }
  });

  app.delete('/api/orders/:id', async (req, res) => {
    try {
      const state = await deleteOrder(req.params.id);
      res.json({ state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete order' });
    }
  });

  app.post('/api/items', async (req, res) => {
    try {
      const body = req.body as {
        orderId: string;
        title: string;
        category: ProductCategory | '';
        priceCny: string | number;
        link: string;
        vendor: string;
        sizeNote?: string;
        imageUrl?: string;
        imageUrls?: string[];
        categoryConfidence?: 'alta' | 'media' | 'bassa' | 'manuale';
        needsCategoryConfirmation?: boolean;
        detectedDetails?: string;
      };

      const validation = validateProductDraft(body);
      if (!validation.valid) {
        res.status(400).json({ error: 'Invalid item details', errors: validation.errors });
        return;
      }

      const normalizedLink = normalizeUrl(body.link);
      const parsedPrice =
        typeof body.priceCny === 'number'
          ? body.priceCny
          : Number(String(body.priceCny).replace(',', '.'));

      const sanitizedImageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : [];
      const primaryImage = body.imageUrl?.trim() || sanitizedImageUrls[0] || '';
      const mergedImages = primaryImage
        ? Array.from(new Set([primaryImage, ...sanitizedImageUrls]))
        : sanitizedImageUrls;

      const newItem: ProductItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        orderId: body.orderId,
        title: body.title.trim(),
        category: body.category as ProductCategory,
        categoryConfidence: body.categoryConfidence ?? 'manuale',
        needsCategoryConfirmation: Boolean(body.needsCategoryConfirmation),
        priceCny: Math.round(parsedPrice * 100) / 100,
        link: normalizedLink,
        platform: detectPlatformFromUrl(normalizedLink),
        vendor: body.vendor.trim(),
        sizeNote: (body.sizeNote ?? '').trim(),
        imageUrl: primaryImage,
        imageUrls: mergedImages.length > 0 ? mergedImages : undefined,
        detectedDetails: body.detectedDetails ?? '',
        createdAt: new Date().toISOString(),
      };

      const result = await addProductItem(newItem);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json({ item: newItem, state: result.state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add item' });
    }
  });

  app.patch('/api/items/:id', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const built = buildItemUpdatePatch(body);
      if (built.error || !built.patch) {
        res.status(400).json({ error: built.error || 'Invalid update data.' });
        return;
      }

      const result = await updateProductItem(req.params.id, built.patch);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ item: result.updated, state: result.state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update item' });
    }
  });

  app.delete('/api/items/:id', async (req, res) => {
    try {
      const result = await deleteProductItem(req.params.id);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ state: result.state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete item' });
    }
  });

  app.post('/api/saved-items', async (req, res) => {
    try {
      const body = req.body as {
        title: string;
        category: ProductCategory | '';
        priceCny: string | number;
        link?: string;
        vendor: string;
        sizeNote?: string;
        imageUrl?: string;
        imageUrls?: string[];
        categoryConfidence?: 'alta' | 'media' | 'bassa' | 'manuale';
        needsCategoryConfirmation?: boolean;
        detectedDetails?: string;
      };

      const draft = {
        ...body,
        orderId: 'saved',
        link: body.link ?? '',
      };

      const validation = validateProductDraft(draft);
      if (!validation.valid) {
        res.status(400).json({ error: 'Invalid item details', errors: validation.errors });
        return;
      }

      const normalizedLink = normalizeUrl(draft.link);
      const parsedPrice =
        typeof draft.priceCny === 'number'
          ? draft.priceCny
          : Number(String(draft.priceCny).replace(',', '.'));

      const sanitizedImageUrls = Array.isArray(draft.imageUrls)
        ? draft.imageUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : [];
      const primaryImage = draft.imageUrl?.trim() || sanitizedImageUrls[0] || '';
      const mergedImages = primaryImage
        ? Array.from(new Set([primaryImage, ...sanitizedImageUrls]))
        : sanitizedImageUrls;

      const now = new Date().toISOString();
      const savedItem: ProductItem = {
        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        orderId: 'saved',
        title: draft.title.trim(),
        category: draft.category as ProductCategory,
        categoryConfidence: draft.categoryConfidence ?? 'manuale',
        needsCategoryConfirmation: Boolean(draft.needsCategoryConfirmation),
        priceCny: Math.round(parsedPrice * 100) / 100,
        link: normalizedLink,
        platform: detectPlatformFromUrl(normalizedLink),
        vendor: draft.vendor.trim(),
        sizeNote: (draft.sizeNote ?? '').trim(),
        imageUrl: primaryImage,
        imageUrls: mergedImages.length > 0 ? mergedImages : undefined,
        detectedDetails: draft.detectedDetails ?? '',
        createdAt: now,
        savedAt: now,
      };

      const state = await addSavedItem(savedItem);
      res.status(201).json({ item: savedItem, state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save item for later',
      });
    }
  });

  app.post('/api/items/:id/save-for-later', async (req, res) => {
    try {
      const result = await saveExistingItemForLater(req.params.id);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ item: result.savedItem, state: result.state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to move item to Save for Later',
      });
    }
  });

  app.post('/api/saved-items/:id/move-to-order', async (req, res) => {
    try {
      const { orderId } = req.body as { orderId?: string };
      if (!orderId || typeof orderId !== 'string') {
        res.status(400).json({ error: 'Select a valid active destination order.' });
        return;
      }
      const result = await moveSavedItemToOrder(req.params.id, orderId);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ item: result.movedItem, state: result.state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to move item into order',
      });
    }
  });

  app.patch('/api/saved-items/:id', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const built = buildItemUpdatePatch(body);
      if (built.error || !built.patch) {
        res.status(400).json({ error: built.error || 'Invalid update data.' });
        return;
      }
      const { rating: _ignoredRating, ...savedPatch } = built.patch;
      const result = await updateSavedItem(req.params.id, savedPatch);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ item: result.updated, state: result.state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update saved item',
      });
    }
  });

  app.delete('/api/saved-items/:id', async (req, res) => {
    try {
      const result = await deleteSavedItem(req.params.id);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ state: result.state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to delete saved item',
      });
    }
  });

  const VALID_CATEGORY_IDS = new Set<string>(PRODUCT_CATEGORIES.map((c) => c.id));

  app.post('/api/items/bulk', async (req, res) => {
    try {
      const { action, itemIds, category, targetOrderId } = req.body as {
        action?: 'update_category' | 'move_to_order' | 'save_for_later' | 'delete';
        itemIds?: unknown;
        category?: string;
        targetOrderId?: string;
      };
      if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every((id) => typeof id === 'string')) {
        res.status(400).json({ error: 'Select at least one item.' });
        return;
      }
      if (
        action !== 'update_category' &&
        action !== 'move_to_order' &&
        action !== 'save_for_later' &&
        action !== 'delete'
      ) {
        res.status(400).json({ error: 'Invalid bulk action.' });
        return;
      }
      if (action === 'update_category' && (!category || !VALID_CATEGORY_IDS.has(category))) {
        res.status(400).json({ error: 'Invalid category.' });
        return;
      }
      const result = await bulkOrderItemsAction({
        action,
        itemIds,
        category: category as ProductCategory | undefined,
        targetOrderId,
      });
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ state: result.state, affectedCount: result.affectedCount });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to perform bulk action',
      });
    }
  });

  app.post('/api/saved-items/bulk', async (req, res) => {
    try {
      const { action, itemIds, category, targetOrderId } = req.body as {
        action?: 'update_category' | 'move_to_order' | 'delete';
        itemIds?: unknown;
        category?: string;
        targetOrderId?: string;
      };
      if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every((id) => typeof id === 'string')) {
        res.status(400).json({ error: 'Select at least one saved item.' });
        return;
      }
      if (action !== 'update_category' && action !== 'move_to_order' && action !== 'delete') {
        res.status(400).json({ error: 'Invalid bulk action.' });
        return;
      }
      if (action === 'update_category' && (!category || !VALID_CATEGORY_IDS.has(category))) {
        res.status(400).json({ error: 'Invalid category.' });
        return;
      }
      const result = await bulkSavedItemsAction({
        action,
        itemIds,
        category: category as ProductCategory | undefined,
        targetOrderId,
      });
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ state: result.state, affectedCount: result.affectedCount });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to perform bulk action',
      });
    }
  });

  app.post('/api/trash/orders/:id/restore', async (req, res) => {
    try {
      const state = await restoreTrashOrder(req.params.id);
      res.json({ state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to restore order from trash' });
    }
  });

  app.post('/api/trash/items/:id/restore', async (req, res) => {
    try {
      const state = await restoreTrashItem(req.params.id);
      res.json({ state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to restore item from trash' });
    }
  });

  app.delete('/api/trash/orders/:id', async (req, res) => {
    try {
      const state = await permanentDeleteTrashOrder(req.params.id);
      res.json({ state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to permanently delete order' });
    }
  });

  app.delete('/api/trash/items/:id', async (req, res) => {
    try {
      const state = await permanentDeleteTrashItem(req.params.id);
      res.json({ state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to permanently delete item' });
    }
  });

  app.post('/api/trash/empty', async (_req, res) => {
    try {
      const state = await emptyTrash();
      res.json({ state });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to empty trash' });
    }
  });



  app.get('/hauldesk-quickadd.xpi', async (_req, res) => {
    const candidates = [
      path.resolve(process.cwd(), 'dist-extension', 'hauldesk-quickadd.xpi'),
      path.resolve(process.cwd(), 'dist', 'hauldesk-quickadd.xpi'),
      path.resolve(import.meta.dirname, 'hauldesk-quickadd.xpi'),
      path.resolve(import.meta.dirname, '..', 'dist-extension', 'hauldesk-quickadd.xpi'),
      path.resolve(import.meta.dirname, '..', 'dist', 'hauldesk-quickadd.xpi'),
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        res.setHeader('Content-Type', 'application/x-xpinstall');
        res.setHeader('Content-Disposition', 'attachment; filename="hauldesk-quickadd.xpi"');
        res.sendFile(candidate);
        return;
      } catch {
        // Try next candidate
      }
    }
    res.status(404).json({ error: 'XPI package not found. Run npm run pack:extension.' });
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distCandidates = [
      path.resolve(process.cwd(), 'dist'),
      path.resolve(import.meta.dirname),
      path.resolve(import.meta.dirname, '..', 'dist'),
    ];
    let distDir = distCandidates[0];
    for (const candidate of distCandidates) {
      try {
        await fs.access(path.join(candidate, 'index.html'));
        distDir = candidate;
        break;
      } catch {
        // Continue searching
      }
    }
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        etag: true,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, HOST, () => {
    const addr = httpServer.address() as AddressInfo | null;
    const actualPort = addr?.port ?? PORT;
    console.log(`  ➜  Local:   http://localhost:${actualPort}/`);
    console.log(`  ➜  Network: http://${HOST}:${actualPort}/`);
    console.log(`HAULDESK_READY_PORT=${actualPort}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

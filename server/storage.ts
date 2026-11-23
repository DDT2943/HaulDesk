import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  HaulDatabaseState,
  HaulOrder,
  ProductCategory,
  ProductItem,
  TrackingEvent,
  TrackingMilestone,
} from '../src/types/haul.ts';
import { TRACKING_MILESTONES } from '../src/utils/haulLogic.ts';

export function resolveDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), 'data');
}

export function getDbFilePath(): string {
  return path.join(resolveDataDir(), 'hauldesk-db.json');
}

const INITIAL_STATE: HaulDatabaseState = {
  orders: [],
  items: [],
  savedItems: [],
  trashOrders: [],
  trashItems: [],
  estimatedExchangeRate: 0.13,
};

let cachedState: HaulDatabaseState | null = null;
let initPromise: Promise<HaulDatabaseState> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function loadInitialStateFromDisk(): Promise<HaulDatabaseState> {
  const dataDir = resolveDataDir();
  const dbFile = getDbFilePath();
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(dbFile, 'utf-8');
    const parsed = JSON.parse(raw) as HaulDatabaseState;
    if (Array.isArray(parsed.orders) && Array.isArray(parsed.items)) {
      parsed.savedItems = Array.isArray(parsed.savedItems) ? parsed.savedItems : [];
      parsed.trashOrders = Array.isArray(parsed.trashOrders) ? parsed.trashOrders : [];
      parsed.trashItems = Array.isArray(parsed.trashItems) ? parsed.trashItems : [];
      if (typeof parsed.estimatedExchangeRate !== 'number' || parsed.estimatedExchangeRate <= 0) {
        const firstOpen = parsed.orders.find((o) => o.status === 'open');
        parsed.estimatedExchangeRate = firstOpen?.exchangeRate ?? 0.13;
      }
      cachedState = parsed;
      return parsed;
    }
  } catch {
    // Initialize with clean empty state
  }
  const initial = structuredClone(INITIAL_STATE);
  cachedState = initial;
  await persistStateToDisk(initial);
  return initial;
}

async function ensureDbState(): Promise<HaulDatabaseState> {
  if (cachedState) return cachedState;
  if (!initPromise) {
    initPromise = loadInitialStateFromDisk().finally(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

async function persistStateToDisk(state: HaulDatabaseState): Promise<void> {
  const dataDir = resolveDataDir();
  const dbFile = getDbFilePath();
  await fs.mkdir(dataDir, { recursive: true });
  const tmpFile = `${dbFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(state), 'utf-8');
  await fs.rename(tmpFile, dbFile);
}

function enqueuePersist(state: HaulDatabaseState): Promise<void> {
  // Snapshot compact JSON immediately on the synchronous tick so subsequent in-memory updates stay consistent
  const serialized = JSON.stringify(state);
  const nextWrite = writeQueue.then(async () => {
    const dataDir = resolveDataDir();
    const dbFile = getDbFilePath();
    await fs.mkdir(dataDir, { recursive: true });
    const tmpFile = `${dbFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpFile, serialized, 'utf-8');
    await fs.rename(tmpFile, dbFile);
  });
  writeQueue = nextWrite.catch(() => {
    // Keep queue alive even if a single write fails
  });
  return nextWrite;
}

let mutationTail: Promise<unknown> = Promise.resolve();

function runMutation<T>(fn: (state: HaulDatabaseState) => Promise<T> | T): Promise<T> {
  const run = mutationTail.then(async () => {
    const state = await ensureDbState();
    return fn(state);
  });
  mutationTail = run.catch(() => undefined);
  return run;
}

export async function getDbState(): Promise<HaulDatabaseState> {
  return ensureDbState();
}

export async function restoreDbState(newState: HaulDatabaseState): Promise<HaulDatabaseState> {
  if (!newState || !Array.isArray(newState.orders) || !Array.isArray(newState.items)) {
    throw new Error('Invalid backup data: orders or items missing.');
  }
  const normalized: HaulDatabaseState = {
    orders: newState.orders,
    items: newState.items,
    savedItems: Array.isArray(newState.savedItems) ? newState.savedItems : [],
    trashOrders: Array.isArray(newState.trashOrders) ? newState.trashOrders : [],
    trashItems: Array.isArray(newState.trashItems) ? newState.trashItems : [],
    estimatedExchangeRate:
      typeof newState.estimatedExchangeRate === 'number' && newState.estimatedExchangeRate > 0
        ? Math.round(newState.estimatedExchangeRate * 10000) / 10000
        : 0.13,
  };
  return runMutation(async () => {
    cachedState = normalized;
    await enqueuePersist(normalized);
    return normalized;
  });
}

export async function updateGlobalExchangeRate(
  exchangeRate: number
): Promise<{ state: HaulDatabaseState; exchangeRate: number }> {
  return runMutation(async (state) => {
    const cleanRate = Math.round(exchangeRate * 10000) / 10000;
    state.estimatedExchangeRate = cleanRate;
    for (const ord of state.orders) {
      if (ord.status === 'open') {
        ord.exchangeRate = cleanRate;
      }
    }
    await enqueuePersist(state);
    return { state, exchangeRate: cleanRate };
  });
}

export async function createOrder(order: HaulOrder): Promise<HaulDatabaseState> {
  return runMutation(async (state) => {
    state.orders.unshift(order);
    await enqueuePersist(state);
    return state;
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: 'open' | 'concluded'
): Promise<{ state: HaulDatabaseState; updated: HaulOrder | null }> {
  return runMutation(async (state) => {
    const target = state.orders.find((o) => o.id === orderId) ?? null;
    if (!target) {
      return { state, updated: null };
    }
    target.status = status;
    target.concludedAt = status === 'concluded' ? new Date().toISOString() : null;
    await enqueuePersist(state);
    return { state, updated: target };
  });
}

export async function updateOrderExchangeRate(
  orderId: string,
  exchangeRate: number
): Promise<{ state: HaulDatabaseState; updated: HaulOrder | null; error?: string }> {
  return runMutation(async (state) => {
    const target = state.orders.find((o) => o.id === orderId) ?? null;
    if (!target) {
      return { state, updated: null, error: 'Order not found.' };
    }
    if (target.status !== 'open') {
      return {
        state,
        updated: null,
        error: 'The conversion rate can only be edited while the order is active.',
      };
    }
    const cleanRate = Math.round(exchangeRate * 10000) / 10000;
    target.exchangeRate = cleanRate;
    state.estimatedExchangeRate = cleanRate;
    for (const ord of state.orders) {
      if (ord.status === 'open') {
        ord.exchangeRate = cleanRate;
      }
    }
    await enqueuePersist(state);
    return { state, updated: target };
  });
}

export async function updateOrderTracking(
  orderId: string,
  payload: {
    trackingNumber?: string;
    shippingLine?: string;
    trackingStatus?: TrackingMilestone;
    eventNote?: string;
    eventLocation?: string;
  }
): Promise<{ state: HaulDatabaseState; updated: HaulOrder | null }> {
  return runMutation(async (state) => {
    const target = state.orders.find((o) => o.id === orderId) ?? null;
    if (!target) {
      return { state, updated: null };
    }

    const now = new Date().toISOString();
    const prevStatus = target.trackingStatus ?? 'in_preparazione';
    const prevTrackingNumber = (target.trackingNumber ?? '').trim();

    if (typeof payload.trackingNumber === 'string') {
      target.trackingNumber = payload.trackingNumber.trim().toUpperCase();
    }
    if (typeof payload.shippingLine === 'string') {
      target.shippingLine = payload.shippingLine.trim();
    }

    let nextStatus = payload.trackingStatus ?? prevStatus;
    if (
      !payload.trackingStatus &&
      !prevTrackingNumber &&
      target.trackingNumber &&
      prevStatus === 'in_preparazione'
    ) {
      nextStatus = 'magazzino_cina';
    }
    target.trackingStatus = nextStatus;
    target.trackingUpdatedAt = now;

    const events: TrackingEvent[] = Array.isArray(target.trackingEvents)
      ? [...target.trackingEvents]
      : [];

    const milestoneMeta = TRACKING_MILESTONES.find((m) => m.id === nextStatus);
    const customNote = (payload.eventNote ?? '').trim();
    const customLocation = (payload.eventLocation ?? '').trim();
    const statusChanged = nextStatus !== prevStatus;
    const trackingAdded = !prevTrackingNumber && Boolean(target.trackingNumber);

    if (statusChanged || trackingAdded || customNote) {
      events.unshift({
        id: `trk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        milestone: nextStatus,
        location: customLocation || milestoneMeta?.defaultLocation || 'In transit',
        description:
          customNote ||
          (trackingAdded
            ? `Tracking number registered (${target.trackingNumber}).`
            : milestoneMeta?.defaultDescription || 'Shipping status update.'),
        timestamp: now,
      });
    }

    target.trackingEvents = events;
    await enqueuePersist(state);
    return { state, updated: target };
  });
}

export async function syncOrderLiveTracking(
  orderId: string,
  payload: {
    trackingNumber?: string;
    carrier: string;
    liveFound: boolean;
    source: 'live_api' | 'manual';
    milestone: TrackingMilestone | null;
    events: TrackingEvent[];
    message: string;
    checkedAt: string;
  }
): Promise<{ state: HaulDatabaseState; updated: HaulOrder | null }> {
  return runMutation(async (state) => {
    const target = state.orders.find((o) => o.id === orderId) ?? null;
    if (!target) {
      return { state, updated: null };
    }

    if (typeof payload.trackingNumber === 'string' && payload.trackingNumber.trim()) {
      target.trackingNumber = payload.trackingNumber.trim().toUpperCase();
    }
    target.trackingCarrier = payload.carrier;
    target.trackingLiveSource = payload.source;
    target.trackingLastSyncMessage = payload.message;
    target.trackingUpdatedAt = payload.checkedAt;

    if (payload.liveFound && payload.events.length > 0) {
      const existing = Array.isArray(target.trackingEvents) ? target.trackingEvents : [];
      const nonLiveExisting = existing.filter((ev) => !ev.id.startsWith('live-'));
      target.trackingEvents = [...payload.events, ...nonLiveExisting];
      if (payload.milestone) {
        target.trackingStatus = payload.milestone;
      }
    }

    await enqueuePersist(state);
    return { state, updated: target };
  });
}

export async function deleteOrder(orderId: string): Promise<HaulDatabaseState> {
  return runMutation(async (state) => {
    state.trashOrders = state.trashOrders || [];
    state.trashItems = state.trashItems || [];
    const order = state.orders.find((o) => o.id === orderId);
    if (order) {
      state.orders = state.orders.filter((o) => o.id !== orderId);
      state.trashOrders.unshift(order);
    }
    const associatedItems = state.items.filter((it) => it.orderId === orderId);
    if (associatedItems.length > 0) {
      state.items = state.items.filter((it) => it.orderId !== orderId);
      state.trashItems.unshift(...associatedItems);
    }
    await enqueuePersist(state);
    return state;
  });
}

export async function addProductItem(item: ProductItem): Promise<{
  state: HaulDatabaseState;
  error?: string;
}> {
  return runMutation(async (state) => {
    const order = state.orders.find((o) => o.id === item.orderId);
    if (!order) {
      return { state, error: 'Order not found.' };
    }
    if (order.status !== 'open') {
      return { state, error: 'This order is concluded. Reopen it or select an active order.' };
    }
    state.items.unshift(item);
    await enqueuePersist(state);
    return { state };
  });
}

export type ProductItemUpdatePatch = Partial<
  Pick<
    ProductItem,
    | 'title'
    | 'category'
    | 'priceCny'
    | 'link'
    | 'platform'
    | 'vendor'
    | 'sizeNote'
    | 'imageUrl'
    | 'imageUrls'
    | 'needsCategoryConfirmation'
    | 'detectedDetails'
  >
> & {
  rating?: number | null;
};

export async function updateProductItem(
  itemId: string,
  patch: ProductItemUpdatePatch
): Promise<{ state: HaulDatabaseState; updated: ProductItem | null; error?: string }> {
  return runMutation(async (state) => {
    const item = state.items.find((it) => it.id === itemId) ?? null;
    if (!item) {
      return { state, updated: null, error: 'Item not found.' };
    }
    const order = state.orders.find((o) => o.id === item.orderId);
    const patchKeys = Object.keys(patch);
    const isAllowedConcludedPatch =
      patchKeys.length > 0 &&
      patchKeys.every(
        (k) =>
          k === 'imageUrl' ||
          k === 'imageUrls' ||
          k === 'rating' ||
          k === 'sizeNote' ||
          k === 'detectedDetails'
      );
    if (order && order.status !== 'open' && !isAllowedConcludedPatch) {
      return { state, updated: null, error: 'Cannot edit items inside a concluded order.' };
    }
    const { rating, ...restPatch } = patch;
    Object.assign(item, restPatch);
    if (rating === null) {
      delete item.rating;
    } else if (typeof rating === 'number') {
      item.rating = rating;
    }
    await enqueuePersist(state);
    return { state, updated: item };
  });
}

export async function deleteProductItem(itemId: string): Promise<{
  state: HaulDatabaseState;
  error?: string;
}> {
  return runMutation(async (state) => {
    const item = state.items.find((it) => it.id === itemId);
    if (!item) {
      return { state, error: 'Item not found.' };
    }
    state.items = state.items.filter((it) => it.id !== itemId);
    state.trashItems = state.trashItems || [];
    state.trashItems.unshift(item);
    await enqueuePersist(state);
    return { state };
  });
}

export async function addSavedItem(item: ProductItem): Promise<HaulDatabaseState> {
  return runMutation(async (state) => {
    state.savedItems = state.savedItems || [];
    state.savedItems.unshift({
      ...item,
      orderId: 'saved',
      savedAt: item.savedAt ?? new Date().toISOString(),
    });
    await enqueuePersist(state);
    return state;
  });
}

export async function saveExistingItemForLater(itemId: string): Promise<{
  state: HaulDatabaseState;
  savedItem: ProductItem | null;
  error?: string;
}> {
  return runMutation(async (state) => {
    const item = state.items.find((it) => it.id === itemId) ?? null;
    if (!item) {
      return { state, savedItem: null, error: 'Item not found.' };
    }
    const order = state.orders.find((o) => o.id === item.orderId);
    if (order && order.status !== 'open') {
      return { state, savedItem: null, error: 'Cannot move items from a concluded order.' };
    }
    state.items = state.items.filter((it) => it.id !== itemId);
    state.savedItems = state.savedItems || [];
    const savedItem: ProductItem = {
      ...item,
      orderId: 'saved',
      savedAt: new Date().toISOString(),
    };
    state.savedItems.unshift(savedItem);
    await enqueuePersist(state);
    return { state, savedItem };
  });
}

export async function moveSavedItemToOrder(
  itemId: string,
  orderId: string
): Promise<{ state: HaulDatabaseState; movedItem: ProductItem | null; error?: string }> {
  return runMutation(async (state) => {
    state.savedItems = state.savedItems || [];
    const saved = state.savedItems.find((it) => it.id === itemId) ?? null;
    if (!saved) {
      return { state, movedItem: null, error: 'Saved item not found.' };
    }
    const targetOrder = state.orders.find((o) => o.id === orderId) ?? null;
    if (!targetOrder) {
      return { state, movedItem: null, error: 'Destination order not found.' };
    }
    if (targetOrder.status !== 'open') {
      return { state, movedItem: null, error: 'Select an active order to add this item.' };
    }

    state.savedItems = state.savedItems.filter((it) => it.id !== itemId);
    const { savedAt: _discarded, ...rest } = saved;
    const movedItem: ProductItem = {
      ...rest,
      orderId: targetOrder.id,
    };
    state.items.unshift(movedItem);
    await enqueuePersist(state);
    return { state, movedItem };
  });
}

export async function updateSavedItem(
  itemId: string,
  patch: Partial<
    Pick<
      ProductItem,
      | 'title'
      | 'category'
      | 'priceCny'
      | 'link'
      | 'platform'
      | 'vendor'
      | 'sizeNote'
      | 'imageUrl'
      | 'imageUrls'
      | 'needsCategoryConfirmation'
      | 'detectedDetails'
    >
  >
): Promise<{ state: HaulDatabaseState; updated: ProductItem | null; error?: string }> {
  return runMutation(async (state) => {
    state.savedItems = state.savedItems || [];
    const item = state.savedItems.find((it) => it.id === itemId) ?? null;
    if (!item) {
      return { state, updated: null, error: 'Saved item not found.' };
    }
    Object.assign(item, patch);
    await enqueuePersist(state);
    return { state, updated: item };
  });
}

export async function deleteSavedItem(itemId: string): Promise<{
  state: HaulDatabaseState;
  error?: string;
}> {
  return runMutation(async (state) => {
    state.savedItems = state.savedItems || [];
    const item = state.savedItems.find((it) => it.id === itemId);
    if (!item) {
      return { state, error: 'Saved item not found.' };
    }
    state.savedItems = state.savedItems.filter((it) => it.id !== itemId);
    state.trashItems = state.trashItems || [];
    state.trashItems.unshift(item);
    await enqueuePersist(state);
    return { state };
  });
}

export async function restoreTrashOrder(orderId: string): Promise<HaulDatabaseState> {
  return runMutation(async (state) => {
    state.trashOrders = state.trashOrders || [];
    const order = state.trashOrders.find((o) => o.id === orderId);
    if (order) {
      state.trashOrders = state.trashOrders.filter((o) => o.id !== orderId);
      state.orders.unshift(order);
      state.trashItems = state.trashItems || [];
      const related = state.trashItems.filter((it) => it.orderId === orderId);
      if (related.length > 0) {
        state.trashItems = state.trashItems.filter((it) => it.orderId !== orderId);
        state.items.unshift(...related);
      }
    }
    await enqueuePersist(state);
    return state;
  });
}

export async function restoreTrashItem(itemId: string): Promise<HaulDatabaseState> {
  return runMutation(async (state) => {
    state.trashItems = state.trashItems || [];
    const item = state.trashItems.find((it) => it.id === itemId);
    if (item) {
      state.trashItems = state.trashItems.filter((it) => it.id !== itemId);
      if (item.orderId === 'saved') {
        state.savedItems = state.savedItems || [];
        state.savedItems.unshift(item);
      } else {
        state.items.unshift(item);
      }
    }
    await enqueuePersist(state);
    return state;
  });
}

export async function permanentDeleteTrashOrder(orderId: string): Promise<HaulDatabaseState> {
  return runMutation(async (state) => {
    state.trashOrders = state.trashOrders || [];
    state.trashOrders = state.trashOrders.filter((o) => o.id !== orderId);
    state.trashItems = state.trashItems || [];
    state.trashItems = state.trashItems.filter((it) => it.orderId !== orderId);
    await enqueuePersist(state);
    return state;
  });
}

export async function permanentDeleteTrashItem(itemId: string): Promise<HaulDatabaseState> {
  return runMutation(async (state) => {
    state.trashItems = state.trashItems || [];
    state.trashItems = state.trashItems.filter((it) => it.id !== itemId);
    await enqueuePersist(state);
    return state;
  });
}

export async function emptyTrash(): Promise<HaulDatabaseState> {
  return runMutation(async (state) => {
    state.trashOrders = [];
    state.trashItems = [];
    await enqueuePersist(state);
    return state;
  });
}

export async function bulkOrderItemsAction(payload: {
  action: 'update_category' | 'move_to_order' | 'save_for_later' | 'delete';
  itemIds: string[];
  category?: ProductCategory;
  targetOrderId?: string;
}): Promise<{ state: HaulDatabaseState; affectedCount: number; error?: string }> {
  return runMutation(async (state) => {
    const idSet = new Set(payload.itemIds);
    const openOrderIds = new Set(
      state.orders.filter((o) => o.status === 'open').map((o) => o.id)
    );

    const editableMatches = state.items.filter(
      (it) => idSet.has(it.id) && openOrderIds.has(it.orderId)
    );
    if (editableMatches.length === 0) {
      return {
        state,
        affectedCount: 0,
        error: 'No editable items selected.',
      };
    }
    const matchedIds = new Set(editableMatches.map((it) => it.id));

    if (payload.action === 'update_category') {
      if (!payload.category) {
        return { state, affectedCount: 0, error: 'Select a valid category.' };
      }
      for (const item of state.items) {
        if (matchedIds.has(item.id)) {
          item.category = payload.category;
          item.needsCategoryConfirmation = false;
        }
      }
      await enqueuePersist(state);
      return { state, affectedCount: editableMatches.length };
    }

    if (payload.action === 'move_to_order') {
      const targetOrder = state.orders.find((o) => o.id === payload.targetOrderId);
      if (!targetOrder || targetOrder.status !== 'open') {
        return {
          state,
          affectedCount: 0,
          error: 'Select a valid active destination order.',
        };
      }
      for (const item of state.items) {
        if (matchedIds.has(item.id)) {
          item.orderId = targetOrder.id;
        }
      }
      await enqueuePersist(state);
      return { state, affectedCount: editableMatches.length };
    }

    if (payload.action === 'save_for_later') {
      const now = new Date().toISOString();
      state.items = state.items.filter((it) => !matchedIds.has(it.id));
      state.savedItems = state.savedItems || [];
      const toSave: ProductItem[] = editableMatches.map((it) => ({
        ...it,
        orderId: 'saved',
        savedAt: now,
      }));
      state.savedItems.unshift(...toSave);
      await enqueuePersist(state);
      return { state, affectedCount: toSave.length };
    }

    // action === 'delete'
    state.items = state.items.filter((it) => !matchedIds.has(it.id));
    state.trashItems = state.trashItems || [];
    state.trashItems.unshift(...editableMatches);
    await enqueuePersist(state);
    return { state, affectedCount: editableMatches.length };
  });
}

export async function bulkSavedItemsAction(payload: {
  action: 'update_category' | 'move_to_order' | 'delete';
  itemIds: string[];
  category?: ProductCategory;
  targetOrderId?: string;
}): Promise<{ state: HaulDatabaseState; affectedCount: number; error?: string }> {
  return runMutation(async (state) => {
    state.savedItems = state.savedItems || [];
    const idSet = new Set(payload.itemIds);
    const matched = state.savedItems.filter((it) => idSet.has(it.id));
    if (matched.length === 0) {
      return {
        state,
        affectedCount: 0,
        error: 'No saved items selected.',
      };
    }
    const matchedIds = new Set(matched.map((it) => it.id));

    if (payload.action === 'update_category') {
      if (!payload.category) {
        return { state, affectedCount: 0, error: 'Select a valid category.' };
      }
      for (const item of state.savedItems) {
        if (matchedIds.has(item.id)) {
          item.category = payload.category;
          item.needsCategoryConfirmation = false;
        }
      }
      await enqueuePersist(state);
      return { state, affectedCount: matched.length };
    }

    if (payload.action === 'move_to_order') {
      const targetOrder = state.orders.find((o) => o.id === payload.targetOrderId);
      if (!targetOrder || targetOrder.status !== 'open') {
        return {
          state,
          affectedCount: 0,
          error: 'Select a valid active destination order.',
        };
      }
      state.savedItems = state.savedItems.filter((it) => !matchedIds.has(it.id));
      const moved: ProductItem[] = matched.map((saved) => {
        const { savedAt: _discarded, ...rest } = saved;
        return {
          ...rest,
          orderId: targetOrder.id,
        };
      });
      state.items.unshift(...moved);
      await enqueuePersist(state);
      return { state, affectedCount: moved.length };
    }

    // action === 'delete'
    state.savedItems = state.savedItems.filter((it) => !matchedIds.has(it.id));
    state.trashItems = state.trashItems || [];
    state.trashItems.unshift(...matched);
    await enqueuePersist(state);
    return { state, affectedCount: matched.length };
  });
}

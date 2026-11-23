import type { HaulDatabaseState, HaulOrder } from '../types/haul.ts';
import { extractUniqueVendors } from '../utils/haulLogic.ts';
import {
  buildExtensionSubmitRequest,
  DEFAULT_EXTENSION_SERVER_URL,
  normalizeServerUrl,
  sanitizePersistedDraft,
  type ExtensionDraftState,
} from '../utils/extensionWizard.ts';

const STORAGE_KEYS = {
  serverUrl: 'hauldesk-ext-server-url',
  theme: 'hauldesk-ext-theme',
  draft: 'hauldesk-ext-draft',
} as const;

interface WebExtStorageArea {
  get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
}

interface FirefoxBrowserApi {
  storage?: { local?: WebExtStorageArea };
  sidebarAction?: { open?: () => Promise<void> };
  tabs?: { create?: (props: { url: string }) => Promise<unknown> };
  permissions?: {
    request?: (perms: { origins?: string[] }) => Promise<boolean>;
    contains?: (perms: { origins?: string[] }) => Promise<boolean>;
  };
}

function getBrowserApi(): FirefoxBrowserApi | null {
  const g = globalThis as unknown as {
    browser?: FirefoxBrowserApi;
    chrome?: FirefoxBrowserApi;
  };
  if (g.browser) return g.browser;
  if (g.chrome) return g.chrome;
  return null;
}

export async function requestServerHostPermission(serverUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(serverUrl);
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]'
    ) {
      return true;
    }
    const api = getBrowserApi();
    if (!api?.permissions?.request) {
      return true;
    }
    const originPattern = `${parsed.protocol}//${parsed.hostname}/*`;
    if (api.permissions.contains) {
      const already = await api.permissions.contains({ origins: [originPattern] });
      if (already) return true;
    }
    return await api.permissions.request({ origins: [originPattern] });
  } catch {
    return true;
  }
}

export function isSidebarView(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('mode') === 'sidebar') {
    return true;
  }
  return window.innerHeight > 630;
}

export function canOpenSidebar(): boolean {
  if (isSidebarView()) return false;
  const api = getBrowserApi();
  return Boolean(api?.sidebarAction?.open);
}

export async function openExtensionSidebar(): Promise<boolean> {
  const api = getBrowserApi();
  if (!api?.sidebarAction?.open) return false;
  try {
    await api.sidebarAction.open();
    return true;
  } catch {
    return false;
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  const api = getBrowserApi();
  if (api?.tabs?.create) {
    try {
      await api.tabs.create({ url });
      return;
    } catch {
      // Fallback below
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function storageGet<T = unknown>(key: string): Promise<T | null> {
  const api = getBrowserApi();
  if (api?.storage?.local) {
    try {
      const res = await api.storage.local.get(key);
      if (key in res) return res[key] as T;
      return null;
    } catch {
      // Fall back to localStorage
    }
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: unknown): Promise<void> {
  const api = getBrowserApi();
  if (api?.storage?.local) {
    try {
      await api.storage.local.set({ [key]: value });
      return;
    } catch {
      // Fall back to localStorage
    }
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore restricted storage errors
  }
}

export async function loadExtensionPreferences(): Promise<{
  serverUrl: string;
  isDark: boolean;
  draft: ExtensionDraftState;
}> {
  const [rawUrl, rawTheme, rawDraft] = await Promise.all([
    storageGet<string>(STORAGE_KEYS.serverUrl),
    storageGet<'dark' | 'light'>(STORAGE_KEYS.theme),
    storageGet<unknown>(STORAGE_KEYS.draft),
  ]);

  const normalized =
    typeof rawUrl === 'string' && rawUrl.trim()
      ? normalizeServerUrl(rawUrl)
      : { valid: true, url: DEFAULT_EXTENSION_SERVER_URL };

  return {
    serverUrl: normalized.valid ? normalized.url : DEFAULT_EXTENSION_SERVER_URL,
    isDark: rawTheme === 'dark',
    draft: sanitizePersistedDraft(rawDraft),
  };
}

export async function saveServerUrlPreference(url: string): Promise<void> {
  await storageSet(STORAGE_KEYS.serverUrl, url);
}

export async function saveThemePreference(isDark: boolean): Promise<void> {
  await storageSet(STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
}

export async function saveDraftPreference(draft: ExtensionDraftState): Promise<void> {
  await storageSet(STORAGE_KEYS.draft, draft);
}

export interface ServerSnapshot {
  serverUrl: string;
  openOrders: HaulOrder[];
  existingVendors: string[];
  totalItems: number;
  savedItemsCount: number;
}

function formatConnectionError(err: unknown, serverUrl: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  if (
    lower.includes('networkerror') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('network request failed')
  ) {
    return `Unable to reach ${serverUrl}. Check that the HaulDesk server is running and your network or SSL certificate settings are valid.`;
  }
  return msg || `Connection error while contacting ${serverUrl}.`;
}

export async function fetchServerSnapshot(rawServerUrl: string): Promise<ServerSnapshot> {
  const norm = normalizeServerUrl(rawServerUrl);
  if (!norm.valid) {
    throw new Error(norm.error || 'Invalid server URL.');
  }
  const base = norm.url;

  try {
    const healthRes = await fetch(`${base}/api/health`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!healthRes.ok) {
      throw new Error(`Server returned status ${healthRes.status} on /api/health.`);
    }

    const stateRes = await fetch(`${base}/api/state`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!stateRes.ok) {
      throw new Error(`Failed to load orders from server (${stateRes.status}).`);
    }

    const data = (await stateRes.json()) as HaulDatabaseState;
    const orders = Array.isArray(data.orders) ? data.orders : [];
    const items = Array.isArray(data.items) ? data.items : [];
    const savedItems = Array.isArray(data.savedItems) ? data.savedItems : [];

    return {
      serverUrl: base,
      openOrders: orders.filter((o) => o.status === 'open'),
      existingVendors: extractUniqueVendors([...items, ...savedItems]),
      totalItems: items.length,
      savedItemsCount: savedItems.length,
    };
  } catch (err) {
    throw new Error(formatConnectionError(err, base));
  }
}

export async function submitExtensionProduct(
  rawServerUrl: string,
  draft: ExtensionDraftState
): Promise<{ itemTitle: string; destinationLabel: string }> {
  const { endpoint, payload } = buildExtensionSubmitRequest(rawServerUrl, draft);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      errors?: Record<string, string>;
    };
    if (!res.ok) {
      const fieldMsg = data.errors ? Object.values(data.errors)[0] : undefined;
      throw new Error(data.error || fieldMsg || `Failed to save item (${res.status}).`);
    }
    return {
      itemTitle: draft.title.trim(),
      destinationLabel: draft.targetMode === 'saved' ? 'Save for Later' : 'Active Order',
    };
  } catch (err) {
    const norm = normalizeServerUrl(rawServerUrl);
    throw new Error(formatConnectionError(err, norm.valid ? norm.url : rawServerUrl));
  }
}

export async function fileToResizedDataUrl(
  file: Blob
): Promise<{ dataUrl: string; mimeType: string }> {
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
          resolve({ dataUrl: rawUrl, mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
      };
      img.onerror = () => resolve({ dataUrl: rawUrl, mimeType: file.type || 'image/jpeg' });
      img.src = rawUrl;
    };
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

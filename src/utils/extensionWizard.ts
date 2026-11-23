import {
  PRODUCT_CATEGORIES,
  type HaulOrder,
  type ProductCategory,
} from '../types/haul.ts';
import { isValidHttpUrl, normalizeUrl } from './haulLogic.ts';

export const DEFAULT_EXTENSION_SERVER_URL = 'http://localhost:3000';

export type ExtensionWizardStep = 1 | 2 | 3 | 4;

export interface WizardStepMeta {
  step: ExtensionWizardStep;
  shortLabel: string;
  title: string;
  subtitle: string;
}

export const WIZARD_STEPS: WizardStepMeta[] = [
  {
    step: 1,
    shortLabel: 'Photos',
    title: 'Photos & Product Name',
    subtitle: 'Upload, drop, or paste Yupoo/Taobao photos and enter a title',
  },
  {
    step: 2,
    shortLabel: 'Price',
    title: 'Category & Price',
    subtitle: 'Pick the item category and price in ¥ CNY',
  },
  {
    step: 3,
    shortLabel: 'Vendor',
    title: 'Link, Vendor & Notes',
    subtitle: 'Add source link, seller name, and optional size or colorway',
  },
  {
    step: 4,
    shortLabel: 'Send',
    title: 'Active Order or Save for Later',
    subtitle: 'Choose where to save this item in HaulDesk',
  },
];

export interface ExtensionDraftState {
  step: ExtensionWizardStep;
  imagePreviews: string[];
  title: string;
  category: ProductCategory | '';
  priceCny: string;
  link: string;
  vendor: string;
  sizeNote: string;
  targetMode: 'order' | 'saved';
  selectedOrderId: string;
}

export type WizardFieldErrors = Partial<
  Record<'title' | 'category' | 'priceCny' | 'link' | 'vendor' | 'target', string>
>;

const VALID_CATEGORY_SET = new Set<string>(PRODUCT_CATEGORIES.map((c) => c.id));

export function createEmptyExtensionDraft(defaultOrderId = ''): ExtensionDraftState {
  return {
    step: 1,
    imagePreviews: [],
    title: '',
    category: '',
    priceCny: '',
    link: '',
    vendor: '',
    sizeNote: '',
    targetMode: 'order',
    selectedOrderId: defaultOrderId,
  };
}

export function normalizeServerUrl(raw: string): {
  valid: boolean;
  url: string;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      url: '',
      error: 'Enter your HaulDesk server URL (e.g. http://localhost:3000 or https://hauldesk.yourdomain.com).',
    };
  }
  const hasAnyScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const withProtocol = hasAnyScheme
    ? trimmed
    : trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')
      ? `http://${trimmed}`
      : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        url: '',
        error: 'Use a valid http:// or https:// protocol.',
      };
    }
    if (!parsed.hostname) {
      return {
        valid: false,
        url: '',
        error: 'Invalid server hostname.',
      };
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return {
      valid: true,
      url: `${parsed.protocol}//${parsed.host}${cleanPath}`,
    };
  } catch {
    return {
      valid: false,
      url: '',
      error: 'Invalid server URL. Example: http://localhost:3000 or https://hauldesk.yourdomain.com',
    };
  }
}

export function sanitizePersistedDraft(raw: unknown): ExtensionDraftState {
  const empty = createEmptyExtensionDraft();
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Record<string, unknown>;

  const rawStep = obj.step;
  const step: ExtensionWizardStep =
    rawStep === 1 || rawStep === 2 || rawStep === 3 || rawStep === 4 ? rawStep : 1;

  const imagePreviews = Array.isArray(obj.imagePreviews)
    ? obj.imagePreviews
        .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        .slice(0, 8)
    : [];

  const category =
    typeof obj.category === 'string' && VALID_CATEGORY_SET.has(obj.category)
      ? (obj.category as ProductCategory)
      : '';

  const targetMode = obj.targetMode === 'saved' ? 'saved' : 'order';

  return {
    step,
    imagePreviews,
    title: typeof obj.title === 'string' ? obj.title : '',
    category,
    priceCny: typeof obj.priceCny === 'string' ? obj.priceCny : '',
    link: typeof obj.link === 'string' ? obj.link : '',
    vendor: typeof obj.vendor === 'string' ? obj.vendor : '',
    sizeNote: typeof obj.sizeNote === 'string' ? obj.sizeNote : '',
    targetMode,
    selectedOrderId: typeof obj.selectedOrderId === 'string' ? obj.selectedOrderId : '',
  };
}

export function validateWizardStep(
  step: ExtensionWizardStep,
  draft: ExtensionDraftState,
  openOrders: Pick<HaulOrder, 'id' | 'status'>[] = []
): WizardFieldErrors {
  const errors: WizardFieldErrors = {};

  if (step === 1) {
    if (!draft.title.trim()) {
      errors.title = 'Please enter a product name or description.';
    }
    return errors;
  }

  if (step === 2) {
    if (!draft.category || !VALID_CATEGORY_SET.has(draft.category)) {
      errors.category = 'Please select a product category.';
    }
    const parsedPrice = Number(draft.priceCny.replace(',', '.'));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      errors.priceCny = 'Please enter a valid price greater than 0 in ¥ CNY.';
    }
    return errors;
  }

  if (step === 3) {
    if (draft.link.trim() && !isValidHttpUrl(draft.link)) {
      errors.link = 'Please enter a valid Yupoo, Taobao, Weidian, or Superbuy URL.';
    }
    if (!draft.vendor.trim()) {
      errors.vendor = 'Please enter the vendor or store name.';
    }
    return errors;
  }

  // step === 4
  if (draft.targetMode === 'order') {
    const validOpenIds = new Set(
      openOrders.filter((o) => o.status === 'open').map((o) => o.id)
    );
    if (validOpenIds.size === 0) {
      errors.target =
        'No active order found on server. Choose "Save for Later" or create an order in HaulDesk first.';
    } else if (!draft.selectedOrderId || !validOpenIds.has(draft.selectedOrderId)) {
      errors.target = 'Please select an active destination order.';
    }
  }

  return errors;
}

export function validateAllWizardSteps(
  draft: ExtensionDraftState,
  openOrders: Pick<HaulOrder, 'id' | 'status'>[] = []
): { valid: boolean; firstInvalidStep: ExtensionWizardStep | null; errors: WizardFieldErrors } {
  const steps: ExtensionWizardStep[] = [1, 2, 3, 4];
  let mergedErrors: WizardFieldErrors = {};
  let firstInvalidStep: ExtensionWizardStep | null = null;

  for (const step of steps) {
    const stepErrors = validateWizardStep(step, draft, openOrders);
    if (Object.keys(stepErrors).length > 0) {
      if (firstInvalidStep === null) {
        firstInvalidStep = step;
      }
      mergedErrors = { ...mergedErrors, ...stepErrors };
    }
  }

  return {
    valid: firstInvalidStep === null,
    firstInvalidStep,
    errors: mergedErrors,
  };
}

export function buildExtensionSubmitRequest(
  serverUrl: string,
  draft: ExtensionDraftState
): { endpoint: string; payload: Record<string, unknown> } {
  const normalizedBase = normalizeServerUrl(serverUrl);
  const base = normalizedBase.valid ? normalizedBase.url : DEFAULT_EXTENSION_SERVER_URL;
  const primaryImage = draft.imagePreviews[0] ?? '';
  const normalizedLink = draft.link.trim() ? normalizeUrl(draft.link) : '';

  const basePayload = {
    title: draft.title.trim(),
    category: draft.category,
    priceCny: draft.priceCny.trim(),
    link: normalizedLink,
    vendor: draft.vendor.trim(),
    sizeNote: draft.sizeNote.trim(),
    imageUrl: primaryImage,
    imageUrls: draft.imagePreviews,
    categoryConfidence: 'manuale',
    needsCategoryConfirmation: false,
    detectedDetails: '',
  };

  if (draft.targetMode === 'saved') {
    return {
      endpoint: `${base}/api/saved-items`,
      payload: basePayload,
    };
  }

  return {
    endpoint: `${base}/api/items`,
    payload: {
      ...basePayload,
      orderId: draft.selectedOrderId,
    },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExtensionSubmitRequest,
  createEmptyExtensionDraft,
  DEFAULT_EXTENSION_SERVER_URL,
  normalizeServerUrl,
  sanitizePersistedDraft,
  validateAllWizardSteps,
  validateWizardStep,
} from './extensionWizard';
import type { HaulOrder } from '../types/haul';

const openOrders: HaulOrder[] = [
  {
    id: 'ord-open-1',
    title: 'Haul Inverno 2026',
    status: 'open',
    createdAt: '2026-11-10T10:00:00Z',
    concludedAt: null,
    agentNote: '',
    exchangeRate: 0.13,
  },
];

test('normalizeServerUrl enforces valid http/https and strips trailing slashes', () => {
  assert.deepEqual(normalizeServerUrl('https://hauldesk.example.com/'), {
    valid: true,
    url: 'https://hauldesk.example.com',
  });
  assert.deepEqual(normalizeServerUrl('hauldesk.example.com/'), {
    valid: true,
    url: 'https://hauldesk.example.com',
  });
  assert.deepEqual(normalizeServerUrl('http://127.0.0.1:3000///'), {
    valid: true,
    url: 'http://127.0.0.1:3000',
  });
  assert.deepEqual(normalizeServerUrl('localhost:3000'), {
    valid: true,
    url: 'http://localhost:3000',
  });
  assert.equal(normalizeServerUrl('').valid, false);
  assert.equal(normalizeServerUrl('ftp://hauldesk.example.com').valid, false);
});

test('validateWizardStep checks each of the 4 wizard screens independently', () => {
  const draft = createEmptyExtensionDraft('ord-open-1');

  // Step 1: requires product title
  assert.ok(validateWizardStep(1, draft, openOrders).title);
  draft.title = 'Felpa Boxy Washed';
  assert.deepEqual(validateWizardStep(1, draft, openOrders), {});

  // Step 2: requires category and positive CNY price
  const s2Err = validateWizardStep(2, draft, openOrders);
  assert.ok(s2Err.category);
  assert.ok(s2Err.priceCny);
  draft.category = 'Felpa';
  draft.priceCny = '240';
  assert.deepEqual(validateWizardStep(2, draft, openOrders), {});

  // Step 3: requires vendor, validates link only if non-empty
  const s3ErrEmptyVendor = validateWizardStep(3, draft, openOrders);
  assert.ok(s3ErrEmptyVendor.vendor);
  assert.equal(s3ErrEmptyVendor.link, undefined);

  draft.vendor = 'TopStoney';
  draft.link = 'not-a-valid-url';
  assert.ok(validateWizardStep(3, draft, openOrders).link);

  draft.link = 'https://topstoney.x.yupoo.com/albums/1';
  assert.deepEqual(validateWizardStep(3, draft, openOrders), {});

  // Step 4: requires an open order if targetMode === 'order', allows saved without open orders
  assert.deepEqual(validateWizardStep(4, draft, openOrders), {});
  assert.ok(validateWizardStep(4, draft, []).target);
  draft.targetMode = 'saved';
  assert.deepEqual(validateWizardStep(4, draft, []), {});
});

test('validateAllWizardSteps returns the first invalid step', () => {
  const draft = createEmptyExtensionDraft('ord-open-1');
  draft.title = 'Cargo Pants';
  draft.category = 'Pantaloni';
  draft.priceCny = '195';
  // vendor missing -> step 3 is first invalid
  const res = validateAllWizardSteps(draft, openOrders);
  assert.equal(res.valid, false);
  assert.equal(res.firstInvalidStep, 3);
  assert.ok(res.errors.vendor);
});

test('buildExtensionSubmitRequest targets /api/items for open orders and /api/saved-items for saved', () => {
  const draft = createEmptyExtensionDraft('ord-open-1');
  draft.imagePreviews = ['data:image/jpeg;base64,img1', 'data:image/jpeg;base64,img2'];
  draft.title = '  Felpa Boxy  ';
  draft.category = 'Felpa';
  draft.priceCny = '260';
  draft.link = 'item.taobao.com/item.htm?id=42';
  draft.vendor = ' TopStoney ';
  draft.sizeNote = ' L · Nero ';
  draft.targetMode = 'order';

  const orderReq = buildExtensionSubmitRequest(DEFAULT_EXTENSION_SERVER_URL, draft);
  assert.equal(orderReq.endpoint, 'http://localhost:3000/api/items');
  assert.equal(orderReq.payload.orderId, 'ord-open-1');
  assert.equal(orderReq.payload.link, 'https://item.taobao.com/item.htm?id=42');
  assert.equal(orderReq.payload.imageUrl, 'data:image/jpeg;base64,img1');
  assert.deepEqual(orderReq.payload.imageUrls, ['data:image/jpeg;base64,img1', 'data:image/jpeg;base64,img2']);

  draft.targetMode = 'saved';
  const savedReq = buildExtensionSubmitRequest('https://hauldesk.example.com/', draft);
  assert.equal(savedReq.endpoint, 'https://hauldesk.example.com/api/saved-items');
  assert.equal('orderId' in savedReq.payload, false);
});

test('sanitizePersistedDraft safely recovers from malformed or partial storage payloads', () => {
  const recovered = sanitizePersistedDraft({
    step: 3,
    title: 'Runner',
    category: 'NonEsiste',
    priceCny: '310',
    imagePreviews: ['data:image/jpeg;base64,a', 123, ''],
    targetMode: 'saved',
  });
  assert.equal(recovered.step, 3);
  assert.equal(recovered.title, 'Runner');
  assert.equal(recovered.category, '');
  assert.deepEqual(recovered.imagePreviews, ['data:image/jpeg;base64,a']);
  assert.equal(recovered.targetMode, 'saved');

  const fallback = sanitizePersistedDraft(null);
  assert.equal(fallback.step, 1);
  assert.equal(fallback.targetMode, 'order');
});

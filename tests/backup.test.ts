import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHaulBackup,
  normalizeLegacyCategory,
  validateHaulBackup,
} from '../src/utils/haulLogic.ts';
import type { HaulOrder, ProductItem } from '../src/types/haul.ts';

const mockOrders: HaulOrder[] = [
  {
    id: 'ord-test-1',
    title: 'Haul Inverno #01',
    status: 'concluded',
    createdAt: '2026-10-01T10:00:00.000Z',
    concludedAt: '2026-10-15T12:00:00.000Z',
    agentNote: 'Superbuy warehouse test',
    exchangeRate: 0.13,
    trackingNumber: 'TEST123456CN',
    shippingLine: 'Europe Air Cargo',
    trackingStatus: 'consegnato',
    trackingEvents: [],
  },
  {
    id: 'ord-test-2',
    title: 'Haul Primavera #02',
    status: 'open',
    createdAt: '2026-11-01T10:00:00.000Z',
    concludedAt: null,
    agentNote: 'Controllo QC in corso',
    exchangeRate: 0.13,
  },
];

const mockItems: ProductItem[] = [
  {
    id: 'item-test-1',
    orderId: 'ord-test-1',
    title: 'Felpa Oversized Grigia',
    category: 'Felpa',
    categoryConfidence: 'alta',
    needsCategoryConfirmation: false,
    priceCny: 250,
    link: 'https://yupoo.com/item1',
    platform: 'yupoo',
    vendor: 'TopStoney',
    sizeNote: 'Taglia XL',
    imageUrl: 'https://example.com/hoodie.jpg',
    imageUrls: ['https://example.com/hoodie.jpg', 'data:image/jpeg;base64,mockBase64String123', 'https://example.com/qc.jpg'],
    detectedDetails: 'Cotone pesante 450gsm',
    createdAt: '2026-10-02T11:00:00.000Z',
  },
  {
    id: 'item-test-2',
    orderId: 'ord-test-2',
    title: 'Sneakers Retro White',
    category: 'Scarpe',
    categoryConfidence: 'alta',
    needsCategoryConfirmation: false,
    priceCny: 380,
    link: 'https://weidian.com/item2',
    platform: 'weidian',
    vendor: 'WWTOP',
    sizeNote: 'EU 43',
    imageUrl: 'https://example.com/sneakers.jpg',
    detectedDetails: 'Pelle e mesh',
    createdAt: '2026-11-02T14:00:00.000Z',
  },
];

test('createHaulBackup generates full backup with all photos, 10 updated categories, and exact counts', () => {
  const backup = createHaulBackup(mockOrders, mockItems);

  assert.equal(backup.format, 'hauldesk-full-backup');
  assert.equal(backup.version, 2);
  assert.equal(backup.stats.totalOrders, 2);
  assert.equal(backup.stats.openOrders, 1);
  assert.equal(backup.stats.concludedOrders, 1);
  assert.equal(backup.stats.totalItems, 2);

  // Check categories metadata in exported backup
  assert.equal(backup.categories?.length, 10);
  assert.ok(backup.categories?.some((c) => c.id === 'Giubbini'));
  assert.ok(backup.categories?.some((c) => c.id === 'Borse'));
  assert.ok(backup.categories?.some((c) => c.id === 'Cappellini'));
  assert.ok(backup.categories?.some((c) => c.id === 'Cinture'));

  // Check stats byCategory
  assert.equal(backup.stats.byCategory?.Felpa, 1);
  assert.equal(backup.stats.byCategory?.Scarpe, 1);
  assert.equal(backup.stats.byCategory?.Giubbini, 0);

  // Item 1 has 3 photos, Item 2 has 1 photo -> total 4 photos
  assert.equal(backup.stats.totalPhotos, 4);

  // Check Item 1 photos preserved 1:1
  const item1 = backup.items.find((i) => i.id === 'item-test-1')!;
  assert.equal(item1.imageUrls?.length, 3);
  assert.equal(item1.imageUrls?.[1], 'data:image/jpeg;base64,mockBase64String123');
  assert.equal(item1.imageUrls?.[2], 'https://example.com/qc.jpg');

  // Check Item 2 has its photo populated into imageUrls array
  const item2 = backup.items.find((i) => i.id === 'item-test-2')!;
  assert.deepEqual(item2.imageUrls, ['https://example.com/sneakers.jpg']);
});

test('validateHaulBackup successfully validates wrapped backup and preserves all data 1:1', () => {
  const backup = createHaulBackup(mockOrders, mockItems);
  const result = validateHaulBackup(backup);

  assert.equal(result.valid, true);
  assert.ok(result.state);
  assert.equal(result.stats?.totalOrders, 2);
  assert.equal(result.stats?.totalItems, 2);
  assert.equal(result.stats?.totalPhotos, 4);

  // Check state data restoration
  assert.equal(result.state?.orders.length, 2);
  assert.equal(result.state?.items.length, 2);

  const restoredItem1 = result.state?.items.find((i) => i.id === 'item-test-1')!;
  assert.equal(restoredItem1.title, 'Felpa Oversized Grigia');
  assert.equal(restoredItem1.priceCny, 250);
  assert.equal(restoredItem1.imageUrls?.length, 3);
  assert.equal(restoredItem1.imageUrls?.[1], 'data:image/jpeg;base64,mockBase64String123');
});

test('validateHaulBackup also supports raw state objects', () => {
  const rawState = {
    orders: mockOrders,
    items: mockItems,
  };
  const result = validateHaulBackup(rawState);

  assert.equal(result.valid, true);
  assert.equal(result.stats?.totalOrders, 2);
  assert.equal(result.stats?.totalItems, 2);
  assert.equal(result.stats?.totalPhotos, 4);
});

test('validateHaulBackup rejects invalid payloads with clear English error messages', () => {
  const invalid1 = validateHaulBackup(null);
  assert.equal(invalid1.valid, false);
  assert.match(invalid1.error || '', /valid JSON/);

  const invalid2 = validateHaulBackup({ foo: 'bar' });
  assert.equal(invalid2.valid, false);
  assert.match(invalid2.error || '', /orders/);

  const invalid3 = validateHaulBackup({ orders: [{ id: '1' }], items: [] });
  assert.equal(invalid3.valid, false);
  assert.match(invalid3.error || '', /title/);
});

test('createHaulBackup and validateHaulBackup preserve savedItems 1:1', () => {
  const mockSaved: ProductItem[] = [
    {
      id: 'saved-test-1',
      orderId: 'saved',
      title: 'Cappellino Wool Navy',
      category: 'Cappellini',
      categoryConfidence: 'manuale',
      needsCategoryConfirmation: false,
      priceCny: 98,
      link: '',
      platform: 'altro',
      vendor: 'TheWave',
      sizeNote: 'OS',
      imageUrl: 'https://example.com/cap.jpg',
      createdAt: '2026-11-12T10:00:00.000Z',
      savedAt: '2026-11-12T10:00:00.000Z',
    },
  ];

  const backup = createHaulBackup(mockOrders, mockItems, mockSaved);
  assert.equal(backup.stats.savedItemsCount, 1);
  assert.equal(backup.stats.totalPhotos, 5);
  assert.equal(backup.savedItems?.length, 1);

  const restored = validateHaulBackup(backup);
  assert.equal(restored.valid, true);
  assert.equal(restored.stats?.savedItemsCount, 1);
  assert.equal(restored.stats?.totalPhotos, 5);
  assert.equal(restored.state?.savedItems?.length, 1);
  assert.equal(restored.state?.savedItems?.[0].title, 'Cappellino Wool Navy');
  assert.equal(restored.state?.savedItems?.[0].orderId, 'saved');
});

test('normalizeLegacyCategory maps legacy aliases and preserves canonical categories', () => {
  assert.equal(normalizeLegacyCategory('Giacca'), 'Giubbini');
  assert.equal(normalizeLegacyCategory('piumino'), 'Giubbini');
  assert.equal(normalizeLegacyCategory('bomber'), 'Giubbini');
  assert.equal(normalizeLegacyCategory('T-Shirt'), 'Maglietta');
  assert.equal(normalizeLegacyCategory('Borsa'), 'Borse');
  assert.equal(normalizeLegacyCategory('zaino'), 'Borse');
  assert.equal(normalizeLegacyCategory('tote'), 'Borse');
  assert.equal(normalizeLegacyCategory('Cintura'), 'Cinture');
  assert.equal(normalizeLegacyCategory('belt'), 'Cinture');
  assert.equal(normalizeLegacyCategory('Cappello'), 'Cappellini');
  assert.equal(normalizeLegacyCategory('beanie'), 'Cappellini');
  assert.equal(normalizeLegacyCategory('berretto'), 'Cappellini');
  assert.equal(normalizeLegacyCategory('Maglia da calcio'), 'Maglietta da calcio');
  assert.equal(normalizeLegacyCategory('Categoria Sconosciuta'), 'Accessori');
});

test('validateHaulBackup normalizes legacy v0 JSON with numeric IDs, string prices, legacy categories, and orphaned orderId', () => {
  const legacyPayload = {
    state: {
      orders: [
        {
          id: 101,
          title: '  Legacy Haul Ottobre  ',
          status: 'aperto',
          exchangeRate: '0,135',
        },
        {
          id: ' 102 ',
          title: 'Vecchio Concluso',
          status: 'closed',
        },
      ],
      items: [
        {
          id: 5001,
          orderId: ' 101 ',
          title: 'Puffer Jacket Black',
          category: 'Giacca',
          priceCny: '320,50',
          vendor: 'TopStoney',
          link: 'https://topstoney.x.yupoo.com/albums/1',
        },
        {
          id: 5002,
          orderId: 'missing-legacy-order',
          title: 'Orphaned Tee',
          category: 't-shirt',
          priceCny: '115',
          vendor: 'UnionKingdom',
        },
      ],
    },
  };

  const result = validateHaulBackup(legacyPayload);
  assert.equal(result.valid, true);
  assert.ok(result.state);
  assert.deepEqual(result.state?.savedItems, []);
  assert.equal(result.state?.orders[0].id, '101');
  assert.equal(result.state?.orders[0].status, 'open');
  assert.equal(result.state?.orders[0].exchangeRate, 0.135);
  assert.equal(result.state?.orders[1].id, '102');
  assert.equal(result.state?.orders[1].status, 'concluded');

  const item1 = result.state?.items.find((it) => it.id === '5001')!;
  assert.equal(item1.orderId, '101');
  assert.equal(item1.category, 'Giubbini');
  assert.equal(item1.priceCny, 320.5);
  assert.equal(item1.platform, 'yupoo');

  const orphan = result.state?.items.find((it) => it.id === '5002')!;
  assert.equal(orphan.orderId, '101');
  assert.equal(orphan.category, 'Maglietta');
  assert.equal(orphan.priceCny, 115);
  assert.equal(orphan.platform, 'altro');
});


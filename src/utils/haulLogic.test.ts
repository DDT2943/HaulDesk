import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areAllVisibleSelected,
  buildExternalTrackingUrls,
  calculateOrderTotals,
  canModifyOrder,
  cnyToEur,
  convertCnyToCurrency,
  convertEurToCurrency,
  createHaulBackup,
  detectCarrierFromTrackingNumber,
  detectPlatformFromUrl,
  extractVendorHintFromUrl,
  filterItems,
  formatCurrency,
  formatExchangeRateLabel,
  generateHaulCsv,
  getCurrenciesWithEstimatedRate,
  getItemImages,
  getTrackingStepIndex,
  groupItemsByVendor,
  summarizeSelectedItems,
  toggleSelectAllVisible,
  toggleSelectionId,
  TRACKING_MILESTONES,
  validateHaulBackup,
  validateOrderTitle,
  validateProductDraft,
} from './haulLogic';
import { HaulOrder, PRODUCT_CATEGORIES, ProductItem } from '../types/haul';

const sampleItems: ProductItem[] = [
  {
    id: '1',
    orderId: 'ord-1',
    title: 'Felpa Boxy Antracite',
    category: 'Felpa',
    categoryConfidence: 'alta',
    needsCategoryConfirmation: false,
    priceCny: 260,
    link: 'https://topstoney.x.yupoo.com/albums/123',
    platform: 'yupoo',
    vendor: 'TopStoney',
    sizeNote: 'L',
    imageUrl: '',
    createdAt: '2026-11-10T10:00:00Z',
  },
  {
    id: '2',
    orderId: 'ord-1',
    title: 'Pantaloni Cargo Oliva',
    category: 'Pantaloni',
    categoryConfidence: 'alta',
    needsCategoryConfirmation: false,
    priceCny: 220,
    link: 'https://item.taobao.com/item.htm?id=999',
    platform: 'taobao',
    vendor: 'TopStoney',
    sizeNote: '32',
    imageUrl: '',
    createdAt: '2026-11-10T11:00:00Z',
  },
  {
    id: '3',
    orderId: 'ord-1',
    title: 'Maglia Calcio Retro',
    category: 'Maglietta da calcio',
    categoryConfidence: 'alta',
    needsCategoryConfirmation: false,
    priceCny: 95,
    link: 'https://aaaajersey.x.yupoo.com/albums/456',
    platform: 'yupoo',
    vendor: 'AAAAJersey',
    sizeNote: 'M',
    imageUrl: '',
    createdAt: '2026-11-10T12:00:00Z',
  },
];

test('detectPlatformFromUrl identifies Yupoo, Taobao, Weidian, Superbuy', () => {
  assert.equal(detectPlatformFromUrl('https://husky-reps.x.yupoo.com/albums/1'), 'yupoo');
  assert.equal(detectPlatformFromUrl('https://item.taobao.com/item.htm?id=555'), 'taobao');
  assert.equal(detectPlatformFromUrl('https://weidian.com/item.html?itemID=12'), 'weidian');
  assert.equal(detectPlatformFromUrl('https://www.superbuy.com/en/page/buy/?url=abc'), 'superbuy');
  assert.equal(detectPlatformFromUrl('https://example.com/product'), 'altro');
});

test('extractVendorHintFromUrl extracts formatted Yupoo vendor subdomain', () => {
  assert.equal(extractVendorHintFromUrl('https://husky-reps.x.yupoo.com/albums/1'), 'Husky Reps');
  assert.equal(extractVendorHintFromUrl('https://topstoney.x.yupoo.com'), 'Topstoney');
  assert.equal(extractVendorHintFromUrl('https://item.taobao.com/item.htm?id=1'), null);
});

test('cnyToEur converts accurately with custom and default rate', () => {
  assert.equal(cnyToEur(100, 0.13), 13);
  assert.equal(cnyToEur(260, 0.13), 33.8);
  assert.equal(cnyToEur(-10, 0.13), 0);
});

test('groupItemsByVendor aggregates counts and subtotals sorted by spend', () => {
  const groups = groupItemsByVendor(sampleItems, 0.13);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].vendor, 'TopStoney');
  assert.equal(groups[0].itemCount, 2);
  assert.equal(groups[0].totalCny, 480);
  assert.equal(groups[0].totalEur, 62.4);
  assert.deepEqual(groups[0].platforms, ['yupoo', 'taobao']);

  assert.equal(groups[1].vendor, 'AAAAJersey');
  assert.equal(groups[1].totalCny, 95);
});

test('calculateOrderTotals computes totals and all 10 category slices', () => {
  const metrics = calculateOrderTotals(sampleItems, 0.13);
  assert.equal(metrics.itemCount, 3);
  assert.equal(metrics.totalCny, 575);
  assert.equal(metrics.uniqueVendors, 2);
  assert.equal(metrics.byCategory.length, PRODUCT_CATEGORIES.length);
  assert.equal(metrics.byCategory.length, 10);
  const felpaSlice = metrics.byCategory.find((c) => c.category === 'Felpa');
  assert.equal(felpaSlice?.count, 1);
  assert.equal(felpaSlice?.totalCny, 260);
});

test('canModifyOrder strictly restricts edits to open orders', () => {
  const openOrder: HaulOrder = {
    id: 'o1',
    title: 'Haul 1',
    status: 'open',
    createdAt: '2026-11-10T10:00:00Z',
    concludedAt: null,
    agentNote: '',
    exchangeRate: 0.13,
  };
  const closedOrder: HaulOrder = { ...openOrder, status: 'concluded', concludedAt: '2026-11-11T10:00:00Z' };
  assert.equal(canModifyOrder(openOrder), true);
  assert.equal(canModifyOrder(closedOrder), false);
  assert.equal(canModifyOrder(null), false);
});

test('validateProductDraft rejects empty required fields without silent defaults', () => {
  const bad = validateProductDraft({
    orderId: 'o1',
    title: '',
    category: '',
    priceCny: '0',
    link: 'not-a-url',
    vendor: '',
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.title);
  assert.ok(bad.errors.category);
  assert.ok(bad.errors.priceCny);
  assert.ok(bad.errors.link);
  assert.ok(bad.errors.vendor);

  const good = validateProductDraft({
    orderId: 'o1',
    title: 'Runner Grigie',
    category: 'Scarpe',
    priceCny: '320',
    link: 'https://item.taobao.com/item.htm?id=123',
    vendor: 'WWTOP',
  });
  assert.equal(good.valid, true);

  const goodWithoutLink = validateProductDraft({
    orderId: 'saved',
    title: 'Puffer Nero',
    category: 'Giubbini',
    priceCny: '420',
    link: '',
    vendor: 'Husky',
  });
  assert.equal(goodWithoutLink.valid, true);
});

import {
  calculateSuperbuyQuotes,
  calculateVolumetricWeightG,
  CATEGORY_ESTIMATED_WEIGHT_G,
  estimateParcelFromItems,
  PACKAGING_BOX_WEIGHT_G,
} from './shippingCalculator';

test('filterItems and validateOrderTitle behave deterministically', () => {
  assert.equal(filterItems(sampleItems, { category: 'Maglietta da calcio' }).length, 1);
  assert.equal(filterItems(sampleItems, { search: 'cargo' }).length, 1);
  assert.equal(filterItems(sampleItems, { vendor: 'TopStoney' }).length, 2);
  assert.ok(validateOrderTitle(''));
  assert.equal(validateOrderTitle('Haul Novembre #04'), null);
});

test('calculateVolumetricWeightG uses Superbuy L*W*H/6000 formula in grams', () => {
  assert.equal(calculateVolumetricWeightG(40, 30, 20, 6000), 4000);
  assert.equal(calculateVolumetricWeightG(30, 20, 15, 6000), 1500);
});

test('estimateParcelFromItems sums category weights including new categories and custom overrides', () => {
  const withShoes: ProductItem[] = [
    ...sampleItems,
    {
      ...sampleItems[0],
      id: '4',
      category: 'Scarpe',
    },
  ];
  const noBoxes = estimateParcelFromItems(withShoes, true);
  const withBoxes = estimateParcelFromItems(withShoes, false);
  assert.equal(noBoxes.shoesCount, 1);
  assert.ok(withBoxes.actualWeightG > noBoxes.actualWeightG);

  const newCatItems: ProductItem[] = [
    { ...sampleItems[0], id: 'n1', category: 'Giubbini' },
    { ...sampleItems[0], id: 'n2', category: 'Borse' },
    { ...sampleItems[0], id: 'n3', category: 'Cappellini' },
    { ...sampleItems[0], id: 'n4', category: 'Cinture' },
  ];
  const defaultNewCatEst = estimateParcelFromItems(newCatItems, true);
  const expectedDefaultWeight =
    CATEGORY_ESTIMATED_WEIGHT_G.Giubbini +
    CATEGORY_ESTIMATED_WEIGHT_G.Borse +
    CATEGORY_ESTIMATED_WEIGHT_G.Cappellini +
    CATEGORY_ESTIMATED_WEIGHT_G.Cinture +
    PACKAGING_BOX_WEIGHT_G;
  assert.equal(defaultNewCatEst.actualWeightG, expectedDefaultWeight);

  const customEst = estimateParcelFromItems(newCatItems, true, {
    Giubbini: 1400,
    Cappellini: 200,
  });
  assert.equal(customEst.actualWeightG, expectedDefaultWeight + (1400 - 1150) + (200 - 140));
});

test('calculateSuperbuyQuotes computes first+continued+customs and enforces EUB 2kg & brand limits', () => {
  const quotesHeavyBrand = calculateSuperbuyQuotes({
    weightG: 3000,
    lengthCm: 35,
    widthCm: 25,
    heightCm: 20,
    goodsCategory: 'international_brand',
    exchangeRate: 0.13,
  });

  const dutyFreeB = quotesHeavyBrand.find((q) => q.line.id === 'eu-duty-free-air-b');
  assert.ok(dutyFreeB && dutyFreeB.available);
  // 3000g: max(3000, ceil(35*25*20/6000*1000)=2917) = 3000g -> 500g (138) + 5*500g (5*54=270) + 12 = 420 CNY
  assert.equal(dutyFreeB.totalCny, 420);
  assert.equal(dutyFreeB.totalEur, 54.6);

  const eub = quotesHeavyBrand.find((q) => q.line.id === 'eub-small-parcel');
  assert.equal(eub?.available, false);

  const sal = quotesHeavyBrand.find((q) => q.line.id === 'china-post-sal');
  assert.equal(sal?.available, false);
});

test('tracking milestone index and external tracking links behave deterministically', () => {
  assert.equal(TRACKING_MILESTONES.length, 6);
  assert.equal(getTrackingStepIndex('in_preparazione'), 0);
  assert.equal(getTrackingStepIndex('dogana_ue'), 3);
  assert.equal(getTrackingStepIndex('consegnato'), 5);
  assert.equal(getTrackingStepIndex(undefined), 0);

  const urls = buildExternalTrackingUrls(' LD849201945CN ');
  assert.equal(urls.seventeenTrack, 'https://t.17track.net/en#nums=LD849201945CN');
  assert.equal(urls.parcelsApp, 'https://parcelsapp.com/en/tracking/LD849201945CN');
  assert.ok(urls.cainiao.includes('LD849201945CN'));
});

test('getItemImages merges, deduplicates, and preserves cover photo first', () => {
  assert.deepEqual(
    getItemImages({ imageUrl: 'a.jpg', imageUrls: ['b.jpg', 'a.jpg', 'c.jpg'] }),
    ['a.jpg', 'b.jpg', 'c.jpg']
  );
  assert.deepEqual(getItemImages({ imageUrl: '', imageUrls: ['x.jpg'] }), ['x.jpg']);
  assert.deepEqual(getItemImages({ imageUrl: '' }), []);
});

test('detectCarrierFromTrackingNumber identifies courier lines', () => {
  assert.equal(detectCarrierFromTrackingNumber('YT26318940123'), 'YunExpress / DHL Europe');
  assert.equal(detectCarrierFromTrackingNumber('LD849201945CN'), 'China Post / ePacket / EMS');
  assert.equal(detectCarrierFromTrackingNumber('LP0067123456'), 'Cainiao Global');
});

test('generateHaulCsv produces BOM UTF-8 RFC-4180 CSV with EUR and CNY values', () => {
  const order: HaulOrder = {
    id: 'ord-1',
    title: 'Haul "Inverno", #01',
    status: 'concluded',
    createdAt: '2026-11-10T10:00:00Z',
    concludedAt: '2026-11-12T10:00:00Z',
    agentNote: 'Superbuy',
    exchangeRate: 0.13,
    trackingNumber: 'YT26318940123',
    shippingLine: 'Europe Duty-Free',
    trackingStatus: 'in_transito',
  };
  const csv = generateHaulCsv([order], sampleItems);
  assert.ok(csv.startsWith('\uFEFFOrder,Order Status'));
  assert.ok(csv.includes('"Haul ""Inverno"", #01"'));
  assert.ok(csv.includes('260.00,33.80'));
  assert.ok(csv.includes('YT26318940123'));
});

test('global currency conversion and formatting helpers work for EUR, USD, GBP, JPY, and CNY', () => {
  assert.equal(convertEurToCurrency(100, 'EUR'), 100);
  assert.equal(convertEurToCurrency(92, 'USD'), 100);
  assert.equal(convertEurToCurrency(92, 'GBP'), 79);
  assert.equal(convertEurToCurrency(92, 'JPY'), 15020);
  assert.equal(convertCnyToCurrency(200, 0.13, 'CNY'), 200);
  assert.equal(convertCnyToCurrency(100, 0.13, 'EUR'), 13);
  assert.equal(convertCnyToCurrency(100, 0.13, 'USD'), 14.13);

  assert.equal(formatCurrency(78.65, 'EUR'), '€78.65');
  assert.equal(formatCurrency(85.49, 'USD'), '$85.49');
  assert.equal(formatCurrency(12500, 'JPY'), 'JP¥12,500');

  assert.equal(formatExchangeRateLabel(0.13, 'EUR'), '1 ¥ = €0.13');
  assert.equal(formatExchangeRateLabel(0.13, 'USD'), '1 ¥ = $0.14');
  assert.equal(formatExchangeRateLabel(0.13, 'CNY'), '1 ¥ = ¥1.00');
});

test('bulk selection helpers toggle individual, visible-all, and summarize totals accurately', () => {
  let selected = toggleSelectionId([], '1');
  assert.deepEqual(selected, ['1']);
  selected = toggleSelectionId(selected, '2');
  assert.deepEqual(selected, ['1', '2']);
  selected = toggleSelectionId(selected, '1');
  assert.deepEqual(selected, ['2']);

  assert.equal(areAllVisibleSelected(['2'], ['1', '2']), false);
  selected = toggleSelectAllVisible(['2'], ['1', '2']);
  assert.deepEqual(selected, ['2', '1']);
  assert.equal(areAllVisibleSelected(selected, ['1', '2']), true);

  // Toggling again when all visible are selected removes only visible IDs while preserving others
  const withHidden = ['other-id', '1', '2'];
  assert.deepEqual(toggleSelectAllVisible(withHidden, ['1', '2']), ['other-id']);

  const summary = summarizeSelectedItems(sampleItems, ['1', '2'], 0.13);
  assert.equal(summary.count, 2);
  assert.equal(summary.totalCny, 480);
  assert.equal(summary.totalEur, 62.4);
});

test('groupItemsByVendor calculates averageRating only when rated items exist', () => {
  const ratedItems: ProductItem[] = [
    { ...sampleItems[0], rating: 5 },
    { ...sampleItems[1], rating: 4 },
    { ...sampleItems[2] }, // unrated
  ];
  const groups = groupItemsByVendor(ratedItems, 0.13);
  const topStoney = groups.find((g) => g.vendor === 'TopStoney');
  const aaaaJersey = groups.find((g) => g.vendor === 'AAAAJersey');

  assert.equal(topStoney?.averageRating, 4.5);
  assert.equal(topStoney?.ratedItemCount, 2);
  assert.equal(aaaaJersey?.averageRating, null);
  assert.equal(aaaaJersey?.ratedItemCount, 0);
});

test('formatExchangeRateLabel preserves custom conversion rate precision up to 4 decimals', () => {
  assert.equal(formatExchangeRateLabel(0.13, 'EUR'), '1 ¥ = €0.13');
  assert.equal(formatExchangeRateLabel(0.135, 'EUR'), '1 ¥ = €0.135');
  assert.equal(formatExchangeRateLabel(0.1275, 'EUR'), '1 ¥ = €0.1275');
});

test('createHaulBackup and validateHaulBackup preserve valid item star ratings', () => {
  const order: HaulOrder = {
    id: 'ord-1',
    title: 'Test Order',
    status: 'concluded',
    createdAt: '2026-11-10T10:00:00Z',
    concludedAt: '2026-11-12T10:00:00Z',
    agentNote: '',
    exchangeRate: 0.135,
  };
  const items: ProductItem[] = [
    { ...sampleItems[0], rating: 5 },
    { ...sampleItems[1] },
  ];
  const backup = createHaulBackup([order], items, []);
  const validated = validateHaulBackup(backup);
  assert.equal(validated.valid, true);
  assert.equal(validated.state?.items[0].rating, 5);
  assert.equal(validated.state?.items[1].rating, undefined);
});

test('getCurrenciesWithEstimatedRate dynamically scales CNY to match target EUR rate', () => {
  const currencies = getCurrenciesWithEstimatedRate(0.16);
  const cny = currencies.find((c) => c.code === 'CNY')!;
  const eur = currencies.find((c) => c.code === 'EUR')!;
  assert.ok(cny);
  assert.ok(eur);
  const ratio = eur.ratePerUsd / cny.ratePerUsd;
  assert.equal(Math.round(ratio * 1000) / 1000, 0.16);
});

test('createHaulBackup and validateHaulBackup preserve global estimatedExchangeRate', () => {
  const order: HaulOrder = {
    id: 'ord-rate-1',
    title: 'Order Rate Test',
    status: 'open',
    createdAt: '2026-11-10T10:00:00Z',
    concludedAt: null,
    agentNote: '',
    exchangeRate: 0.155,
  };
  const backup = createHaulBackup([order], [], [], 0.155);
  assert.equal(backup.estimatedExchangeRate, 0.155);
  const validated = validateHaulBackup(backup);
  assert.equal(validated.valid, true);
  assert.equal(validated.state?.estimatedExchangeRate, 0.155);
});





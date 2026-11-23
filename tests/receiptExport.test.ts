import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptExportModel, sanitizeReceiptFilename } from '../src/utils/receiptExport.ts';
import type { HaulOrder, ProductItem } from '../src/types/haul.ts';

test('sanitizeReceiptFilename normalizes order titles safely', () => {
  assert.equal(sanitizeReceiptFilename('Haul Autunno #03'), 'receipt-haul-autunno-03.png');
  assert.equal(sanitizeReceiptFilename('Ordine Città & Café!'), 'receipt-ordine-citta-cafe.png');
  assert.equal(sanitizeReceiptFilename('   '), 'receipt-order.png');
});

test('buildReceiptExportModel prepares complete itemized receipt totals and shipping estimate', () => {
  const order: HaulOrder = {
    id: 'ord-1',
    title: 'Haul Autunno #03',
    status: 'concluded',
    createdAt: '2026-11-01T10:00:00.000Z',
    concludedAt: '2026-11-13T12:00:00.000Z',
    agentNote: '',
    exchangeRate: 0.13,
    trackingNumber: 'LD849201945CN',
    shippingLine: 'Europe Duty-Free Air Cargo-B',
  };

  const items: ProductItem[] = [
    {
      id: 'it-1',
      orderId: 'ord-1',
      title: 'Felpa Heavyweight',
      category: 'Felpa',
      categoryConfidence: 'alta',
      needsCategoryConfirmation: false,
      priceCny: 265,
      link: 'https://topstoney.x.yupoo.com/1',
      platform: 'yupoo',
      vendor: 'TopStoney',
      sizeNote: 'L',
      imageUrl: 'https://example.com/hoodie.jpg',
      createdAt: '2026-11-01T10:00:00.000Z',
    },
    {
      id: 'it-2',
      orderId: 'ord-1',
      title: 'Sneakers Suede',
      category: 'Scarpe',
      categoryConfidence: 'alta',
      needsCategoryConfirmation: false,
      priceCny: 340,
      link: 'https://weidian.com/2',
      platform: 'weidian',
      vendor: 'WWTOP',
      sizeNote: '43',
      imageUrl: 'https://example.com/sneakers.jpg',
      createdAt: '2026-11-02T10:00:00.000Z',
    },
  ];

  const model = buildReceiptExportModel(order, items);

  assert.equal(model.filename, 'receipt-haul-autunno-03.png');
  assert.equal(model.orderTitle, 'Haul Autunno #03');
  assert.equal(model.trackingNumber, 'LD849201945CN');
  assert.equal(model.itemCount, 2);
  assert.equal(model.uniqueVendors, 2);
  assert.equal(model.lines.length, 2);
  assert.equal(model.lines[0].subtitle, 'Hoodies & Knitwear · TopStoney · L');
  assert.equal(model.totalCnyLabel, '¥605');
  assert.equal(model.totalEurLabel, '€78.65');
  assert.ok(model.shippingEstimateLabel);
  assert.ok(model.grandTotalEurLabel);
});

test('buildReceiptExportModel handles empty concluded orders cleanly', () => {
  const emptyOrder: HaulOrder = {
    id: 'ord-empty',
    title: 'Ordine Vuoto',
    status: 'concluded',
    createdAt: '2026-11-01T10:00:00.000Z',
    concludedAt: '2026-11-02T10:00:00.000Z',
    agentNote: '',
    exchangeRate: 0.13,
  };

  const model = buildReceiptExportModel(emptyOrder, []);
  assert.equal(model.itemCount, 0);
  assert.equal(model.lines.length, 0);
  assert.equal(model.shippingEstimateLabel, null);
  assert.equal(model.grandTotalEurLabel, null);
});

test('buildReceiptExportModel converts receipt totals and rate when displayCurrency is USD', () => {
  const order: HaulOrder = {
    id: 'ord-usd',
    title: 'Haul USD #01',
    status: 'concluded',
    createdAt: '2026-11-01T10:00:00.000Z',
    concludedAt: '2026-11-13T12:00:00.000Z',
    agentNote: '',
    exchangeRate: 0.13,
  };
  const items: ProductItem[] = [
    {
      id: 'it-usd-1',
      orderId: 'ord-usd',
      title: 'Giacca Tecnica',
      category: 'Felpa',
      categoryConfidence: 'alta',
      needsCategoryConfirmation: false,
      priceCny: 200,
      link: 'https://example.com/1',
      platform: 'yupoo',
      vendor: 'TopStoney',
      sizeNote: 'L',
      imageUrl: '',
      createdAt: '2026-11-01T10:00:00.000Z',
    },
  ];

  const model = buildReceiptExportModel(order, items, 'USD');
  assert.ok(model.totalEurLabel.startsWith('$'));
  assert.ok(model.shippingEstimateLabel?.includes('$'));
  assert.ok(model.grandTotalEurLabel?.startsWith('$'));
  assert.equal(model.exchangeRateLabel, '1 ¥ = $0.14');
});

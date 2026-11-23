import { getCategoryLabel, type HaulOrder, type ProductItem } from '../types/haul';
import {
  calculateOrderTotals,
  convertCnyToCurrency,
  convertEurToCurrency,
  formatCny,
  formatCurrency,
  formatExchangeRateLabel,
  formatShortDate,
  type DisplayCurrencyCode,
} from './haulLogic';
import { calculateSuperbuyQuotes, estimateParcelFromItems } from './shippingCalculator';

export interface ReceiptExportLine {
  title: string;
  subtitle: string;
  priceCnyLabel: string;
  priceEurLabel: string;
}

export interface ReceiptExportModel {
  filename: string;
  orderTitle: string;
  closedDateLabel: string;
  trackingNumber: string;
  shippingLine: string;
  exchangeRateLabel: string;
  lines: ReceiptExportLine[];
  itemCount: number;
  uniqueVendors: number;
  totalCnyLabel: string;
  totalEurLabel: string;
  shippingEstimateLabel: string | null;
  grandTotalEurLabel: string | null;
}

export function sanitizeReceiptFilename(orderTitle: string): string {
  const slug = orderTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `receipt-${slug || 'order'}.png`;
}

export function buildReceiptExportModel(
  order: HaulOrder,
  items: ProductItem[],
  displayCurrency: DisplayCurrencyCode = 'EUR'
): ReceiptExportModel {
  const metrics = calculateOrderTotals(items, order.exchangeRate);
  const closedIso = order.concludedAt ?? order.createdAt ?? new Date().toISOString();
  const closedDateLabel = formatShortDate(closedIso);

  const lines: ReceiptExportLine[] = items.map((item) => ({
    title: item.title,
    subtitle: `${getCategoryLabel(item.category)} · ${item.vendor}${item.sizeNote ? ` · ${item.sizeNote}` : ''}`,
    priceCnyLabel: formatCny(item.priceCny),
    priceEurLabel: formatCurrency(
      convertCnyToCurrency(item.priceCny, order.exchangeRate, displayCurrency),
      displayCurrency
    ),
  }));

  let shippingEstimateLabel: string | null = null;
  let grandTotalEurLabel: string | null = null;

  if (items.length > 0) {
    const parcel = estimateParcelFromItems(items, true);
    const quotes = calculateSuperbuyQuotes({
      weightG: parcel.actualWeightG,
      lengthCm: parcel.lengthCm,
      widthCm: parcel.widthCm,
      heightCm: parcel.heightCm,
      goodsCategory: 'common_brand',
      exchangeRate: order.exchangeRate,
    });
    const recommended =
      quotes.find((q) => q.available && q.line.recommended) ??
      quotes.find((q) => q.available && q.line.taxIncluded) ??
      quotes.find((q) => q.available) ??
      null;

    if (recommended) {
      const convertedShip =
        displayCurrency === 'CNY'
          ? recommended.totalCny
          : convertEurToCurrency(recommended.totalEur, displayCurrency);
      const convertedTotal =
        displayCurrency === 'CNY'
          ? metrics.totalCny
          : convertEurToCurrency(metrics.totalEur, displayCurrency);
      shippingEstimateLabel = `${recommended.line.name} (~${parcel.actualWeightG.toLocaleString('en-US')} g): ${formatCurrency(convertedShip, displayCurrency)}`;
      grandTotalEurLabel = formatCurrency(convertedTotal + convertedShip, displayCurrency);
    }
  }

  const convertedMetricsTotal =
    displayCurrency === 'CNY'
      ? metrics.totalCny
      : convertEurToCurrency(metrics.totalEur, displayCurrency);

  return {
    filename: sanitizeReceiptFilename(order.title),
    orderTitle: order.title,
    closedDateLabel,
    trackingNumber: (order.trackingNumber ?? '').trim(),
    shippingLine: (order.shippingLine ?? '').trim(),
    exchangeRateLabel: formatExchangeRateLabel(order.exchangeRate, displayCurrency),
    lines,
    itemCount: metrics.itemCount,
    uniqueVendors: metrics.uniqueVendors,
    totalCnyLabel: formatCny(metrics.totalCny),
    totalEurLabel: formatCurrency(convertedMetricsTotal, displayCurrency),
    shippingEstimateLabel,
    grandTotalEurLabel,
  };
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

export function renderReceiptToPngDataUrl(
  order: HaulOrder,
  items: ProductItem[],
  displayCurrency: DisplayCurrencyCode = 'EUR'
): { dataUrl: string; filename: string } {
  const model = buildReceiptExportModel(order, items, displayCurrency);

  const scale = 2;
  const width = 420;
  const padX = 28;
  const contentWidth = width - padX * 2;
  const toothCount = 28;
  const toothHeight = 8;

  // Measure pass to compute dynamic canvas height
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) {
    throw new Error('Unable to initialize canvas graphics context for receipt export.');
  }

  mCtx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
  const wrappedTitles = model.lines.map((line) =>
    wrapCanvasText(mCtx, line.title, contentWidth - 96)
  );

  let estimatedHeight = 40; // top margin
  estimatedHeight += 86; // header block
  if (model.trackingNumber) estimatedHeight += 20;
  estimatedHeight += 24; // divider

  if (model.lines.length === 0) {
    estimatedHeight += 40;
  } else {
    for (const titleLines of wrappedTitles) {
      estimatedHeight += titleLines.length * 16 + 18 + 12;
    }
  }

  estimatedHeight += 24; // divider
  estimatedHeight += 84; // summary metadata + totals
  if (model.shippingEstimateLabel) estimatedHeight += 42;
  estimatedHeight += 96; // barcode + footer + serrated bottom + bottom padding

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = estimatedHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create receipt PNG image.');
  }

  ctx.scale(scale, scale);

  // Outer subtle slate backdrop
  ctx.fillStyle = '#EFEFEA';
  ctx.fillRect(0, 0, width, estimatedHeight);

  // Thermal receipt paper polygon with serrated bottom edge
  const paperTop = 16;
  const paperBottom = estimatedHeight - 16;
  const paperLeft = 14;
  const paperRight = width - 14;
  const paperW = paperRight - paperLeft;

  ctx.save();
  ctx.shadowColor = 'rgba(17, 17, 16, 0.14)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;

  ctx.beginPath();
  ctx.moveTo(paperLeft, paperTop);
  ctx.lineTo(paperRight, paperTop);
  ctx.lineTo(paperRight, paperBottom - toothHeight);

  const step = paperW / (toothCount * 2);
  for (let i = 0; i < toothCount * 2; i++) {
    const x = paperRight - (i + 1) * step;
    const y = i % 2 === 0 ? paperBottom : paperBottom - toothHeight;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  // Helper to draw dashed line
  const drawDashedRule = (yPos: number) => {
    ctx.save();
    ctx.strokeStyle = '#D6D6CF';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padX, yPos);
    ctx.lineTo(width - padX, yPos);
    ctx.stroke();
    ctx.restore();
  };

  let y = 46;

  // Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6E6E68';
  ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText('HAULDESK · SUPERBUY RECEIPT', width / 2, y);
  y += 22;

  ctx.fillStyle = '#111110';
  ctx.font = '700 16px "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(model.orderTitle, width / 2, y);
  y += 18;

  ctx.fillStyle = '#6E6E68';
  ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`Closed on ${model.closedDateLabel}`, width / 2, y);
  y += 16;

  if (model.trackingNumber) {
    ctx.fillStyle = '#111110';
    ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(`TRK: ${model.trackingNumber}`, width / 2, y);
    y += 18;
  }

  y += 6;
  drawDashedRule(y);
  y += 20;

  // Items
  if (model.lines.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6E6E68';
    ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('No items in this order.', width / 2, y + 6);
    y += 32;
  } else {
    model.lines.forEach((line, idx) => {
      const titleLines = wrappedTitles[idx];

      // Prices on right
      ctx.textAlign = 'right';
      ctx.fillStyle = '#111110';
      ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(line.priceCnyLabel, width - padX, y);

      ctx.fillStyle = '#6E6E68';
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(line.priceEurLabel, width - padX, y + 14);

      // Item title & subtitle on left
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111110';
      ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
      titleLines.forEach((tLine, lineIdx) => {
        ctx.fillText(tLine, padX, y + lineIdx * 15);
      });

      const subY = y + titleLines.length * 15;
      ctx.fillStyle = '#6E6E68';
      ctx.font = '400 10px "JetBrains Mono", ui-monospace, monospace';
      const subText =
        line.subtitle.length > 42 ? `${line.subtitle.slice(0, 39)}...` : line.subtitle;
      ctx.fillText(subText, padX, subY);

      y = subY + 18;
    });
  }

  drawDashedRule(y);
  y += 20;

  // Summary counts & exchange rate
  ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = '#6E6E68';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Items (${model.itemCount}) · ${model.uniqueVendors} ${model.uniqueVendors === 1 ? 'vendor' : 'vendors'}`,
    padX,
    y
  );
  ctx.textAlign = 'right';
  ctx.fillText(model.exchangeRateLabel, width - padX, y);
  y += 24;

  // Total
  ctx.textAlign = 'left';
  ctx.fillStyle = '#111110';
  ctx.font = '700 14px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText('ORDER TOTAL', padX, y);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#111110';
  ctx.font = '700 14px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(model.totalCnyLabel, width - padX, y);
  y += 16;

  ctx.fillStyle = '#E11D48';
  ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(model.totalEurLabel, width - padX, y);
  y += 20;

  if (model.shippingEstimateLabel && model.grandTotalEurLabel) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6E6E68';
    ctx.font = '400 10px "JetBrains Mono", ui-monospace, monospace';
    const shipLabel =
      model.shippingEstimateLabel.length > 52
        ? `${model.shippingEstimateLabel.slice(0, 49)}...`
        : model.shippingEstimateLabel;
    ctx.fillText(shipLabel, padX, y);
    y += 16;

    ctx.fillStyle = '#111110';
    ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('Est. Total (+ Shipping):', padX, y);
    ctx.textAlign = 'right';
    ctx.fillText(model.grandTotalEurLabel, width - padX, y);
    y += 18;
  }

  drawDashedRule(y);
  y += 18;

  // Decorative receipt barcode
  const barAreaW = 190;
  const barStartX = (width - barAreaW) / 2;
  ctx.fillStyle = '#111110';
  let cursor = barStartX;
  const seed = model.orderTitle.length + model.itemCount * 7;
  for (let i = 0; i < 36 && cursor < barStartX + barAreaW; i++) {
    const barW = ((seed + i * 5) % 3) + 1;
    const gap = ((seed + i * 3) % 3) + 2;
    ctx.fillRect(cursor, y, barW, 22);
    cursor += barW + gap;
  }
  y += 36;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8E8E87';
  ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText('* THANK YOU · READY TO SHIP *', width / 2, y);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    filename: model.filename,
  };
}

export function downloadOrderReceiptPng(
  order: HaulOrder,
  items: ProductItem[],
  displayCurrency: DisplayCurrencyCode = 'EUR'
): string {
  const { dataUrl, filename } = renderReceiptToPngDataUrl(order, items, displayCurrency);
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  return filename;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { removeBackgroundFromRgba } from './backgroundRemoval';

test('removeBackgroundFromRgba strips connected studio backdrop while preserving garment center and tight bbox', () => {
  const width = 20;
  const height = 20;
  const buf = new Uint8ClampedArray(width * height * 4);

  // Fill white background (248, 248, 248, 255)
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = 248;
    buf[i * 4 + 1] = 248;
    buf[i * 4 + 2] = 248;
    buf[i * 4 + 3] = 255;
  }

  // Draw a dark navy garment block in center x: 6..13, y: 5..14
  for (let y = 5; y <= 14; y++) {
    for (let x = 6; x <= 13; x++) {
      const idx = (y * width + x) * 4;
      buf[idx] = 24;
      buf[idx + 1] = 36;
      buf[idx + 2] = 72;
      buf[idx + 3] = 255;
    }
  }

  // Put an interior white logo pixel at (9, 9) that must NOT be erased by edge-seeded flood fill
  const logoIdx = (9 * width + 9) * 4;
  buf[logoIdx] = 250;
  buf[logoIdx + 1] = 250;
  buf[logoIdx + 2] = 250;
  buf[logoIdx + 3] = 255;

  const res = removeBackgroundFromRgba(buf, width, height, { tolerance: 36, feather: false });
  assert.equal(res.applied, true);
  // Corner should be transparent
  assert.equal(res.rgba[3], 0);
  // Garment interior should stay opaque
  assert.equal(res.rgba[(7 * width + 8) * 4 + 3], 255);
  // Interior white logo should stay opaque because it is enclosed by the garment
  assert.equal(res.rgba[logoIdx + 3], 255);
  assert.deepEqual(res.bbox, { minX: 6, minY: 5, maxX: 13, maxY: 14 });
});

test('removeBackgroundFromRgba safely aborts if entire frame is uniform color', () => {
  const width = 12;
  const height = 12;
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = 255;
    buf[i * 4 + 1] = 255;
    buf[i * 4 + 2] = 255;
    buf[i * 4 + 3] = 255;
  }
  const res = removeBackgroundFromRgba(buf, width, height);
  assert.equal(res.applied, false);
  assert.equal(res.rgba[3], 255);
});

test('removeBackgroundFromRgba preserves large enclosed interior pocket with background color', () => {
  const width = 24;
  const height = 24;
  const buf = new Uint8ClampedArray(width * height * 4);

  // Background light gray
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = 240;
    buf[i * 4 + 1] = 240;
    buf[i * 4 + 2] = 240;
    buf[i * 4 + 3] = 255;
  }

  // Large outer jacket x: 4..19, y: 4..19
  for (let y = 4; y <= 19; y++) {
    for (let x = 4; x <= 19; x++) {
      const idx = (y * width + x) * 4;
      buf[idx] = 30;
      buf[idx + 1] = 50;
      buf[idx + 2] = 90;
      buf[idx + 3] = 255;
    }
  }

  // Interior 3x3 white pocket matching background (240, 240, 240)
  for (let py = 10; py <= 12; py++) {
    for (let px = 10; px <= 12; px++) {
      const pIdx = (py * width + px) * 4;
      buf[pIdx] = 240;
      buf[pIdx + 1] = 240;
      buf[pIdx + 2] = 240;
      buf[pIdx + 3] = 255;
    }
  }

  const res = removeBackgroundFromRgba(buf, width, height, { tolerance: 40 });
  assert.equal(res.applied, true);

  // Outer corner should be transparent
  assert.equal(res.rgba[3], 0);

  // Interior pocket pixels must be 100% opaque due to morphological boundary protection
  for (let py = 10; py <= 12; py++) {
    for (let px = 10; px <= 12; px++) {
      const pIdx = (py * width + px) * 4;
      assert.equal(res.rgba[pIdx + 3], 255, `Pocket pixel at ${px},${py} should remain opaque`);
    }
  }
});


import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  applyUpscaledMaskToPng,
  buildSaliencyAlphaMask,
  removeBackgroundWithOnnx,
} from '../server/backgroundRemoval.ts';

test('buildSaliencyAlphaMask applies smooth S-curve thresholding cleanly', () => {
  const mask = buildSaliencyAlphaMask([0, 0.1, 0.45, 0.8, 1.0], 5);
  assert.equal(mask[0], 0);
  assert.equal(mask[1], 0);
  assert.ok(mask[2] > 100 && mask[2] < 160);
  assert.equal(mask[3], 255);
  assert.equal(mask[4], 255);
});

test('applyUpscaledMaskToPng preserves full-height mask alignment without 3-channel stride distortion', async () => {
  const width = 400;
  const height = 480;
  const maskSize = 320;

  // Create a uniform dark garment canvas
  const srcPng = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 28, g: 32, b: 44, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  // Foreground rectangle occupying middle 50% horizontally and rows 20%..85% vertically
  const maskSmall = Buffer.alloc(maskSize * maskSize);
  for (let y = 0; y < maskSize; y++) {
    for (let x = 0; x < maskSize; x++) {
      const inside = x >= 80 && x <= 240 && y >= 64 && y <= 272;
      maskSmall[y * maskSize + x] = inside ? 255 : 0;
    }
  }

  const outPng = await applyUpscaledMaskToPng(srcPng, width, height, maskSmall, maskSize);
  const { data, info } = await sharp(outPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  assert.equal(info.width, width);
  assert.equal(info.height, height);
  assert.equal(info.channels, 4);

  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];

  // Outer corners must be transparent
  assert.equal(alphaAt(10, 10), 0);
  assert.equal(alphaAt(width - 10, 10), 0);
  assert.equal(alphaAt(10, height - 10), 0);
  assert.equal(alphaAt(width - 10, height - 10), 0);

  // Upper, middle, and lower torso interior must ALL remain opaque (proves no 1/3 vertical squishing)
  assert.equal(alphaAt(200, 130), 255);
  assert.equal(alphaAt(200, 240), 255);
  assert.equal(alphaAt(200, 380), 255);
});

test('removeBackgroundWithOnnx rejects corrupted custom BG_REMOVAL_MODEL_PATH checksum', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hauldesk-model-test-'));
  const fakeModelPath = path.join(tmpDir, 'u2netp.onnx');
  const prevModelEnv = process.env.BG_REMOVAL_MODEL_PATH;
  const prevDisableEnv = process.env.DISABLE_AI_BG_REMOVAL;

  try {
    // Write > 1MB fake file with wrong SHA-256 checksum
    await fs.writeFile(fakeModelPath, Buffer.alloc(1_200_000, 0xaa));
    process.env.BG_REMOVAL_MODEL_PATH = fakeModelPath;
    delete process.env.DISABLE_AI_BG_REMOVAL;

    const samplePng = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 240, g: 240, b: 240 } },
    })
      .png()
      .toBuffer();

    await assert.rejects(
      () => removeBackgroundWithOnnx(samplePng),
      /SHA-256 verification/i
    );
  } finally {
    if (prevModelEnv === undefined) {
      delete process.env.BG_REMOVAL_MODEL_PATH;
    } else {
      process.env.BG_REMOVAL_MODEL_PATH = prevModelEnv;
    }
    if (prevDisableEnv === undefined) {
      delete process.env.DISABLE_AI_BG_REMOVAL;
    } else {
      process.env.DISABLE_AI_BG_REMOVAL = prevDisableEnv;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

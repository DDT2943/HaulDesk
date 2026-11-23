import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildZipArchive, crc32 } from '../src/utils/zipPackager';

test('crc32 computes standard IEEE 802.3 checksum', () => {
  assert.equal(crc32(Buffer.from('123456789', 'utf-8')), 0xcbf43926);
});

test('buildZipArchive produces valid ZIP/XPI with manifest.json at root', async () => {
  const manifest = await fs.readFile(
    path.resolve(process.cwd(), 'firefox-extension/manifest.json')
  );
  const parsedManifest = JSON.parse(manifest.toString('utf-8')) as {
    browser_specific_settings?: {
      gecko?: { data_collection_permissions?: { required?: string[] } };
    };
  };
  assert.deepEqual(
    parsedManifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
    ['none']
  );
  let popup: Buffer;
  try {
    popup = await fs.readFile(path.resolve(process.cwd(), 'firefox-extension/popup.html'));
  } catch {
    popup = await fs.readFile(path.resolve(process.cwd(), 'src/extension/popup.html'));
  }
  const icon = await fs.readFile(
    path.resolve(process.cwd(), 'firefox-extension/icons/icon.svg')
  );

  const archive = buildZipArchive([
    { name: 'manifest.json', data: manifest },
    { name: 'popup.html', data: popup },
    { name: 'icons/icon.svg', data: icon },
  ]);

  // Local file header signature PK\x03\x04
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  // EOCD signature PK\x05\x06 near end (last 22 bytes since comment length is 0)
  assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
  assert.equal(archive.readUInt16LE(archive.length - 12), 3); // 3 entries

  // Verify filenames are present without leading directory prefix
  assert.ok(archive.includes(Buffer.from('manifest.json', 'utf-8')));
  assert.ok(archive.includes(Buffer.from('popup.html', 'utf-8')));
  assert.ok(archive.includes(Buffer.from('icons/icon.svg', 'utf-8')));
});

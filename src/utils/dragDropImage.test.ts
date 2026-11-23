import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDroppedImageInput,
  extractImageUrlsFromHtml,
  isLikelyImageFile,
} from './dragDropImage';

test('isLikelyImageFile recognizes image MIME types and empty-MIME image filenames', () => {
  assert.equal(isLikelyImageFile({ type: 'image/png', name: 'qc.dat' }), true);
  assert.equal(isLikelyImageFile({ type: '', name: 'yupoo-hoodie.WEBP' }), true);
  assert.equal(isLikelyImageFile({ type: 'application/octet-stream', name: 'photo.jpg' }), true);
  assert.equal(isLikelyImageFile({ type: 'text/plain', name: 'notes.txt' }), false);
  assert.equal(isLikelyImageFile({ type: '', name: 'archive.zip' }), false);
});

test('extractImageUrlsFromHtml extracts and decodes img src attributes', () => {
  const html =
    '<meta charset="utf-8"><img src="https://photo.yupoo.com/seller/123.jpg?width=800&amp;q=90" alt="item">';
  assert.deepEqual(extractImageUrlsFromHtml(html), [
    'https://photo.yupoo.com/seller/123.jpg?width=800&q=90',
  ]);
});

test('extractDroppedImageInput extracts image files, items fallback, HTML img, and uri-list URLs', () => {
  const fakeFile = new File([new Uint8Array([1, 2, 3])], 'hoodie.png', { type: '' });
  const result = extractDroppedImageInput({
    files: [fakeFile],
    items: [],
    getData: (fmt) => {
      if (fmt === 'text/uri-list') {
        return '# comment\nhttps://example.com/jacket.webp\n';
      }
      if (fmt === 'text/html') {
        return '<img src="https://example.com/jacket.webp">';
      }
      return '';
    },
  });

  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, 'hoodie.png');
  assert.deepEqual(result.urls, ['https://example.com/jacket.webp']);
});

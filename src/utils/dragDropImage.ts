const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp|avif|svg)(\?|#|$)/i;

export interface DataTransferLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind?: string; type?: string; getAsFile?: () => File | null }> | null;
  getData?: (format: string) => string;
}

export function isLikelyImageFile(file: Pick<File, 'type' | 'name'>): boolean {
  const mime = (file.type ?? '').trim().toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (!mime || mime === 'application/octet-stream') {
    return IMAGE_EXT_REGEX.test((file.name ?? '').trim());
  }
  return false;
}

export function extractImageUrlsFromHtml(html: string): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = imgSrcRegex.exec(html)) !== null) {
    const raw = match[1]
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .trim();
    if (isSupportedImageUrl(raw)) {
      urls.push(raw);
    }
  }
  return Array.from(new Set(urls));
}

export function isSupportedImageUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^blob:/i.test(trimmed)) return true;
  return false;
}

export function extractDroppedImageInput(dt: DataTransferLike | null | undefined): {
  files: File[];
  urls: string[];
} {
  if (!dt) return { files: [], urls: [] };

  const files: File[] = [];
  const seenFileKeys = new Set<string>();
  const pushFile = (file: File | null | undefined) => {
    if (!file || !isLikelyImageFile(file)) return;
    const key = `${file.name}:${file.size}:${file.type}`;
    if (seenFileKeys.has(key)) return;
    seenFileKeys.add(key);
    files.push(file);
  };

  if (dt.files) {
    for (let i = 0; i < dt.files.length; i++) {
      pushFile(dt.files[i]);
    }
  }

  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item?.kind === 'file' && typeof item.getAsFile === 'function') {
        pushFile(item.getAsFile());
      }
    }
  }

  const urls: string[] = [];
  const seenUrls = new Set<string>();
  const pushUrl = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned || !isSupportedImageUrl(cleaned) || seenUrls.has(cleaned)) return;
    seenUrls.add(cleaned);
    urls.push(cleaned);
  };

  if (typeof dt.getData === 'function') {
    const html = dt.getData('text/html') ?? '';
    for (const u of extractImageUrlsFromHtml(html)) {
      pushUrl(u);
    }

    const uriList = dt.getData('text/uri-list') ?? '';
    for (const line of uriList.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      pushUrl(trimmed);
    }

    const plain = dt.getData('text/plain') ?? '';
    for (const line of plain.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && isSupportedImageUrl(trimmed)) {
        pushUrl(trimmed);
      }
    }
  }

  return { files, urls };
}

export async function resolveImageUrlsToBlobs(
  urls: string[],
  serverBaseUrl = ''
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  const normalizedBase = serverBaseUrl.replace(/\/+$/, '');

  for (const url of urls.slice(0, 8)) {
    try {
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) blobs.push(blob);
        }
        continue;
      }

      if (/^https?:\/\//i.test(url)) {
        const proxyUrl = `${normalizedBase}/api/proxy-image?url=${encodeURIComponent(url)}`;
        const proxied = await fetch(proxyUrl);
        if (proxied.ok) {
          const blob = await proxied.blob();
          if (blob.size > 0 && (!blob.type || blob.type.startsWith('image/'))) {
            blobs.push(blob);
            continue;
          }
        }

        // Fallback direct fetch if same-origin or CORS-enabled
        const direct = await fetch(url);
        if (direct.ok) {
          const blob = await direct.blob();
          if (blob.size > 0 && (!blob.type || blob.type.startsWith('image/'))) {
            blobs.push(blob);
          }
        }
      }
    } catch {
      // Skip unreachable URLs gracefully
    }
  }

  return blobs;
}

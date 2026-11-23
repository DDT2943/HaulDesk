import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import type { Response } from 'express';

/**
 * Checks if an IPv4 or IPv6 string is private, loopback, link-local, or otherwise reserved.
 */
export function isPrivateIpAddress(ip: string): boolean {
  const cleanIp = ip.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (cleanIp.startsWith('::ffff:')) {
    const embedded = cleanIp.slice(7);
    if (net.isIPv4(embedded)) {
      return isPrivateIpAddress(embedded);
    }
  }

  // IPv4 inspection
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return true;
    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (a === 10) return true;
    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local, including Cloud metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private network)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF protocol assignments)
    if (a === 192 && b === 0 && parts[2] === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved / Future use)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 inspection
  if (net.isIPv6(cleanIp)) {
    if (cleanIp === '::' || cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') return true;
    // Unique local addresses fc00::/7 (fc00... or fd00...)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;
    // Link-local unicast fe80::/10
    if (cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) return true;
    // Multicast ff00::/8
    if (cleanIp.startsWith('ff')) return true;

    return false;
  }

  // Unrecognized IP format: defensively treat as private/unsafe
  return true;
}

/**
 * Validates a remote URL against Server-Side Request Forgery (SSRF) threats.
 * Resolves the DNS record and verifies that NONE of the resolved IP addresses
 * belong to loopback, private RFC-1918, link-local (cloud metadata), or internal networks.
 */
export async function validateSafeRemoteUrl(rawUrl: string): Promise<{
  safe: boolean;
  url?: URL;
  error?: string;
}> {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed) {
    return { safe: false, error: 'Missing or empty URL.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { safe: false, error: 'Invalid image URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, error: 'Disallowed protocol. Use http:// or https://.' };
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    return { safe: false, error: 'Destination host is not allowed.' };
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) {
      return { safe: false, error: 'Private or local IP addresses are not allowed.' };
    }
  }

  // Resolve hostname via DNS to prevent DNS rebinding or domain mapping to private IPs
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { safe: false, error: 'Unable to resolve the image hostname.' };
    }

    for (const record of addresses) {
      if (isPrivateIpAddress(record.address)) {
        return {
          safe: false,
          error: 'The requested domain resolves to a disallowed private or local network address.',
        };
      }
    }
  } catch {
    return { safe: false, error: 'DNS resolution failed for remote domain.' };
  }

  return { safe: true, url: parsed };
}

/**
 * Canonicalizes and validates a requested asset path to prevent directory traversal.
 * Ensures the target file stays strictly inside the authorized directory.
 */
export function sanitizeSafeAssetPath(rawRelativePath: string, authorizedBaseDir: string): string | null {
  if (typeof rawRelativePath !== 'string' || !rawRelativePath.trim()) {
    return null;
  }

  // Block null-byte poisoning and traversal sequences
  if (rawRelativePath.includes('\0') || rawRelativePath.includes('..')) {
    return null;
  }

  // Disallow absolute paths from escaping authorized root
  if (path.isAbsolute(rawRelativePath) || rawRelativePath.startsWith('/') || rawRelativePath.startsWith('\\')) {
    return null;
  }

  const root = path.resolve(authorizedBaseDir);
  const resolved = path.resolve(root, rawRelativePath);

  if (!resolved.startsWith(root + path.sep)) {
    return null;
  }

  return resolved;
}

/**
 * Validates tracking number string to protect courier query endpoints from injection.
 */
export function validateTrackingNumberInput(raw: unknown): {
  valid: boolean;
  trackingNumber: string;
  error?: string;
} {
  if (typeof raw !== 'string') {
    return { valid: false, trackingNumber: '', error: 'Missing or invalid tracking number.' };
  }
  const clean = raw.trim().toUpperCase();
  if (!clean || clean.length < 6 || clean.length > 50) {
    return { valid: false, trackingNumber: clean, error: 'Tracking number must be between 6 and 50 characters.' };
  }
  // Allow alphanumeric characters, hyphens, and underscores only
  if (!/^[A-Z0-9\-_]+$/.test(clean)) {
    return { valid: false, trackingNumber: clean, error: 'Tracking number contains invalid characters.' };
  }
  return { valid: true, trackingNumber: clean };
}

/**
 * Applies defensive security headers to Express responses.
 */
export function applySecurityHeaders(res: Response): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export interface SafeRemoteFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  requireImageMime?: boolean;
  headers?: Record<string, string>;
  urlValidator?: typeof validateSafeRemoteUrl;
  fetchImpl?: typeof fetch;
}

export type SafeRemoteFetchResult =
  | {
      ok: true;
      buffer: Buffer;
      contentType: string;
      finalUrl: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches a remote resource safely with strict SSRF protection across ALL redirect hops.
 * Validates initial destination and every redirect Location header (protocol, hostname, DNS resolution,
 * private/loopback/metadata IP blocking) before issuing the follow-up request, while guarding against
 * redirect loops, excessive redirect chains, invalid MIME types, and oversized payloads.
 */
export async function fetchSafeRemoteBuffer(
  rawUrl: string,
  options: SafeRemoteFetchOptions = {}
): Promise<SafeRemoteFetchResult> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 4;
  const requireImageMime = options.requireImageMime ?? true;
  const validateUrl = options.urlValidator ?? validateSafeRemoteUrl;
  const fetchFn = options.fetchImpl ?? fetch;

  let currentRawUrl = rawUrl;
  const visitedUrls = new Set<string>();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await validateUrl(currentRawUrl);
    if (!check.safe || !check.url) {
      return {
        ok: false,
        status: 400,
        error: check.error || 'Image host is not allowed.',
      };
    }

    const normalizedHref = check.url.toString();
    if (visitedUrls.has(normalizedHref)) {
      return {
        ok: false,
        status: 400,
        error: 'Redirect loop detected while fetching resource.',
      };
    }
    visitedUrls.add(normalizedHref);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let upstream: globalThis.Response;
    try {
      upstream = await fetchFn(normalizedHref, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; HaulDesk/1.0)',
          ...(options.headers ?? {}),
        },
      });
    } catch {
      clearTimeout(timer);
      return {
        ok: false,
        status: 502,
        error: 'Network error while fetching remote image.',
      };
    }
    clearTimeout(timer);

    if (REDIRECT_STATUS_CODES.has(upstream.status)) {
      if (hop >= maxRedirects) {
        return {
          ok: false,
          status: 400,
          error: 'Too many consecutive redirects while fetching resource.',
        };
      }
      const locationHeader = upstream.headers.get('location')?.trim();
      if (!locationHeader) {
        return {
          ok: false,
          status: 502,
          error: 'Remote redirect missing a valid destination.',
        };
      }
      try {
        currentRawUrl = new URL(locationHeader, check.url).toString();
      } catch {
        return {
          ok: false,
          status: 400,
          error: 'Invalid redirect URL.',
        };
      }
      continue;
    }

    if (!upstream.ok) {
      return {
        ok: false,
        status: 502,
        error: 'Unable to fetch remote image.',
      };
    }

    const contentType = (upstream.headers.get('content-type') || 'application/octet-stream')
      .split(';')[0]
      .trim()
      .toLowerCase();

    if (requireImageMime && !contentType.startsWith('image/')) {
      return {
        ok: false,
        status: 400,
        error: 'The requested resource is not a valid image.',
      };
    }

    const contentLengthHeader = upstream.headers.get('content-length');
    if (contentLengthHeader) {
      const declaredLength = Number(contentLengthHeader);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        return {
          ok: false,
          status: 400,
          error: 'Image size exceeds the allowed limit.',
        };
      }
    }

    let arrayBuf: ArrayBuffer;
    try {
      arrayBuf = await upstream.arrayBuffer();
    } catch {
      return {
        ok: false,
        status: 502,
        error: 'Failed to read remote resource.',
      };
    }

    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > maxBytes) {
      return {
        ok: false,
        status: 400,
        error: 'Invalid image size or exceeds the allowed limit.',
      };
    }

    return {
      ok: true,
      buffer: Buffer.from(arrayBuf),
      contentType,
      finalUrl: normalizedHref,
    };
  }

  return {
    ok: false,
    status: 400,
    error: 'Too many consecutive redirects.',
  };
}

/**
 * Evaluates whether an incoming Origin header is permitted to access the HaulDesk API.
 * Allows:
 *  - No Origin header (same-origin GETs, curl, desktop native client)
 *  - Same host origin matching the HTTP Host header
 *  - Browser extension origins (moz-extension://, chrome-extension://, safari-web-extension://)
 *  - Local loopback dev origins (localhost / 127.0.0.1)
 *  - Configured APP_URL or comma-separated ALLOWED_ORIGINS
 */
export function resolveCorsOrigin(params: {
  origin?: string;
  host?: string;
  appUrl?: string;
  allowedOrigins?: string;
}): { allowed: boolean; allowOriginHeader: string | null } {
  const rawOrigin = params.origin?.trim();
  if (!rawOrigin) {
    return { allowed: true, allowOriginHeader: null };
  }

  // Allow browser extension contexts (Firefox / Chromium / Safari)
  if (
    rawOrigin.startsWith('moz-extension://') ||
    rawOrigin.startsWith('chrome-extension://') ||
    rawOrigin.startsWith('safari-web-extension://')
  ) {
    return { allowed: true, allowOriginHeader: rawOrigin };
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(rawOrigin);
  } catch {
    return { allowed: false, allowOriginHeader: null };
  }

  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    return { allowed: false, allowOriginHeader: null };
  }

  // Same-origin match against Host header
  const hostHeader = params.host?.trim().toLowerCase();
  if (hostHeader && parsedOrigin.host.toLowerCase() === hostHeader) {
    return { allowed: true, allowOriginHeader: rawOrigin };
  }

  // Local loopback access for desktop/dev setups
  const originHost = parsedOrigin.hostname.toLowerCase();
  if (originHost === 'localhost' || originHost === '127.0.0.1' || originHost === '[::1]') {
    return { allowed: true, allowOriginHeader: rawOrigin };
  }

  // Explicitly configured APP_URL
  if (params.appUrl?.trim()) {
    try {
      const parsedAppUrl = new URL(params.appUrl.trim());
      if (parsedAppUrl.origin.toLowerCase() === parsedOrigin.origin.toLowerCase()) {
        return { allowed: true, allowOriginHeader: rawOrigin };
      }
    } catch {
      // Ignore malformed APP_URL
    }
  }

  // Explicitly configured comma-separated ALLOWED_ORIGINS
  if (params.allowedOrigins?.trim()) {
    const allowedSet = params.allowedOrigins
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (allowedSet.includes(parsedOrigin.origin.toLowerCase())) {
      return { allowed: true, allowOriginHeader: rawOrigin };
    }
  }

  return { allowed: false, allowOriginHeader: null };
}

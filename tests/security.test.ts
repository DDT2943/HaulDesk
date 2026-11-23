import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  fetchSafeRemoteBuffer,
  isPrivateIpAddress,
  resolveCorsOrigin,
  sanitizeSafeAssetPath,
  validateSafeRemoteUrl,
  validateTrackingNumberInput,
} from '../server/security.ts';
import { removeBackgroundWithOnnx } from '../server/backgroundRemoval.ts';

test('isPrivateIpAddress correctly flags private, loopback, and cloud metadata IPv4 addresses', () => {
  // Loopback
  assert.equal(isPrivateIpAddress('127.0.0.1'), true);
  assert.equal(isPrivateIpAddress('127.255.255.254'), true);

  // RFC-1918 Private Ranges
  assert.equal(isPrivateIpAddress('10.0.0.1'), true);
  assert.equal(isPrivateIpAddress('10.254.12.3'), true);
  assert.equal(isPrivateIpAddress('172.16.0.1'), true);
  assert.equal(isPrivateIpAddress('172.31.255.255'), true);
  assert.equal(isPrivateIpAddress('192.168.0.1'), true);
  assert.equal(isPrivateIpAddress('192.168.178.55'), true);

  // Cloud Metadata / Link-Local
  assert.equal(isPrivateIpAddress('169.254.169.254'), true);
  assert.equal(isPrivateIpAddress('169.254.1.1'), true);

  // Current network & Multicast
  assert.equal(isPrivateIpAddress('0.0.0.0'), true);
  assert.equal(isPrivateIpAddress('224.0.0.1'), true);

  // Carrier-Grade NAT (100.64.0.0/10)
  assert.equal(isPrivateIpAddress('100.64.0.1'), true);
  assert.equal(isPrivateIpAddress('100.127.255.254'), true);

  // Public internet addresses must NOT be flagged
  assert.equal(isPrivateIpAddress('8.8.8.8'), false);
  assert.equal(isPrivateIpAddress('1.1.1.1'), false);
  assert.equal(isPrivateIpAddress('142.250.180.206'), false);
});

test('isPrivateIpAddress correctly flags private, loopback, and mapped IPv6 addresses', () => {
  // Loopback IPv6
  assert.equal(isPrivateIpAddress('::1'), true);

  // Unique local addresses (fc00::/7)
  assert.equal(isPrivateIpAddress('fc00::1'), true);
  assert.equal(isPrivateIpAddress('fd12:3456:789a::1'), true);

  // Link-local unicast (fe80::/10)
  assert.equal(isPrivateIpAddress('fe80::1'), true);

  // IPv4-mapped IPv6 containing loopback or private IPv4
  assert.equal(isPrivateIpAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateIpAddress('::ffff:169.254.169.254'), true);
  assert.equal(isPrivateIpAddress('::ffff:192.168.1.1'), true);
  assert.equal(isPrivateIpAddress('::ffff:8.8.8.8'), false);
});

test('validateSafeRemoteUrl rejects invalid protocols and private destinations', async () => {
  // Invalid protocol
  const ftpRes = await validateSafeRemoteUrl('ftp://example.com/photo.jpg');
  assert.equal(ftpRes.safe, false);

  const fileRes = await validateSafeRemoteUrl('file:///etc/passwd');
  assert.equal(fileRes.safe, false);

  // Blocked hosts
  const localRes = await validateSafeRemoteUrl('http://localhost:3000/api/state');
  assert.equal(localRes.safe, false);

  const metaRes = await validateSafeRemoteUrl('http://169.254.169.254/computeMetadata/v1/');
  assert.equal(metaRes.safe, false);

  const ipRes = await validateSafeRemoteUrl('http://127.0.0.1:8080/secret');
  assert.equal(ipRes.safe, false);

  const privRes = await validateSafeRemoteUrl('http://192.168.1.10/admin');
  assert.equal(privRes.safe, false);
});

test('fetchSafeRemoteBuffer blocks SSRF redirect hops to private/loopback/metadata destinations', async () => {
  const publicOnlyValidator = async (rawUrl: string) => {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.endsWith('public.example')) {
      return { safe: true, url: parsed };
    }
    return validateSafeRemoteUrl(rawUrl);
  };

  let fetchCount = 0;
  const loopbackRedirect = await fetchSafeRemoteBuffer('https://cdn.public.example/image.jpg', {
    urlValidator: publicOnlyValidator,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1:3000/api/state' },
      });
    },
  });
  assert.equal(loopbackRedirect.ok, false);
  assert.equal(loopbackRedirect.status, 400);
  assert.equal(fetchCount, 1);

  const metadataRedirect = await fetchSafeRemoteBuffer('https://cdn.public.example/image.jpg', {
    urlValidator: publicOnlyValidator,
    fetchImpl: async () =>
      new Response(null, {
        status: 301,
        headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
      }),
  });
  assert.equal(metadataRedirect.ok, false);
  assert.equal(metadataRedirect.status, 400);
});

test('fetchSafeRemoteBuffer prevents redirect loops, enforces maxRedirects, and validates MIME/size', async () => {
  const publicValidator = async (rawUrl: string) => ({
    safe: true,
    url: new URL(rawUrl),
  });

  // Loop detection: A -> B -> A
  const loopRes = await fetchSafeRemoteBuffer('https://a.example/img.png', {
    urlValidator: publicValidator,
    fetchImpl: async (input) => {
      const target = String(input);
      if (target.startsWith('https://a.example/')) {
        return new Response(null, { status: 302, headers: { Location: 'https://b.example/img.png' } });
      }
      return new Response(null, { status: 302, headers: { Location: 'https://a.example/img.png' } });
    },
  });
  assert.equal(loopRes.ok, false);
  assert.equal(loopRes.status, 400);

  // Max redirects enforcement
  let hopIdx = 0;
  const tooManyRes = await fetchSafeRemoteBuffer('https://hop0.example/img.png', {
    maxRedirects: 2,
    urlValidator: publicValidator,
    fetchImpl: async () => {
      hopIdx += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: `https://hop${hopIdx}.example/img.png` },
      });
    },
  });
  assert.equal(tooManyRes.ok, false);
  assert.equal(tooManyRes.status, 400);

  // Non-image MIME rejection
  const htmlRes = await fetchSafeRemoteBuffer('https://cdn.example/not-an-image', {
    urlValidator: publicValidator,
    fetchImpl: async () =>
      new Response('<html>nope</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
  });
  assert.equal(htmlRes.ok, false);
  assert.equal(htmlRes.status, 400);

  // Valid 2-hop public redirect returns image buffer and finalUrl
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const validRes = await fetchSafeRemoteBuffer('https://short.example/1', {
    urlValidator: publicValidator,
    fetchImpl: async (input) => {
      if (String(input) === 'https://short.example/1') {
        return new Response(null, { status: 302, headers: { Location: '/final/pic.png' } });
      }
      return new Response(pngBytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    },
  });
  assert.equal(validRes.ok, true);
  if (validRes.ok) {
    assert.equal(validRes.finalUrl, 'https://short.example/final/pic.png');
    assert.equal(validRes.contentType, 'image/png');
    assert.deepEqual(validRes.buffer, pngBytes);
  }
});

test('resolveCorsOrigin allows legitimate local, same-host, and Firefox extension origins while blocking untrusted sites', () => {
  // Same-origin / non-browser requests without Origin header
  assert.deepEqual(resolveCorsOrigin({ host: 'hauldesk.example' }), {
    allowed: true,
    allowOriginHeader: null,
  });

  // Firefox & Chrome extensions
  assert.deepEqual(
    resolveCorsOrigin({ origin: 'moz-extension://1234abcd-5678-90ef', host: 'hauldesk.example' }),
    { allowed: true, allowOriginHeader: 'moz-extension://1234abcd-5678-90ef' }
  );
  assert.deepEqual(
    resolveCorsOrigin({ origin: 'chrome-extension://abcdefghijklmnop', host: 'localhost:3000' }),
    { allowed: true, allowOriginHeader: 'chrome-extension://abcdefghijklmnop' }
  );

  // Local loopback & matching host
  assert.deepEqual(resolveCorsOrigin({ origin: 'http://localhost:3000', host: 'localhost:3000' }), {
    allowed: true,
    allowOriginHeader: 'http://localhost:3000',
  });
  assert.deepEqual(resolveCorsOrigin({ origin: 'https://hauldesk.home', host: 'hauldesk.home' }), {
    allowed: true,
    allowOriginHeader: 'https://hauldesk.home',
  });

  // Configured APP_URL & ALLOWED_ORIGINS
  assert.deepEqual(
    resolveCorsOrigin({
      origin: 'https://app.hauldesk.invalid',
      host: 'internal:3000',
      appUrl: 'https://app.hauldesk.invalid/dashboard',
    }),
    { allowed: true, allowOriginHeader: 'https://app.hauldesk.invalid' }
  );
  assert.deepEqual(
    resolveCorsOrigin({
      origin: 'https://companion.example.com',
      host: 'internal:3000',
      allowedOrigins: 'https://other.example.com, https://companion.example.com',
    }),
    { allowed: true, allowOriginHeader: 'https://companion.example.com' }
  );

  // Untrusted cross-site origins rejected
  assert.deepEqual(resolveCorsOrigin({ origin: 'https://evil.example', host: 'localhost:3000' }), {
    allowed: false,
    allowOriginHeader: null,
  });
  assert.deepEqual(resolveCorsOrigin({ origin: 'null', host: 'localhost:3000' }), {
    allowed: false,
    allowOriginHeader: null,
  });
});

test('removeBackgroundWithOnnx respects DISABLE_AI_BG_REMOVAL toggle', async () => {
  const prev = process.env.DISABLE_AI_BG_REMOVAL;
  process.env.DISABLE_AI_BG_REMOVAL = 'true';
  try {
    await assert.rejects(
      () => removeBackgroundWithOnnx(Buffer.from([1, 2, 3])),
      /disabled/i
    );
  } finally {
    if (prev === undefined) {
      delete process.env.DISABLE_AI_BG_REMOVAL;
    } else {
      process.env.DISABLE_AI_BG_REMOVAL = prev;
    }
  }
});

test('sanitizeSafeAssetPath prevents path traversal attacks', () => {
  const root = path.resolve(process.cwd(), 'public/assets');

  // Directory traversal escape attempts
  assert.equal(sanitizeSafeAssetPath('../../etc/passwd', root), null);
  assert.equal(sanitizeSafeAssetPath('../server.ts', root), null);
  assert.equal(sanitizeSafeAssetPath('..\\..\\windows\\system32', root), null);
  assert.equal(sanitizeSafeAssetPath('/etc/shadow', root), null);
  assert.equal(sanitizeSafeAssetPath('sub/../../../secret.env', root), null);

  // Null byte poison attempt
  assert.equal(sanitizeSafeAssetPath('safe.png\0.php', root), null);

  // Legitimate relative paths within bounds
  const valid = sanitizeSafeAssetPath('images/cover.jpg', root);
  assert.ok(valid);
  assert.ok(valid.startsWith(root + path.sep));
});

test('validateTrackingNumberInput rejects malicious inputs and validates standard formats', () => {
  // Valid courier tracking numbers
  assert.equal(validateTrackingNumberInput('LD849201945CN').valid, true);
  assert.equal(validateTrackingNumberInput('1Z9999999999999999').valid, true);
  assert.equal(validateTrackingNumberInput('YT24018294829').valid, true);

  // Dangerous injection or invalid characters
  assert.equal(validateTrackingNumberInput('TEST; rm -rf /').valid, false);
  assert.equal(validateTrackingNumberInput('<script>alert(1)</script>').valid, false);
  assert.equal(validateTrackingNumberInput("LD123' OR 1=1--").valid, false);
  assert.equal(validateTrackingNumberInput('   ').valid, false);
  assert.equal(validateTrackingNumberInput('123').valid, false); // too short
  assert.equal(validateTrackingNumberInput('A'.repeat(55)).valid, false); // too long
});


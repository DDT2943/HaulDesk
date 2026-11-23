# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in HaulDesk, please report it privately so maintainers can investigate and patch it before public disclosure.

### How to Report

- **GitHub Security Advisories (Preferred):** Open a private vulnerability report via the repository's **Security -> Advisories -> New draft security advisory** page (or private vulnerability reporting on the repository).
- **What to include:**
  - Clear description of the vulnerability and potential impact.
  - Step-by-step reproduction steps or minimal proof of concept.
  - Affected release version, endpoint, or OS target.

Please avoid posting unpatched exploits in public GitHub Issues or Reddit threads until a fix is available.

---

## Supported Versions

Only the current release branch receives security fixes:

| Version | Supported |
| --- | --- |
| `1.0.x` | Yes |
| `< 1.0.0` | No |

---

## Threat Model & Defensive Controls

HaulDesk is a local-first, single-user web and desktop application designed to run on localhost, inside Electron, or on a private self-hosted instance (e.g., Docker behind an authenticated reverse proxy).

1. **SSRF & Redirect-Hop Protection (`/api/proxy-image`, `/api/remove-background`)**:
   - Remote image fetches use `redirect: 'manual'` and validate **every hop** (`maxRedirects: 4`) before issuing follow-up requests.
   - URLs are restricted to `http:` and `https:`.
   - Hostnames are resolved via DNS prior to connecting; loopback (`127.0.0.0/8`, `::1`), RFC-1918 private subnets (`10/8`, `172.16/12`, `192.168/16`), CGNAT (`100.64/10`), link-local / cloud metadata IPs (`169.254.169.254`, `fe80::/10`, `metadata.google.internal`), and `.local` / `.internal` hostnames are blocked.
   - Redirect loops (`visitedUrls` tracking), non-`image/*` MIME responses, and payloads over 12 MB are rejected.
2. **Scoped CORS Policy (`/api/*`)**:
   - Requests without an `Origin` header (same-origin browser navigation, Electron desktop app, CLI requests) and same-host / loopback origins are permitted.
   - Browser extension origins (`moz-extension://`, `chrome-extension://`, `safari-web-extension://`) and explicitly configured `APP_URL` / `ALLOWED_ORIGINS` entries are allowed.
   - Untrusted cross-site origins are blocked from sending mutating API requests (`403`).
3. **Path Traversal Mitigation**:
   - Local static asset lookups are canonicalized and confined within the authorized directory; `..`, null bytes, and absolute paths are rejected.
4. **Input Sanitization**:
   - Tracking numbers are strictly validated (`^[A-Z0-9\-_]{6,50}$`) before querying external courier endpoints.
   - Order rates, item prices, ratings (`1-5`), categories, and backup payloads are validated server-side.
5. **Least-Privilege Firefox Extension Permissions**:
   - Only `storage`, `http://localhost/*`, and `http://127.0.0.1/*` are requested upfront; custom self-hosted domains trigger an optional runtime permission prompt (`optional_permissions`).
   - `data_collection_permissions.required` is declared as `["none"]`.
6. **Zero Telemetry & Local Storage**:
   - No analytics, tracking scripts, or third-party auth cookies. Data resides exclusively in `hauldesk-db.json` inside `DATA_DIR`.

---

## Important Deployment Note

HaulDesk has **no built-in multi-user login system**. If you expose a self-hosted instance to the public internet, put it behind an authenticated reverse proxy (e.g., Authelia, Cloudflare Access, Tailscale, or Nginx Basic Auth).

# Changelog

All notable changes to HaulDesk will be documented in this file.

## [1.0.0] — Initial Public Open-Source Release

### Features
- **English Interface:** Complete English UI across web dashboard, Firefox companion extension, printable receipts, CSV exports, and Electron desktop dialogs (additional language support planned for future releases).
- **Order Workspace:** Create open orders, switch between open and concluded hauls, adjust per-order and global CNY exchange rates, and view multi-currency totals (`EUR`, `USD`, `GBP`, `JPY`, `INR`, `CNY`).
- **Product Cataloging & Drag-and-Drop:** Add items with multi-photo galleries, cover selection, automatic platform detection (`Yupoo`, `Taobao`, `Weidian`, `1688`, `Superbuy`, external links), vendor auto-hints, category breakdown, and bulk multi-select actions.
- **Saved for Later & Trash Recovery:** Park wishlist/draft items outside active parcels and restore accidentally deleted orders or items from Trash.
- **Wardrobe & Flatlay Outfit Studio:** Review purchased items with 1–5 star ratings, aggregate vendor star averages, build custom flatlay outfits with drag-and-drop canvas positioning, and remove image backgrounds locally.
- **Shipping Estimator & Live Tracking:** Estimate parcel weights by garment category (including optional shoebox removal), compare estimated line quotes, track milestones manually, or sync supported carrier events.
- **Printable Order Receipts & Backups:** Generate itemized receipt previews, export/import full JSON backups (including legacy v0 migration), and export UTF-8 BOM CSV spreadsheets.
- **Firefox Quick-Add Companion Extension (`.xpi`):** 4-step popup/sidebar wizard supporting drag-and-drop, clipboard paste (`Ctrl+V`), custom server URLs, and least-privilege optional host permissions.
- **Standalone Desktop Builds & Docker Support:** Cross-platform Electron installers for Windows (`x64`), macOS (`arm64` + `x64`), and Linux (`x64`), plus `node:22-bookworm-slim` Docker deployment.

### Security & Licensing Hardening
- Replaced AGPL-3.0 background removal package with an MIT/Apache-2.0 pipeline (`onnxruntime-node` + `sharp` + on-demand SHA-256-verified `u2netp.onnx`), enabling clean **MIT** licensing and zero runtime `npm audit` vulnerabilities.
- Enforced multi-hop SSRF validation (`redirect: 'manual'`, DNS/private-IP checks per hop, loop prevention, 12 MB cap, MIME validation) and scoped CORS rules.
- Added automated unit tests covering backup validation, flatlay math, shipping quotes, extension packaging, SSRF redirect protection, and CORS origin rules.

# Third-Party Notices & License Inventory

HaulDesk is licensed under the **MIT License** (see [`LICENSE`](LICENSE)).  
Below is an accurate inventory of third-party packages, runtime weights, icon sets, and fonts used by the application and desktop builds.

---

## 1. Runtime Dependencies

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| `express` | `^4.21.2` | MIT | HTTP server, REST API, and static bundle serving |
| `dotenv` | `^17.2.3` | BSD-2-Clause | `.env` configuration loader |
| `onnxruntime-node` | `^1.31.1` | MIT | Local CPU inference runtime for outfit background removal |
| `sharp` | `^0.35.5` | Apache-2.0 | Server-side image normalization, mask resizing, alpha compositing, and auto-trimming |

---

## 2. Optional Downloaded Segmentation Weights

| Component | Source | License | How It Is Loaded |
| --- | --- | --- | --- |
| **U-2-Net Lightweight (`u2netp.onnx`)** | Xuebin Qin et al. (`danielgatis/rembg` `v0.0.0` release mirror, ~4.4 MB, SHA-256 verified) | Apache-2.0 | Downloaded lazily to `${DATA_DIR}/models/u2netp.onnx` only on first outfit background-removal request (unless `DISABLE_AI_BG_REMOVAL=true`). Never bundled inside the source tree. |

*Note:* Previously, an experimental build evaluated `@imgly/background-removal-node` (AGPL-3.0). It was permanently removed and replaced with the MIT/Apache-2.0 ONNX Runtime + Sharp + `u2netp.onnx` pipeline so the entire repository remains cleanly compatible with the MIT License and has zero runtime `npm audit` vulnerabilities.

---

## 3. Frontend & Build/Packaging Tooling (`devDependencies`)

| Package | Version | License | Role |
| --- | --- | --- | --- |
| `react` / `react-dom` | `^19.0.1` | MIT | Web & extension UI rendering |
| `lucide-react` | `^0.546.0` | ISC | Monochrome UI iconography |
| `motion` | `^12.23.24` | MIT | Micro-interactions & drawer transitions |
| `react-icons` | `^5.7.0` | MIT (wrapper) | Imports `Fa*` (Font Awesome 5 Free — icons CC BY 4.0, code MIT) and `Bi*` (BoxIcons — MIT) |
| `react-use-measure` | `^2.1.7` | MIT | Responsive element measurement |
| `vite` | `^8.3.0` | MIT | Frontend and Firefox extension bundler |
| `@vitejs/plugin-react` | `^6.1.1` | MIT | React Vite integration |
| `@tailwindcss/vite` / `tailwindcss` | `^4.3.3` | MIT | Utility CSS framework |
| `autoprefixer` | `^10.4.21` | MIT | CSS vendor prefixing |
| `esbuild` | `^0.25.0` | MIT | Standalone `dist/server.mjs` bundling |
| `typescript` | `^5.9.3` | Apache-2.0 | Static type checking |
| `tsx` | `^4.21.0` | MIT | TypeScript dev runner & Node test executor |
| `electron` | `^45.4.1` | MIT | Standalone desktop Chromium + Node shell |
| `electron-builder` | `^26.18.0` | MIT | Windows / macOS / Linux installer packaging |
| `@google/genai` | `^3.3.0` | Apache-2.0 | Optional SDK dependency reserved in devDependencies (`DISABLE_AI_ANALYSIS=true` by default) |

---

## 4. Web Fonts Loaded via CDN

| Font Family | License | Usage |
| --- | --- | --- |
| **DM Sans** | SIL Open Font License 1.1 | Primary UI typography |
| **Plus Jakarta Sans** | SIL Open Font License 1.1 | Headings and display titles |
| **JetBrains Mono** | SIL Open Font License 1.1 | Prices, weights, currency rates, and receipt numbers |

# Contributing to HaulDesk

Thank you for helping improve HaulDesk. Contributions—whether bug reports, documentation fixes, shipping rate updates, translations, or new features—are welcome.

## Ways to Contribute

- **Bug Reports:** Use the Bug Report issue template and include your OS, deployment mode (Desktop / Docker / Source), and reproduction steps.
- **Feature Requests:** Use the Feature Request issue template and explain the real-world haul workflow you are trying to improve.
- **Code & Documentation PRs:** Fork the repository, create a focused branch, and open a Pull Request against `main`.

## Local Development Setup

**Prerequisites:** Node.js 20.x or 22.x and `npm`.

```bash
git clone https://github.com/DDT2943/HaulDesk.git
cd HaulDesk
npm install --legacy-peer-deps
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

### Useful Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Express API + Vite dev middleware on port 3000 |
| `npm run lint` | Run TypeScript typechecking (`tsc --noEmit`) |
| `npm test` | Run all unit & security tests via `tsx --test` |
| `npm run build` | Build production frontend bundle (`dist/`) |
| `npm run pack:extension` | Build and package Firefox add-on (`dist-extension/hauldesk-quickadd.xpi`) |
| `npm run build:server` | Bundle production Node entrypoint (`dist/server.mjs`) |
| `npm run electron:build:linux` | Build standalone Linux `.AppImage` and `.deb` (on Linux) |

## Pull Request Guidelines

1. Keep changes focused and preserve existing functionality unless intentionally fixed/redesigned.
2. Put pure logic (parsing, calculations, validation, layout math) in `src/utils/` or `server/` with unit tests using `node:test`.
3. Never commit `.env`, `data/`, screenshots containing real personal tracking numbers/addresses, or private keys/certificates.
4. Make sure `npm run lint`, `npm test`, and `npm run build` pass before opening your PR.
5. Note clearly in the PR description if any part was AI-assisted and what you tested manually.

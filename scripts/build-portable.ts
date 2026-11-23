import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { buildZipArchive, type ZipEntryInput } from '../src/utils/zipPackager.ts';

const VERSION = '1.0.0';

async function collectFilesRecursively(dir: string, baseDir: string): Promise<ZipEntryInput[]> {
  const entries: ZipEntryInput[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  items.sort((a, b) => a.name.localeCompare(b.name));

  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...(await collectFilesRecursively(full, baseDir)));
    } else if (item.isFile()) {
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      const data = await fs.readFile(full);
      entries.push({ name: rel, data });
    }
  }
  return entries;
}

const WINDOWS_LAUNCHER = `@echo off
setlocal
cd /d "%~dp0"
echo ===================================================
echo   HaulDesk v${VERSION} — Starting Local Server
echo ===================================================
echo.
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required to run HaulDesk.
    echo Please install Node.js (version 20 or newer) from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

set NODE_ENV=production
set PORT=3000
set HOST=127.0.0.1
set DATA_DIR=data

if not exist data mkdir data

start "" http://localhost:3000
node dist/server.mjs
pause
`;

const LINUX_LAUNCHER = `#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==================================================="
echo "  HaulDesk v${VERSION} — Starting Local Server"
echo "==================================================="
echo ""

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is required to run HaulDesk."
    echo "Please install Node.js (version 20 or newer):"
    echo "https://nodejs.org/ or via your package manager."
    exit 1
fi

export NODE_ENV=production
export PORT=3000
export HOST=127.0.0.1
export DATA_DIR="data"

mkdir -p data

(sleep 1.2 && (xdg-open http://localhost:3000 2>/dev/null || sensible-browser http://localhost:3000 2>/dev/null || true)) &
exec node dist/server.mjs
`;

const MACOS_LAUNCHER = `#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==================================================="
echo "  HaulDesk v${VERSION} — Starting Local Server"
echo "==================================================="
echo ""

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is required to run HaulDesk."
    echo "Please install Node.js (version 20 or newer) from:"
    echo "https://nodejs.org/ or via Homebrew: brew install node"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

export NODE_ENV=production
export PORT=3000
export HOST=127.0.0.1
export DATA_DIR="data"

mkdir -p data

(sleep 1.2 && open http://localhost:3000) &
exec node dist/server.mjs
`;

const PORTABLE_README = `# HaulDesk v${VERSION} — Portable Node Edition

HaulDesk is an open-source catalog and manager for Superbuy and agent hauls.

## Requirements
- **Node.js**: Version 20.x or 22.x (Download from https://nodejs.org/)
  *(If you want a zero-dependency installer with no Node.js required, download the Electron desktop installer for Windows, macOS, or Linux from GitHub Releases.)*

## How to Run

### Windows
1. Double-click **\`start-windows.bat\`**.
2. Your browser will automatically open at \`http://localhost:3000\`.

### macOS
1. Double-click **\`start-macos.command\`**.
   *(If macOS blocks it on first run, right-click and select "Open", or run \`chmod +x start-macos.command\` in Terminal).*
2. Your browser will open at \`http://localhost:3000\`.

### Linux
1. Open a terminal in this directory.
2. Run:
   \`\`\`bash
   chmod +x start-linux.sh
   ./start-linux.sh
   \`\`\`
3. Open your browser at \`http://localhost:3000\`.

## Browser Extension (Firefox)
The included **\`hauldesk-quickadd.xpi\`** can be loaded into Firefox via \`about:debugging\` → "This Firefox" → "Load Temporary Add-on", or downloaded from \`http://localhost:3000/hauldesk-quickadd.xpi\` while the server is running.

## User Data & Backups
All orders, items, images, and trash are stored locally inside the \`data/\` folder.
You can back up your entire haul at any time from the top navigation bar by clicking **Export JSON**.
`;

async function main() {
  const root = process.cwd();
  const releaseDir = path.join(root, 'release');
  const stageDir = path.join(releaseDir, 'stage');
  const distDir = path.join(root, 'dist');
  const distExtensionDir = path.join(root, 'dist-extension');

  console.log(`[1/5] Building frontend Vite bundle...`);
  execSync('npm run build', { stdio: 'inherit' });

  console.log(`[2/5] Packaging Firefox extension...`);
  execSync('npm run pack:extension', { stdio: 'inherit' });

  console.log(`[3/5] Bundling standalone server via esbuild...`);
  execSync(
    'npx esbuild server.ts --bundle --platform=node --target=node22 --format=esm --packages=external --outfile=dist/server.mjs',
    { stdio: 'inherit' }
  );

  // Copy extension XPI into dist so the server serves it statically at /hauldesk-quickadd.xpi
  const xpiSource = path.join(distExtensionDir, 'hauldesk-quickadd.xpi');
  const xpiDest = path.join(distDir, 'hauldesk-quickadd.xpi');
  try {
    await fs.copyFile(xpiSource, xpiDest);
    console.log(`✓ Copied hauldesk-quickadd.xpi to dist/`);
  } catch (err) {
    console.warn('Warning: could not copy extension XPI to dist:', err);
  }

  console.log(`[4/5] Assembling release packages...`);
  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.mkdir(stageDir, { recursive: true });

  // Copy production files into staging
  const stageDist = path.join(stageDir, 'dist');
  await fs.mkdir(stageDist, { recursive: true });
  const distEntries = await fs.readdir(distDir);
  for (const entry of distEntries) {
    const srcPath = path.join(distDir, entry);
    const destPath = path.join(stageDist, entry);
    await fs.cp(srcPath, destPath, { recursive: true });
  }

  // Copy server and dependencies package.json
  const minimalPackageJson = {
    name: 'hauldesk',
    version: VERSION,
    license: 'MIT',
    type: 'module',
    private: true,
    dependencies: {
      express: '^4.21.2',
      sharp: '^0.35.5',
      'onnxruntime-node': '^1.31.1',
      dotenv: '^17.2.3',
    },
  };
  await fs.writeFile(
    path.join(stageDir, 'package.json'),
    JSON.stringify(minimalPackageJson, null, 2)
  );
  await fs.writeFile(path.join(stageDir, 'start-windows.bat'), WINDOWS_LAUNCHER);
  await fs.writeFile(path.join(stageDir, 'start-linux.sh'), LINUX_LAUNCHER, { mode: 0o755 });
  await fs.writeFile(path.join(stageDir, 'start-macos.command'), MACOS_LAUNCHER, { mode: 0o755 });
  await fs.writeFile(path.join(stageDir, 'README.txt'), PORTABLE_README);
  await fs.writeFile(path.join(stageDir, '.env.example'), (await fs.readFile(path.join(root, '.env.example'))));

  // Build portable ZIP for Windows / generic
  console.log(`[5/5] Generating release archives and checksums...`);
  const stagedFiles = await collectFilesRecursively(stageDir, stageDir);
  const zipBuffer = buildZipArchive(stagedFiles);
  const zipPath = path.join(releaseDir, `hauldesk-v${VERSION}-portable.zip`);
  await fs.writeFile(zipPath, zipBuffer);

  // Copy XPI directly to release root
  const releaseXpiPath = path.join(releaseDir, `hauldesk-quickadd-v${VERSION}.xpi`);
  await fs.copyFile(xpiSource, releaseXpiPath);

  // Generate SHA256 checksums
  const filesToCheck = [zipPath, releaseXpiPath];
  const checksumLines: string[] = [];

  for (const f of filesToCheck) {
    const content = await fs.readFile(f);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    checksumLines.push(`${hash}  ${path.basename(f)}`);
  }

  await fs.writeFile(path.join(releaseDir, 'checksums.txt'), checksumLines.join('\n') + '\n');
  await fs.rm(stageDir, { recursive: true, force: true });

  console.log(`\n🎉 Release artifacts generated successfully in release/:`);
  for (const line of checksumLines) {
    console.log(`   ${line}`);
  }
}

main().catch((err) => {
  console.error('Fatal release build error:', err);
  process.exit(1);
});

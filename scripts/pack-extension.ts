import fs from 'node:fs/promises';
import path from 'node:path';
import { buildZipArchive, type ZipEntryInput } from '../src/utils/zipPackager.ts';

async function collectFiles(dir: string, baseDir: string): Promise<ZipEntryInput[]> {
  const entries: ZipEntryInput[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  items.sort((a, b) => a.name.localeCompare(b.name));

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...(await collectFiles(fullPath, baseDir)));
    } else if (item.isFile()) {
      const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const data = await fs.readFile(fullPath);
      entries.push({ name: rel, data });
    }
  }
  return entries;
}

async function main() {
  const rootDir = process.cwd();
  const extDir = path.join(rootDir, 'firefox-extension');
  const outDir = path.join(rootDir, 'dist-extension');
  const outFile = path.join(outDir, 'hauldesk-quickadd.xpi');

  const manifestRaw = await fs.readFile(path.join(extDir, 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(manifestRaw) as { name?: string; version?: string };

  const entries = await collectFiles(extDir, extDir);
  if (!entries.some((e) => e.name === 'manifest.json')) {
    throw new Error('manifest.json not found in the root of firefox-extension/');
  }

  const archive = buildZipArchive(entries);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, archive);

  console.log(
    `Packed ${manifest.name ?? 'HaulDesk Extension'} v${manifest.version ?? '1.0.0'} (${entries.length} files, ${archive.length} bytes) -> ${path.relative(rootDir, outFile)}`
  );
}

main().catch((err) => {
  console.error('Failed to build XPI package:', err);
  process.exit(1);
});

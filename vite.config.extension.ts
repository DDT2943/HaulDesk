import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function cleanExtensionAssetsPlugin(): Plugin {
  return {
    name: 'clean-extension-assets',
    async buildStart() {
      const assetsDir = path.resolve(import.meta.dirname, 'firefox-extension', 'assets');
      await fs.rm(assetsDir, { recursive: true, force: true });
    },
  };
}

function flattenExtensionPopupPlugin(): Plugin {
  return {
    name: 'flatten-extension-popup',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [key, asset] of Object.entries(bundle)) {
        if (key.endsWith('popup.html')) {
          asset.fileName = 'popup.html';
          if (asset.type === 'asset' && typeof asset.source === 'string') {
            asset.source = asset.source
              .replace(/\s+crossorigin/g, '')
              .replace(/(src|href)="\.\.\/\.\.\//g, '$1="./')
              .replace(/(src|href)="\/assets\//g, '$1="./assets/');
          }
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [cleanExtensionAssetsPlugin(), react(), tailwindcss(), flattenExtensionPopupPlugin()],
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'firefox-extension'),
    emptyOutDir: false,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        popup: path.resolve(import.meta.dirname, 'src/extension/popup.html'),
      },
    },
  },
});

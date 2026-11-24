import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

function copyManifestAssets(): Plugin {
  return {
    name: 'pixelpeek-copy-manifest-assets',
    closeBundle() {
      const source = resolve(root, 'public');
      const target = resolve(root, 'dist');
      mkdirSync(target, { recursive: true });
      for (const entry of readdirSync(source)) {
        cpSync(resolve(source, entry), resolve(target, entry), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [copyManifestAssets()],
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(root, 'src/background/index.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
});

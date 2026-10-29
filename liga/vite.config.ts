import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Genera `sw.js` al compilar: precachea la app (ficheros con hash) y los ficheros de `public/`. */
function serviceWorker(): Plugin {
  return {
    name: 'pokeliga-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicDir = join(root, 'public');
      const publicFiles = walk(publicDir).map((f) => relative(publicDir, f).split('\\').join('/'));
      const files = ['./', ...Object.keys(bundle), ...publicFiles].sort();
      const template = readFileSync(join(root, 'scripts', 'sw.template.js'), 'utf8');
      // la versión cambia si cambia cualquier fichero de la app o el propio service worker
      const version = createHash('sha1').update(files.join('|')).update(template).digest('hex').slice(0, 10);
      const source = template
        .replaceAll('__VERSION__', version)
        .replaceAll('__PRECACHE__', JSON.stringify(files));
      if (/__[A-Z]+__/.test(source)) throw new Error('sw.js: quedan marcadores sin sustituir');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  test: { include: ['tests/**/*.test.ts'] },
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p));

describe('service worker (plantilla)', () => {
  const template = read('scripts/sw.template.js').toString('utf8');

  it('los marcadores están una sola vez y en el código (no en un comentario)', () => {
    expect(template.match(/__VERSION__/g)).toHaveLength(1);
    expect(template.match(/__PRECACHE__/g)).toHaveLength(1);
    expect(template).toContain("const VERSION = '__VERSION__';");
    expect(template).toContain('const PRECACHE = __PRECACHE__;');
  });

  it('una vez rellena es JavaScript válido y sin marcadores', () => {
    const source = template.replaceAll('__VERSION__', 'abc123').replaceAll('__PRECACHE__', JSON.stringify(['./', 'assets/a.js']));
    expect(source).not.toMatch(/__[A-Z]+__/);
    expect(() => new Function(source)).not.toThrow();
  });

  it('ignora Vary al buscar en la caché (el servidor puede enviar «Vary: Origin»)', () => {
    expect(template).toContain('const MATCH = { ignoreSearch: true, ignoreVary: true };');
    expect(template).toContain('caches.match(req, MATCH)');
    expect(template).toContain("caches.match(abs('./'), MATCH)");
  });

  it('guarda los sprites con CORS, para que ocupen su tamaño real en la cuota', () => {
    expect(template).toContain("mode: 'cors'");
  });
});

describe('manifiesto e iconos', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8'));

  it('es instalable: nombre, inicio, modo independiente y colores', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('es');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('tiene iconos de 192 y 512 y uno "maskable", y los ficheros existen con ese tamaño', () => {
    const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
    expect(purposes).toContain('maskable');
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const png = read(`public/${icon.src}`);
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // firma PNG
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(png.readUInt32BE(16)).toBe(w); // ancho en IHDR
      expect(png.readUInt32BE(20)).toBe(h);
    }
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  });

  it('la página enlaza el manifiesto y el icono de iOS', () => {
    const html = read('index.html').toString('utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('name="theme-color"');
  });
});

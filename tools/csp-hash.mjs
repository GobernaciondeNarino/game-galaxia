#!/usr/bin/env node
/**
 * Recalcula los hashes CSP de los scripts en línea de index.html y los escribe
 * en la directiva script-src de .htaccess.
 *
 * ORBIS lleva un único script en línea —el <script type="importmap">—, que no
 * puede externalizarse porque los navegadores no admiten import maps externos.
 * En lugar de abrir la política con 'unsafe-inline', se autoriza ese bloque
 * concreto por su hash. Ejecuta este script cada vez que toques el importmap.
 *
 *   node tools/csp-hash.mjs            # aplica los cambios
 *   node tools/csp-hash.mjs --verificar # solo comprueba (útil en CI); sale 1 si difiere
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const soloVerificar = process.argv.includes('--verificar');

const html = await readFile(join(RAIZ, 'index.html'), 'utf8');
const htaccess = await readFile(join(RAIZ, '.htaccess'), 'utf8');

// Scripts en línea: los que no tienen atributo src.
const enLinea = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]);

if (enLinea.length === 0) {
  console.error('✘ No se encontró ningún script en línea en index.html.');
  process.exit(1);
}

const hashes = enLinea.map(
  (contenido) => `'sha256-${createHash('sha256').update(contenido, 'utf8').digest('base64')}'`,
);

// Sustituye los hashes existentes (o el marcador de plantilla) dentro de script-src.
const nuevo = htaccess.replace(
  /(script-src[^;]*?)((?:\s*'sha256-[^']*')+)/,
  (_, prefijo) => `${prefijo} ${hashes.join(' ')}`,
);

if (nuevo === htaccess) {
  if (/script-src[^;]*'sha256-/.test(htaccess) && hashes.every((h) => htaccess.includes(h))) {
    console.log('✔ Los hashes de .htaccess ya están al día.');
    process.exit(0);
  }
  console.error("✘ No se localizó ningún marcador 'sha256-…' en la directiva script-src de .htaccess.");
  process.exit(1);
}

if (soloVerificar) {
  console.error('✘ Los hashes CSP de .htaccess están desactualizados. Ejecuta: node tools/csp-hash.mjs');
  process.exit(1);
}

await writeFile(join(RAIZ, '.htaccess'), nuevo);
console.log(`✔ .htaccess actualizado con ${hashes.length} hash(es):`);
for (const h of hashes) console.log(`    ${h}`);

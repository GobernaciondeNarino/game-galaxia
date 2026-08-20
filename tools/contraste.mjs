#!/usr/bin/env node
/**
 * ORBIS — Verificación de contraste (WCAG 2.1).
 *
 * Comprueba que cada pareja texto/fondo de la interfaz alcanza la relación de
 * contraste mínima. Es una comprobación automática, no una impresión: en una
 * interfaz oscura con paneles translúcidos es facilísimo dejar texto a 2,7:1
 * que «se lee bien» en el monitor de quien lo programó y resulta ilegible en
 * una pantalla con reflejos o para alguien con baja visión.
 *
 * Al ser un sitio de una entidad pública, el criterio es AA (4,5:1 para texto
 * normal, 3:1 para texto grande y para elementos de interfaz).
 *
 *   node tools/contraste.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Convierte #rrggbb o rgba(...) a un array [r, g, b, a]. */
function aRgba(color) {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = color.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const partes = rgba[1].split(',').map((p) => Number(p.trim()));
    return [partes[0], partes[1], partes[2], partes[3] ?? 1];
  }
  throw new Error(`Color no reconocido: ${color}`);
}

/** Compone un color con alfa sobre un fondo opaco. */
function componer(frente, fondo) {
  const [r1, g1, b1, a] = frente;
  const [r2, g2, b2] = fondo;
  return [r1 * a + r2 * (1 - a), g1 * a + g2 * (1 - a), b1 * a + b2 * (1 - a), 1];
}

/** Luminancia relativa según la fórmula de la WCAG. */
function luminancia([r, g, b]) {
  const canal = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(frente, fondo) {
  const l1 = luminancia(frente);
  const l2 = luminancia(fondo);
  const [claro, oscuro] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Lee las fichas de diseño de css/nucleo.css. */
async function leerFichas() {
  const css = await readFile(join(RAIZ, 'css/nucleo.css'), 'utf8');
  const bloque = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!bloque) throw new Error('No se encontró el bloque :root en css/nucleo.css');

  const fichas = {};
  for (const [, nombre, valor] of bloque[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    fichas[nombre] = valor.trim();
  }
  return fichas;
}

/**
 * Parejas que hay que verificar.
 * `sobre` es la pila de fondos, del más cercano al más lejano; los colores con
 * alfa se componen en orden hasta llegar a un opaco.
 */
const PAREJAS = [
  { texto: 'texto',            sobre: ['panel-fondo', 'fondo-profundo'], minimo: 4.5, uso: 'texto de panel' },
  { texto: 'texto-tenue',      sobre: ['panel-fondo', 'fondo-profundo'], minimo: 4.5, uso: 'texto secundario de panel' },
  { texto: 'texto-apagado',    sobre: ['panel-fondo', 'fondo-profundo'], minimo: 4.5, uso: 'notas y unidades' },
  { texto: 'cian-acento',      sobre: ['panel-fondo', 'fondo-profundo'], minimo: 3.0, uso: 'títulos de panel (texto grande)' },
  { texto: 'cian-brillante',   sobre: ['panel-fondo', 'fondo-profundo'], minimo: 3.0, uso: 'valores destacados' },
  { texto: 'ambar-seleccion',  sobre: ['panel-fondo', 'fondo-profundo'], minimo: 3.0, uso: 'estado seleccionado' },
  { texto: 'verde-estado',     sobre: ['panel-fondo', 'fondo-profundo'], minimo: 3.0, uso: 'indicador correcto' },
  { texto: 'rojo-alerta',      sobre: ['panel-fondo', 'fondo-profundo'], minimo: 3.0, uso: 'indicador de alerta' },
  { texto: 'texto',            sobre: ['fondo-profundo'],                minimo: 4.5, uso: 'texto sobre el espacio' },
  { texto: 'texto-tenue',      sobre: ['fondo-profundo'],                minimo: 4.5, uso: 'texto secundario sobre el espacio' },
  { texto: 'panel-borde',      sobre: ['panel-fondo', 'fondo-profundo'], minimo: 3.0, uso: 'borde de panel (elemento de interfaz)' },
];

const fichas = await leerFichas();
let fallos = 0;

console.log('\n▸ Contraste de las fichas de diseño (WCAG 2.1 AA)\n');
console.log(`   ${'pareja'.padEnd(38)}${'ratio'.padStart(7)}  mínimo  uso`);
console.log(`   ${'-'.repeat(78)}`);

for (const pareja of PAREJAS) {
  const valor = fichas[pareja.texto];
  if (!valor) {
    console.log(`   ✘ ficha desconocida: --${pareja.texto}`);
    fallos++;
    continue;
  }

  // Se compone la pila de fondos de atrás hacia delante.
  let fondo = aRgba(fichas[pareja.sobre[pareja.sobre.length - 1]]);
  for (let i = pareja.sobre.length - 2; i >= 0; i--) {
    fondo = componer(aRgba(fichas[pareja.sobre[i]]), fondo);
  }

  const frente = componer(aRgba(valor), fondo);
  const ratio = contraste(frente, fondo);
  const pasa = ratio >= pareja.minimo;
  if (!pasa) fallos++;

  const etiqueta = `--${pareja.texto} sobre ${pareja.sobre[0]}`;
  console.log(
    `   ${pasa ? '✔' : '✘'} ${etiqueta.padEnd(36)}${ratio.toFixed(2).padStart(7)}  ${String(pareja.minimo).padStart(6)}  ${pareja.uso}`,
  );
}

console.log('');
if (fallos) {
  console.error(`✘ ${fallos} pareja(s) por debajo del mínimo. Ajusta css/nucleo.css.\n`);
  process.exit(1);
}
console.log('✔ Todas las parejas alcanzan el mínimo AA.\n');

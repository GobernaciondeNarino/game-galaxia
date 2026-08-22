#!/usr/bin/env node
/**
 * ORBIS — Comprobaciones de la interfaz que no se ven en una captura.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * Nace de dos fallos reales, los dos silenciosos y los dos encontrados por el
 * usuario, no por el código:
 *
 *   1. «ESCALA REAL» NO HACÍA NADA. La casilla llamaba a
 *      `this.acciones.cambiarEscala(...)`, y esa acción no estaba entre las que
 *      `main.js` le pasa a la HUD. El `TypeError` moría dentro del manejador
 *      del evento: la casilla se marcaba, la escena no cambiaba y en la consola
 *      quedaba una línea que nadie miraba. Un mando roto que PARECE funcionar
 *      es peor que un mando ausente.
 *
 *   2. LA VISTA PREVIA DE LA CÁMARA IBA AL REVÉS. El esqueleto se dibuja
 *      reflejado, el cursor gestual también y el giro de la escena invierte el
 *      desplazamiento; solo faltaba reflejar el <video>. Resultado: se levanta
 *      la mano derecha y el esqueleto aparece en el lado contrario.
 *
 * Los dos son del mismo tipo: piezas que tienen que estar de acuerdo entre sí y
 * viven en archivos distintos. Nada las obligaba a estarlo.
 *
 *   node tools/pruebas-interfaz.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8');

let fallos = 0;
const comprobar = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` — esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(real)}`}`);
};

const hud = leer('js/ui/HUD.js');
const main = leer('js/main.js');
const cssHud = leer('css/hud.css');

console.log('\n▸ Todo mando de la HUD llama a una acción que existe');
{
  // ESTA es la comprobación que habría cazado lo de «Escala real». No mira si
  // la acción hace lo correcto —eso es otra prueba—, sino si está.
  const usadas = [...new Set([...hud.matchAll(/this\.acciones\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort();

  const inicio = main.indexOf('new HUD(');
  const fin = main.indexOf('}, { capaEtiquetas', inicio);
  comprobar('se encuentra la llamada a new HUD', inicio !== -1 && fin > inicio, true);

  const bloque = main.slice(inicio, fin);
  // Las claves del literal van con cuatro espacios de sangría; los cuerpos de
  // las funciones que declaran, con más.
  const dadas = new Set([...bloque.matchAll(/^ {4}([A-Za-z0-9_]+)[,:]/gm)].map((m) => m[1]));

  console.log(`     ${usadas.length} acciones usadas, ${dadas.size} entregadas`);
  comprobar('ninguna acción usada falta', usadas.filter((a) => !dadas.has(a)), []);
}

console.log('\n▸ La escala se pide y se responde');
{
  comprobar('la casilla llama a cambiarEscala', /cambiarEscala\?\.\(e\.target\.checked \? 'real' : 'didactico'\)/.test(hud), true);
  // Y la casilla se pone al día cuando el modo lo cambia otro —la voz dice
  // «modo real», el teclado también—: si no, afirma lo contrario de lo que pasa.
  comprobar('y se sincroniza con escena:escala', /escena:escala.*\n.*\n.*\n.*\n.*interruptorEscala\.checked = modo === 'real'/.test(hud), true);
  comprobar('el modo real cambia radios y semiejes de verdad',
    /radioMedioKm \/ KM_POR_UNIDAD_REAL/.test(leer('js/system/SolarSystem.js')), true);
}

console.log('\n▸ La vista previa de la cámara va reflejada, y solo una vez');
{
  // El espejo es lo que espera quien se ve a sí mismo: la mano derecha, a la
  // derecha de la pantalla.
  comprobar('el <video> se refleja por CSS', /\.entradas__video \{ transform: scaleX\(-1\); \}/.test(cssHud), true);

  // El lienzo NO se refleja por CSS porque ya se refleja al dibujarlo. Hacerlo
  // dos veces lo devolvería a su sitio y volveríamos al fallo de partida.
  const reglasLienzo = [...cssHud.matchAll(/^[^\n{]*entradas__esqueleto[^\n{]*\{([^}]*)\}/gm)].map((m) => m[1]);
  comprobar('el lienzo no se refleja también', reglasLienzo.some((r) => /scaleX/.test(r)), false);
  comprobar('el lienzo se dibuja ya reflejado', /const x = \(p\) => \(1 - p\.x\) \* ancho;/.test(leer('js/input/HandTracking.js')), true);
  comprobar('y el cursor gestual, igual', /\(1 - estado\.cursor\.x\)/.test(leer('js/ui/CursorGestual.js')), true);
}

console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallida(s)\n` : '\n✔ Todas las comprobaciones pasan\n');
process.exit(fallos ? 1 : 0);

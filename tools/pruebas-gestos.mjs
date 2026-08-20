#!/usr/bin/env node
/**
 * ORBIS — Pruebas del reconocedor de gestos.
 *
 * Construye manos sintéticas con la geometría que produciría cada gesto y
 * comprueba la clasificación y las acciones que se derivan. No hace falta
 * cámara ni navegador, así que corre en cada push.
 *
 * Estas pruebas ya han encontrado dos errores reales: un umbral de «dedo
 * estirado» medido sobre el tamaño total de la mano —que daba un puño cerrado
 * por palma abierta— y una dispersión de profundidad sin normalizar, que habría
 * clasificado mal cualquier mano cerca de la cámara.
 *
 *   node tools/pruebas-gestos.mjs
 */
import { GestureRecognizer, GESTO, PUNTO } from '../js/input/GestureRecognizer.js';

/** Construye una mano con los dedos en las posiciones pedidas. */
function mano({ x = 0.5, y = 0.5, escala = 0.12, dedos, pulgarJunto = false, plana = true }) {
  const p = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  const set = (i, dx, dy, dz = 0) => { p[i] = { x: x + dx * escala, y: y + dy * escala, z: dz }; };

  set(PUNTO.MUNECA, 0, 0);
  // La z de MediaPipe está en el mismo orden de magnitud que x e y, así que
  // el desnivel de una mano de canto se escala con el tamaño de la mano.
  set(PUNTO.INDICE_MCP, -0.3, -1, plana ? 0 : 0.5 * escala);
  set(PUNTO.MEDIO_MCP, 0, -1);
  set(PUNTO.ANULAR_MCP, 0.3, -1);
  set(PUNTO.MENIQUE_MCP, 0.6, -1, plana ? 0 : -0.5 * escala);

  const largo = (estirado) => (estirado ? -2.0 : -0.9);
  set(PUNTO.INDICE_PUNTA, -0.3, largo(dedos.indice));
  set(PUNTO.MEDIO_PUNTA, 0, largo(dedos.medio));
  set(PUNTO.ANULAR_PUNTA, 0.3, largo(dedos.anular));
  set(PUNTO.MENIQUE_PUNTA, 0.6, largo(dedos.menique));

  // El pulgar se acerca a la punta del índice cuando hay pellizco.
  if (pulgarJunto) {
    p[PUNTO.PULGAR_PUNTA] = { x: p[PUNTO.INDICE_PUNTA].x + 0.002, y: p[PUNTO.INDICE_PUNTA].y + 0.002, z: 0 };
  } else {
    set(PUNTO.PULGAR_PUNTA, -1.2, -0.6);
  }
  return p;
}

const TODOS = { indice: true, medio: true, anular: true, menique: true };
const NINGUNO = { indice: false, medio: false, anular: false, menique: false };
const SOLO_INDICE = { indice: true, medio: false, anular: false, menique: false };

let fallos = 0;
const comprobar = (nombre, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` — esperado «${esperado}», obtenido «${real}»`}`);
};

console.log('\n▸ Clasificación de gestos');
{
  const r = new GestureRecognizer();
  comprobar('puño', r.clasificarMano(mano({ dedos: NINGUNO })), GESTO.PUNO);
  comprobar('apuntando', r.clasificarMano(mano({ dedos: SOLO_INDICE })), GESTO.APUNTANDO);
  comprobar('palma de frente', r.clasificarMano(mano({ dedos: TODOS, plana: true })), GESTO.PALMA);
  comprobar('mano abierta de lado', r.clasificarMano(mano({ dedos: TODOS, plana: false })), GESTO.MANO_ABIERTA);
  comprobar('pellizco', r.clasificarMano(mano({ dedos: SOLO_INDICE, pulgarJunto: true })), GESTO.PELLIZCO);
}

console.log('\n▸ Invarianza al tamaño de la mano (cerca y lejos)');
{
  const r = new GestureRecognizer();
  for (const escala of [0.05, 0.12, 0.30]) {
    comprobar(`pellizco a escala ${escala}`,
      r.clasificarMano(mano({ dedos: SOLO_INDICE, pulgarJunto: true, escala })), GESTO.PELLIZCO);
  }
}

console.log('\n▸ Zona muerta: una mano quieta no debe producir acciones');
{
  const r = new GestureRecognizer();
  let t = 0;
  let acciones = 0;
  for (let i = 0; i < 40; i++) {
    // Deriva minúscula, por debajo del umbral.
    const ruido = (i % 2 ? 1 : -1) * 0.0008;
    const res = r.procesar([mano({ dedos: SOLO_INDICE, pulgarJunto: true, x: 0.5 + ruido })], (t += 33));
    acciones += res.acciones.filter((a) => a.tipo === 'orbitar').length;
  }
  comprobar('sin órbitas espurias', acciones, 0);
}

console.log('\n▸ Arrastre con pellizco: sí debe producir órbita');
{
  const r = new GestureRecognizer();
  let t = 0;
  let acciones = 0;
  for (let i = 0; i < 20; i++) {
    const res = r.procesar([mano({ dedos: SOLO_INDICE, pulgarJunto: true, x: 0.3 + i * 0.02 })], (t += 33));
    acciones += res.acciones.filter((a) => a.tipo === 'orbitar').length;
  }
  comprobar('hay órbitas', acciones > 10, true);
}

console.log('\n▸ Gesto sostenido: apuntar 1,2 s selecciona');
{
  const r = new GestureRecognizer();
  let t = 0;
  let selecciones = 0;
  const progresos = [];
  for (let i = 0; i < 60; i++) {
    const res = r.procesar([mano({ dedos: SOLO_INDICE })], (t += 33));
    progresos.push(res.progreso);
    selecciones += res.acciones.filter((a) => a.tipo === 'seleccionar').length;
  }
  comprobar('selecciona una vez', selecciones, 1);
  comprobar('el progreso llegó a subir', progresos.some((p) => p > 0.5), true);
}

console.log('\n▸ El progreso se reinicia si se cambia de gesto');
{
  const r = new GestureRecognizer();
  let t = 0;
  for (let i = 0; i < 20; i++) r.procesar([mano({ dedos: SOLO_INDICE })], (t += 33));
  const res = r.procesar([mano({ dedos: NINGUNO })], (t += 33));
  comprobar('progreso a cero', res.progreso, 0);
}

console.log('\n▸ Zoom con dos manos en pellizco');
{
  const r = new GestureRecognizer();
  let t = 0;
  const deltas = [];
  for (let i = 0; i < 15; i++) {
    const sep = 0.15 + i * 0.02;
    const res = r.procesar([
      mano({ dedos: SOLO_INDICE, pulgarJunto: true, x: 0.5 - sep / 2 }),
      mano({ dedos: SOLO_INDICE, pulgarJunto: true, x: 0.5 + sep / 2 }),
    ], (t += 33));
    for (const a of res.acciones) if (a.tipo === 'zoom') deltas.push(a.delta);
  }
  comprobar('genera zoom', deltas.length > 5, true);
  comprobar('separar acerca (delta negativo)', deltas.every((d) => d < 0), true);
}

console.log('\n▸ Deslizamiento horizontal con mano abierta');
{
  const r = new GestureRecognizer();
  let t = 0;
  const vecinos = [];
  for (let i = 0; i < 12; i++) {
    const res = r.procesar([mano({ dedos: TODOS, plana: false, x: 0.2 + i * 0.03 })], (t += 30));
    for (const a of res.acciones) if (a.tipo === 'vecino') vecinos.push(a.direccion);
  }
  comprobar('detecta el deslizamiento', vecinos.length >= 1, true);
  comprobar('dirección correcta', vecinos[0], -1);
}

console.log('\n▸ Sin manos: estado limpio');
{
  const r = new GestureRecognizer();
  r.procesar([mano({ dedos: SOLO_INDICE })], 0);
  const res = r.procesar([], 33);
  comprobar('gesto ninguno', res.gesto, GESTO.NINGUNO);
  comprobar('sin cursor', res.cursor, null);
}

console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallida(s)\n` : '\n✔ Todas las comprobaciones pasan\n');
process.exit(fallos ? 1 : 0);

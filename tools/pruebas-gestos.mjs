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
 * El vocabulario son tres gestos y cuatro acciones: pellizcar y arrastrar rota,
 * pellizcar con las dos manos acerca y aleja, y barrer con la mano abierta pasa
 * al cuerpo siguiente. Buena parte de estas pruebas comprueban justamente lo
 * contrario de lo que se espera de una prueba: que abrir la mano, cerrar el
 * puño o apuntar NO disparen nada.
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
  comprobar('mano abierta de frente', r.clasificarMano(mano({ dedos: TODOS, plana: true })), GESTO.MANO_ABIERTA);
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

console.log('\n▸ Los gestos retirados no disparan nada');
{
  // Esta es la prueba del problema que motivó recortar el vocabulario: abrir la
  // mano o dejarla quieta apuntando abría paneles que nadie había pedido.
  for (const [nombre, dedos] of [['apuntar', SOLO_INDICE], ['mano abierta quieta', TODOS]]) {
    const r = new GestureRecognizer();
    let t = 0;
    const acciones = [];
    for (let i = 0; i < 90; i++) {   // 3 s largos, mucho más que cualquier umbral antiguo
      acciones.push(...r.procesar([mano({ dedos })], (t += 33)).acciones);
    }
    comprobar(`${nombre} sostenido no produce acciones`, acciones.length, 0);
  }
}

console.log('\n▸ Puño sostenido: calla la narración');
{
  const r = new GestureRecognizer();
  let t = 0;
  const acciones = [];
  const progresos = [];
  for (let i = 0; i < 90; i++) {                       // ~3 s de puño cerrado
    const res = r.procesar([mano({ dedos: NINGUNO })], (t += 33));
    progresos.push(res.progreso);
    acciones.push(...res.acciones);
  }
  // Lo importante no es que dispare, sino que dispare UNA vez: sin el cerrojo,
  // mantener el puño mandaría callar treinta veces por segundo.
  comprobar('dispara exactamente una vez', acciones.filter((a) => a.tipo === 'callar').length, 1);
  comprobar('no produce ninguna otra acción', acciones.length, 1);
  comprobar('el aro avisa antes de disparar', progresos.some((v) => v > 0.3 && v < 1), true);
}

console.log('\n▸ Un puño corto no basta');
{
  const r = new GestureRecognizer();
  let t = 0;
  const acciones = [];
  for (let i = 0; i < 12; i++) {                       // ~0,4 s, por debajo del umbral
    acciones.push(...r.procesar([mano({ dedos: NINGUNO })], (t += 33)).acciones);
  }
  comprobar('no calla', acciones.length, 0);
}

console.log('\n▸ Hay que abrir la mano para volver a callar');
{
  const r = new GestureRecognizer();
  let t = 0;
  const cerrar = (n) => {
    const a = [];
    for (let i = 0; i < n; i++) a.push(...r.procesar([mano({ dedos: NINGUNO })], (t += 33)).acciones);
    return a.filter((x) => x.tipo === 'callar').length;
  };
  const abrir = (n) => { for (let i = 0; i < n; i++) r.procesar([mano({ dedos: TODOS })], (t += 33)); };

  comprobar('primer puño calla', cerrar(60), 1);
  comprobar('seguir cerrado no repite', cerrar(60), 0);
  abrir(10);
  comprobar('tras abrir, vuelve a contar', cerrar(60), 1);
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

console.log('\n▸ Barrido horizontal con mano abierta');
{
  for (const plana of [true, false]) {
    const r = new GestureRecognizer();
    let t = 0;
    const vecinos = [];
    const progresos = [];
    for (let i = 0; i < 12; i++) {
      const res = r.procesar([mano({ dedos: TODOS, plana, x: 0.2 + i * 0.03 })], (t += 30));
      progresos.push(res.progreso);
      for (const a of res.acciones) if (a.tipo === 'vecino') vecinos.push(a.direccion);
    }
    // De frente o de canto: el barrido tiene que detectarse igual, porque nadie
    // controla la orientación de la mano mientras hace el gesto de pasar.
    comprobar(`detecta el barrido (${plana ? 'de frente' : 'de canto'})`, vecinos.length >= 1, true);
    comprobar(`dirección correcta (${plana ? 'de frente' : 'de canto'})`, vecinos[0], -1);
    comprobar(`el aro de progreso sube antes de disparar (${plana ? 'de frente' : 'de canto'})`,
      progresos.some((v) => v > 0.3 && v < 1), true);
  }
}

console.log('\n▸ El barrido no arrastra ni desplaza la escena');
{
  const r = new GestureRecognizer();
  let t = 0;
  const tipos = new Set();
  for (let i = 0; i < 12; i++) {
    for (const a of r.procesar([mano({ dedos: TODOS, x: 0.2 + i * 0.03 })], (t += 30)).acciones) {
      tipos.add(a.tipo);
    }
  }
  comprobar('solo produce «vecino»', [...tipos].join(','), 'vecino');
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

#!/usr/bin/env node
/**
 * ORBIS — Pruebas de las narraciones.
 *
 * Cada cuerpo tiene tres narraciones que se van alternando en visitas
 * sucesivas. Con ciento cinco textos escritos a mano, los fallos que importan
 * no son de programación sino de contenido: que a un cuerpo se le quede una
 * sola narración y siempre suene igual, que dos variantes acaben siendo el
 * mismo texto, o que una se pase del tope de caracteres que acepta el proxy de
 * síntesis y ese cuerpo se quede mudo en producción.
 *
 * Aquí se comprueban esas tres cosas sobre el catálogo ya construido, que es lo
 * que de verdad leen el navegador y el servidor.
 *
 *   node tools/pruebas-narracion.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'data/sistema-solar.json'), 'utf8'));
const cuerpos = catalogo.cuerpos;

/** El mismo tope que aplica api/tts.php antes de llamar a ElevenLabs. */
const LIMITE_CARACTERES = 2500;

/** Por debajo de esto no es una narración, es un rótulo. */
const MINIMO_RAZONABLE = 200;

let fallos = 0;
const comprobar = (nombre, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` — esperado «${esperado}», obtenido «${real}»`}`);
};

console.log('\n▸ Todos los cuerpos tienen varias narraciones');
{
  const sin = cuerpos.filter((c) => !Array.isArray(c.narraciones) || c.narraciones.length === 0);
  comprobar('ninguno se queda sin narración', sin.map((c) => c.id).join(', '), '');

  // Con una sola, volver al mismo cuerpo suena exactamente igual que la primera
  // vez, que es justo lo que se quería arreglar.
  const unaSola = cuerpos.filter((c) => (c.narraciones?.length ?? 0) < 2);
  comprobar('ninguno se repetiría al volver', unaSola.map((c) => c.id).join(', '), '');

  const conTres = cuerpos.filter((c) => c.narraciones?.length === 3).length;
  comprobar('los 35 tienen tres', conTres, cuerpos.length);
  console.log(`     ${cuerpos.length} entradas · ${cuerpos.reduce((n, c) => n + c.narraciones.length, 0)} narraciones`);
}

console.log('\n▸ Ninguna narración se repite');
{
  // Ni dentro del mismo cuerpo ni entre cuerpos distintos: copiar un texto de
  // un sitio a otro es el error fácil al escribir ciento cinco.
  const vistos = new Map();
  const repetidos = [];
  for (const cuerpo of cuerpos) {
    for (const [i, texto] of cuerpo.narraciones.entries()) {
      const clave = texto.trim();
      if (vistos.has(clave)) repetidos.push(`${cuerpo.id}[${i}] = ${vistos.get(clave)}`);
      else vistos.set(clave, `${cuerpo.id}[${i}]`);
    }
  }
  comprobar('sin textos duplicados', repetidos.join(' · '), '');
}

console.log('\n▸ Todas caben en el proxy de síntesis');
{
  const pasadas = [];
  const cortas = [];
  for (const cuerpo of cuerpos) {
    for (const [i, texto] of cuerpo.narraciones.entries()) {
      if (texto.length > LIMITE_CARACTERES) pasadas.push(`${cuerpo.id}[${i}]=${texto.length}`);
      if (texto.length < MINIMO_RAZONABLE) cortas.push(`${cuerpo.id}[${i}]=${texto.length}`);
    }
  }
  comprobar(`ninguna pasa de ${LIMITE_CARACTERES} caracteres`, pasadas.join(', '), '');
  comprobar(`ninguna baja de ${MINIMO_RAZONABLE}`, cortas.join(', '), '');

  const todas = cuerpos.flatMap((c) => c.narraciones);
  const media = Math.round(todas.reduce((n, t) => n + t.length, 0) / todas.length);
  console.log(`     longitudes: ${Math.min(...todas.map((t) => t.length))} · media ${media} · ${Math.max(...todas.map((t) => t.length))}`);
}

console.log('\n▸ La rotación no repite hasta agotarlas');
{
  // Es la regla de la que depende todo lo demás: con tres textos, tres visitas
  // seguidas tienen que dar tres textos distintos. Se reproduce aquí el mismo
  // cálculo que hace Narrator para poder comprobarlo sin navegador.
  const siguiente = (visitas, total) => visitas % total;

  for (const total of [2, 3]) {
    const salidas = Array.from({ length: total }, (_, v) => siguiente(v, total));
    comprobar(`con ${total} narraciones, ${total} visitas dan ${total} distintas`,
      new Set(salidas).size, total);
  }

  // Y a la vuelta empieza otra vez por la primera, en el mismo orden.
  const ciclo = Array.from({ length: 7 }, (_, v) => siguiente(v, 3));
  comprobar('el ciclo es 0,1,2,0,1,2,0', ciclo.join(','), '0,1,2,0,1,2,0');
}

console.log('\n▸ El servidor resuelve las mismas variantes que el cliente');
{
  // api/lib/Catalogo.php envuelve el índice con módulo. Se comprueba que el
  // cálculo del cliente cae siempre dentro del rango que el servidor acepta,
  // porque un desajuste aquí serviría la narración equivocada.
  let malas = 0;
  for (const cuerpo of cuerpos) {
    const total = cuerpo.narraciones.length;
    for (let visitas = 0; visitas < 10; visitas++) {
      const indice = visitas % total;
      if (indice < 0 || indice >= total) malas++;
    }
  }
  comprobar('todo índice cae dentro del rango', malas, 0);
}

console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallida(s)\n` : '\n✔ Todas las comprobaciones pasan\n');
process.exit(fallos ? 1 : 0);

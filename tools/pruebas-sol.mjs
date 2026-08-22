#!/usr/bin/env node
/**
 * ORBIS — Pruebas del shader de la superficie solar.
 *
 * POR QUÉ NO SE COMPARAN CAPTURAS
 * ───────────────────────────────
 * Lo natural sería fotografiar el Sol dos veces y ver si cambió. Se intentó y
 * no vale: con render por software el mismo fotograma no sale igual dos veces
 * —el 99 % de los píxeles difieren incluso con la cámara inmóvil y la animación
 * parada—, así que la comparación da positivo siempre y no prueba nada. Peor
 * aún, comparar los BYTES del PNG es todavía más engañoso: la compresión los
 * revuelve enteros en cuanto cambia un píxel.
 *
 * Lo que sí se puede medir sin ambigüedad es la aritmética del shader, que es
 * donde de verdad está el efecto. El movimiento de la superficie es una función
 * pura del uniforme `tiempo`; comprobar cómo avanza ese uniforme, y que las
 * constantes del flujo están donde deben, dice más que cualquier captura.
 *
 * QUÉ SE VIGILA
 * ─────────────
 *   · Que el flujo del plasma no acumule desplazamiento. Es la trampa en la que
 *     ya se cayó una vez con la rotación diferencial: un desplazamiento que
 *     crece sin límite convierte la superficie en una cinta transportadora.
 *   · Que la amplitud siga siendo sutil. Subiéndola, el Sol se ondula como agua.
 *   · Que `prefers-reduced-motion` congele el reloj, no que lo ralentice.
 *
 *   node tools/pruebas-sol.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = readFileSync(join(RAIZ, 'js/system/Sun.js'), 'utf8');

let fallos = 0;
const comprobar = (nombre, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` — esperado «${esperado}», obtenido «${real}»`}`);
};

console.log('\n▸ El flujo del plasma existe y se genera con mezclaTemporal');
{
  // mezclaTemporal es lo que garantiza que el campo evolucione EN SU SITIO en
  // lugar de desplazarse. Si el flujo se generase con `turbulencia(p + tiempo)`
  // —la forma ingenua— la superficie acabaría corriendo hacia un lado para
  // siempre, que es exactamente el fallo que la rotación diferencial ya provocó.
  comprobar('se declara el campo de flujo', /vec3 flujo = vec3\(/.test(fuente), true);

  const bloque = fuente.slice(fuente.indexOf('vec3 flujo = vec3('), fuente.indexOf('vec3 pSuper'));
  comprobar('sus tres componentes usan mezclaTemporal',
    (bloque.match(/mezclaTemporal\(/g) ?? []).length, 3);
  comprobar('ninguna suma el tiempo a la posición', /pGirado[^;]*\+\s*tiempo/.test(bloque), false);

  // Centrado en cero: si no se restara 0,5, el campo sería siempre positivo y
  // arrastraría todo hacia la misma esquina.
  comprobar('el campo está centrado en cero', /\)\s*-\s*0\.5;/.test(bloque), true);
}

console.log('\n▸ La deformación es sutil, y la supergranulación menos que el grano');
{
  const sup = fuente.match(/pSuper = pGirado \+ flujo \* ([\d.]+)/);
  const gra = fuente.match(/pGrano = pGirado \+ flujo \* ([\d.]+)/);
  comprobar('se deforma la supergranulación', sup !== null, true);
  comprobar('se deforma la granulación', gra !== null, true);

  const amplitudSuper = Number(sup?.[1]);
  const amplitudGrano = Number(gra?.[1]);
  console.log(`     supergranulación ${amplitudSuper} · granulación ${amplitudGrano}`);

  // Las celdas grandes empujan; no son las empujadas.
  comprobar('la grande se deforma menos que la fina', amplitudSuper < amplitudGrano, true);
  // Por encima de 0,25 la superficie deja de parecer una estrella.
  comprobar('la amplitud se mantiene sutil', amplitudGrano <= 0.25, true);
  comprobar('y no es cero', amplitudGrano > 0, true);
}

console.log('\n▸ El flujo es más lento que la granulación que arrastra');
{
  // Un campo de arrastre que cambiara más deprisa que lo arrastrado se vería
  // como ruido, no como corriente.
  const flujo = Number(fuente.match(/ritmoFlujo = tiempo \* ([\d.]+)/)?.[1]);
  const grano = Number(fuente.match(/tiempo \* ([\d.]+) \* ritmoLatitud, 2\)/)?.[1]);
  console.log(`     flujo ${flujo} · granulación ${grano}`);
  comprobar('el flujo va más lento', flujo < grano, true);
}

console.log('\n▸ El movimiento reducido CONGELA el reloj, no lo ralentiza');
{
  // Medido en Chromium: con prefers-reduced-motion el uniforme se queda en
  // 0,000 después de seis segundos, frente a 1,667 sin la preferencia.
  comprobar('el reloj solo avanza sin la preferencia',
    /if \(!MOVIMIENTO_REDUCIDO\?\.matches\) this\._tiempo \+= delta;/.test(fuente), true);
  comprobar('la consulta se declara una sola vez',
    (fuente.match(/matchMedia\?\.\(/g) ?? []).length, 1);
}

console.log('\n▸ Sigue sin cizallarse el mapa con la rotación diferencial');
{
  // El comentario que explica por qué no se hace vale más que el código que no
  // está: sin él, alguien lo intentaría otra vez.
  comprobar('el aviso sigue escrito', /NO se cizalla el mapa con la rotación/.test(fuente), true);
  comprobar('las constantes de Snodgrass siguen ahí', /OMEGA_A = 14\.713/.test(fuente), true);
}

console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallida(s)\n` : '\n✔ Todas las comprobaciones pasan\n');
process.exit(fallos ? 1 : 0);

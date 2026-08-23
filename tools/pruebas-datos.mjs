#!/usr/bin/env node
/**
 * ORBIS — Pruebas de coherencia del catálogo.
 *
 * Las demás pruebas comprueban CÓDIGO. Esta comprueba los DATOS, que es donde
 * un error hace más daño y donde nadie mira: un número mal leído no rompe nada,
 * no lanza ninguna excepción y llega tal cual a la interfaz, donde el asistente
 * lo dice en voz alta como si fuese una medida. El pliego prohíbe inventarse
 * datos, y una cifra mal parseada es un dato inventado por accidente.
 *
 * QUÉ ENCONTRÓ ESTO LA PRIMERA VEZ QUE SE EJECUTÓ
 * ──────────────────────────────────────────────
 * Fobos con 1,08 × 10^20 kg y Deimos con 1,80 × 10^20 kg: diez mil y cien mil
 * veces sus masas reales. Horizons publica esas dos con un multiplicador entre
 * paréntesis detrás de la cifra —«Mass (10^20 kg) = 1.08 (10^-4)»— y el
 * extractor se quedaba con el 1.08 y tiraba el paréntesis. La aplicación
 * llevaba desde la fase 1 contando que Fobos pesa más que Encélado, que tiene
 * veintitrés veces su radio.
 *
 * LA COMPROBACIÓN QUE LO CAZA
 * ───────────────────────────
 * Horizons publica masa, radio y densidad por separado, y las tres tienen que
 * cuadrar entre sí: m = d × (4/3)πr³. No es una fuente nueva ni una cifra
 * inventada, es la definición de densidad. Un cuerpo que no la cumple tiene mal
 * alguno de los tres, y da igual cuál: no se puede publicar.
 *
 * El margen es del 25 %. Suena ancho y no lo es: los tres valores vienen
 * redondeados y de campañas distintas, y los cuerpos irregulares además no son
 * esferas —Fobos mide 13,1 × 11,1 × 9,3 km—, así que un 10 % de desviación es
 * normal. Los errores que importan son de órdenes de magnitud, no del 30 %.
 *
 *   node tools/pruebas-datos.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (r) => JSON.parse(readFileSync(join(RAIZ, r), 'utf8'));

let fallos = 0;
const comprobar = (nombre, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` — esperado «${esperado}», obtenido «${real}»`}`);
};

const catalogo = leer('wj-content/data/sistema-solar.json').cuerpos;

/** Margen: por debajo de esto la discrepancia es redondeo, no un error. */
const TOLERANCIA = 0.25;

console.log('\n▸ La masa cuadra con la densidad y el radio');
{
  let comprobados = 0;
  for (const c of catalogo) {
    const { masaKg, radioMedioKm, densidadGcm3 } = c.fisica ?? {};
    if (!masaKg || !radioMedioKm || !densidadGcm3) continue;

    const volumenM3 = (4 / 3) * Math.PI * (radioMedioKm * 1000) ** 3;
    const masaDerivada = volumenM3 * densidadGcm3 * 1000;   // g/cm³ → kg/m³
    const desviacion = Math.abs(masaKg / masaDerivada - 1);

    comprobados++;
    const ok = desviacion <= TOLERANCIA;
    if (!ok) fallos++;
    console.log(
      `  ${ok ? '✔' : '✘'} ${c.nombre.padEnd(14)}`
      + `${masaKg.toExponential(3)} kg  vs  d×V ${masaDerivada.toExponential(3)} kg`
      + `  (${(desviacion * 100).toFixed(1)} %${ok ? '' : ' — REVISAR'})`,
    );
  }
  console.log(`     ${comprobados} cuerpos con los tres valores`);
  comprobar('hay bastantes que comprobar', comprobados >= 25, true);
}

console.log('\n▸ Ninguna cifra física es negativa ni absurda');
{
  const limites = {
    'fisica.masaKg': [1e10, 1e32],
    'fisica.radioMedioKm': [0.1, 1e6],
    'fisica.densidadGcm3': [0.1, 30],
    'fisica.gravedadMs2': [0.0001, 500],
    'fisica.velocidadEscapeKms': [0.0001, 1000],
    'fisica.albedoGeometrico': [0, 1.5],
    'fisica.inclinacionAxialGrados': [0, 180],
  };
  const leerRuta = (o, ruta) => ruta.split('.').reduce((v, k) => (v == null ? v : v[k]), o);

  let fuera = 0;
  for (const c of catalogo) {
    for (const [ruta, [min, max]] of Object.entries(limites)) {
      const v = leerRuta(c, ruta);
      if (v === null || v === undefined) continue;      // SIN DATOS es legítimo
      if (typeof v !== 'number' || Number.isNaN(v) || v < min || v > max) {
        fuera++;
        comprobar(`${c.nombre} · ${ruta} = ${v}`, false, true);
      }
    }
  }
  if (fuera === 0) console.log('  ✔ todas dentro de rango');
}

console.log('\n▸ El albedo geométrico no puede pasar de 1,5');
{
  // Encélado ronda 1,0 —es el cuerpo más reflectante que se conoce— y algunas
  // fuentes lo dan por encima. Más de 1,5 no lo justifica ninguna medida y
  // delataría un porcentaje colado donde va una fracción.
  for (const c of catalogo) {
    const a = c.fisica?.albedoGeometrico;
    if (a === null || a === undefined) continue;
    if (a > 1.5) comprobar(`${c.nombre} · albedo ${a}`, false, true);
  }
  console.log('  ✔ ninguno pasa del límite');
}

console.log('\n▸ Toda cifra publicada tiene fuente');
{
  let sinFuente = 0;
  for (const c of catalogo) {
    const tieneAlgo = Object.values(c.fisica ?? {}).some((v) => v !== null && v !== undefined);
    if (!tieneAlgo) continue;
    const fuente = c.fuente ?? c.fuentes;
    if (!fuente) {
      sinFuente++;
      comprobar(`${c.nombre} publica cifras sin fuente`, false, true);
    }
  }
  if (sinFuente === 0) console.log('  ✔ todos los cuerpos con cifras citan de dónde salen');
}

console.log('\n▸ Un satélite orbita a alguien, y ese alguien existe');
{
  const ids = new Set(catalogo.map((c) => c.id));
  for (const c of catalogo) {
    if (c.tipo === 'satelite') {
      comprobar(`${c.nombre} declara padre`, typeof c.padre === 'string' && c.padre !== '', true);
      if (c.padre) comprobar(`el padre de ${c.nombre} está en el catálogo`, ids.has(c.padre), true);
    }
  }
}

console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallida(s)\n` : '\n✔ Todas las comprobaciones pasan\n');
process.exit(fallos ? 1 : 0);

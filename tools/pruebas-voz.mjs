#!/usr/bin/env node
/**
 * ORBIS — Pruebas del parser de intenciones de voz.
 *
 * Comprueba el reconocimiento con transcripciones reales, incluidas las que
 * el reconocedor de voz suele estropear: «ganimedez», «enselado», «yo» por
 * «Ío». Si estas pruebas pasan, el control por voz funciona aunque el motor
 * de transcripción se equivoque, que es lo normal con nombres poco frecuentes.
 *
 *   node tools/pruebas-voz.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParserIntenciones, levenshtein, normalizar } from '../js/input/ParserIntenciones.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const vocabulario = JSON.parse(readFileSync(join(RAIZ, 'data/comandos-voz.json'), 'utf8'));
const parser = new ParserIntenciones(vocabulario);

let fallos = 0;
const comprobar = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` — esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(real)}`}`);
};

console.log('\n▸ Normalización');
comprobar('quita tildes y signos', normalizar('¿Llévame a Júpiter?'), 'llevame a jupiter');
comprobar('colapsa espacios', normalizar('  ir   a    marte '), 'ir a marte');

console.log('\n▸ Distancia de Levenshtein');
comprobar('idénticas', levenshtein('marte', 'marte'), 0);
comprobar('una sustitución', levenshtein('marte', 'marde'), 1);
comprobar('ganimedes/ganimedez', levenshtein('ganimedez', 'ganimedes'), 1);

console.log('\n▸ Comandos de navegación bien transcritos');
for (const [frase, intencion, cuerpo] of [
  ['llévame a Júpiter', 'ir_a', 'jupiter'],
  ['ir a Marte', 'ir_a', 'marte'],
  ['muéstrame Europa', 'ir_a', 'europa'],
  ['vista general', 'vista_general', null],
  ['siguiente', 'siguiente', null],
  ['anterior', 'anterior', null],
  ['háblame de Saturno', 'hablame_de', 'saturno'],
  ['satélites de Júpiter', 'satelites_de', 'jupiter'],
  ['pausar', 'pausar', null],
  ['acelerar tiempo', 'acelerar', null],
  ['mostrar órbitas', 'mostrar_orbitas', null],
  ['ocultar órbitas', 'ocultar_orbitas', null],
  ['modo real', 'modo_real', null],
  ['modo didáctico', 'modo_didactico', null],
  ['repetir', 'repetir', null],
  ['silencio', 'silencio', null],
  ['ayuda', 'ayuda', null],
  ['qué puedo decir', 'ayuda', null],
]) {
  const r = parser.interpretar(frase);
  comprobar(`«${frase}»`, [r.intencion, r.cuerpo], [intencion, cuerpo]);
}

console.log('\n▸ Transcripciones estropeadas por el reconocedor');
for (const [frase, cuerpo] of [
  ['ir a ganimedez', 'ganimedes'],
  ['llevame a enselado', 'encelado'],
  ['muestrame yo', 'io'],
  ['ir a tritón', 'triton'],
  ['ir a umbriell', 'umbriel'],
  ['llevame a make make', 'makemake'],
  ['ir a caronde', 'caronte'],
  ['ir a japetus', 'japeto'],
]) {
  const r = parser.interpretar(frase);
  comprobar(`«${frase}» → ${cuerpo}`, r.cuerpo, cuerpo);
}

console.log('\n▸ Apodos');
for (const [frase, cuerpo] of [
  ['llévame al planeta rojo', 'marte'],
  ['muéstrame el planeta azul', 'tierra'],
  ['ir al de los anillos', 'saturno'],
  ['ir al cinturón de asteroides', 'cinturon-asteroides'],
]) {
  comprobar(`«${frase}»`, parser.interpretar(frase).cuerpo, cuerpo);
}

console.log('\n▸ Solo el nombre del cuerpo basta');
comprobar('«Neptuno»', parser.interpretar('Neptuno').intencion, 'ir_a');
comprobar('«Neptuno» → cuerpo', parser.interpretar('Neptuno').cuerpo, 'neptuno');

console.log('\n▸ Muletillas y palabra de activación');
comprobar('«oye orbis llévame a Venus por favor»',
  parser.interpretar('oye orbis llévame a Venus por favor').cuerpo, 'venus');

console.log('\n▸ Comparación de dos cuerpos');
{
  const r = parser.interpretar('comparar Marte con Venus');
  comprobar('intención', r.intencion, 'comparar');
  comprobar('primer cuerpo', r.cuerpo, 'marte');
  comprobar('segundo cuerpo', r.cuerpoB, 'venus');
}

console.log('\n▸ Comandos que no se entienden: sugerencias, no silencio');
{
  const r = parser.interpretar('pon la lavadora');
  comprobar('sin intención ejecutable', r.confianza, 0);
  comprobar('hay tres sugerencias', r.sugerencias.length, 3);
  console.log(`     sugerencias: ${r.sugerencias.join(' · ')}`);
}
{
  const r = parser.interpretar('llévame a Krypton');
  comprobar('intención reconocida pero sin cuerpo', r.intencion, 'ir_a');
  comprobar('cuerpo nulo', r.cuerpo, null);
  comprobar('propone un ejemplo', r.sugerencias.length > 0, true);
}

console.log('\n▸ No confunde cuerpos de nombre parecido');
comprobar('titania ≠ titan', parser.interpretar('ir a titania').cuerpo, 'titania');
comprobar('titan ≠ titania', parser.interpretar('ir a titan').cuerpo, 'titan');
comprobar('ceres ≠ eris', parser.interpretar('ir a ceres').cuerpo, 'ceres');
comprobar('eris ≠ ceres', parser.interpretar('ir a eris').cuerpo, 'eris');

console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallida(s)\n` : '\n✔ Todas las comprobaciones pasan\n');
process.exit(fallos ? 1 : 0);

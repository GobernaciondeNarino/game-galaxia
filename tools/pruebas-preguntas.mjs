#!/usr/bin/env node
/**
 * ORBIS — Pruebas del reconocedor de preguntas.
 *
 * Comprueba que una pregunta acaba en el atributo correcto del catálogo. Lo que
 * más importa aquí no es acertar —eso se ve enseguida— sino DOS cosas que se
 * rompen en silencio:
 *
 *   1. Que las preguntas parecidas no se confundan entre sí. «cuánto dura su
 *      día» y «cuánto dura su año» se diferencian en una palabra y apuntan a
 *      campos distintos; con umbrales difusos mal puestos, una se come a la
 *      otra y nadie se entera hasta que responde mal.
 *   2. Que las ÓRDENES no se traten como preguntas. «vista general» o «llévame
 *      a Marte» tienen que seguir siendo comandos; si el reconocedor de
 *      preguntas las atrapa, la aplicación deja de obedecer.
 *
 *   node tools/pruebas-preguntas.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Preguntas } from '../js/input/Preguntas.js';
import { ParserIntenciones } from '../js/input/ParserIntenciones.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (r) => JSON.parse(readFileSync(join(RAIZ, r), 'utf8'));

const catalogo = leer('data/sistema-solar.json').cuerpos;
const parser = new ParserIntenciones(leer('data/comandos-voz.json'));
const preguntas = new Preguntas(leer('data/preguntas.json'), catalogo, parser);

let fallos = 0;
const comprobar = (nombre, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` — esperado «${esperado}», obtenido «${real}»`}`);
};

console.log('\n▸ Preguntas con el cuerpo dentro de la frase');
{
  const casos = [
    ['¿cuánto pesa Júpiter?', 'masa', 'jupiter'],
    ['¿qué tamaño tiene Marte?', 'tamano', 'marte'],
    ['¿qué temperatura hace en Venus?', 'temperatura', 'venus'],
    ['¿cuántas lunas tiene Saturno?', 'satelites', 'saturno'],
    ['¿qué atmósfera tiene Titán?', 'atmosfera', 'titan'],
    ['¿tiene campo magnético Mercurio?', 'magnetosfera', 'mercurio'],
    ['¿tiene volcanes Ío?', 'geologia', 'io'],
    ['¿a qué distancia está del Sol Neptuno?', 'distancia', 'neptuno'],
    ['¿cuánto dura su año en Plutón?', 'orbita', 'pluton'],
    ['¿cuál es su velocidad de escape en la Luna?', 'escape', 'luna'],
  ];
  for (const [frase, atributo, cuerpo] of casos) {
    const r = preguntas.interpretar(frase);
    comprobar(`«${frase}» → atributo`, r.atributo, atributo);
    comprobar(`«${frase}» → cuerpo`, r.cuerpo, cuerpo);
  }
}

console.log('\n▸ Preguntas parecidas que NO deben confundirse');
{
  // Este es el bloque que de verdad protege algo: son pares que se diferencian
  // en una palabra y apuntan a campos distintos del catálogo.
  const pares = [
    ['cuánto dura su día', 'rotacion'],
    ['cuánto dura su año', 'orbita'],
    ['cuánto pesa', 'masa'],
    ['cuánto mide', 'tamano'],
    ['qué densidad tiene', 'densidad'],
    ['qué gravedad tiene', 'gravedad'],
    ['a qué distancia está del sol', 'distancia'],
    // El par que más se puede confundir de todos, y el que más importa: uno es
    // el semieje mayor respecto al Sol, que es una constante orbital y está en
    // el catálogo; el otro es la separación real respecto a la Tierra HOY, que
    // cambia cada día y se le pregunta a JPL Horizons. Para Marte son 1,52 ua
    // frente a cualquier cosa entre 0,4 y 2,7: dar una por la otra sería un
    // error de más del doble.
    ['a qué distancia está de la tierra', 'posicion'],
    ['dónde está ahora', 'posicion'],
    ['dónde lo veo', 'posicion'],
    ['se acerca o se aleja', 'posicion'],
    ['a qué orbita', 'padre'],
    ['qué inclinación axial tiene', 'inclinacion'],
    ['cuál es su velocidad de escape', 'escape'],
  ];
  for (const [frase, atributo] of pares) {
    comprobar(`«${frase}»`, preguntas.interpretar(frase, 'marte').atributo, atributo);
  }
}

console.log('\n▸ El nombre del cuerpo puede ir EN MEDIO de la pregunta');
{
  // Así es como habla la gente, y era justo lo que no se reconocía: el patrón
  // queda partido en dos por el nombre y la coincidencia exacta no lo encuentra.
  // Se reconocía «dónde está ahora» y «dónde está ahora Marte», pero no «dónde
  // está Marte ahora», que es la forma más natural de las tres.
  const casos = [
    ['dónde está Marte ahora', 'posicion', 'marte'],
    ['cuánto pesa Júpiter exactamente', 'masa', 'jupiter'],
    ['qué temperatura hace en Venus de noche', 'temperatura', 'venus'],
    ['cuántas lunas tiene Saturno en total', 'satelites', 'saturno'],
    ['a qué distancia está de la tierra Titán', 'posicion', 'titan'],
  ];
  for (const [frase, atributo, cuerpo] of casos) {
    const r = preguntas.interpretar(frase);
    comprobar(`«${frase}» → atributo`, r.atributo, atributo);
    comprobar(`«${frase}» → cuerpo`, r.cuerpo, cuerpo);
  }

  // Y quitar el nombre no puede convertir una pregunta en otra distinta: las
  // órdenes siguen sin ser preguntas aunque nombren un cuerpo.
  for (const orden of ['llévame a Marte', 'háblame de Venus', 'vista general']) {
    comprobar(`«${orden}» sigue sin ser pregunta`, preguntas.interpretar(orden).atributo, null);
  }
}

console.log('\n▸ El cuerpo puede quedar implícito');
{
  // «¿y su masa?» mirando Júpiter pregunta por Júpiter. Es como habla la gente.
  const r = preguntas.interpretar('cuánto pesa', 'jupiter');
  comprobar('usa el cuerpo del contexto', r.cuerpo, 'jupiter');
  comprobar('y lo señala como implícito', r.porContexto, true);

  // Pero si la pregunta nombra otro, gana el nombrado.
  const r2 = preguntas.interpretar('cuánto pesa Venus', 'jupiter');
  comprobar('el cuerpo nombrado manda sobre el contexto', r2.cuerpo, 'venus');
  comprobar('y no se marca como implícito', r2.porContexto, false);

  // Y sin contexto ni cuerpo no hay a quién preguntarle.
  comprobar('sin contexto no hay cuerpo', preguntas.interpretar('cuánto pesa', null).cuerpo, null);
}

console.log('\n▸ Las órdenes NO son preguntas');
{
  // Si el reconocedor de preguntas atrapara estas frases, la aplicación
  // dejaría de obedecer comandos que llevan funcionando desde la fase 7.
  for (const orden of [
    'vista general', 'siguiente', 'anterior', 'pausar', 'reanudar',
    'mostrar órbitas', 'ocultar órbitas', 'modo real', 'silencio', 'repetir',
    'detente', 'ayuda',
  ]) {
    comprobar(`«${orden}» no se toma por pregunta`, preguntas.interpretar(orden, 'marte').atributo, null);
  }
}

console.log('\n▸ Y una frase sin sentido tampoco');
{
  for (const frase of ['pon la lavadora', 'qué hora es en Madrid', 'lorem ipsum dolor']) {
    comprobar(`«${frase}»`, preguntas.interpretar(frase, 'marte').atributo, null);
  }
}

console.log('\n▸ Todos los atributos declarados se reconocen por su primer patrón');
{
  // Si un patrón deja de casar consigo mismo es que algo se ha roto en la
  // normalización, y ese fallo se propagaría a todas las formas de ese atributo.
  for (const { id, ejemplo } of preguntas.atributosDisponibles()) {
    comprobar(`«${ejemplo}» → ${id}`, preguntas.interpretar(ejemplo, 'marte').atributo, id);
  }
}

console.log('\n▸ Cada atributo apunta a un campo que existe de verdad');
{
  const tierra = catalogo.find((c) => c.id === 'tierra');
  const leerRuta = (o, ruta) => ruta.split('.').reduce((v, k) => (v == null ? v : v[k]), o);

  for (const [id, datos] of Object.entries(leer('data/preguntas.json').atributos)) {
    // Los campos con «$» no son rutas del catálogo: «$fuente» es del cuerpo
    // entero y «$horizons» no está en ningún archivo, se consulta en vivo.
    if (datos.campo.startsWith('$')) continue;
    const valor = leerRuta(tierra, datos.campo);
    comprobar(`${id} → ${datos.campo} existe en el catálogo`, valor !== undefined, true);
  }
}

console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallida(s)\n` : '\n✔ Todas las comprobaciones pasan\n');
process.exit(fallos ? 1 : 0);

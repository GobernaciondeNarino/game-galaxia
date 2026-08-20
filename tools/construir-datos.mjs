#!/usr/bin/env node
/**
 * ORBIS — Construcción del catálogo maestro.
 *
 * Fusiona las tres fuentes del proyecto en data/sistema-solar.json:
 *
 *   data/fisica-jpl.json   cifras físicas y orbitales, extraídas de JPL Horizons
 *   data/complementos.json lo que Horizons no publica, con su cita bibliográfica
 *   data/textos.json       nombres, jerarquía, narraciones y opciones visuales
 *
 * Cada valor numérico del archivo resultante lleva en `procedencia` de dónde
 * salió, de modo que la interfaz pueda mostrarlo y cualquiera pueda auditarlo.
 * Ninguna cifra se escribe a mano en este script.
 *
 *   node tools/construir-datos.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leerJson = async (ruta) => JSON.parse(await readFile(join(RAIZ, ruta), 'utf8'));

// ---------------------------------------------------------------------------
// Escala didáctica
//
// A escala real, la Tierra mediría 0,5 píxeles junto a un Sol de 55, y Neptuno
// quedaría a 4.500 pantallas de distancia. El modo didáctico comprime tamaños y
// distancias con dos funciones deterministas —no con valores escogidos a ojo—
// para que el conjunto sea navegable conservando el orden y la proporción
// relativa. El modo real recalcula todo desde las cifras verdaderas.
// ---------------------------------------------------------------------------

/** Radio en unidades de escena. La Tierra vale 1. */
function radioEscalado(radioKm, tipo) {
  if (!radioKm) return tipo === 'satelite' ? 0.12 : 0.4;   // Sin dato: tamaño testimonial.
  const RADIO_TIERRA = 6371.01;
  const relativo = Math.sqrt(radioKm / RADIO_TIERRA);      // Raíz cuadrada: comprime sin invertir el orden.

  if (tipo === 'estrella') return 6;                       // El Sol se acota aparte: si no, aplasta la escena.
  if (tipo === 'satelite') return Math.max(0.06, relativo * 0.55);
  return Math.max(0.18, relativo);
}

/** Distancia orbital al Sol, en unidades de escena. */
function distanciaEscalada(semiejeUA) {
  if (!semiejeUA) return null;
  return 30 * semiejeUA ** 0.55;                           // La Tierra queda a 30 unidades.
}

/**
 * Distancia de un satélite a su planeta, en unidades de escena.
 * Se comprime logarítmicamente respecto al radio del planeta: así Fobos no se
 * incrusta en Marte y Jápeto no se sale de la pantalla.
 */
function distanciaSatelite(semiejeKm, radioPlanetaKm, radioPlanetaEscena) {
  if (!semiejeKm || !radioPlanetaKm) return null;
  const enRadios = semiejeKm / radioPlanetaKm;
  return radioPlanetaEscena * (1.5 + 2.2 * Math.log(1 + enRadios / 3));
}

// ---------------------------------------------------------------------------
// Cinturones. No son cuerpos: son regiones, y sus límites también llevan fuente.
// ---------------------------------------------------------------------------
const CINTURONES = [
  {
    id: 'cinturon-asteroides',
    nombre: 'Cinturón de asteroides',
    tipo: 'cinturon',
    padre: 'sol',
    region: {
      radioInternoUA: 2.06,
      radioExternoUA: 3.27,
      fuente:
        'Límites tomados de las lagunas de Kirkwood 4:1 y 2:1, que definen el cinturón principal. ' +
        'JPL Small-Body Database.',
    },
    render: { color: '#8A8175', instancias: 5000 },
    narraciones: [
      'Entre Marte y Júpiter orbitan más de un millón de asteroides de más de un kilómetro. ' +
      'Pese al nombre, el cinturón está prácticamente vacío: la distancia media entre dos ' +
      'asteroides vecinos es de cientos de miles de kilómetros, y las sondas que lo han ' +
      'atravesado no han tenido que esquivar nada. Toda su masa junta no llega ni al 5 % de ' +
      'la de la Luna. No son los restos de un planeta destruido, sino material que nunca ' +
      'llegó a agregarse: la gravedad de Júpiter lo impidió.',
      'El cinturón de asteroides está mucho más vacío de lo que sugiere cualquier ilustración. La ' +
      'distancia media entre dos asteroides vecinos es de cientos de miles de kilómetros: las sondas que ' +
      'lo han atravesado no han tenido que esquivar nada, y ninguna ha corrido peligro. Toda la masa del ' +
      'cinturón junta no alcanza el 5 % de la masa de la Luna, y Ceres, el mayor de sus cuerpos, ' +
      'concentra por sí solo cerca de un tercio de esa masa. Es decir: casi todo el cinturón es un puñado ' +
      'de objetos grandes y una inmensidad de espacio entre ellos.',
      'Los huecos del cinturón no están vacíos por casualidad. Se llaman lagunas de Kirkwood y los abre ' +
      'Júpiter a distancia, por resonancia: los asteroides que orbitan en esas franjas completan un ' +
      'número exacto de vueltas por cada una de Júpiter, así que reciben su tirón gravitatorio siempre en ' +
      'el mismo punto, una y otra vez, hasta que acaban expulsados. Dos de esas lagunas, la 4:1 y la 2:1, ' +
      'son las que definen los límites interior y exterior del cinturón principal. El cinturón no termina ' +
      'donde se acaba el material: termina donde Júpiter deja de permitirlo.',
    ],
    curiosidades: [
      'Toda la masa del cinturón junta no alcanza el 5 % de la masa de la Luna.',
      'Ceres, el mayor de sus cuerpos, concentra por sí solo cerca de un tercio de esa masa.',
      'Las lagunas de Kirkwood son huecos vaciados por resonancias con la órbita de Júpiter.',
    ],
    fuente: 'JPL Small-Body Database',
  },
  {
    id: 'cinturon-kuiper',
    nombre: 'Cinturón de Kuiper',
    tipo: 'cinturon',
    padre: 'sol',
    region: {
      radioInternoUA: 30,
      radioExternoUA: 50,
      fuente: 'NASA Science — Kuiper Belt: región entre 30 y 50 UA del Sol.',
    },
    render: { color: '#6F7E93', instancias: 3000 },
    narraciones: [
      'Más allá de Neptuno se extiende un anillo de cuerpos helados mucho más ancho y masivo ' +
      'que el cinturón de asteroides. Ahí están Plutón, Eris, Makemake y Haumea, y de ahí ' +
      'vienen los cometas de periodo corto. Es el material que sobró de la formación del ' +
      'Sistema Solar, demasiado disperso y demasiado lejos como para haberse unido en un ' +
      'planeta. Se conocen ya miles de objetos y se estima que hay cientos de miles de más ' +
      'de cien kilómetros.',
      'De aquí vienen los cometas de periodo corto, como el Halley, y de aquí vino también Tritón antes ' +
      'de que Neptuno lo capturara. El cinturón de Kuiper no es solo un depósito de material sobrante: es ' +
      'el sitio del que el Sistema Solar exterior sigue recibiendo visitas. Alberga a Plutón, Eris, ' +
      'Makemake y Haumea, los cuatro planetas enanos reconocidos más allá de Neptuno, y se extiende entre ' +
      'las treinta y las cincuenta unidades astronómicas del Sol.',
      'En 2019 la sonda New Horizons sobrevoló Arrokoth, el objeto más lejano visitado hasta ahora por ' +
      'una nave humana. Lo que encontró fueron dos cuerpos redondeados unidos por un cuello estrecho, ' +
      'como un muñeco de nieve: dos objetos que se acercaron tan despacio que se quedaron pegados en ' +
      'lugar de destruirse. Es una imagen de cómo se formaron los planetas, conservada intacta cuatro mil ' +
      'quinientos millones de años porque ahí fuera no ha pasado nada capaz de borrarla.',
    ],
    curiosidades: [
      'Plutón, Eris, Makemake y Haumea son objetos del cinturón de Kuiper.',
      'Los cometas de periodo corto, como el Halley, proceden de esta región.',
      'La sonda New Horizons sobrevoló Arrokoth en 2019: el objeto más lejano visitado hasta ahora.',
    ],
    fuente: 'NASA Science — Kuiper Belt',
  },
];

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

async function principal() {
  const fisicaJpl = await leerJson('data/fisica-jpl.json');
  const complementos = await leerJson('data/complementos.json');
  const textos = await leerJson('data/textos.json');

  const cuerpos = [];
  const avisos = [];

  // Primera pasada: física, órbita y procedencia de cada cifra.
  const porId = {};
  for (const [id, texto] of Object.entries(textos.cuerpos)) {
    const jpl = fisicaJpl.cuerpos[id];
    if (!jpl) {
      avisos.push(`${id}: sin datos de Horizons`);
      continue;
    }

    const extra = complementos.cuerpos[id] ?? {};
    const fisica = { ...jpl.fisica };
    const procedencia = {};
    const referencias = new Set();

    for (const clave of Object.keys(fisica)) {
      if (fisica[clave] !== null) {
        procedencia[clave] = { fuente: 'JPL Horizons', detalle: jpl.origen[clave] ?? null };
        referencias.add('NASA/JPL Horizons');
      } else if (extra[clave]) {
        fisica[clave] = extra[clave].valor;
        procedencia[clave] = { fuente: 'literatura', detalle: extra[clave].fuente, nota: extra[clave].nota ?? null };
        referencias.add(extra[clave].fuente);
      } else {
        procedencia[clave] = null;      // La interfaz lo mostrará como SIN DATOS.
      }
    }

    // Diámetro: lo que se enseña en el panel, derivado del radio.
    fisica.diametroKm = fisica.radioMedioKm ? Number((fisica.radioMedioKm * 2).toPrecision(6)) : null;
    procedencia.diametroKm = procedencia.radioMedioKm
      ? { ...procedencia.radioMedioKm, detalle: `diámetro = 2 × radio medio · ${procedencia.radioMedioKm.detalle ?? ''}` }
      : null;

    porId[id] = {
      id,
      nombre: texto.nombre,
      tipo: texto.tipo,
      padre: texto.padre,
      fisica,
      orbita: jpl.orbita,
      temperatura: texto.temperatura,
      atmosfera: texto.atmosfera,
      magnetosfera: texto.magnetosfera ?? null,
      geologia: texto.geologia ?? null,
      satelitesConocidos: texto.satelitesConocidos,
      render: { ...texto.render },
      anotaciones: texto.anotaciones,
      satelites: texto.satelites,
      narraciones: texto.narraciones,
      curiosidades: texto.curiosidades,
      procedencia,
      revisadoPorJpl: jpl.revisado,
      fuente: [...referencias].join(' · ') || 'Sin fuente',
    };
  }

  // Segunda pasada: escala de escena. Necesita el radio del planeta padre.
  for (const cuerpo of Object.values(porId)) {
    cuerpo.render.radioEscalado = Number(
      radioEscalado(cuerpo.fisica.radioMedioKm, cuerpo.tipo).toPrecision(5),
    );

    if (cuerpo.tipo === 'satelite') {
      const padre = porId[cuerpo.padre];
      const d = distanciaSatelite(
        cuerpo.orbita?.semiejeMayorKm,
        padre?.fisica.radioMedioKm,
        padre?.render.radioEscalado,
      );
      cuerpo.render.distanciaEscalada = d === null ? null : Number(d.toPrecision(5));
    } else if (cuerpo.orbita?.semiejeMayorUA) {
      cuerpo.render.distanciaEscalada = Number(
        distanciaEscalada(cuerpo.orbita.semiejeMayorUA).toPrecision(5),
      );
    } else {
      cuerpo.render.distanciaEscalada = null;
    }

    // Un cuerpo sin mapa fotográfico se declara como representación, no como retrato.
    cuerpo.render.esSimulacion = !cuerpo.render.textura;
  }

  // Los cinturones se escalan con la misma función que las órbitas.
  for (const cinturon of CINTURONES) {
    cuerpos.push({
      ...cinturon,
      render: {
        ...cinturon.render,
        radioInternoEscalado: Number(distanciaEscalada(cinturon.region.radioInternoUA).toPrecision(5)),
        radioExternoEscalado: Number(distanciaEscalada(cinturon.region.radioExternoUA).toPrecision(5)),
        esSimulacion: true,
      },
      fisica: null,
      orbita: null,
      procedencia: { region: { fuente: 'literatura', detalle: cinturon.region.fuente } },
    });
  }

  const orden = Object.values(porId);
  const salida = {
    $esquema: 'orbis/sistema-solar/2',
    generado: 'tools/construir-datos.mjs',
    nota:
      'ARCHIVO GENERADO — no editar a mano. Se construye con tools/construir-datos.mjs a ' +
      'partir de data/fisica-jpl.json (JPL Horizons), data/complementos.json (literatura ' +
      'citada) y data/textos.json (contenido redactado). Cada cifra lleva su procedencia. ' +
      'Lo que no tiene fuente vale null y la interfaz lo muestra como SIN DATOS.',
    fuentes: {
      'jpl-horizons': 'https://ssd.jpl.nasa.gov/api/horizons.api',
      'nasa-fact-sheet': 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
      texturas: 'assets/textures/CREDITOS.json',
    },
    escala: {
      unidad: 'El radio de la Tierra vale 1 unidad de escena; su órbita, 30.',
      radio: 'raíz cuadrada del radio real relativo al terrestre; los satélites, al 55 %',
      distanciaPlanetas: '30 × (semieje mayor en UA) ^ 0,55',
      distanciaSatelites: 'radio del planeta × (1,5 + 2,2 · ln(1 + separación en radios / 3))',
      aviso:
        'La escala didáctica NO conserva las proporciones reales. El modo real las recalcula ' +
        'desde fisica.radioMedioKm y orbita.semiejeMayorUA.',
    },
    epocaElementos: fisicaJpl.epocaElementos,
    cuerpos: [...orden, ...cuerpos],
  };

  await writeFile(join(RAIZ, 'data/sistema-solar.json'), JSON.stringify(salida, null, 2) + '\n');

  const sinDatos = orden.flatMap((c) =>
    Object.entries(c.procedencia)
      .filter(([, v]) => v === null)
      .map(([k]) => `${c.id}.${k}`),
  );

  console.log(`✔ data/sistema-solar.json · ${salida.cuerpos.length} entradas`);
  console.log(`  ${orden.length} cuerpos + ${CINTURONES.length} cinturones`);
  console.log(`  ${sinDatos.length} campos SIN DATOS: ${sinDatos.slice(0, 6).join(', ')}${sinDatos.length > 6 ? '…' : ''}`);
  for (const aviso of avisos) console.log(`  ⚠ ${aviso}`);
}

principal().catch((err) => {
  console.error(`\n✘ ${err.message}\n`);
  process.exit(1);
});

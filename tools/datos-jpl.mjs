#!/usr/bin/env node
/**
 * ORBIS — Extracción de datos físicos y orbitales desde JPL Horizons.
 *
 * Escribe data/fisica-jpl.json a partir de la API de Horizons
 * (https://ssd.jpl.nasa.gov/api/horizons.api). Ninguna cifra de ORBIS se
 * teclea a mano: la regla del proyecto es que todo dato numérico proceda de
 * una fuente verificable, y este script es cómo se cumple.
 *
 * Para cada cuerpo se guardan además:
 *   - `revisado`: la fecha de revisión que declara el propio Horizons,
 *   - `origen`: la línea literal de la que se extrajo cada cifra,
 * de modo que cualquiera pueda auditar el valor sin volver a consultar la API.
 *
 * Lo que no se consigue extraer queda en null. Nunca se estima.
 *
 *   node tools/datos-jpl.mjs            descarga y regenera el archivo
 *   node tools/datos-jpl.mjs --cache    reutiliza las respuestas ya guardadas
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(RAIZ, '.cache-horizons');
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const USAR_CACHE = process.argv.includes('--cache');

/** Época de referencia de los elementos orbitales: J2000. */
const EPOCA = '2000-01-01';

/**
 * Catálogo de cuerpos. `centro` es el cuerpo respecto al que se calculan los
 * elementos orbitales: el Sol para planetas y planetas enanos, el planeta
 * correspondiente para cada satélite.
 */
const CUERPOS = [
  { id: 'sol',        horizons: '10',            tipo: 'estrella' },

  { id: 'mercurio',   horizons: '199', centro: '500@10', tipo: 'planeta' },
  { id: 'venus',      horizons: '299', centro: '500@10', tipo: 'planeta' },
  { id: 'tierra',     horizons: '399', centro: '500@10', tipo: 'planeta' },
  { id: 'marte',      horizons: '499', centro: '500@10', tipo: 'planeta' },
  { id: 'jupiter',    horizons: '599', centro: '500@10', tipo: 'planeta' },
  { id: 'saturno',    horizons: '699', centro: '500@10', tipo: 'planeta' },
  { id: 'urano',      horizons: '799', centro: '500@10', tipo: 'planeta' },
  { id: 'neptuno',    horizons: '899', centro: '500@10', tipo: 'planeta' },

  { id: 'pluton',     horizons: '999',           centro: '500@10', tipo: 'planeta-enano' },
  { id: 'ceres',      horizons: "'DES=2000001;'",  centro: '500@10', tipo: 'planeta-enano' },
  { id: 'eris',       horizons: "'DES=2136199;'",  centro: '500@10', tipo: 'planeta-enano' },
  { id: 'makemake',   horizons: "'DES=2136472;'",  centro: '500@10', tipo: 'planeta-enano' },
  { id: 'haumea',     horizons: "'DES=2136108;'",  centro: '500@10', tipo: 'planeta-enano' },

  { id: 'luna',       horizons: '301', centro: '500@399', tipo: 'satelite' },
  { id: 'fobos',      horizons: '401', centro: '500@499', tipo: 'satelite' },
  { id: 'deimos',     horizons: '402', centro: '500@499', tipo: 'satelite' },
  { id: 'io',         horizons: '501', centro: '500@599', tipo: 'satelite' },
  { id: 'europa',     horizons: '502', centro: '500@599', tipo: 'satelite' },
  { id: 'ganimedes',  horizons: '503', centro: '500@599', tipo: 'satelite' },
  { id: 'calisto',    horizons: '504', centro: '500@599', tipo: 'satelite' },
  { id: 'mimas',      horizons: '601', centro: '500@699', tipo: 'satelite' },
  { id: 'encelado',   horizons: '602', centro: '500@699', tipo: 'satelite' },
  { id: 'rea',        horizons: '605', centro: '500@699', tipo: 'satelite' },
  { id: 'titan',      horizons: '606', centro: '500@699', tipo: 'satelite' },
  { id: 'japeto',     horizons: '608', centro: '500@699', tipo: 'satelite' },
  { id: 'ariel',      horizons: '701', centro: '500@799', tipo: 'satelite' },
  { id: 'umbriel',    horizons: '702', centro: '500@799', tipo: 'satelite' },
  { id: 'titania',    horizons: '703', centro: '500@799', tipo: 'satelite' },
  { id: 'oberon',     horizons: '704', centro: '500@799', tipo: 'satelite' },
  { id: 'miranda',    horizons: '705', centro: '500@799', tipo: 'satelite' },
  { id: 'triton',     horizons: '801', centro: '500@899', tipo: 'satelite' },
  { id: 'caronte',    horizons: '901', centro: '500@999', tipo: 'satelite' },
];

// ---------------------------------------------------------------------------
// Acceso a la API
// ---------------------------------------------------------------------------

async function existe(ruta) {
  try { await access(ruta); return true; } catch { return false; }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function horizons(nombreCache, parametros, intento = 1) {
  const archivo = join(CACHE, `${nombreCache}.txt`);
  if (USAR_CACHE && (await existe(archivo))) return readFile(archivo, 'utf8');

  const url = `${API}?${new URLSearchParams({ format: 'text', ...parametros })}`;
  const res = await fetch(url);

  if (res.status === 429 || res.status >= 500) {
    // Horizons limita las ráfagas con 503. Se espera de forma creciente en
    // lugar de rendirse: regenerar el catálogo completo son 66 peticiones.
    if (intento > 7) throw new Error(`Horizons devolvió ${res.status} tras 7 intentos`);
    const espera = Math.min(2 ** intento * 1500, 45000);
    process.stdout.write(` [${res.status}, espero ${espera / 1000}s]`);
    await dormir(espera);
    return horizons(nombreCache, parametros, intento + 1);
  }
  if (!res.ok) throw new Error(`Horizons ${res.status} para ${nombreCache}`);

  const texto = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(archivo, texto);
  await dormir(1500);          // Cortesía con la API: no la saturamos.
  return texto;
}

// ---------------------------------------------------------------------------
// Extracción de datos físicos
//
// El texto de Horizons no tiene un formato único: cada cuerpo lo redactó una
// persona distinta a lo largo de décadas. Por eso cada campo se busca con
// varias alternativas y se guarda la línea de la que salió.
// ---------------------------------------------------------------------------

/**
 * Aplica una lista de expresiones regulares y devuelve el primer valor
 * encontrado junto con la línea completa que lo contenía.
 *
 * `rango` es una red de seguridad imprescindible: el texto de Horizons mezcla
 * varias columnas por línea y un patrón demasiado laxo puede capturar el
 * número equivocado. Por ejemplo, en Plutón la densidad aparece como
 * «Density (R=1195 km) = 1.86 g/cm^3»: sin comprobar el rango, el analizador
 * se quedaría con 1195 g/cm³. Un valor imposible es un fallo del analizador,
 * no un dato: se descarta y se prueba el siguiente patrón.
 */
function extraer(texto, patrones, transformar = (m) => Number(m[1]), rango = null) {
  for (const patron of patrones) {
    const coincidencia = texto.match(patron);
    if (!coincidencia) continue;
    const valor = transformar(coincidencia);
    if (valor === null || Number.isNaN(valor)) continue;
    if (rango && (valor < rango[0] || valor > rango[1])) continue;
    const linea = texto
      .split('\n')
      .find((l) => l.includes(coincidencia[0].split('\n')[0].trim().slice(0, 30)));
    return { valor, origen: (linea ?? coincidencia[0]).trim() };
  }
  return { valor: null, origen: null };
}

const NUM = String.raw`([-+]?[\d.]+)`;

function radioKm(t) {
  // Cuerpos irregulares: Horizons publica los tres semiejes («13.1 x11.1 x9.3»).
  // El radio medio de un elipsoide es la media geométrica de los tres, que es
  // la definición que usa la propia IAU. Se anota que el valor es derivado.
  const triaxial = t.match(
    /Radius[^=\n]*=\s*([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)/i,
  );
  if (triaxial) {
    const [a, b, c] = triaxial.slice(1, 4).map(Number);
    return {
      valor: Math.cbrt(a * b * c),
      origen: `radio medio derivado de los semiejes ${a}×${b}×${c} km — ${triaxial[0].trim()}`,
      derivado: true,
    };
  }

  return extraer(t, [
    new RegExp(String.raw`Vol\.?\s*[Mm]ean [Rr]adius[^=\n]*=\s*~?\s*${NUM}`),
    new RegExp(String.raw`Mean [Rr]adius\s*\(km\)[^=\n]*=\s*~?\s*${NUM}`),
    new RegExp(String.raw`Vol\.?\s*mean radius[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Radius\s*\(IAU\),?\s*km[^=\n]*=\s*~?\s*${NUM}`),
    new RegExp(String.raw`Radius\s*\(km[^)]*\)[^=\n]*=\s*~?\s*${NUM}`),
    new RegExp(String.raw`\bRAD\s*=\s*${NUM}`),
    new RegExp(String.raw`Mean [Rr]adius,?\s*\(?km\)?[^=\n]*=\s*~?\s*${NUM}`),
  ], undefined, [0.1, 1e6]);
}

function masaKg(t) {
  // El exponente viaja en la etiqueta: «Mass x10^24 (kg)= 5.97219».
  const conExponente = [
    new RegExp(String.raw`Mass[ ,]*x?\s*10\^(\d+)\s*\(?kg\)?[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Mass[ ,]*\(\s*10\^(\d+)\s*kg\s*\)[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Mass[ ,]*10\^(\d+)\s*kg[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Mass[ ,]*x\s*10\^(\d+)[^=\n]*=\s*~?\s*${NUM}`, 'i'),
  ];
  const directo = extraer(
    t,
    conExponente,
    (m) => Number(m[2]) * 10 ** Number(m[1]),
    [1e14, 1e31],
  );
  if (directo.valor !== null) return directo;

  // Si no hay masa explícita, se deduce de GM (parámetro gravitacional
  // estándar), que Horizons publica casi siempre y con más precisión.
  const gm = parametroGM(t);
  if (gm.valor === null) return { valor: null, origen: null };
  const G = 6.6743e-20;   // km^3 kg^-1 s^-2 (CODATA 2018)
  return {
    valor: gm.valor / G,
    origen: `derivado de M = GM/G con ${gm.origen}`,
    derivado: true,
  };
}

function densidad(t) {
  return extraer(t, [
    // Variante con paréntesis intermedio: «Density (R=1195 km) = 1.86 g/cm^3».
    new RegExp(String.raw`Density\s*\([^)]*\)\s*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Density[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Mean dens[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Bulk density[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`\bDENS\s*=\s*${NUM}`),
  ], undefined, [0.05, 30]);      // Ningún cuerpo del sistema pasa de 30 g/cm³.
}

function gravedad(t) {
  return extraer(t, [
    new RegExp(String.raw`Equ\.? grav[^=\n]*=\s*${NUM}`, 'i'),
    new RegExp(String.raw`g_e,\s*m\/s\^2\s*\(equatorial\)[^=\n]*=\s*${NUM}`),
    new RegExp(String.raw`Surface gravity[^=\n]*=\s*${NUM}`, 'i'),
    new RegExp(String.raw`Surface accel[^=\n]*=\s*${NUM}`, 'i'),
    new RegExp(String.raw`Grav\.?\s*accel[^=\n]*=\s*${NUM}`, 'i'),
  ], undefined, [1e-5, 1000]);
}

function rotacionHoras(t) {
  // Formato «9h 55m 29.711 s».
  const sexagesimal = t.match(
    /Sid\.? rot\.? period[^=\n]*=\s*(\d+)h\s*(\d+)m\s*([\d.]+)\s*s/i,
  );
  if (sexagesimal) {
    return {
      valor: Number(sexagesimal[1]) + Number(sexagesimal[2]) / 60 + Number(sexagesimal[3]) / 3600,
      origen: sexagesimal[0].trim(),
    };
  }

  const enDias = extraer(
    t,
    [new RegExp(String.raw`(?:Adopted )?[Ss]id(?:ereal)?\.? rot(?:ation)?\.? per(?:iod)?\.?[^=\n]*=\s*~?\s*${NUM}\s*d\b`, 'i')],
    (m) => Number(m[1]) * 24,
  );
  if (enDias.valor !== null) return enDias;

  return extraer(t, [
    new RegExp(String.raw`\bROTPER\s*=\s*${NUM}`),
    new RegExp(String.raw`Rotation period[^=\n]*=\s*~?\s*${NUM}\s*h`, 'i'),
    new RegExp(String.raw`Sidereal rot\.? period[^=\n]*=\s*~?\s*${NUM}\s*h`, 'i'),
    new RegExp(String.raw`Sid(?:ereal)?\.? rot\.? period[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Mean sidereal day,?\s*hr[^=\n]*=\s*${NUM}`, 'i'),
    new RegExp(String.raw`Rotational period[^=\n]*=\s*${NUM}\s*d`, 'i'),
  ]);
}

function oblicuidad(t) {
  // Mercurio es el único que la publica en minutos de arco: «2.11' +/- 0.1'».
  // Tomarlo como grados daría 2,11° en lugar de los 0,034° reales.
  const enMinutos = extraer(
    t,
    [new RegExp(String.raw`Obliquity to orbit[^=\n]*=\s*${NUM}\s*'`, 'i')],
    (m) => Number(m[1]) / 60,
    [0, 180],
  );
  if (enMinutos.valor !== null) {
    return { ...enMinutos, origen: `${enMinutos.origen} (convertido de minutos de arco a grados)` };
  }

  return extraer(t, [
    new RegExp(String.raw`Obliquity to orbit[^=\n]*=\s*${NUM}\s*(?:deg|$)`, 'im'),
    new RegExp(String.raw`Obliquity to ecliptic[^=\n]*=\s*${NUM}`, 'i'),
    new RegExp(String.raw`Obliquity to orbit[^=\n]*=\s*${NUM}`, 'i'),
    new RegExp(String.raw`Axial tilt[^=\n]*=\s*${NUM}`, 'i'),
  ], undefined, [0, 180]);
}

/**
 * Albedo geométrico: la fracción de luz que el cuerpo refleja. Es un dato real
 * y comparable entre cuerpos, así que la HUD lo usa en lugar de rellenar el
 * panel de indicadores con una cifra decorativa.
 */
function albedo(t) {
  return extraer(t, [
    new RegExp(String.raw`Geometric [Aa]lbedo[^=\n]*=\s*~?\s*${NUM}`),
    new RegExp(String.raw`\bALBEDO\s*=\s*${NUM}`),
    new RegExp(String.raw`Albedo[^=\n]*=\s*~?\s*${NUM}`, 'i'),
  ], undefined, [0.001, 1.5]);
}

/**
 * Velocidad de escape, en km/s. Horizons solo la publica para diez de los
 * treinta y tres cuerpos; para el resto se deduce de v = √(2GM/R), que es su
 * definición exacta, no una aproximación. Se anota que el valor es derivado.
 */
function velocidadEscape(t, radioMedioKm) {
  const publicada = extraer(t, [
    new RegExp(String.raw`Escape (?:speed|velocity)[^=\n]*=\s*~?\s*${NUM}`, 'i'),
    new RegExp(String.raw`Escape vel[^=\n]*=\s*~?\s*${NUM}`, 'i'),
  ], undefined, [0.001, 1000]);
  if (publicada.valor !== null) return publicada;

  const gm = parametroGM(t);
  if (gm.valor === null || !radioMedioKm) return { valor: null, origen: null };
  return {
    valor: Math.sqrt((2 * gm.valor) / radioMedioKm),
    origen: `derivado de v = √(2GM/R) con ${gm.origen}`,
    derivado: true,
  };
}

/** Parámetro gravitacional estándar GM, en km^3/s^2. */
function parametroGM(t) {
  return extraer(t, [
    new RegExp(String.raw`GM\s*\(?\s*km\^3[/ ]s\^2\s*\)?[^=\n]*=\s*${NUM}`, 'i'),
    new RegExp(String.raw`GM,?\s*km\^3\/s\^2[^=\n]*=\s*${NUM}`, 'i'),
    new RegExp(String.raw`GM\s*=\s*${NUM}`, 'i'),
  ]);
}

/**
 * Gravedad superficial. Horizons no la publica para casi ningún satélite, pero
 * sí publica GM y el radio: g = GM/R². Se deja constancia de que el valor es
 * derivado y de la fórmula, no se presenta como si viniera tal cual de la API.
 */
function gravedadDerivada(t, radioMedioKm) {
  const gm = parametroGM(t);
  if (gm.valor === null || !radioMedioKm) return { valor: null, origen: null };
  const g = (gm.valor / radioMedioKm ** 2) * 1000;   // km/s² → m/s²
  return {
    valor: g,
    origen: `derivado de g = GM/R² con ${gm.origen}`,
    derivado: true,
  };
}

/**
 * Rotación síncrona: la mayoría de los satélites grandes muestran siempre la
 * misma cara a su planeta, así que su periodo de rotación es el orbital.
 */
function esSincrono(t) {
  return /Rotational period\s*[=~]\s*Synchronous/i.test(t);
}

/** Fecha de revisión que declara el propio Horizons para ese cuerpo. */
function fechaRevision(t) {
  const m =
    t.match(/(?:revised|updated)[:\s]+([A-Za-z0-9,\- ]+?)\)/i) ??
    t.match(/Revised:\s*([A-Za-z0-9,\- ]+?)\s{2,}/i);
  return m ? m[1].trim() : null;
}

/** Nombre oficial que Horizons asigna al cuerpo. */
function nombreHorizons(t) {
  const m = t.match(/Revised:.*?\n?\s*(?:.*?)\s{2,}([A-Za-z0-9 ()/.-]+?)\s{2,}\d+\s*$/m);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Extracción de elementos orbitales
// ---------------------------------------------------------------------------

/**
 * Lee el primer registro del bloque $$SOE…$$EOE.
 * Unidades: A en au o km según OUT_UNITS; PR en días; ángulos en grados.
 */
function elementos(texto) {
  const bloque = texto.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
  if (!bloque) return null;

  const campo = (clave) => {
    const m = bloque[1].match(new RegExp(String.raw`\b${clave}\s*=\s*([-+\dEe.]+)`));
    return m ? Number(m[1]) : null;
  };

  return {
    excentricidad: campo('EC'),
    inclinacionGrados: campo('IN'),
    nodoAscendenteGrados: campo('OM'),
    argumentoPeriastroGrados: campo('W'),
    // La anomalía media en la época es imprescindible: sin ella se puede
    // dibujar la elipse, pero no situar el cuerpo en el punto correcto de ella.
    anomaliaMediaGrados: campo('MA'),
    semiejeMayor: campo('A'),
    periodoDias: campo('PR'),
  };
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

const redondear = (v, decimales) =>
  v === null || v === undefined ? null : Number(v.toPrecision(decimales));

async function principal() {
  const salida = {};

  for (const cuerpo of CUERPOS) {
    process.stdout.write(`▸ ${cuerpo.id.padEnd(12)}`);

    const fisico = await horizons(`${cuerpo.id}-fisico`, {
      COMMAND: cuerpo.horizons,
      OBJ_DATA: 'YES',
      MAKE_EPHEM: 'NO',
    });

    const registro = {
      horizons: cuerpo.horizons,
      tipo: cuerpo.tipo,
      revisado: fechaRevision(fisico),
      fisica: {},
      orbita: null,
      origen: {},
    };

    const radio = radioKm(fisico);
    let gravitacion = gravedad(fisico);
    if (gravitacion.valor === null) gravitacion = gravedadDerivada(fisico, radio.valor);

    const campos = {
      radioMedioKm: radio,
      masaKg: masaKg(fisico),
      densidadGcm3: densidad(fisico),
      gravedadMs2: gravitacion,
      periodoRotacionHoras: rotacionHoras(fisico),
      inclinacionAxialGrados: oblicuidad(fisico),
      albedoGeometrico: albedo(fisico),
      velocidadEscapeKms: velocidadEscape(fisico, radio.valor),
    };

    for (const [clave, { valor, origen }] of Object.entries(campos)) {
      registro.fisica[clave] = redondear(valor, 6);
      registro.origen[clave] = origen;
    }
    registro.rotacionSincrona = esSincrono(fisico);

    if (cuerpo.centro) {
      const unidades = cuerpo.tipo === 'satelite' ? 'KM-D' : 'AU-D';
      // Todo se refiere a la eclíptica J2000, también los satélites: es el
      // único plano que la API acepta de forma fiable y deja todas las órbitas
      // en un mismo sistema, que es justo lo que necesita la escena. Con él,
      // la inclinación de Tritón (retrógrada) sale correctamente por encima de
      // 90°, sin tener que componer la orientación del planeta.
      const plano = 'ECLIPTIC';
      const orbital = await horizons(`${cuerpo.id}-orbita`, {
        COMMAND: cuerpo.horizons,
        OBJ_DATA: 'NO',
        MAKE_EPHEM: 'YES',
        EPHEM_TYPE: 'ELEMENTS',
        CENTER: cuerpo.centro,
        START_TIME: EPOCA,
        STOP_TIME: '2000-01-02',
        STEP_SIZE: '1d',
        OUT_UNITS: unidades,
        REF_PLANE: plano,
      });

      const e = elementos(orbital);
      if (e) {
        // Un satélite síncrono rota una vez por órbita: el dato existe, solo
        // que Horizons lo expresa con la palabra «Synchronous».
        if (registro.rotacionSincrona && registro.fisica.periodoRotacionHoras === null) {
          registro.fisica.periodoRotacionHoras = redondear(e.periodoDias * 24, 6);
          registro.origen.periodoRotacionHoras =
            'rotación síncrona declarada por Horizons: igual al periodo orbital';
        }
        registro.orbita = {
          excentricidad: redondear(e.excentricidad, 6),
          inclinacionGrados: redondear(e.inclinacionGrados, 6),
          nodoAscendenteGrados: redondear(e.nodoAscendenteGrados, 6),
          argumentoPeriastroGrados: redondear(e.argumentoPeriastroGrados, 6),
          anomaliaMediaGrados: redondear(e.anomaliaMediaGrados, 8),
          periodoOrbitalDias: redondear(e.periodoDias, 8),
          semiejeMayorUA: unidades === 'AU-D' ? redondear(e.semiejeMayor, 8) : null,
          semiejeMayorKm: unidades === 'KM-D' ? redondear(e.semiejeMayor, 8) : null,
          planoReferencia: 'eclíptica J2000',
          epoca: `${EPOCA} TDB (elementos osculadores)`,
        };
      }
    }

    const faltan = Object.entries(registro.fisica)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    console.log(faltan.length ? `  ⚠ sin: ${faltan.join(', ')}` : '  ✓');

    salida[cuerpo.id] = registro;
  }

  await writeFile(
    join(RAIZ, 'data/fisica-jpl.json'),
    JSON.stringify(
      {
        $esquema: 'orbis/fisica-jpl/1',
        nota:
          'GENERADO POR tools/datos-jpl.mjs — no editar a mano. Cada cifra procede ' +
          'de la API de JPL Horizons; el campo «origen» guarda la línea literal de ' +
          'la que se extrajo, para poder auditarla. Lo que no se pudo extraer queda ' +
          'en null y la interfaz lo muestra como SIN DATOS.',
        fuente: 'NASA/JPL Horizons — https://ssd.jpl.nasa.gov/api/horizons.api',
        epocaElementos: `${EPOCA} TDB`,
        cuerpos: salida,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`\n✔ data/fisica-jpl.json con ${Object.keys(salida).length} cuerpos.\n`);
}

principal().catch((err) => {
  console.error(`\n✘ ${err.message}\n`);
  process.exit(1);
});

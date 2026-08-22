#!/usr/bin/env node
/**
 * ORBIS — Descarga de texturas planetarias.
 *
 * Se ejecuta SOLO en desarrollo. Las texturas no se versionan (pesan decenas
 * de megabytes y tienen licencias propias): este script las obtiene de fuentes
 * verificables y genera assets/textures/CREDITOS.json con la autoría y la
 * licencia REALES de cada archivo, leídas de la propia fuente.
 *
 *   node tools/texturas.mjs             descarga todo lo que falte
 *   node tools/texturas.mjs --forzar    vuelve a descargar aunque exista
 *
 * REGLA DE RIGOR: aquí solo entran mapas fotográficos o cartográficos reales.
 * Wikimedia Commons aloja también texturas «fictional» de Ceres, Eris, Haumea
 * y Makemake —invenciones artísticas, porque no existe cartografía de esos
 * cuerpos—. NO se descargan. Esos cuerpos se dibujan con un color plano y la
 * interfaz los marca como SIMULACIÓN.
 */
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'assets/textures');
const FORZAR = process.argv.includes('--forzar');

// Wikimedia exige un User-Agent identificable en su política de uso de la API.
const UA = 'ORBIS-vendor/0.1 (https://guaguas.narino.gov.co; hosting@narino.gov.co)';
const API = 'https://commons.wikimedia.org/w/api.php';

/**
 * Catálogo de texturas.
 * `ancho` es el del mapa completo; de cada uno se genera además una versión de
 * 512 px que la escena carga primero para ser navegable de inmediato.
 */
const CATALOGO = [
  { archivo: 'sol.jpg',            titulo: 'Solarsystemscope texture 2k sun.jpg',              ancho: 2048 },
  { archivo: 'mercurio.jpg',       titulo: 'Solarsystemscope texture 2k mercury.jpg',          ancho: 2048 },
  { archivo: 'venus.jpg',          titulo: 'Solarsystemscope texture 2k venus atmosphere.jpg', ancho: 2048 },
  { archivo: 'venus-superficie.jpg', titulo: 'Solarsystemscope texture 2k venus surface.jpg',  ancho: 2048 },
  { archivo: 'tierra.jpg',         titulo: 'Solarsystemscope texture 2k earth daymap.jpg',     ancho: 2048 },
  { archivo: 'tierra-noche.jpg',   titulo: 'Solarsystemscope texture 2k earth nightmap.jpg',   ancho: 2048 },
  { archivo: 'tierra-nubes.jpg',   titulo: 'Solarsystemscope texture 2k earth clouds.jpg',     ancho: 2048 },
  { archivo: 'marte.jpg',          titulo: 'Solarsystemscope texture 2k mars.jpg',             ancho: 2048 },
  { archivo: 'jupiter.jpg',        titulo: 'Solarsystemscope texture 2k jupiter.jpg',          ancho: 2048 },
  { archivo: 'saturno.jpg',        titulo: 'Solarsystemscope texture 2k saturn.jpg',           ancho: 2048 },
  { archivo: 'saturno-anillos.png', titulo: 'Solarsystemscope texture 2k saturn ring alpha.png', ancho: 1024 },
  { archivo: 'urano.jpg',          titulo: 'Solarsystemscope texture 2k uranus.jpg',           ancho: 2048 },
  { archivo: 'neptuno.jpg',        titulo: 'Solarsystemscope texture 2k neptune.jpg',          ancho: 2048 },
  { archivo: 'luna.jpg',           titulo: 'Solarsystemscope texture 2k moon.jpg',             ancho: 2048 },
  { archivo: 'estrellas.jpg',      titulo: 'Solarsystemscope texture 2k stars milky way.jpg',  ancho: 4096 },

  // Cartografía real de satélites, de dominio público (NASA/USGS). Solo entran
  // mapas equirectangulares de proporción 2:1; cualquier otra cosa se rechaza
  // automáticamente porque no envuelve correctamente una esfera.
  { archivo: 'titan.jpg',          titulo: 'Titan map April 2011 full.png',                    ancho: 2048 },
  { archivo: 'triton.jpg',         titulo: 'Triton map no grid.jpg',                           ancho: 2048 },

  // Cuerpos que se dibujaban con un color plano por no tener aquí su mapa, no
  // por no existir. La nota decía «sin mapa fotográfico EN EL REPOSITORIO», que
  // es muy distinto de «no hay»: a Plutón lo cartografió New Horizons, a Ceres
  // la sonda Dawn, a las lunas de Júpiter y Saturno las Voyager, Galileo y
  // Cassini, y a las de Urano la Voyager 2. Se prefieren los archivos con
  // atribución explícita de NASA, JPL, USGS o número PIA.
  { archivo: 'pluton.jpg',         titulo: 'Pluto-map-sept-16-2015.jpg',                       ancho: 2048 },
  { archivo: 'ceres.png',          titulo: 'Map of Ceres (PIA19625 cropped).png',              ancho: 2048 },
  { archivo: 'europa.jpg',         titulo: 'Moon Europa color map.jpg',                        ancho: 2048 },
  { archivo: 'ganimedes.jpg',      titulo: 'Map of Ganymede by Björn Jónsson.jpg',             ancho: 1800 },
  { archivo: 'calisto.jpg',        titulo: 'Callisto map NASA JPL Voyager.jpg',                ancho: 1440 },
  { archivo: 'mimas.jpg',          titulo: 'Map of Mimas colorized 2014-04 PIA18437.jpg',      ancho: 2048 },
  { archivo: 'encelado.jpg',       titulo: 'Color map of Enceladus PIA18435 (modified).jpg',   ancho: 2048 },
  { archivo: 'rea.jpg',            titulo: 'Rhea map NASA JPL Voyager.jpg',                    ancho: 1440 },
  { archivo: 'japeto.jpg',         titulo: 'Iapetus May 2008 PIA11116 moon only.jpg',          ancho: 2048 },
  { archivo: 'ariel.jpg',          titulo: 'Ariel map JPL USGS.jpg',                           ancho: 1440 },
  { archivo: 'umbriel.jpg',        titulo: 'Umbriel map JPL USGS.jpg',                         ancho: 1440 },
  { archivo: 'titania.jpg',        titulo: 'Titania map JPL USGS.jpg',                         ancho: 1440 },
  { archivo: 'oberon.jpg',         titulo: 'Oberon map JPL USGS.jpg',                          ancho: 1440 },
  { archivo: 'miranda.jpg',        titulo: 'Miranda map JPL USGS.jpg',                         ancho: 1440 },
  { archivo: 'caronte.jpg',        titulo: 'Charon map iau1803c.jpg',                          ancho: 2048 },
  { archivo: 'fobos.jpg',          titulo: 'Phobos Viking Mosaic DLRcontrol 7200.jpg',         ancho: 2048 },
  { archivo: 'deimos.jpg',         titulo: 'Deimos color map.jpg',                             ancho: 1264 },

  // NO se añaden: Eris, Makemake y Haumea, porque de esos NO existe
  // cartografía —son puntos de luz incluso para el Hubble— y lo único que
  // circula son invenciones artísticas. Tampoco Ío: se buscó y en Commons no
  // hay ningún mapa suyo en proporción 2:1, que es la que envuelve una esfera.
];

/** Descarga con reintentos: Commons devuelve 429 con facilidad. */
async function pedir(url, binario = false, intento = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 || res.status >= 500) {
    if (intento > 5) throw new Error(`${res.status} tras 5 intentos — ${url}`);
    const espera = 2 ** intento * 1000;
    console.log(`    · ${res.status}, reintento ${intento} en ${espera / 1000}s`);
    await new Promise((r) => setTimeout(r, espera));
    return pedir(url, binario, intento + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return binario ? Buffer.from(await res.arrayBuffer()) : res.json();
}

/** Limpia el HTML que Commons devuelve en los campos de metadatos. */
const sinEtiquetas = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function existe(ruta) {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

/** Pide a Commons la URL de una miniatura del ancho pedido y sus metadatos. */
async function consultar(titulo, ancho) {
  const url =
    `${API}?action=query&format=json&formatversion=2` +
    `&titles=${encodeURIComponent('File:' + titulo)}` +
    `&prop=imageinfo&iiprop=${encodeURIComponent('url|size|extmetadata')}` +
    `&iiurlwidth=${ancho}`;
  const datos = await pedir(url);
  const pagina = datos?.query?.pages?.[0];
  if (!pagina || pagina.missing) throw new Error(`No existe en Commons: ${titulo}`);
  const info = pagina.imageinfo[0];
  const meta = info.extmetadata ?? {};
  return {
    url: info.thumburl ?? info.url,
    ancho: info.thumbwidth ?? info.width,
    alto: info.thumbheight ?? info.height,
    autor: sinEtiquetas(meta.Artist?.value) || 'Sin autoría declarada',
    licencia: sinEtiquetas(meta.LicenseShortName?.value) || 'Sin licencia declarada',
    urlLicencia: sinEtiquetas(meta.LicenseUrl?.value) || null,
    descripcion: sinEtiquetas(meta.ImageDescription?.value).slice(0, 200) || null,
    paginaCommons: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(titulo)}`,
  };
}

async function principal() {
  await mkdir(DESTINO, { recursive: true });
  const creditos = [];
  let descargados = 0;
  let omitidos = 0;

  for (const entrada of CATALOGO) {
    const rutaGrande = join(DESTINO, entrada.archivo);
    const rutaPequena = join(DESTINO, entrada.archivo.replace(/(\.\w+)$/, '@512$1'));

    console.log(`▸ ${entrada.archivo}`);
    const info = await consultar(entrada.titulo, entrada.ancho);

    // Una textura de esfera tiene que ser equirectangular: el ancho debe ser
    // exactamente el doble del alto. Los anillos son la excepción, porque son
    // una tira radial, no una envolvente.
    const proporcion = info.ancho / info.alto;
    const esAnillo = entrada.archivo.includes('anillos');
    if (!esAnillo && Math.abs(proporcion - 2) > 0.05) {
      console.log(`    ✘ proporción ${proporcion.toFixed(2)}:1 — no es equirectangular, se descarta`);
      continue;
    }

    creditos.push({
      archivo: entrada.archivo,
      obra: entrada.titulo.replace(/^File:/, ''),
      autor: info.autor,
      licencia: info.licencia,
      urlLicencia: info.urlLicencia,
      fuente: info.paginaCommons,
    });

    if (!FORZAR && (await existe(rutaGrande))) {
      console.log('    · ya estaba, se omite');
      omitidos++;
      continue;
    }

    const grande = await pedir(info.url, true);
    await writeFile(rutaGrande, grande);
    console.log(`    ✓ ${info.ancho}×${info.alto} · ${(grande.length / 1024).toFixed(0)} kB`);
    descargados++;

    // Nivel reducido: lo sirve la carga inicial para que la escena sea
    // navegable de inmediato en conexiones lentas.
    const pequena = await consultar(entrada.titulo, 512);
    const bytes = await pedir(pequena.url, true);
    await writeFile(rutaPequena, bytes);
    console.log(`    ✓ 512 px · ${(bytes.length / 1024).toFixed(0)} kB`);
    descargados++;
  }

  await writeFile(
    join(DESTINO, 'CREDITOS.json'),
    JSON.stringify(
      {
        nota:
          'Generado por tools/texturas.mjs. La atribución se lee de la propia ' +
          'fuente, no se escribe a mano. La interfaz la muestra en el panel de créditos.',
        generado: null,
        texturas: creditos,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`\n✔ ${descargados} archivo(s) descargados, ${omitidos} ya presentes.`);
  console.log('  Créditos en assets/textures/CREDITOS.json\n');
}

principal().catch((err) => {
  console.error(`\n✘ ${err.message}\n`);
  process.exit(1);
});

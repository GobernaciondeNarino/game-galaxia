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
 * Wikimedia Commons aloja también texturas «fictional» de Eris, Haumea y
 * Makemake —invenciones artísticas, porque de esos cuerpos no existe
 * cartografía—. NO se descargan: se dibujan con un color plano y la interfaz
 * los marca como SIMULACIÓN.
 *
 * Y tampoco entra un mapa real con rótulos encima. Existe uno de Ío con los
 * nombres de las regiones grabados en la imagen; envuelto en la esfera, el
 * satélite saldría con texto escrito en la superficie.
 */
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ejecutar = promisify(execFile);

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'wj-content/assets/textures');
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
  // .png y no .jpg: el nombre lo pone esta tabla y el contenido lo pone la
  // fuente, y aquí la fuente es un PNG. Se llamaba «titan.jpg» y era un PNG;
  // el navegador lo servía igual porque mira el contenido, pero un archivo que
  // miente sobre su formato acaba rompiendo la herramienta que se lo crea.
  { archivo: 'titan.png',          titulo: 'Titan map April 2011 full.png',                    ancho: 2048 },
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

  // Ío. La búsqueda anterior se dio por vencida demasiado pronto: dijo que en
  // Commons no había ningún mapa suyo en proporción 2:1 y sí lo hay. Es el
  // fotomosaico Voyager + Galileo del USGS, de dominio público, con cobertura
  // declarada de -90 a 90 de latitud y de 0 a 360 de longitud.
  //
  // Hay otra copia del mismo mapa a 4096 px, pero lleva los nombres de las
  // regiones ROTULADOS ENCIMA: al envolverla en la esfera, Ío saldría con
  // «COLCHIS REGIO» escrito en la superficie. Se prefiere esta, más pequeña y
  // limpia; 1225 px está en la línea de Calisto, Rea y las lunas de Urano.
  { archivo: 'io.jpg',             titulo: 'Io for GeoHacks.jpg',                              ancho: 1225 },

  // NO se añaden: Eris, Makemake y Haumea. De esos NO existe cartografía —son
  // puntos de luz incluso para el Hubble— y lo único que circula son
  // invenciones artísticas. Se dibujan con un color plano y la interfaz los
  // marca como SIMULACIÓN, que es lo honesto: no hay foto que enseñar.
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

/**
 * Reduce una textura a 512 px con GD, sobrescribiéndola.
 *
 * Se hace con PHP porque PHP ya es un requisito del proyecto —es el backend
 * entero— y GD viene con él. La alternativa era una dependencia de Node solo
 * para esto, y la regla 1 del pliego dice que no hay npm ni paso de
 * compilación. Esto se ejecuta SOLO al regenerar las texturas; el servidor no
 * lo llama nunca.
 *
 * Si GD no está, no se rompe la descarga: se avisa y se queda el archivo tal
 * cual llegó. Pesará de más, pero funcionará.
 */
async function reducir(origen, destino) {
  try {
    const { stdout } = await ejecutar('php', [join(RAIZ, 'tools/reducir-textura.php'), origen, destino, '512', '82']);
    return stdout.trim();
  } catch (err) {
    // Sin GD no se rompe la descarga: se copia el completo tal cual y se avisa.
    // Pesará de más, pero la escena funcionará igual.
    await writeFile(destino, await readFile(origen));
    console.log('    ! no se pudo reducir (¿falta php-gd?):', String(err.message).split('\n')[0]);
    return `copia del completo, SIN reducir`;
  }
}

async function principal() {
  await mkdir(DESTINO, { recursive: true });
  const creditos = [];
  let descargados = 0;
  let omitidos = 0;

  for (const entrada of CATALOGO) {
    const rutaGrande = join(DESTINO, entrada.archivo);
    // El nivel ligero SIEMPRE es .jpg: lo produce GD recodificando, sea cual
    // sea el formato del original. Un PNG de 512 px de una foto pesa cinco
    // veces más que el JPEG equivalente y no se distingue a ese tamaño.
    const rutaPequena = join(DESTINO, entrada.archivo.replace(/\.\w+$/, '@512.jpg'));

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
      console.log('    · ya estaba, no se vuelve a descargar');
      omitidos++;
    } else {
      const grande = await pedir(info.url, true);
      await writeFile(rutaGrande, grande);
      console.log(`    ✓ ${info.ancho}×${info.alto} · ${(grande.length / 1024).toFixed(0)} kB`);
      descargados++;
    }

    // Nivel ligero: lo sirve la carga inicial para que la escena sea navegable
    // de inmediato en conexiones lentas.
    //
    // Se DERIVA del archivo completo que ya está en disco, no se descarga
    // aparte. Antes se pedía a la API una miniatura de 512 px, y la API
    // respondía «thumbwidth: 512» acompañada de una URL que apunta a la de 960,
    // porque Wikimedia redondea a sus tamaños en caché: los 35 archivos «@512»
    // medían 960 px y pesaban 3,53 MB entre todos, casi lo mismo que los
    // completos. El nivel ligero no aligeraba nada.
    //
    // Derivarlo en local arregla las dos cosas de una vez: mide de verdad 512
    // px —0,79 MB entre todos, cuatro veces y media menos en la carga inicial—
    // y ahorra una segunda descarga por textura.
    // Los anillos NO tienen nivel ligero, y no por olvido: su textura es una
    // tira radial con canal ALFA —es a la vez `map` y `alphaMap`— y el JPEG no
    // guarda transparencia, así que reducirla dejaría los anillos como un
    // rectángulo opaco. Rings.js carga siempre la completa, que pesa 30 kB.
    if (esAnillo) {
      console.log('    · sin nivel ligero: lleva canal alfa y se carga entera');
    } else if (FORZAR || !(await existe(rutaPequena))) {
      console.log(`    ✓ nivel ligero · ${await reducir(rutaGrande, rutaPequena)}`);
    }
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

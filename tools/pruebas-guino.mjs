#!/usr/bin/env node
/**
 * ORBIS — Pruebas del reconocedor de guiños.
 *
 * Reproduce con números lo que hace una cara delante de la cámara: parpadeos
 * normales, guiños deliberados, ojos entrecerrados y pérdidas momentáneas del
 * rostro. Sin cámara y sin navegador, así que corre en cada push.
 *
 * La prueba que de verdad importa es la de los parpadeos: si un parpadeo
 * contara como guiño, la narración se cortaría sola cada pocos segundos y el
 * usuario no tendría forma de saber por qué.
 *
 *   node tools/pruebas-guino.mjs
 */
import { ReconocedorGuino, ojosDesdeResultado, AJUSTES_GUINO } from '../js/input/ReconocedorGuino.js';

let fallos = 0;
const comprobar = (nombre, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` — esperado «${esperado}», obtenido «${real}»`}`);
};

/** Reproduce una secuencia de lecturas a 15 Hz y cuenta los disparos. */
function reproducir(reconocedor, lecturas, { hz = 15, desde = 0 } = {}) {
  const paso = 1000 / hz;
  let t = desde;
  let disparos = 0;
  const progresos = [];
  for (const ojos of lecturas) {
    const r = reconocedor.procesar(ojos, (t += paso));
    if (r.disparo) disparos++;
    progresos.push(r.progreso);
  }
  return { disparos, progresos, t };
}

/** n lecturas iguales. */
const repetir = (n, ojos) => Array.from({ length: n }, () => ojos);

const ABIERTOS = { izquierdo: 0.03, derecho: 0.04 };
const GUINO_IZQ = { izquierdo: 0.92, derecho: 0.05 };
const GUINO_DER = { izquierdo: 0.06, derecho: 0.88 };

console.log('\n▸ Un parpadeo normal NO es un guiño');
{
  const r = new ReconocedorGuino();
  // Un parpadeo cierra los dos ojos a la vez y dura unos 130 ms: a 15 Hz son
  // dos lecturas. Se encadenan veinte parpadeos, casi un minuto de uso normal.
  const secuencia = [];
  for (let i = 0; i < 20; i++) {
    secuencia.push(...repetir(8, ABIERTOS));
    secuencia.push({ izquierdo: 0.95, derecho: 0.93 });
    secuencia.push({ izquierdo: 0.88, derecho: 0.91 });
  }
  comprobar('veinte parpadeos, cero disparos', reproducir(r, secuencia).disparos, 0);
}

console.log('\n▸ Un parpadeo largo y forzado tampoco');
{
  const r = new ReconocedorGuino();
  // Los dos ojos cerrados tres segundos: apretar los ojos, no guiñar.
  comprobar('ojos cerrados 3 s, cero disparos',
    reproducir(r, repetir(45, { izquierdo: 0.97, derecho: 0.96 })).disparos, 0);
}

console.log('\n▸ Un guiño sostenido sí dispara, y una sola vez');
{
  for (const [nombre, guino] of [['ojo izquierdo', GUINO_IZQ], ['ojo derecho', GUINO_DER]]) {
    const r = new ReconocedorGuino();
    const { disparos, progresos } = reproducir(r, repetir(45, guino));   // 3 s
    comprobar(`${nombre}: dispara una vez`, disparos, 1);
    comprobar(`${nombre}: el progreso avisa antes`, progresos.some((p) => p > 0.3 && p < 1), true);
  }
}

console.log('\n▸ Hay que abrir el ojo para volver a guiñar');
{
  const r = new ReconocedorGuino();
  let t = 0;
  const tanda = (lecturas) => { const s = reproducir(r, lecturas, { desde: t }); t = s.t; return s.disparos; };

  comprobar('primer guiño', tanda(repetir(20, GUINO_IZQ)), 1);
  comprobar('seguir guiñando no repite', tanda(repetir(40, GUINO_IZQ)), 0);
  tanda(repetir(5, ABIERTOS));
  comprobar('tras abrir, vuelve a contar', tanda(repetir(20, GUINO_IZQ)), 1);
}

console.log('\n▸ Un guiño demasiado corto no basta');
{
  const r = new ReconocedorGuino();
  // 4 lecturas a 15 Hz ≈ 265 ms, por debajo de los 450 del umbral.
  comprobar('no dispara', reproducir(r, repetir(4, GUINO_IZQ)).disparos, 0);
}

console.log('\n▸ Ojos entrecerrados: ni una cosa ni la otra');
{
  const r = new ReconocedorGuino();
  // Ambos en la franja intermedia: el modelo no está seguro y no se decide nada.
  comprobar('no dispara', reproducir(r, repetir(45, { izquierdo: 0.4, derecho: 0.35 })).disparos, 0);
}
{
  const r = new ReconocedorGuino();
  // Asimetría real pero pequeña: un parpadeo capturado a medias.
  comprobar('asimetría insuficiente no dispara',
    reproducir(r, repetir(45, { izquierdo: 0.55, derecho: 0.30 })).disparos, 0);
}

console.log('\n▸ Perder el rostro un instante no cancela el guiño');
{
  const r = new ReconocedorGuino();
  let t = 0;
  const paso = 1000 / 15;
  let disparos = 0;
  const ver = (ojos, n) => {
    for (let i = 0; i < n; i++) if (r.procesar(ojos, (t += paso)).disparo) disparos++;
  };
  ver(GUINO_IZQ, 4);     // ~265 ms guiñando
  ver(null, 2);          // ~130 ms sin rostro: por debajo de la tolerancia
  ver(GUINO_IZQ, 6);     // se completa el guiño
  comprobar('el guiño se completa', disparos, 1);
}

console.log('\n▸ Salir del encuadre sí lo cancela');
{
  const r = new ReconocedorGuino();
  let t = 0;
  const paso = 1000 / 15;
  let disparos = 0;
  const ver = (ojos, n) => {
    for (let i = 0; i < n; i++) if (r.procesar(ojos, (t += paso)).disparo) disparos++;
  };
  ver(GUINO_IZQ, 4);     // ~265 ms guiñando, aún sin disparar
  ver(null, 10);         // ~665 ms sin rostro: por encima de la tolerancia
  ver(GUINO_IZQ, 4);     // ~265 ms más: si no se hubiera reiniciado, dispararía
  comprobar('la cuenta empieza de cero', disparos, 0);
}

console.log('\n▸ Lectura de los blendshapes de MediaPipe');
{
  const resultado = {
    faceBlendshapes: [{
      categories: [
        { categoryName: 'browDownLeft', score: 0.1 },
        { categoryName: 'eyeBlinkLeft', score: 0.91 },
        { categoryName: 'eyeBlinkRight', score: 0.04 },
        { categoryName: 'jawOpen', score: 0.2 },
      ],
    }],
  };
  const ojos = ojosDesdeResultado(resultado);
  comprobar('ojo izquierdo', ojos.izquierdo, 0.91);
  comprobar('ojo derecho', ojos.derecho, 0.04);
  comprobar('sin rostro devuelve null', ojosDesdeResultado({ faceBlendshapes: [] }), null);
  comprobar('resultado vacío devuelve null', ojosDesdeResultado(null), null);
  // Si el detector se creara sin outputFaceBlendshapes llegarían puntos pero no
  // formas, y hay que notarlo en lugar de leer «undefined» como «ojo abierto».
  comprobar('sin blendshapes devuelve null',
    ojosDesdeResultado({ faceLandmarks: [[{ x: 0, y: 0 }]] }), null);
}

console.log('\n▸ Los umbrales son coherentes entre sí');
{
  comprobar('cerrado por encima de abierto',
    AJUSTES_GUINO.umbralCerrado > AJUSTES_GUINO.umbralAbierto, true);
  // Si la diferencia mínima fuese menor que la distancia entre los dos
  // umbrales, no aportaría nada y sobraría.
  comprobar('la diferencia mínima aprieta de verdad',
    AJUSTES_GUINO.diferenciaMinima >= AJUSTES_GUINO.umbralCerrado - AJUSTES_GUINO.umbralAbierto, true);
  // Por encima de cualquier parpadeo (150 ms) y por debajo de lo que cansa.
  comprobar('el sostenido supera un parpadeo', AJUSTES_GUINO.sostenido > 200, true);
  comprobar('el sostenido no es agotador', AJUSTES_GUINO.sostenido <= 800, true);
}

console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallida(s)\n` : '\n✔ Todas las comprobaciones pasan\n');
process.exit(fallos ? 1 : 0);

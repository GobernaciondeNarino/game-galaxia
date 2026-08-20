/**
 * ORBIS — punto de entrada.
 *
 * Arranca la aplicación: diagnostica el entorno, carga el catálogo, construye
 * la escena tridimensional y pone en marcha el bucle de render.
 *
 * Fase 1 implementada: Sol, planetas, planetas enanos, satélites, anillos,
 * cinturones, entorno galáctico, órbitas keplerianas reales, post-procesado con
 * bloom y controles de ratón y teclado. La HUD completa llega en la fase 3.
 */

import { App } from './core/App.js';
import { ejecutarDiagnostico, titularDeFallo } from './core/Diagnostico.js';
import { SceneManager } from './core/SceneManager.js';
import { PostFX } from './core/PostFX.js';
import { CameraRig } from './core/CameraRig.js';
import { Loop, VELOCIDADES } from './core/Loop.js';
import { SolarSystem } from './system/SolarSystem.js';
import { FallbackControls } from './input/FallbackControls.js';
import { $, crear, anunciar } from './utils/dom.js';
import { RAIZ, rutaApp } from './utils/rutas.js';
import { depuracion, log, error } from './utils/debug.js';

const relleno = $('#arranque-relleno');
const detalle = $('#arranque-detalle');
const barra = relleno?.parentElement;

/** Refleja el progreso real de carga en la pantalla de arranque. */
function progresar(fraccion, texto) {
  const porcentaje = Math.round(Math.min(1, Math.max(0, fraccion)) * 100);
  if (relleno) relleno.style.width = `${porcentaje}%`;
  if (barra) barra.setAttribute('aria-valuenow', String(porcentaje));
  if (detalle && texto) detalle.textContent = texto;
}

/**
 * Deja la pantalla de arranque en estado de fallo irrecuperable.
 * El mensaje debe decir qué pasa y qué hacer, nunca un genérico que culpe al
 * navegador de quien visita la página cuando el problema es del despliegue.
 */
function fallar(titular, detalles = []) {
  $('.arranque__marco')?.setAttribute('data-fallo', '');
  progresar(1, titular);

  const aviso = $('.arranque__aviso');
  if (aviso) {
    aviso.innerHTML = '';
    aviso.append(
      crear('strong', { text: 'Cada punto en rojo indica qué falta. ' }),
      'La guía completa está en docs/DESPLIEGUE-PLESK.md, apartado «Resolución de problemas».',
    );
  }

  anunciar(`Error de arranque: ${titular}`);
  error(titular, ...detalles);
}

/**
 * Espera a que terminen de cargar las texturas, informando del progreso REAL
 * del LoadingManager de Three.js. Nunca una barra simulada.
 */
function esperarTexturas(gestor, desde, hasta) {
  return new Promise((resolver) => {
    let pendientes = 0;
    let terminadas = 0;
    let cerrado = false;

    const acabar = () => {
      if (cerrado) return;
      cerrado = true;
      resolver();
    };

    gestor.gestorCarga.onStart = (_, cargadas, total) => {
      pendientes = total;
    };
    gestor.gestorCarga.onProgress = (_, cargadas, total) => {
      pendientes = total;
      terminadas = cargadas;
      progresar(desde + (hasta - desde) * (cargadas / Math.max(1, total)),
        `Cargando texturas… ${cargadas} de ${total}`);
    };
    gestor.gestorCarga.onLoad = acabar;
    gestor.gestorCarga.onError = (url) => {
      error('No se pudo cargar', url);
      // Una textura que falta no debe impedir arrancar: el cuerpo se verá con
      // su color plano, marcado como SIMULACIÓN.
      if (++terminadas >= pendientes) acabar();
    };

    // Red de seguridad: si ninguna textura llega a registrarse (por ejemplo
    // porque todas estaban en caché) el gestor no dispara onLoad.
    setTimeout(() => {
      if (pendientes === 0) acabar();
    }, 60);

    // Tope absoluto: la escena arranca aunque el servidor se atasque.
    setTimeout(acabar, 20000);
  });
}

async function arrancar() {
  log(`ORBIS v${App.version} — fase implementada: ${App.faseImplementada}`);
  log(`Raíz de la aplicación: ${RAIZ}`);
  progresar(0.02, 'Verificando el entorno…');

  const { ok, resultados, fallos } = await ejecutarDiagnostico((f, t) => progresar(f * 0.35, t));

  const catalogo = resultados.datos?.extra ?? null;
  App.definir('datos', catalogo);

  if (!ok) {
    fallar(titularDeFallo(fallos), fallos.map((f) => f.remedio).filter(Boolean));
    return;
  }

  if (!catalogo?.cuerpos?.length) {
    fallar('El catálogo del Sistema Solar está vacío.', [
      'Ejecuta «node tools/construir-datos.mjs» y sube data/sistema-solar.json.',
    ]);
    return;
  }

  // ---------------------------------------------------------------- escena --
  progresar(0.4, 'Construyendo la escena…');

  const gestor = new SceneManager($('#lienzo'), $('#capa-etiquetas'));
  const sistema = new SolarSystem(catalogo, gestor);
  gestor.escena.add(sistema.grupo);

  const efectos = new PostFX(gestor);
  const rig = new CameraRig(gestor);

  gestor.alRedimensionar = (ancho, alto) => efectos.redimensionar(ancho, alto);

  await esperarTexturas(gestor, 0.45, 0.92);
  progresar(0.95, 'Preparando los controles…');

  // -------------------------------------------------------------- controles --
  const orden = sistema.ordenNavegacion;

  /** Selecciona un cuerpo y viaja hasta él. */
  function seleccionar(id, origen = 'programa') {
    const cuerpo = sistema.obtener(id);
    if (!cuerpo) return;

    App.definir('cuerpoActivo', id);
    App.definir('vista', 'cuerpo');
    rig.viajarA(cuerpo);
    anunciar(`${cuerpo.datos.nombre} seleccionado.`);
    App.emitir('cuerpo:seleccionado', { id, origen, cuerpo });
  }

  function vistaGeneral() {
    App.definir('cuerpoActivo', null);
    App.definir('vista', 'sistema');
    rig.volverAVistaGeneral();
    anunciar('Vista general del Sistema Solar.');
    App.emitir('vista:general', {});
  }

  function vecino(direccion) {
    const actual = App.estado.cuerpoActivo;
    const indice = actual ? orden.indexOf(actual) : -1;
    const siguiente = (indice + direccion + orden.length) % orden.length;
    seleccionar(orden[siguiente], 'teclado');
  }

  const controles = new FallbackControls(gestor, sistema, {
    alSeleccionar: seleccionar,
    alPedirVistaGeneral: vistaGeneral,
    alPedirVecino: vecino,
    alAlternarPausa: () => {
      const v = bucle.alternarPausa();
      anunciar(v.factor === 0 ? 'Tiempo en pausa.' : `Tiempo a ${v.etiqueta}.`);
      App.emitir('tiempo:velocidad', v);
    },
    alAlternarOrbitas: () => {
      const visible = !App.preferencias.get('mostrarOrbitas');
      App.preferencias.set('mostrarOrbitas', visible);
      sistema.establecerVisibilidadOrbitas(visible);
      anunciar(visible ? 'Órbitas visibles.' : 'Órbitas ocultas.');
    },
  });

  // ------------------------------------------------------------------ bucle --
  let usuarioInteractuando = false;
  gestor.controles.addEventListener('start', () => {
    usuarioInteractuando = true;
  });
  gestor.controles.addEventListener('end', () => {
    usuarioInteractuando = false;
  });

  const bucle = new Loop({
    alActualizar: (delta, deltaSimulado, fecha, deltaReal) => {
      sistema.actualizar(fecha, delta);
      // La cámara se mueve con el tiempo real (acotado a medio segundo para
      // que volver de una pestaña en segundo plano no la teletransporte).
      rig.actualizar(Math.min(0.5, deltaReal), usuarioInteractuando);
      gestor.controles.update();
      sistema.actualizarEntorno(
        gestor.camara.position.distanceTo(gestor.controles.target),
        delta,
      );
      App.estado.tiempoSimulado = fecha;
    },
    alRenderizar: (delta) => {
      efectos.render(delta);
      gestor.renderizadorEtiquetas.render(gestor.escena, gestor.camara);
    },
    alActualizarLento: (_, fps) => {
      App.definir('fps', fps);
      ajustarCalidad(fps);
    },
  });

  /**
   * Degradación automática. Si los fotogramas no llegan, se sacrifica primero
   * la resolución del post-procesado y después el bloom entero, antes que
   * dejar la escena a trompicones.
   */
  let calidad = 'alta';
  let muestrasBajas = 0;
  function ajustarCalidad(fps) {
    if (App.preferencias.get('calidad') !== 'auto') return;

    if (fps < 32) muestrasBajas++;
    else if (fps > 52) muestrasBajas = Math.max(0, muestrasBajas - 1);

    if (muestrasBajas > 12 && calidad === 'alta') {
      calidad = 'media';
      efectos.establecerCalidad('media');
      log('Calidad reducida a media por rendimiento.');
    } else if (muestrasBajas > 30 && calidad === 'media') {
      calidad = 'baja';
      efectos.establecerCalidad('baja');
      log('Post-procesado desactivado por rendimiento.');
    }
  }

  // -------------------------------------------------------------- exposición --
  Object.assign(App.subsistemas, { escena: gestor, sistema, efectos, rig, bucle, controles });
  App.acciones = { seleccionar, vistaGeneral, vecino };
  App.faseImplementada = 1;

  sistema.establecerVisibilidadOrbitas(App.preferencias.get('mostrarOrbitas'));
  bucle.iniciar();

  App.definir('cargando', false);
  progresar(1, 'Listo.');
  document.body.dataset.estado = 'listo';
  anunciar('Sistema Solar cargado. Use Tab para navegar o haga clic sobre un cuerpo.');

  if (depuracion.activo) {
    log('Diagnóstico:', resultados);
    log('Estadísticas de render:', gestor.estadisticas);
    log('Velocidades disponibles:', VELOCIDADES.map((v) => v.etiqueta).join(', '));
    const { montarPanelDepuracion } = await import('./utils/panel-depuracion.js');
    montarPanelDepuracion({ App, gestor, efectos, bucle, sistema });
  }

  // Liberar todo al cerrar la pestaña: evita que el contexto WebGL quede
  // colgado si el navegador conserva la página en la caché de retroceso.
  window.addEventListener('pagehide', () => {
    bucle.detener();
    controles.destruir();
    sistema.destruir();
    efectos.destruir();
    gestor.destruir();
  }, { once: true });
}

window.addEventListener('error', (e) => error('Error no capturado:', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => error('Promesa rechazada:', e.reason));

arrancar().catch((err) => {
  fallar(err.message ?? 'Fallo desconocido durante el arranque.');
  console.error(err);
});

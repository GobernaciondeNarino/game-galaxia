/**
 * ORBIS — punto de entrada.
 *
 * Fase 0: arranca la aplicación, ejecuta el diagnóstico del entorno y deja
 * preparado el bus de estado. La escena tridimensional se incorpora en la
 * fase 1 (js/core/SceneManager.js).
 */

import { App } from './core/App.js';
import { ejecutarDiagnostico, titularDeFallo } from './core/Diagnostico.js';
import { $, crear, anunciar } from './utils/dom.js';
import { RAIZ } from './utils/rutas.js';
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
  const marco = $('.arranque__marco');
  marco?.setAttribute('data-fallo', '');
  progresar(1, titular);

  // Las instrucciones concretas ya aparecen bajo cada punto en rojo; aquí solo
  // se sustituye el aviso de cámara y micrófono, que en este estado sobra.
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

async function arrancar() {
  log(`ORBIS v${App.version} — fase implementada: ${App.faseImplementada}`);
  log(`Raíz de la aplicación: ${RAIZ}`);
  progresar(0.02, 'Verificando el entorno…');

  const { ok, resultados, fallos } = await ejecutarDiagnostico(progresar);

  // Los datos maestros quedan disponibles para el resto de subsistemas.
  App.definir('datos', resultados.datos?.extra ?? null);

  if (!ok) {
    fallar(
      titularDeFallo(fallos),
      fallos.map((f) => f.remedio).filter(Boolean),
    );
    return;
  }

  App.definir('cargando', false);
  anunciar('Entorno verificado.');

  // --- Hasta aquí llega la fase 0 -----------------------------------------
  // La fase 1 sustituye este bloque por la construcción de la escena y el
  // paso a body[data-estado="listo"], que oculta la pantalla de arranque.
  progresar(1, 'Fase 0 verificada · la escena llega en la fase 1.');
  document.body.dataset.estado = 'diagnostico';

  if (depuracion.activo) log('Resultados del diagnóstico:', resultados);
}

// Cualquier fallo no capturado debe verse en la interfaz, no solo en consola.
window.addEventListener('error', (e) => error('Error no capturado:', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => error('Promesa rechazada:', e.reason));

arrancar().catch((err) => {
  fallar(err.message ?? 'Fallo desconocido durante el arranque.');
  console.error(err);
});

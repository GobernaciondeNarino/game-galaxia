/**
 * ORBIS — punto de entrada.
 *
 * Arranca la aplicación: diagnostica el entorno, carga el catálogo, construye
 * la escena tridimensional y pone en marcha el bucle de render.
 *
 * Fases 1 a 7 implementadas: escena tridimensional con órbitas keplerianas
 * reales, HUD en DOM con paneles persistentes, las dos vistas con transición
 * interrumpible, narración con subtítulos, control por gestos y por voz.
 */

import { App } from './core/App.js';
import { ejecutarDiagnostico, titularDeFallo } from './core/Diagnostico.js';
import { SceneManager } from './core/SceneManager.js';
import { PostFX } from './core/PostFX.js';
import { CameraRig } from './core/CameraRig.js';
import { Loop, VELOCIDADES } from './core/Loop.js';
import { SolarSystem } from './system/SolarSystem.js';
import { FallbackControls } from './input/FallbackControls.js';
import { HUD } from './ui/HUD.js';
import { Narrator } from './audio/Narrator.js';
import { SFX } from './audio/SFX.js';
import { HandTracking } from './input/HandTracking.js';
import { GestureRecognizer } from './input/GestureRecognizer.js';
import { CursorGestual } from './ui/CursorGestual.js';
import { VoiceCommands } from './input/VoiceCommands.js';
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
    sfx.reproducir('seleccion');
    // La narración arranca al seleccionar, no al llegar: el viaje dura más de
    // un segundo y el silencio mientras tanto se hace largo.
    narrador?.narrar(id);
    anunciar(`${cuerpo.datos.nombre} seleccionado.`);
    App.emitir('cuerpo:seleccionado', { id, origen, cuerpo });
  }

  function vistaGeneral() {
    App.definir('cuerpoActivo', null);
    App.definir('vista', 'sistema');
    rig.volverAVistaGeneral();
    narrador?.detener();
    sfx.reproducir('transicion');
    anunciar('Vista general del Sistema Solar.');
    App.emitir('vista:general', {});
  }

  function vecino(direccion) {
    const actual = App.estado.cuerpoActivo;
    const indice = actual ? orden.indexOf(actual) : -1;
    const siguiente = (indice + direccion + orden.length) % orden.length;
    seleccionar(orden[siguiente], 'teclado');
  }

  function alternarPausa() {
    const v = bucle.alternarPausa();
    anunciar(v.factor === 0 ? 'Tiempo en pausa.' : `Tiempo a ${v.etiqueta}.`);
    App.emitir('tiempo:velocidad', v);
    return v;
  }

  function cambiarVelocidad(direccion) {
    const v = bucle.establecerVelocidad(bucle.indiceVelocidad + direccion);
    anunciar(v.factor === 0 ? 'Tiempo en pausa.' : `Tiempo a ${v.etiqueta}.`);
    App.emitir('tiempo:velocidad', v);
    return v;
  }

  function mostrarOrbitas(visible) {
    App.preferencias.set('mostrarOrbitas', visible);
    sistema.establecerVisibilidadOrbitas(visible);
    anunciar(visible ? 'Órbitas visibles.' : 'Órbitas ocultas.');
  }

  const controles = new FallbackControls(gestor, sistema, {
    alSeleccionar: seleccionar,
    alPedirVistaGeneral: vistaGeneral,
    alPedirVecino: vecino,
    alAlternarPausa: alternarPausa,
    alAlternarOrbitas: () => mostrarOrbitas(!App.preferencias.get('mostrarOrbitas')),
    alPedirAyuda: () => hud.mostrarAyuda(),
    alAlternarSilencio: () => {
      const silenciada = !App.preferencias.get('narracionSilenciada');
      narrador?.silenciar(silenciada);
      hud.actualizarSilencio(silenciada);
      anunciar(silenciada ? 'Narración silenciada.' : 'Narración activada.');
    },
  });

  // ------------------------------------------------------------------- HUD --
  const sfx = new SFX();

  // El narrador se crea antes que la HUD para poder pasarle sus acciones, pero
  // necesita los subtítulos, que viven en la HUD. Se conecta justo después.
  let narrador = null;

  const hud = new HUD(catalogo, {
    seleccionar,
    vistaGeneral,
    vecino,
    alternarPausa,
    cambiarVelocidad,
    mostrarOrbitas,
    // La HUD necesita la malla del cuerpo para anclar las anotaciones a su
    // superficie; se la pide al sistema en lugar de guardar una referencia.
    obtenerCuerpo3D: (id) => sistema.obtener(id),
    alternarSilencio: () => {
      const silenciada = !App.preferencias.get('narracionSilenciada');
      narrador?.silenciar(silenciada);
      hud.actualizarSilencio(silenciada);
      anunciar(silenciada ? 'Narración silenciada.' : 'Narración activada.');
    },
    establecerVolumen: (v) => narrador?.establecerVolumen(v),
    repetirNarracion: () => narrador?.repetir(),
  }, { capaEtiquetas: $('#capa-etiquetas'), gestor });

  narrador = new Narrator(
    catalogo.cuerpos.filter((c) => c.tipo !== 'cinturon'),
    hud.subtitulos,
    resultados.backend?.extra ?? null,
  );

  // ------------------------------------------------------- control por manos --
  // Se construye siempre, pero no toca la cámara hasta que el usuario la
  // enciende explícitamente. Es una capa que se suma a ratón y teclado, nunca
  // un requisito.
  const cursorGestual = new CursorGestual(document.body);
  const reconocedor = new GestureRecognizer();

  const manos = new HandTracking({
    video: hud.entradas.video,
    lienzoEsqueleto: hud.entradas.esqueleto,
    alDetectar: (landmarks) => {
      const estado = reconocedor.procesar(landmarks);
      cursorGestual.actualizar(estado);
      for (const accion of estado.acciones) ejecutarGesto(accion);
    },
  });

  /** Traduce una acción del reconocedor en una operación sobre la escena. */
  function ejecutarGesto(accion) {
    switch (accion.tipo) {
      case 'orbitar':
        // El factor convierte fracción de imagen en radianes. La x va invertida
        // porque la cámara refleja: mover la mano a la derecha debe girar la
        // escena hacia la derecha.
        controles.orbitarPor(-accion.dx * 6, accion.dy * 4);
        break;

      case 'zoom':
        controles.acercarPor(1 + accion.delta * 2.5);
        break;

      case 'desplazar':
        controles.desplazarPor(-accion.dx * 1.4, accion.dy * 1.4);
        break;

      case 'anclar':
        // El puño detiene el viaje de cámara en curso y deja la vista quieta.
        rig.enTransito = false;
        break;

      case 'seleccionar': {
        // La x se invierte igual que en el cursor: el punto de la pantalla no
        // es el de la imagen de la cámara.
        const cuerpo = controles.cuerpoEnPunto(1 - accion.x, accion.y);
        if (cuerpo) {
          seleccionar(cuerpo.id, 'gesto');
        } else {
          sfx.reproducir('error');
          anunciar('No hay ningún cuerpo bajo el cursor.');
        }
        break;
      }

      case 'vista-general':
        vistaGeneral();
        break;

      case 'vecino':
        vecino(accion.direccion);
        break;

      default:
        break;
    }
  }

  App.al('entrada:solicitar-camara', async () => {
    if (manos.activa) {
      manos.desactivar();
      return;
    }
    hud.entradas.mostrarEstado('Pidiendo permiso de cámara…');
    await manos.activar();
  });

  App.al('manos:cargando', ({ paso }) => {
    hud.entradas.mostrarEstado(
      paso === 'modelo'
        ? 'Cargando el modelo de manos (7,6 MB)…'
        : 'Esperando el permiso de la cámara…',
    );
  });

  App.al('manos:activa', () => {
    hud.entradas.mostrarEstado('');
    hud.entradas.establecerCamara(true);
    hud.barra.establecerIndicador('camara', 'activo', 'on');
    anunciar('Cámara activada. El vídeo se procesa en tu navegador y no se envía a ningún servidor.');
  });

  App.al('manos:inactiva', () => {
    hud.entradas.establecerCamara(false);
    hud.barra.establecerIndicador('camara', 'inactivo', 'off');
    cursorGestual.ocultar();
    reconocedor.reiniciar();
    anunciar('Cámara apagada.');
  });

  App.al('manos:error', ({ mensaje }) => {
    hud.entradas.mostrarEstado(mensaje, 'error');
    hud.entradas.establecerCamara(false);
    hud.barra.establecerIndicador('camara', 'alerta', 'error');
    anunciar(mensaje);
  });

  // -------------------------------------------------------- control por voz --
  let voz = null;
  try {
    const vocabulario = await (await fetch(rutaApp('data/comandos-voz.json'))).json();
    voz = new VoiceCommands(vocabulario, ejecutarIntencion);
    // La ayuda se construye con el mismo vocabulario que entiende el parser,
    // así que la lista de comandos nunca puede quedar desfasada.
    hud.mostrarAyuda(vocabulario);
    hud.panelAyuda.hidden = true;
  } catch (err) {
    error('No se pudo cargar el vocabulario de voz:', err);
  }

  /** Ejecuta una intención reconocida por voz. */
  function ejecutarIntencion(intencion) {
    const { intencion: tipo, cuerpo, cuerpoB } = intencion;

    switch (tipo) {
      case 'ir_a':
      case 'hablame_de':
        if (cuerpo) seleccionar(cuerpo, 'voz');
        break;

      case 'vista_general': vistaGeneral(); break;
      case 'siguiente': vecino(1); break;
      case 'anterior': vecino(-1); break;

      case 'satelites_de': {
        const datos = catalogo.cuerpos.find((c) => c.id === cuerpo);
        const lunas = (datos?.satelites ?? [])
          .map((id) => catalogo.cuerpos.find((c) => c.id === id)?.nombre)
          .filter(Boolean);
        anunciar(
          lunas.length
            ? `${datos.nombre} tiene ${lunas.length} satélites en ORBIS: ${lunas.join(', ')}.`
            : `${datos?.nombre ?? 'Ese cuerpo'} no tiene satélites catalogados en ORBIS.`,
        );
        if (cuerpo) seleccionar(cuerpo, 'voz');
        break;
      }

      case 'comparar':
        // La comparación abre el primero y anuncia el segundo: el panel
        // comparativo llega en la fase 8; hasta entonces, no se finge tenerlo.
        if (cuerpo) seleccionar(cuerpo, 'voz');
        anunciar(
          cuerpoB
            ? `Comparación con ${catalogo.cuerpos.find((c) => c.id === cuerpoB)?.nombre}: disponible próximamente.`
            : 'No he entendido con qué comparar.',
        );
        break;

      case 'pausar': if (!bucle.pausado) alternarPausa(); break;
      case 'reanudar': if (bucle.pausado) alternarPausa(); break;
      case 'acelerar': cambiarVelocidad(1); break;
      case 'frenar': cambiarVelocidad(-1); break;
      case 'mostrar_orbitas': mostrarOrbitas(true); break;
      case 'ocultar_orbitas': mostrarOrbitas(false); break;

      case 'modo_real':
      case 'modo_didactico':
        anunciar('El cambio de escala llega en la fase 8.');
        break;

      case 'repetir': narrador?.repetir(); break;
      case 'silencio':
        narrador?.silenciar(true);
        hud.actualizarSilencio(true);
        break;
      case 'detener_narracion': narrador?.detener(); break;
      case 'ayuda': hud.mostrarAyuda(); break;

      default:
        break;
    }

    sfx.reproducir('seleccion');
  }

  App.al('entrada:solicitar-microfono', async () => {
    if (!voz) return;
    if (voz.activo) {
      voz.desactivar();
      return;
    }
    // El aviso de privacidad se muestra ANTES de pedir el permiso, no después.
    hud.entradas.mostrarEstado(voz.avisoPrivacidad);
    await voz.activar();
  });

  App.al('voz:activa', ({ motor }) => {
    hud.entradas.establecerMicrofono(true);
    hud.barra.establecerIndicador('microfono', 'activo', motor === 'navegador' ? 'on' : 'servidor');
    anunciar('Micrófono activado. Di «ayuda» para saber qué puedes pedir.');
  });

  App.al('voz:inactiva', () => {
    hud.entradas.establecerMicrofono(false);
    hud.barra.establecerIndicador('microfono', 'inactivo', 'off');
    hud.entradas.mostrarEstado('');
  });

  App.al('voz:error', ({ mensaje }) => {
    hud.entradas.mostrarEstado(mensaje, 'error');
    hud.barra.establecerIndicador('microfono', 'alerta', 'error');
    anunciar(mensaje);
  });

  App.al('voz:no-entendido', ({ texto, sugerencias }) => {
    sfx.reproducir('error');
    hud.mostrarSugerencias(texto, sugerencias);
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
      // Las anotaciones y la retícula se recolocan después de renderizar, con
      // la cámara ya en su posición definitiva de este fotograma.
      hud.actualizarRapido(delta);
    },
    alActualizarLento: (_, fps) => {
      App.definir('fps', fps);
      hud.actualizarLento(fps, bucle.fechaSimulada);
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
  Object.assign(App.subsistemas, {
    escena: gestor, sistema, efectos, rig, bucle, controles, hud, narrador, sfx,
    manos, reconocedor, voz,
  });
  App.acciones = { seleccionar, vistaGeneral, vecino };
  App.faseImplementada = 7;

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
    manos.destruir();
    voz?.destruir();
    cursorGestual.destruir();
    narrador.destruir();
    sfx.destruir();
    hud.destruir();
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

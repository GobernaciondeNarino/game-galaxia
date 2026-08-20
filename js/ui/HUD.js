/**
 * HUD — orquestador de la interfaz.
 *
 * Construye UNA sola vez los paneles persistentes y se limita a repintar su
 * contenido cuando cambia el cuerpo activo. Esa es la razón de que la
 * transición entre VISTA DE SISTEMA y VISTA DE CUERPO no parpadee: no se
 * destruye ni se vuelve a crear nada, solo cambia lo que hay dentro del
 * viewport central.
 *
 * El repintado de los paneles va a 10 Hz (canal «lento» del bucle), no a 60:
 * actualizar el DOM en cada fotograma cuesta fotogramas y nadie lee un dato
 * sesenta veces por segundo.
 */

import { App } from '../core/App.js';
import { $, crear, anunciar } from '../utils/dom.js';
import { BarraSuperior } from './panels/BarraSuperior.js';
import { PerfilCuerpo } from './panels/PerfilCuerpo.js';
import {
  MapaOrbital, ComposicionAtmosferica, ActividadGeologica,
  DensidadMagnetosferica, DatosAdicionales,
} from './panels/PanelesDerecha.js';
import { NavegacionPlanetaria } from './panels/NavegacionPlanetaria.js';
import { ProyeccionOrbital } from './panels/ProyeccionOrbital.js';
import { EstadoEntradas } from './panels/EstadoEntradas.js';
import { PanelGalactico } from './panels/PanelGalactico.js';
import { Anotaciones } from './Anotaciones.js';
import { ArcoDatos } from './ArcoDatos.js';
import { Reticula } from './Reticula.js';
import { Subtitles } from './Subtitles.js';
import { Comparador } from './panels/Comparador.js';
import { log } from '../utils/debug.js';

export class HUD {
  /**
   * @param {object} catalogo data/sistema-solar.json
   * @param {object} acciones { seleccionar, vistaGeneral, vecino, alternarPausa, … }
   */
  constructor(catalogo, acciones, { capaEtiquetas, gestor } = {}) {
    this.catalogo = catalogo.cuerpos;
    this.acciones = acciones;
    this.gestor = gestor;
    this.porId = new Map(this.catalogo.map((c) => [c.id, c]));
    this.tierra = this.porId.get('tierra');

    const raiz = $('#hud');
    raiz.hidden = false;

    this.barra = new BarraSuperior($('#hud-barra-superior'), {
      alCambiarModulo: (id) => this._cambiarModulo(id),
    });

    this.perfil = new PerfilCuerpo($('#hud-panel-izquierdo'));

    const derecha = $('#hud-panel-derecho');
    this.mapaOrbital = new MapaOrbital(derecha, {
      alElegirSatelite: (id) => acciones.seleccionar(id, 'mapa-orbital'),
    });
    this.composicion = new ComposicionAtmosferica(derecha);
    this.geologia = new ActividadGeologica(derecha);
    this.magnetosfera = new DensidadMagnetosferica(derecha);
    this.adicionales = new DatosAdicionales(derecha);

    this.navegacion = new NavegacionPlanetaria($('#hud-navegacion-planetaria'), this.catalogo, {
      alSeleccionar: (id, origen) => acciones.seleccionar(id, origen),
    });

    this.proyeccion = new ProyeccionOrbital($('#hud-proyeccion-orbital'), this.catalogo);

    // El panel de entradas cierra la columna derecha en lugar de flotar sobre
    // ella: como elemento fijo se solapaba con los paneles de datos en cuanto
    // la pantalla bajaba de 1080 px de alto.
    this.entradas = new EstadoEntradas(derecha);

    // El viewport central: es lo ÚNICO que cambia entre los dos estados.
    this.viewport = $('#hud-viewport');
    this.panelGalactico = new PanelGalactico(this.viewport);
    // Nace oculto y sin cuenta atrás: la presentación arranca cuando la
    // pantalla de carga se retira, no cuando se construye la HUD, que ocurre
    // varios segundos antes y con el arranque todavía tapándolo todo.

    // Piezas de la VISTA DE CUERPO. Se crean una vez y se muestran u ocultan;
    // recrearlas en cada cambio de vista provocaría el parpadeo que el pliego
    // pide evitar.
    if (capaEtiquetas && gestor) {
      this.reticula = new Reticula(capaEtiquetas, gestor);
      this.anotaciones = new Anotaciones(capaEtiquetas, gestor);
    }
    this.arco = new ArcoDatos(document.body);
    this.subtitulos = new Subtitles($('#hud-subtitulos'));
    this.comparador = new Comparador(document.body);

    this._montarControlesEscena();
    this._suscribir();

    // Arranque en VISTA DE SISTEMA con el Sol en el perfil.
    this.mostrarCuerpo(this.porId.get('sol'));
    this.establecerVista('sistema');

    log('HUD montada.');
  }

  /** Controles de escena: tiempo, órbitas y vuelta a la vista general. */
  _montarControlesEscena() {
    this.etiquetaVelocidad = crear('span', { class: 'controles__valor panel__cifra', text: '×100' });

    this.botonGalaxia = crear('button', {
      class: 'controles__boton controles__boton--galaxia', type: 'button',
      'aria-pressed': 'false',
      title: 'Mostrar u ocultar la interfaz galáctica',
      onclick: () => {
        const visible = this.panelGalactico.alternar();
        this.botonGalaxia.setAttribute('aria-pressed', String(visible));
      },
      text: 'Galaxia',
    });

    this.controles = crear('div', { class: 'panel controles' }, [
      crear('button', {
        class: 'controles__boton', type: 'button',
        onclick: () => this.acciones.vistaGeneral(),
        title: 'Volver a la vista general (Esc)',
        text: 'Vista general',
      }),
      this.botonGalaxia,
      crear('div', { class: 'controles__grupo' }, [
        crear('button', {
          class: 'controles__boton controles__boton--icono', type: 'button',
          'aria-label': 'Ralentizar el tiempo',
          onclick: () => this.acciones.cambiarVelocidad(-1),
          text: '◀◀',
        }),
        crear('button', {
          class: 'controles__boton controles__boton--icono', type: 'button',
          'aria-label': 'Pausar o reanudar el tiempo (Espacio)',
          onclick: () => this.acciones.alternarPausa(),
          text: '❚❚',
        }),
        crear('button', {
          class: 'controles__boton controles__boton--icono', type: 'button',
          'aria-label': 'Acelerar el tiempo',
          onclick: () => this.acciones.cambiarVelocidad(1),
          text: '▶▶',
        }),
        this.etiquetaVelocidad,
      ]),
      crear('label', { class: 'controles__interruptor' }, [
        crear('input', {
          type: 'checkbox',
          checked: App.preferencias.get('mostrarOrbitas'),
          onchange: (e) => this.acciones.mostrarOrbitas(e.target.checked),
        }),
        crear('span', { text: 'Órbitas' }),
      ]),
      crear('label', { class: 'controles__interruptor', title: 'Escala real: proporciones astronómicas verdaderas' }, [
        crear('input', {
          type: 'checkbox',
          checked: App.preferencias.get('escala') === 'real',
          onchange: (e) => this.acciones.cambiarEscala(e.target.checked ? 'real' : 'didactico'),
        }),
        crear('span', { text: 'Escala real' }),
      ]),
      this._crearControlesNarracion(),
      crear('button', {
        class: 'controles__boton controles__boton--icono',
        type: 'button',
        'aria-label': 'Ayuda: qué puedes decir y pulsar (F1)',
        title: 'Ayuda (F1)',
        onclick: () => this.mostrarAyuda(),
        text: '?',
      }),
    ]);

    $('#hud-barra-superior').append(this.controles);
  }

  /**
   * Controles de narración: silencio, volumen, repetir y subtítulos.
   * El de subtítulos existe porque son obligatorios pero no imponibles: quien
   * los tenga tapando el planeta debe poder quitarlos.
   */
  _crearControlesNarracion() {
    this.botonSilencio = crear('button', {
      class: 'controles__boton controles__boton--icono',
      type: 'button',
      'aria-pressed': String(App.preferencias.get('narracionSilenciada')),
      'aria-label': 'Silenciar la narración (M)',
      title: 'Silenciar la narración (M)',
      onclick: () => this.acciones.alternarSilencio(),
      text: '🔊',
    });

    this.deslizadorVolumen = crear('input', {
      type: 'range', min: 0, max: 1, step: 0.05,
      value: App.preferencias.get('volumenNarracion'),
      class: 'controles__volumen',
      'aria-label': 'Volumen de la narración',
      oninput: (e) => this.acciones.establecerVolumen(Number(e.target.value)),
    });

    return crear('div', { class: 'controles__grupo controles__grupo--audio' }, [
      this.botonSilencio,
      this.deslizadorVolumen,
      crear('button', {
        class: 'controles__boton controles__boton--icono',
        type: 'button',
        'aria-label': 'Repetir la narración',
        title: 'Repetir la narración',
        onclick: () => this.acciones.repetirNarracion(),
        text: '↻',
      }),
      crear('label', { class: 'controles__interruptor' }, [
        crear('input', {
          type: 'checkbox',
          checked: App.preferencias.get('subtitulos'),
          onchange: (e) => App.preferencias.set('subtitulos', e.target.checked),
        }),
        crear('span', { text: 'Subtítulos' }),
      ]),
    ]);
  }

  /** Refleja el estado del silencio en el botón. */
  actualizarSilencio(silenciada) {
    this.botonSilencio.textContent = silenciada ? '🔇' : '🔊';
    this.botonSilencio.setAttribute('aria-pressed', String(silenciada));
  }

  _cambiarModulo(id) {
    // Los módulos no implementados están desactivados en la propia barra, así
    // que aquí solo llegan los que existen.
    anunciar(`Módulo ${id} seleccionado.`);
    App.emitir('hud:modulo', { id });
  }

  _suscribir() {
    this._cancelaciones = [
      App.al('estado:cuerpoActivo', ({ valor }) => {
        const cuerpo = valor ? this.porId.get(valor) : this.porId.get('sol');
        this.mostrarCuerpo(cuerpo);
        this.navegacion.marcar(valor);
      }),
      App.al('estado:vista', ({ valor }) => this.establecerVista(valor)),
      App.al('tiempo:velocidad', (v) => {
        this.etiquetaVelocidad.textContent = v.etiqueta;
      }),
      App.al('entrada:resaltado', ({ id }) => {
        this.navegacion.panel.dataset.resaltado = id ?? '';
      }),
      App.al('voz:comando', ({ texto }) => this.entradas.mostrarComando(texto)),
      App.al('narracion:motor', ({ motor }) => {
        // Un cambio de motor es información, no un fallo silencioso.
        this.barra.establecerSubtitulo(
          motor === 'navegador'
            ? 'Narración con la voz del navegador'
            : 'Narración con voz sintetizada',
        );
      }),
      App.al('escena:escala', ({ aviso }) => this.barra.establecerSubtitulo(aviso)),
      App.al('estado:cargando', ({ valor }) => {
        // Terminada la carga: el panel galáctico se presenta y se retira solo.
        if (!valor && document.body.dataset.vista !== 'cuerpo') this._presentarGalaxia();
      }),
      App.al('narracion:bloqueada', () => {
        this.barra.establecerSubtitulo('Toca la pantalla para permitir el audio');
      }),
    ];
  }

  /** Repinta todos los paneles con los datos de un cuerpo. */
  mostrarCuerpo(cuerpo) {
    if (!cuerpo) return;
    this.cuerpoMostrado = cuerpo;

    this.perfil.mostrar(cuerpo);
    this.mapaOrbital.mostrar(cuerpo, this.catalogo);
    this.composicion.mostrar(cuerpo);
    this.geologia.mostrar(cuerpo);
    this.magnetosfera.mostrar(cuerpo);
    this.adicionales.mostrar(cuerpo, this.tierra);
    this.proyeccion.destacar(cuerpo);

    this.barra.establecerSubtitulo(
      cuerpo.render?.esSimulacion
        ? `${cuerpo.nombre} · representación simulada, sin mapa fotográfico`
        : `${cuerpo.nombre} · seguimiento activo`,
    );

    if (document.body.dataset.vista === 'cuerpo') {
      this.arco.mostrar(cuerpo);
      this._anclarAnotaciones();
    }
  }

  /** Alterna entre VISTA DE SISTEMA y VISTA DE CUERPO. */
  establecerVista(vista) {
    const enCuerpo = vista === 'cuerpo';
    document.body.dataset.vista = vista;

    // El panel galáctico se retira con un barrido; no se destruye, así que
    // volver a la vista general no cuesta ni una reconstrucción. Al volver se
    // asoma unos segundos y se va: es un rótulo de contexto, no un panel de
    // trabajo, y el centro de la pantalla lo necesita el Sistema Solar.
    if (enCuerpo) this.panelGalactico.ocultar();
    else if (!App.estado.cargando) this._presentarGalaxia();

    this.reticula?.establecerVisible(enCuerpo);
    this.arco.establecerVisible(enCuerpo);

    if (enCuerpo && this.cuerpoMostrado) {
      this.arco.mostrar(this.cuerpoMostrado);
      this._anclarAnotaciones();
    } else {
      this.anotaciones?.limpiar();
    }
  }

  /** Asoma el panel galáctico y deja que se retire solo. */
  _presentarGalaxia() {
    this.panelGalactico.mostrar();
    this.botonGalaxia?.setAttribute('aria-pressed', 'false');
  }

  /** Conecta las anotaciones con la malla del cuerpo mostrado. */
  _anclarAnotaciones() {
    if (!this.anotaciones || !this.cuerpoMostrado) return;
    const cuerpo3D = this.acciones.obtenerCuerpo3D?.(this.cuerpoMostrado.id);
    this.anotaciones.establecerCuerpo(cuerpo3D, this.cuerpoMostrado);
  }

  /**
   * Canal rápido del bucle: solo lo que tiene que seguir a la escena fotograma
   * a fotograma —las anotaciones y la retícula—, nunca los paneles de datos.
   */
  actualizarRapido(delta) {
    const enCuerpo = document.body.dataset.vista === 'cuerpo';
    const cuerpo3D = enCuerpo && this.cuerpoMostrado
      ? this.acciones.obtenerCuerpo3D?.(this.cuerpoMostrado.id)
      : null;

    this.reticula?.actualizar(cuerpo3D, delta);
    this.anotaciones?.actualizar(delta, enCuerpo && Boolean(cuerpo3D));
  }

  /**
   * Panel de ayuda con los comandos disponibles. Se construye a partir del
   * mismo vocabulario que usa el parser, así que nunca puede quedar desfasado
   * respecto a lo que la aplicación entiende de verdad.
   */
  mostrarAyuda(vocabulario = this._vocabulario) {
    this._vocabulario = vocabulario ?? this._vocabulario;
    if (this.panelAyuda) {
      this.panelAyuda.hidden = false;
      this.panelAyuda.querySelector('button')?.focus();
      return;
    }
    if (!this._vocabulario) return;

    const filas = Object.entries(this._vocabulario.intenciones ?? {}).map(([, datos]) =>
      crear('li', { class: 'ayuda__fila' }, [
        crear('span', { class: 'ayuda__ejemplo', text: `«${datos.ejemplo}»` }),
        crear('span', { class: 'ayuda__descripcion', text: datos.descripcion }),
      ]));

    const cerrar = crear('button', {
      class: 'controles__boton', type: 'button', text: 'Cerrar',
      onclick: () => { this.panelAyuda.hidden = true; },
    });

    this.panelAyuda = crear('div', {
      class: 'panel ayuda', role: 'dialog', 'aria-modal': 'false',
      'aria-label': 'Comandos disponibles',
      onkeydown: (e) => { if (e.key === 'Escape') this.panelAyuda.hidden = true; },
    }, [
      crear('header', { class: 'panel__cabecera' }, [
        crear('h2', { class: 'panel__titulo', text: 'Qué puedes decir y pulsar' }),
        cerrar,
      ]),
      crear('ul', { class: 'ayuda__lista' }, filas),
      crear('p', { class: 'panel__nota', text: 'Con teclado: flechas para orbitar, + y − para acercar, Re Pág y Av Pág para cambiar de cuerpo, Espacio para pausar, O para las órbitas, M para silenciar y Esc para la vista general.' }),
    ]);

    document.body.append(this.panelAyuda);
    cerrar.focus();
  }

  /** Abre el comparador con dos cuerpos del catálogo. */
  compararCuerpos(idA, idB) {
    const a = this.porId.get(idA);
    const b = this.porId.get(idB);
    if (!a || !b) return false;
    this.comparador.mostrar(a, b);
    return true;
  }

  /** Propuesta de alternativas cuando no se entiende un comando de voz. */
  mostrarSugerencias(texto, sugerencias) {
    if (!this.avisoSugerencias) {
      this.avisoSugerencias = crear('div', { class: 'panel sugerencias', role: 'status' });
      document.body.append(this.avisoSugerencias);
    }

    this.avisoSugerencias.replaceChildren(
      crear('p', { class: 'sugerencias__oido' }, [
        crear('span', { class: 'panel__titulo', text: 'No he entendido' }),
        crear('span', { class: 'sugerencias__texto', text: `«${texto}»` }),
      ]),
      crear('p', { class: 'panel__nota', text: 'Puedes probar con:' }),
      crear('ul', { class: 'sugerencias__lista' },
        sugerencias.map((s) => crear('li', { text: `«${s}»` }))),
    );

    this.avisoSugerencias.hidden = false;
    clearTimeout(this._temporizadorSugerencias);
    this._temporizadorSugerencias = setTimeout(() => {
      this.avisoSugerencias.hidden = true;
    }, 6000);
  }

  /** Canal lento del bucle: 10 veces por segundo. */
  actualizarLento(fps, fechaSimulada) {
    this.barra.actualizarFps(fps);
    this.barra.actualizarReloj(fechaSimulada);
    this.proyeccion.actualizar(fechaSimulada);
  }

  destruir() {
    for (const cancelar of this._cancelaciones ?? []) cancelar();
    for (const parte of [
      this.barra, this.perfil, this.mapaOrbital, this.composicion, this.geologia,
      this.magnetosfera, this.adicionales, this.navegacion, this.proyeccion,
      this.entradas, this.panelGalactico, this.reticula, this.anotaciones, this.arco,
      this.subtitulos, this.comparador,
    ]) {
      parte?.destruir?.();
    }
    clearTimeout(this._temporizadorSugerencias);
    this.controles?.remove();
    this.panelAyuda?.remove();
    this.avisoSugerencias?.remove();
    $('#hud').hidden = true;
  }
}

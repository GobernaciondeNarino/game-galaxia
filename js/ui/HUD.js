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
import { Avisos } from './Avisos.js';
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
    this.viewportDerecha = derecha;
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

    // Los avisos cuelgan de #hud, no del viewport central. Es deliberado: por
    // debajo de 720 px el viewport se oculta entero, y con él habría
    // desaparecido el aviso de audio bloqueado justo en el sitio donde más
    // falta hace, porque es en el móvil donde el navegador bloquea el audio con
    // más frecuencia. Colgando de la rejilla, cada tamaño de pantalla les
    // asigna su celda por CSS y nunca se quedan sin sitio.
    this.avisos = new Avisos(raiz);

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

    // Arranque en VISTA DE SISTEMA con el Sol en el perfil y el módulo Sistema,
    // que no esconde ningún panel.
    document.body.dataset.modulo = 'sistema';
    this.mostrarCuerpo(this.porId.get('sol'));
    this.establecerVista('sistema');

    log('HUD montada.');
  }

  /** Controles de escena: tiempo, órbitas y vuelta a la vista general. */
  _montarControlesEscena() {
    this.etiquetaVelocidad = crear('span', { class: 'controles__valor panel__cifra', text: '×100' });

    this.botonGalaxia = crear('button', {
      class: 'controles__boton controles__boton--galaxia', type: 'button',
      title: 'Alejar la cámara hasta ver el Sistema Solar entero y el disco galáctico',
      onclick: () => this.acciones.vistaGalactica?.(),
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

    // Los controles van ENTRE la barra de identidad y la fila secundaria, para
    // que compartan renglón con la primera y las pestañas y los indicadores
    // queden debajo de ellos, que es donde se pidieron.
    this.barra.secundaria.before(this.controles);
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

  /**
   * Cambia de módulo. Los tres que existen filtran la columna derecha:
   *
   *   · SISTEMA   — todos los paneles. Es el estado inicial.
   *   · SENSORES  — lo que se mide del cuerpo: atmósfera, geología, magnetosfera.
   *   · ANALÍTICA — lo que se deduce: mapa orbital y datos relativos a la Tierra.
   *
   * Quien esconde y muestra es el CSS, a partir de `body[data-modulo]` y del
   * `data-modulos` que cada panel declara. Aquí no se destruye ni se reconstruye
   * nada, así que volver a SISTEMA no cuesta un repintado.
   *
   * Antes estas tres pestañas se marcaban como activas y al pulsarlas solo
   * emitían un evento que no escuchaba nadie: no ocurría absolutamente nada.
   */
  _cambiarModulo(id) {
    document.body.dataset.modulo = id;

    const visibles = this.viewportDerecha.querySelectorAll(
      '.panel--derecha:not([hidden])',
    ).length;
    anunciar(
      id === 'sistema'
        ? 'Módulo Sistema: se muestran todos los paneles.'
        : `Módulo ${id}: ${visibles} panel${visibles === 1 ? '' : 'es'} a la vista.`,
    );

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
        // Un cambio de motor es información, no un fallo silencioso: la voz
        // cambia de golpe a media sesión y conviene decir por qué.
        this.avisos.mostrar(
          motor === 'navegador'
            ? 'Narración con la voz del navegador: no hay voz sintetizada disponible.'
            : 'Narración con voz sintetizada.',
          { tono: 'info', clave: 'motor-narracion' },
        );
      }),
      App.al('escena:escala', ({ aviso }) => {
        this.avisos.mostrar(aviso, { tono: 'info', clave: 'escala' });
      }),
      App.al('estado:cargando', ({ valor }) => {
        // Terminada la carga: el panel galáctico se presenta y se retira solo.
        if (!valor && document.body.dataset.vista !== 'cuerpo') this._presentarGalaxia();
      }),
      App.al('narracion:bloqueada', () => {
        // Este NO se va solo. Es el único aviso que pide una acción concreta, y
        // hasta que esa acción ocurre el problema sigue ahí: sin ella no suena
        // nada y no hay ninguna otra pista de por qué.
        this.avisos.mostrar(
          'Toca la pantalla para permitir el audio: el navegador lo bloquea hasta la primera interacción.',
          { tono: 'aviso', clave: 'audio-bloqueado', persistente: true },
        );
      }),
      // Si el audio acaba sonando, el aviso ya no describe nada. Dejarlo ahí
      // sería pedir una acción que ya se hizo.
      App.al('narracion:inicio', () => this.avisos.retirar('audio-bloqueado')),
      // Este evento se emitía desde la fase 5 y no lo escuchaba nadie: cuando
      // el navegador no trae síntesis de voz, la narración se apagaba en
      // silencio absoluto. Ahora al menos se dice, y se dice que el texto sigue
      // ahí, que es lo que salva la situación.
      App.al('narracion:sin-motor', () => {
        this.avisos.mostrar(
          'Este navegador no puede narrar en voz alta. Los textos siguen disponibles en pantalla.',
          { tono: 'aviso', clave: 'sin-motor', persistente: true },
        );
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
    this.botonGalaxia?.setAttribute('aria-pressed', String(vista === 'galaxia'));

    // El panel galáctico se retira con un barrido; no se destruye, así que
    // volver a la vista general no cuesta ni una reconstrucción. Al volver se
    // asoma unos segundos y se va: es un rótulo de contexto, no un panel de
    // trabajo, y el centro de la pantalla lo necesita el Sistema Solar.
    //
    // En la vista galáctica no se asoma: ahí el centro es justamente lo que se
    // ha ido a mirar, y taparlo con un panel sería contradecir el botón que
    // acaba de pulsarse.
    if (enCuerpo || vista === 'galaxia') this.panelGalactico.ocultar();
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

  /**
   * Asoma el panel galáctico y deja que se retire solo.
   *
   * El panel sigue existiendo y funcionando —lleva la invitación a encender el
   * micrófono y la cámara, y sus dos cifras citadas— pero ya no lo abre ningún
   * botón: «Galaxia» ahora aleja la cámara, que es lo que se pidió. Se conserva
   * entero por si vuelve a hacer falta.
   */
  _presentarGalaxia() {
    // La primera vez se queda más rato, porque lleva la invitación a encender
    // el micrófono y la cámara y tres segundos no dan para leerla y decidir.
    this.panelGalactico.mostrar(this.panelGalactico.msDePresentacion);
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

  /**
   * Muestra un aviso breve sobre la escena.
   *
   * Es lo que hay que usar para lo que ACABA DE PASAR. Para describir el estado
   * actual —qué cuerpo se sigue, de quién es la sesión— está
   * `barra.establecerSubtitulo`, que no ocupa sitio en pantalla.
   */
  avisar(texto, opciones) {
    return this.avisos.mostrar(texto, opciones);
  }

  /**
   * Muestra la respuesta a una pregunta, con su fuente.
   *
   * La fuente no es un adorno: es la diferencia entre un dato y una afirmación.
   * Cuando el catálogo no trae el valor se muestra SIN DATOS en ámbar, igual
   * que en los paneles, en lugar de disimular el hueco.
   */
  mostrarRespuesta({ texto, fuente, valor, sinDato, cuerpo, etiqueta }) {
    if (!this.panelRespuesta) {
      this.respuestaTitulo = crear('h2', { class: 'panel__titulo' });
      this.respuestaValor = crear('p', { class: 'respuesta__valor panel__cifra' });
      this.respuestaTexto = crear('p', { class: 'respuesta__texto' });
      this.respuestaFuente = crear('p', { class: 'panel__fuente' });

      this.panelRespuesta = crear('div', {
        class: 'panel respuesta', role: 'status', hidden: true,
      }, [
        crear('header', { class: 'panel__cabecera' }, [
          this.respuestaTitulo,
          crear('button', {
            class: 'galaxia__cerrar', type: 'button',
            'aria-label': 'Cerrar la respuesta',
            onclick: () => { this.panelRespuesta.hidden = true; },
            text: '✕',
          }),
        ]),
        this.respuestaValor,
        this.respuestaTexto,
        this.respuestaFuente,
      ]);
      document.body.append(this.panelRespuesta);
    }

    this.respuestaTitulo.textContent = `${cuerpo} · ${etiqueta ?? ''}`.trim();
    this.respuestaValor.textContent = sinDato ? 'SIN DATOS' : (valor ?? '');
    this.respuestaValor.hidden = !sinDato && !valor;
    this.respuestaValor.dataset.sinDato = sinDato ? 'si' : 'no';
    this.respuestaTexto.textContent = texto;
    this.respuestaFuente.textContent = fuente ? `Fuente: ${fuente}` : '';
    this.respuestaFuente.hidden = !fuente;
    this.panelRespuesta.hidden = false;

    clearTimeout(this._temporizadorRespuesta);
    // Se retira sola, pero con margen de sobra para leer la fuente entera.
    this._temporizadorRespuesta = setTimeout(() => {
      this.panelRespuesta.hidden = true;
    }, 18000);
  }

  /** Propuesta de alternativas cuando no se entiende un comando de voz. */
  mostrarSugerencias(texto, sugerencias) {
    // Se retira la respuesta anterior: dejarla ahí mientras se dice «no te he
    // entendido» invita a leerla como si fuera la contestación a lo último.
    if (this.panelRespuesta) this.panelRespuesta.hidden = true;

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
      this.subtitulos, this.comparador, this.avisos,
    ]) {
      parte?.destruir?.();
    }
    clearTimeout(this._temporizadorSugerencias);
    clearTimeout(this._temporizadorRespuesta);
    this.panelRespuesta?.remove();
    this.controles?.remove();
    this.panelAyuda?.remove();
    this.avisoSugerencias?.remove();
    $('#hud').hidden = true;
  }
}

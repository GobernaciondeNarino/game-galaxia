<?php
/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ORBIS — PLANTILLA DE CONFIGURACIÓN DEL SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Este es el ÚNICO archivo que hay que tocar para configurar ORBIS en el
 *  servidor. Aquí van la clave de ElevenLabs, el código de la voz, la clave de
 *  Anthropic para el asistente y los topes de gasto.
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  CÓMO USARLO
 *  ──────────────────────────────────────────────────────────────────────────
 *
 *    1. En el servidor, copia este archivo al lado, sin «.example»:
 *
 *         cp wj-config-ejemplo.php wj-config.php
 *
 *       (En el gestor de archivos de Plesk: duplicar y renombrar.)
 *
 *    2. Rellena SOLO lo que quieras fijar desde aquí. Lo que dejes vacío se
 *       queda en manos del panel, y si allí tampoco hay nada, del valor por
 *       omisión que ya trae ORBIS —escrito en el comentario de cada clave—.
 *
 *       O NO RELLENES NADA y hazlo todo desde el panel:
 *       https://tu-dominio/wj-admin/ — más cómodo, y lo que se ponga AQUÍ
 *       manda sobre lo que se ponga allí.
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  POR QUÉ TODAS LAS CLAVES VIAJAN VACÍAS
 *  ──────────────────────────────────────────────────────────────────────────
 *
 *  Porque copiar esta plantilla es el paso 1 de la instalación, y ese paso
 *  BLOQUEABA medio panel. Ocho de estas claves traían rellenado su valor por
 *  omisión —el modelo de síntesis, el de transcripción y los seis topes de
 *  gasto— y para Config eso es un valor fijado por quien administra el
 *  servidor. El panel hacía entonces lo que tiene que hacer con un valor
 *  fijado: enseñarlo bloqueado. Resultado: quien seguía las instrucciones al
 *  pie de la letra se encontraba un formulario que no dejaba escribir en la
 *  mitad de sus campos, sin haber decidido nada.
 *
 *  Un valor por omisión no es una decisión. Ahora vive en el comentario, donde
 *  se lee igual de bien, y la clave viaja vacía: RELLENARLA es lo que
 *  convierte un valor en una decisión, y solo entonces manda sobre el panel.
 *
 *    3. Comprueba que NO se puede leer desde fuera. Abre en el navegador:
 *
 *         https://tu-dominio/wj-config.php               → tiene que dar 403
 *         https://tu-dominio/wj-includes/api/health.php  → dice qué ha detectado
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  DÓNDE PONER LAS CLAVES: DOS SITIOS, UNO MEJOR QUE OTRO
 *  ──────────────────────────────────────────────────────────────────────────
 *
 *  Cada valor se busca en este orden y gana el PRIMERO que aparece:
 *
 *    1º  VARIABLE DE ENTORNO de Plesk  ←  recomendado para las claves
 *        Dominios → Configuración de PHP → Variables de entorno.
 *        La clave no toca el disco del sitio, así que no puede acabar en una
 *        copia de seguridad descargable ni en un despliegue por FTP.
 *
 *    2º  ESTE ARCHIVO (wj-config.php)
 *        Más cómodo, y perfectamente válido: está en .gitignore y el .htaccess
 *        raíz lo bloquea por nombre. Pero vive en el disco.
 *
 *    3º  EL PANEL de wj-admin, que guarda en wj-content/ajustes/ajustes.json.
 *        La capa cómoda. Lo que se fije en 1º o 2º se enseña allí bloqueado,
 *        con su procedencia, en lugar de dejar escribir algo sin efecto.
 *
 *  Si defines una variable de entorno Y la rellenas aquí, GANA LA VARIABLE DE
 *  ENTORNO. Es la causa número uno de «he cambiado la voz y suena igual»:
 *  `api/health.php` dice de dónde sale cada valor, precisamente para eso.
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  NUNCA
 *  ──────────────────────────────────────────────────────────────────────────
 *
 *  · No subas wj-config.php al repositorio. Está en .gitignore por algo.
 *  · No copies estos valores a ningún archivo de js/, css/ o data/: todo eso
 *    se sirve al navegador y cualquiera puede leerlo. `bash
 *    tools/comprobar-secretos.sh` lo verifica antes de cada commit.
 *  · Si una clave se te ha escapado alguna vez —un correo, una captura, un
 *    mensaje de chat—, dala por comprometida y genera otra. Rotarla cuesta un
 *    minuto; una clave filtrada la gasta cualquiera.
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

declare(strict_types=1);

return [

    // ════════════════════════════════════════════════════════════════════════
    //  0. PANEL DE ADMINISTRACIÓN — https://tu-dominio/wj-admin/
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Clave para entrar en el panel.
     *
     * MIENTRAS ESTÉ VACÍA se usa la de por omisión, «orbis-admin», que viene
     * escrita en el repositorio: cualquiera que vea el código la conoce. El
     * panel avisa en rojo mientras siga así. Cámbiala antes de abrir el sitio.
     *
     * Mejor todavía: guarda aquí un HASH en lugar de la clave, y así la clave
     * real no queda escrita en el disco del servidor ni en una copia de
     * seguridad. Se genera con:
     *
     *     php -r 'echo password_hash("tu-clave", PASSWORD_DEFAULT), "\n";'
     *
     * Y lo mejor de todo: ponla como variable de entorno WJ_ADMIN_CLAVE en
     * Plesk, que ni siquiera toca el disco.
     *
     * Esta es la ÚNICA clave que el panel no puede cambiarse a sí mismo. Si
     * pudiera, quien entrase una vez con la de por omisión dejaría fuera al
     * administrador de verdad.
     */
    'WJ_ADMIN_CLAVE' => '',


    // ════════════════════════════════════════════════════════════════════════
    //  1. NARRACIÓN CON VOZ — ElevenLabs
    //     Sin esto ORBIS funciona igual, pero narra con la voz del navegador,
    //     que es notablemente peor. No es obligatorio; es lo primero que se
    //     nota si falta.
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Clave de la API de ElevenLabs.
     * Se saca en https://elevenlabs.io → Profile → API Key.
     *
     * La misma clave sirve para la narración (api/tts.php) y para transcribir
     * la voz cuando el navegador no sabe hacerlo (api/stt.php, que existe
     * sobre todo para Safari).
     */
    'ELEVENLABS_API_KEY' => '',

    /**
     * CÓDIGO DE LA VOZ con la que habla ORBIS.
     *
     * Déjalo vacío para usar la voz que ya trae ORBIS: «Enrique M. Nieto»
     * (gbTn1bmCvNgk0QEAVyfM), fijada en wj-includes/lib/Config.php.
     *
     * Lo más cómodo es elegirla en el panel de wj-admin, que ofrece las
     * candidatas en español con un botón para OÍR cada una antes de decidir.
     * A mano: https://elevenlabs.io → Voices → elige una → Copiar ID. O:
     *     curl -H "xi-api-key: TU_CLAVE" https://api.elevenlabs.io/v1/voices
     *     php tools/verificar-voz.php   ← qué es de verdad la que hay puesta
     *
     * Un identificador de voz es PÚBLICO: sin la clave de API no sirve para
     * nada, así que no pasa nada porque se vea.
     *
     * Después de cambiarlo, BORRA cache/audio/: los MP3 ya generados siguen
     * ahí con la voz vieja y se seguirían sirviendo tal cual. Es la segunda
     * causa de «he cambiado la voz y suena igual».
     */
    'ELEVENLABS_VOICE_ID' => '',

    /**
     * Modelo de síntesis. Vacío = `eleven_multilingual_v2`, que da la mejor
     * prosodia en español; los «turbo» salen más baratos y suenan más planos.
     */
    'ELEVENLABS_MODEL_ID' => '',

    /**
     * Voces que api/tts.php acepta, separadas por comas.
     *
     * Vacío = solo la voz de arriba. Esto es una cerradura, no una comodidad:
     * impide que alguien pida una voz cualquiera por parámetro y te gaste la
     * cuenta probando el catálogo entero de ElevenLabs.
     */
    'ELEVENLABS_VOCES_PERMITIDAS' => '',

    /**
     * Modelo de transcripción para api/stt.php (dictado por voz en los
     * navegadores sin reconocimiento propio). Vacío = `scribe_v1`.
     */
    'ELEVENLABS_STT_MODEL' => '',


    // ════════════════════════════════════════════════════════════════════════
    //  2. ASISTENTE CONVERSACIONAL — Anthropic
    //     Sin esto, el botón «Asistente» responde 503 con una explicación y
    //     ORBIS sigue contestando las preguntas del catálogo por su cuenta.
    //     La conversación libre —preguntarle lo que sea— necesita la clave.
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Clave de la API de Anthropic.
     * Se saca en https://console.anthropic.com → Settings → API Keys.
     *
     * El asistente NO responde de memoria: cada cifra que dice se la devuelve
     * una de sus seis herramientas leyendo data/sistema-solar.json. Es la
     * regla 4 del proyecto y está probada en tools/pruebas-conversacion.php.
     */
    'ANTHROPIC_API_KEY' => '',

    /**
     * Modelo del asistente. Vacío = el que trae ORBIS.
     * Cámbialo por uno más pequeño si el gasto se dispara; responderá algo
     * peor, pero las herramientas y los datos son exactamente los mismos.
     */
    'ORBIS_MODELO' => '',


    // ════════════════════════════════════════════════════════════════════════
    //  3. TOPES DE GASTO
    //     Cuentan por dirección IP y por hora. Existen porque las tres APIs se
    //     pagan por uso: sin ellos, una pestaña con un bucle vacía la cuenta
    //     en una tarde.
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Narraciones NUEVAS por IP y hora. Las que ya están en cache/audio/ no
     * cuentan, y la precarga tampoco: el tope limita el gasto, no el uso.
     *
     * Vacío = 30. Con ese valor una visita normal nunca lo toca. Al llenarse
     * la caché de los 33 cuerpos —lo que pasa una sola vez, en las primeras
     * visitas— el gasto se detiene y se reanuda a la hora siguiente.
     */
    'LIMITE_GENERACIONES_HORA' => '',

    /**
     * Transcripciones por IP y hora (api/stt.php). Vacío = 120: más alto
     * porque cada una cuesta bastante menos que una narración, y son turnos
     * de conversación.
     */
    'LIMITE_TRANSCRIPCIONES_HORA' => '',

    /**
     * Respuestas del asistente por IP y hora (api/chat.php). Vacío = 60. Es el
     * más caro de los tres: cada respuesta puede encadenar varias llamadas a
     * herramientas.
     */
    'LIMITE_CONVERSACION_HORA' => '',

    // ── Techos del SITIO ENTERO, por día ────────────────────────────────
    //
    //  Los tres límites de arriba acotan lo que gasta UNA persona. Estos acotan
    //  lo que gasta el sitio. Hacen falta los dos: con sesenta conversaciones
    //  por IP y hora, diez direcciones distintas son seiscientas respuestas de
    //  un modelo de pago en una tarde, y sin techo nada las frenaba.
    //
    //  NO son un objetivo de uso: son un freno de emergencia. Un día normal no
    //  se acerca. Si se alcanza, algo está pasando —un bucle, un rastreador,
    //  alguien probando— y es mejor que el sitio deje de gastar unas horas a
    //  que siga pagando. Cuando se llega, la interfaz lo dice con esas palabras
    //  y sigue funcionando: la voz pasa a la del navegador y las preguntas del
    //  catálogo se contestan igual.
    //
    //  Vacío = el valor por omisión de cada uno, que es el que dice su
    //  comentario. CERO los desactiva, que no es lo mismo que vacío. Si los
    //  subes, súbelos a sabiendas.

    /**
     * Narraciones NUEVAS de todo el sitio en 24 h. Las cacheadas no cuentan.
     *
     * Vacío = 500, y con eso hay de sobra: el catálogo entero son 33 cuerpos
     * × 3 narraciones, más las frases, y una vez generadas no se vuelven a
     * pagar nunca.
     */
    'TOPE_DIARIO_NARRACION' => '',

    /** Transcripciones de todo el sitio en 24 h. Vacío = 1500. */
    'TOPE_DIARIO_TRANSCRIPCION' => '',

    /**
     * Respuestas del asistente de todo el sitio en 24 h.
     *
     * Vacío = 400. Es el más caro de los tres y el que conviene mirar primero
     * si el gasto sorprende: cada respuesta puede encadenar varias llamadas a
     * herramientas.
     */
    'TOPE_DIARIO_CONVERSACION' => '',

    /**
     * Sal con la que se anonimizan las direcciones IP de los contadores.
     *
     * PONLE ALGO PROPIO. Cualquier texto largo vale:
     *     head -c 32 /dev/urandom | base64
     *
     * También se puede poner desde el panel de wj-admin, que además avisa en
     * rojo mientras siga sin ponerse.
     *
     * Los topes de arriba cuentan por visitante, y ORBIS guarda un hash de la
     * IP en lugar de la IP: así en cache/limites/ no queda una lista de
     * direcciones de quien ha entrado. Pero un hash sin sal —o con la misma sal
     * en todas las instalaciones— se puede deshacer probando: solo hay unos
     * pocos miles de millones de direcciones. Con una sal tuya, el hash no dice
     * nada fuera de este servidor.
     *
     * Cambiarla vacía los contadores en curso. No pasa nada: se rehacen solos.
     */
    'ORBIS_SAL_LIMITES' => '',

];

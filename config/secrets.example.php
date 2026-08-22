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
 *         cp config/secrets.example.php config/secrets.php
 *
 *       (En el gestor de archivos de Plesk: duplicar y renombrar.)
 *
 *    2. Rellena los valores de config/secrets.php. Lo que dejes vacío usa el
 *       valor de la derecha, que es el que ya trae ORBIS.
 *
 *    3. Comprueba que NO se puede leer desde fuera. Abre en el navegador:
 *
 *         https://tu-dominio/config/secrets.php     → tiene que dar 403
 *         https://tu-dominio/api/health.php         → dice qué ha detectado
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
 *    2º  ESTE ARCHIVO (config/secrets.php)
 *        Más cómodo, y perfectamente válido: está en .gitignore y config/
 *        .htaccess lo bloquea con `Require all denied`. Pero vive en el disco.
 *
 *  Si defines una variable de entorno Y la rellenas aquí, GANA LA VARIABLE DE
 *  ENTORNO. Es la causa número uno de «he cambiado la voz y suena igual»:
 *  `api/health.php` dice de dónde sale cada valor, precisamente para eso.
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  NUNCA
 *  ──────────────────────────────────────────────────────────────────────────
 *
 *  · No subas config/secrets.php al repositorio. Está en .gitignore por algo.
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
     * Déjalo vacío para usar la voz que ya trae ORBIS
     * (lE5ZJB6jGeeuvSNxOvs2, fijada en api/lib/Config.php).
     *
     * Para cambiarla: https://elevenlabs.io → Voices → elige una → Copiar ID.
     * O saca la lista completa con la clave:
     *     curl -H "xi-api-key: TU_CLAVE" https://api.elevenlabs.io/v1/voices
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
     * Modelo de síntesis. `eleven_multilingual_v2` da la mejor prosodia en
     * español; los modelos «turbo» salen más baratos y suenan más planos.
     */
    'ELEVENLABS_MODEL_ID' => 'eleven_multilingual_v2',

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
     * navegadores sin reconocimiento propio).
     */
    'ELEVENLABS_STT_MODEL' => 'scribe_v1',


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
     * Modelo del asistente. Vacío = el que trae ORBIS (claude-opus-5).
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
     * Con 30, una visita normal nunca lo toca. Al llenarse la caché de los 33
     * cuerpos —lo que pasa una sola vez, en las primeras visitas— el gasto se
     * detiene y se reanuda a la hora siguiente.
     */
    'LIMITE_GENERACIONES_HORA' => 30,

    /**
     * Transcripciones por IP y hora (api/stt.php). Más alto porque cada una
     * cuesta bastante menos que una narración y son turnos de conversación.
     */
    'LIMITE_TRANSCRIPCIONES_HORA' => 120,

    /**
     * Respuestas del asistente por IP y hora (api/chat.php). Es el más caro de
     * los tres: cada respuesta puede encadenar varias llamadas a herramientas.
     */
    'LIMITE_CONVERSACION_HORA' => 60,

    /**
     * Sal con la que se anonimizan las direcciones IP de los contadores.
     *
     * PONLE ALGO PROPIO. Cualquier texto largo vale:
     *     head -c 32 /dev/urandom | base64
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

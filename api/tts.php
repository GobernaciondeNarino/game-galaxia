<?php
/**
 * ORBIS — Proxy de síntesis de voz (ElevenLabs Text-to-Speech).
 *
 * El navegador NUNCA habla con ElevenLabs. Habla con este archivo, que:
 *
 *   1. valida que el cuerpo pedido existe en data/sistema-solar.json;
 *   2. toma el texto de SU PROPIA copia del catálogo, no del cliente;
 *   3. sirve el MP3 de la caché si ya existe, sin salir a Internet;
 *   4. si no existe, lo genera, lo guarda y lo devuelve;
 *   5. limita las generaciones nuevas por IP.
 *
 * POR QUÉ EL TEXTO NO VIENE DEL CLIENTE. Un endpoint que sintetiza el texto que
 * se le envíe es una pasarela gratuita hacia una API de pago a costa del
 * titular de la cuenta: bastaría con un bucle enviando párrafos para agotar el
 * saldo. Aceptando solo un identificador, el conjunto de textos posibles es
 * finito, conocido y cacheable, y el gasto máximo está acotado por el catálogo.
 *
 * Petición, en cualquiera de las dos formas:
 *   GET  api/tts.php?bodyId=jupiter[&soloCache=1]
 *   POST api/tts.php  con { "bodyId": "jupiter", "voiceId": "…" }
 *
 * `soloCache=1` sirve el audio si ya está generado y devuelve 204 si no lo
 * está, SIN sintetizar ni consumir cupo. Lo usa la precarga de los cuerpos
 * vecinos: precargar no puede costar dinero ni gastar el límite por hora del
 * visitante, que debe quedar para lo que de verdad pide.
 *
 * Se admite GET a propósito: permite usar la URL directamente como src de un
 * <audio>, y con ella el navegador cachea el MP3 un año por su cuenta. Con solo
 * POST, cada reproducción volvería a pedir el archivo al servidor.
 *
 * Respuesta: audio/mpeg, o JSON con { error, mensaje } si algo falla.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/Config.php';
require_once __DIR__ . '/lib/Respuesta.php';
require_once __DIR__ . '/lib/Cache.php';
require_once __DIR__ . '/lib/RateLimiter.php';
require_once __DIR__ . '/lib/Catalogo.php';
require_once __DIR__ . '/lib/Asistente.php';
require_once __DIR__ . '/lib/Respuestas.php';

header('X-Content-Type-Options: nosniff');

// ---------------------------------------------------------------------------
// 1. Método y cuerpo de la petición
// ---------------------------------------------------------------------------
$metodo = $_SERVER['REQUEST_METHOD'] ?? '';

if ($metodo === 'GET') {
    $peticion = [
        'bodyId' => $_GET['bodyId'] ?? '',
        'frase' => $_GET['frase'] ?? null,
        'atributo' => $_GET['atributo'] ?? null,
        'nombre' => $_GET['nombre'] ?? null,
        'voiceId' => $_GET['voiceId'] ?? null,
        'variante' => $_GET['variante'] ?? 0,
        'soloCache' => isset($_GET['soloCache']) && $_GET['soloCache'] === '1',
    ];
} elseif ($metodo === 'POST') {
    $crudo = file_get_contents('php://input');
    if ($crudo === false || strlen($crudo) > 4096) {
        Respuesta::error(400, 'peticion_invalida', 'La petición está vacía o es demasiado grande.');
    }
    $peticion = json_decode((string) $crudo, true);
    if (!is_array($peticion)) {
        Respuesta::error(400, 'json_invalido', 'El cuerpo de la petición no es JSON válido.');
    }
} else {
    header('Allow: GET, POST');
    Respuesta::error(405, 'metodo_no_permitido', 'Este endpoint solo acepta GET y POST.');
}

// ---------------------------------------------------------------------------
// 2. Qué hay que decir
//    Dos vías, y en las dos el TEXTO lo pone el servidor: la narración de un
//    cuerpo del catálogo, o una frase del asistente. El cliente solo elige cuál
//    con un identificador y un número.
// ---------------------------------------------------------------------------
$variante = (int) ($peticion['variante'] ?? 0);
$fraseId = isset($peticion['frase']) ? (string) $peticion['frase'] : '';
$bodyId = isset($peticion['bodyId']) ? (string) $peticion['bodyId'] : '';

$atributo = isset($peticion['atributo']) ? (string) $peticion['atributo'] : '';

if ($atributo !== '') {
    // Respuesta a una pregunta: dos identificadores, y el texto lo compone
    // Respuestas a partir del catálogo. Igual que en las otras dos vías, el
    // navegador elige QUÉ se dice, nunca CÓMO se dice.
    if (preg_match('/^[a-z]{1,24}$/', $atributo) !== 1) {
        Respuesta::error(400, 'atributo_invalido', 'El atributo no tiene un formato válido.');
    }
    if (preg_match('/^[a-z0-9-]{1,40}$/', $bodyId) !== 1) {
        Respuesta::error(400, 'id_invalido', 'El identificador del cuerpo no tiene un formato válido.');
    }

    $resultado = Respuestas::responder($bodyId, $atributo);
    if ($resultado === null) {
        Respuesta::error(
            404,
            'sin_respuesta',
            'No hay respuesta para esa combinación de cuerpo y atributo.',
            $bodyId . ' / ' . $atributo
        );
    }
    $texto = $resultado['texto'];
    $bodyId = 'respuesta-' . $bodyId . '-' . $atributo;
} elseif ($fraseId !== '') {
    if (preg_match('/^[a-z-]{1,32}$/', $fraseId) !== 1) {
        Respuesta::error(400, 'frase_invalida', 'El identificador de frase no tiene un formato válido.');
    }

    // El nombre es lo ÚNICO que llega del cliente y acaba dicho en voz alta.
    // Asistente::limpiarNombre lo acota a un puñado de letras; si no pasa, se
    // usa la versión sin nombre en lugar de rechazar la petición.
    $nombre = Asistente::limpiarNombre(
        isset($peticion['nombre']) ? (string) $peticion['nombre'] : null
    );

    $texto = Asistente::frase($fraseId, $nombre, $variante);
    if ($texto === null) {
        Respuesta::error(
            404,
            'frase_desconocida',
            'No hay ninguna frase registrada con ese identificador.',
            'frase solicitada: ' . $fraseId
        );
    }
    $bodyId = 'asistente-' . $fraseId;
} else {
    // El identificador tiene un formato conocido: minúsculas, dígitos y guiones.
    if (preg_match('/^[a-z0-9-]{1,40}$/', $bodyId) !== 1) {
        Respuesta::error(400, 'id_invalido', 'El identificador del cuerpo no tiene un formato válido.');
    }

    $texto = Catalogo::narracion($bodyId, $variante);
    if ($texto === null) {
        Respuesta::error(
            404,
            'cuerpo_desconocido',
            'No hay narración registrada para ese cuerpo.',
            'bodyId solicitado: ' . $bodyId
        );
    }
}

// Tope de longitud: el catálogo lo cumple de sobra (150-220 palabras), pero si
// alguien edita una narración a mano, mejor que falle aquí que en la factura.
$LIMITE_CARACTERES = 2500;
if (mb_strlen($texto) > $LIMITE_CARACTERES) {
    Respuesta::error(
        413,
        'texto_demasiado_largo',
        'La narración de ese cuerpo supera el límite configurado.',
        $bodyId . ' tiene ' . mb_strlen($texto) . ' caracteres'
    );
}

// ---------------------------------------------------------------------------
// 3. Voz y modelo
//    El cliente puede pedir una voz concreta, pero solo de una lista blanca:
//    un voiceId libre permitiría usar voces de pago ajenas al proyecto.
//
//    VOZ_ORBIS es un identificador público de ElevenLabs, no una credencial:
//    sin la clave de API no sirve para nada, así que puede ir en el repositorio.
//    Se puede sustituir sin tocar el código con la variable de entorno
//    ELEVENLABS_VOICE_ID o con config/secrets.php.
// ---------------------------------------------------------------------------
$vozPredeterminada = Config::obtener('ELEVENLABS_VOICE_ID', Config::VOZ_PREDETERMINADA);
$modelo = Config::obtener('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2');

$vocesPermitidas = array_filter(array_map(
    'trim',
    explode(',', (string) Config::obtener('ELEVENLABS_VOCES_PERMITIDAS', (string) $vozPredeterminada))
));

$voz = !empty($peticion['voiceId']) ? (string) $peticion['voiceId'] : (string) $vozPredeterminada;
if ($voz !== $vozPredeterminada && !in_array($voz, $vocesPermitidas, true)) {
    $voz = (string) $vozPredeterminada;
}

$clave = Config::obtener('ELEVENLABS_API_KEY');

// ---------------------------------------------------------------------------
// 4. Caché: si ya existe, se sirve sin tocar ElevenLabs ni el limitador
// ---------------------------------------------------------------------------
$cache = new Cache();
$claveCache = $cache->clave($texto, $voz, (string) $modelo);

if ($cache->existe($claveCache)) {
    $cache->servir($claveCache, true);
    exit;
}

// Precarga: si no estaba en caché, se responde «todavía no» y se termina. Sin
// llamada saliente, sin gasto y sin consumir cupo.
if (!empty($peticion['soloCache'])) {
    http_response_code(204);
    header('Cache-Control: no-store');
    header('X-Orbis-Cache: miss');
    exit;
}

// A partir de aquí hace falta generar, así que hace falta la clave de API.
if ($clave === null || $clave === '') {
    Respuesta::error(
        503,
        'sin_credencial',
        'La narración con voz no está configurada en este servidor. Se usará la voz del navegador.',
        'ELEVENLABS_API_KEY ausente'
    );
}
if ($voz === '') {
    Respuesta::error(
        503,
        'sin_voz',
        'No hay ninguna voz configurada para la narración.',
        'ELEVENLABS_VOICE_ID ausente'
    );
}

// ---------------------------------------------------------------------------
// 5. Límite de generaciones nuevas por IP
// ---------------------------------------------------------------------------
$limitador = new RateLimiter(Config::entero('LIMITE_GENERACIONES_HORA', 30));
$cupo = $limitador->consumir();

header('X-Orbis-Cupo-Restante: ' . $cupo['restantes']);

if (!$cupo['permitido']) {
    header('Retry-After: ' . $cupo['esperaSegundos']);
    Respuesta::error(
        429,
        'limite_alcanzado',
        'Se ha alcanzado el límite de narraciones nuevas por hora. Vuelve a intentarlo más tarde; '
            . 'mientras tanto se usará la voz del navegador.',
        'cupo agotado'
    );
}

// ---------------------------------------------------------------------------
// 6. Llamada a ElevenLabs
// ---------------------------------------------------------------------------
if (!extension_loaded('curl')) {
    Respuesta::error(503, 'sin_curl', 'El servidor no puede realizar la síntesis de voz.', 'extensión curl ausente');
}

$carga = json_encode([
    'text' => $texto,
    'model_id' => $modelo,
    'voice_settings' => [
        'stability' => 0.42,
        'similarity_boost' => 0.78,
        'style' => 0.15,
        'use_speaker_boost' => true,
    ],
], JSON_UNESCAPED_UNICODE);

$ch = curl_init('https://api.elevenlabs.io/v1/text-to-speech/' . rawurlencode($voz));
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $carga,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 45,
    CURLOPT_CONNECTTIMEOUT => 10,
    // Verificación TLS obligatoria: sin ella, la clave de API viajaría por un
    // canal que se podría interceptar.
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_HTTPHEADER => [
        'xi-api-key: ' . $clave,
        'Content-Type: application/json',
        'Accept: audio/mpeg',
    ],
]);

$respuesta = curl_exec($ch);
$codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$tipo = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$errorCurl = curl_error($ch);
curl_close($ch);

if ($respuesta === false || $codigo === 0) {
    Respuesta::error(
        502,
        'sin_conexion',
        'No se pudo contactar con el servicio de voz. Se usará la voz del navegador.',
        'curl: ' . $errorCurl
    );
}

if ($codigo !== 200 || strpos($tipo, 'audio') === false) {
    // La respuesta cruda del tercero NO se devuelve: puede contener detalles de
    // la cuenta. Va al registro, recortada.
    Respuesta::error(
        502,
        'error_sintesis',
        'El servicio de voz devolvió un error. Se usará la voz del navegador.',
        'HTTP ' . $codigo . ' tipo ' . $tipo . ' — ' . substr((string) $respuesta, 0, 300)
    );
}

// ---------------------------------------------------------------------------
// 7. Guardar y servir
// ---------------------------------------------------------------------------
if (!$cache->guardar($claveCache, (string) $respuesta)) {
    // No poder cachear es grave —cada visita volvería a pagar—, pero no motivo
    // para no entregar el audio ya generado.
    Respuesta::registrar('error', 'No se pudo guardar en caché ' . $claveCache . ' (¿permisos de cache/audio?)');

    header('Content-Type: audio/mpeg');
    header('Content-Length: ' . strlen((string) $respuesta));
    header('Cache-Control: no-store');
    header('X-Orbis-Cache: error');
    echo $respuesta;
    exit;
}

Respuesta::registrar('info', 'Generada narración de ' . $bodyId . ' (' . mb_strlen($texto) . ' caracteres)');
$cache->servir($claveCache, false);

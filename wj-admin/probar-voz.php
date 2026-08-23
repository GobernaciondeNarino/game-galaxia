<?php
/**
 * ORBIS — Prueba de voz para el panel de administración.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  POR QUÉ EXISTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Porque elegir una voz leyendo su descripción no funciona. La que ORBIS traía
 * de fábrica era «Marshal - Toon Character», un personaje de dibujos animados
 * en inglés, y llevaba meses ahí: la síntesis funcionaba, el audio llegaba, la
 * caché lo guardaba. Solo se oía. Sin poder escuchar antes de decidir, el
 * siguiente error de este tipo tardaría lo mismo en salir.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  POR QUÉ NO SE USA api/tts.php
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ese endpoint es PÚBLICO y solo acepta las voces de la lista blanca, a
 * propósito: si aceptara cualquiera, cualquiera podría recorrer el catálogo
 * entero de ElevenLabs a costa del titular de la cuenta. Ampliar esa lista para
 * poder probar habría abierto justo el agujero que la lista cierra.
 *
 * Esto vive detrás de la sesión del panel, acepta SOLO las diez voces
 * candidatas y dice una frase fija de ochenta caracteres. Lo que se puede
 * gastar desde aquí está acotado por tres sitios a la vez.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Y SE CACHEA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La misma voz diciendo la misma frase es el mismo audio. Se guarda con el
 * mismo Cache que la narración, así que comparar diez voces cuesta diez
 * síntesis UNA vez y ninguna a partir de la segunda.
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/Config.php';
require_once __DIR__ . '/../wj-includes/lib/Ajustes.php';
require_once __DIR__ . '/../wj-includes/lib/SesionAdmin.php';
require_once __DIR__ . '/../wj-includes/lib/Cache.php';
require_once __DIR__ . '/../wj-includes/lib/RateLimiter.php';
require_once __DIR__ . '/../wj-includes/lib/Respuesta.php';

/**
 * La frase de prueba.
 *
 * Lleva números, un nombre propio y una cifra con separador porque es donde se
 * nota si una voz sirve para ORBIS: leer «1.391.400 kilómetros» en español es
 * exactamente lo que va a tener que hacer todo el día.
 */
const FRASE = 'Esto es el Sol. Su diámetro es de 1.391.400 kilómetros, unas ciento nueve veces el de la Tierra.';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (!SesionAdmin::dentro()) {
    Respuesta::error(403, 'sin_sesion', 'Hay que entrar en el panel para probar una voz.');
}

$voz = (string) ($_GET['voz'] ?? '');
if (!isset(Ajustes::VOCES[$voz])) {
    Respuesta::error(400, 'voz_no_candidata', 'Esa voz no está entre las candidatas del panel.');
}

$clave = Config::obtener('ELEVENLABS_API_KEY');
if ($clave === null || $clave === '') {
    Respuesta::error(503, 'sin_credencial', 'No hay clave de ElevenLabs configurada.');
}

$modelo = (string) Config::obtener('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2');

// La caché es la misma de la narración: misma voz y misma frase, mismo audio.
$cache = new Cache();
$claveCache = $cache->clave(FRASE, $voz, $modelo);
if ($cache->existe($claveCache)) {
    $cache->servir($claveCache, true);
    exit;
}

// Diez pruebas por hora: comparar el catálogo entero cabe de sobra, y dejar el
// botón pulsado no.
$limitador = new RateLimiter(20, 3600, 'pruebavoz', 60);
if (!$limitador->consumir()['permitido']) {
    Respuesta::error(429, 'limite_alcanzado', 'Demasiadas pruebas seguidas. Espera un poco.');
}

if (!extension_loaded('curl')) {
    Respuesta::error(503, 'sin_curl', 'El servidor no puede sintetizar voz.');
}

$ch = curl_init(
    'https://api.elevenlabs.io/v1/text-to-speech/' . rawurlencode($voz)
    . '?output_format=mp3_44100_128'
);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 45,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_HTTPHEADER     => [
        'xi-api-key: ' . $clave,
        'Content-Type: application/json',
        'Accept: audio/mpeg',
    ],
    // Los MISMOS ajustes que usa la narración de verdad: probar con otros daría
    // una idea equivocada de cómo va a sonar el sitio.
    CURLOPT_POSTFIELDS => json_encode([
        'text'     => FRASE,
        'model_id' => $modelo,
        'voice_settings' => [
            'stability'         => 0.42,
            'similarity_boost'  => 0.78,
            'style'             => 0.15,
            'use_speaker_boost' => true,
        ],
    ], JSON_UNESCAPED_UNICODE),
]);
$audio = curl_exec($ch);
$codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$tipo = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($codigo !== 200 || strpos($tipo, 'audio') === false) {
    $detalle = json_decode((string) $audio, true);
    $mensajeApi = (string) ($detalle['detail']['message'] ?? '');
    $sinPermiso = $codigo === 401
        && (($detalle['detail']['status'] ?? '') === 'missing_permissions'
            || stripos($mensajeApi, 'permission') !== false);

    Respuesta::error(
        502,
        $sinPermiso ? 'clave_sin_permiso' : 'error_sintesis',
        $sinPermiso
            ? 'La clave configurada no tiene permiso para sintetizar. Activa «text_to_speech» en '
                . 'el panel de ElevenLabs para esa clave, o genera otra que lo tenga.'
            : 'ElevenLabs devolvió un error al probar esta voz.',
        'HTTP ' . $codigo . ' — ' . substr((string) $audio, 0, 200)
    );
}

$cache->guardar($claveCache, (string) $audio);
Respuesta::registrar('info', 'Prueba de voz ' . $voz . ' desde wj-admin.');

header('Content-Type: audio/mpeg');
header('Content-Length: ' . strlen((string) $audio));
echo $audio;

<?php
/**
 * ORBIS — Proxy de transcripción de voz (ElevenLabs Speech-to-Text).
 *
 * Es la ALTERNATIVA al reconocimiento del navegador, para Firefox y Safari,
 * que no implementan la Web Speech API. El cliente graba fragmentos cortos y
 * los envía aquí; aquí se transcriben y se devuelve solo el texto.
 *
 * DIFERENCIA IMPORTANTE CON LA RUTA PRINCIPAL. Con el reconocimiento del
 * navegador, el audio nunca sale del equipo en el caso de Chrome... salvo que
 * el propio Chrome lo envíe a Google, cosa que hace. Con esta ruta, el audio
 * llega a este servidor y de aquí a ElevenLabs. En ambos casos hay envío a un
 * tercero, y en ambos casos la interfaz lo dice antes de encender el micrófono.
 * Lo que NO se hace nunca es guardar el audio: se transcribe y se descarta.
 *
 * Petición: POST multipart/form-data con el campo `audio`.
 * Respuesta: { "texto": "…", "idioma": "spa" } o { error, mensaje }.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/Config.php';
require_once __DIR__ . '/lib/Respuesta.php';
require_once __DIR__ . '/lib/RateLimiter.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    Respuesta::error(405, 'metodo_no_permitido', 'Este endpoint solo acepta POST.');
}

// ---------------------------------------------------------------------------
// 1. Archivo de audio
//    Los fragmentos son de pocos segundos: un límite bajo evita que alguien
//    intente transcribir una hora de audio a costa de la cuenta.
// ---------------------------------------------------------------------------
const TAMANO_MAXIMO = 1048576;   // 1 MiB ≈ 30 s de Opus a 32 kbps

if (!isset($_FILES['audio']) || !is_array($_FILES['audio'])) {
    Respuesta::error(400, 'sin_audio', 'No se ha recibido ningún fragmento de audio.');
}

$archivo = $_FILES['audio'];

if (($archivo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    Respuesta::error(400, 'subida_fallida', 'El fragmento de audio no llegó completo.', 'código ' . $archivo['error']);
}
if (($archivo['size'] ?? 0) <= 0 || $archivo['size'] > TAMANO_MAXIMO) {
    Respuesta::error(413, 'audio_demasiado_grande', 'El fragmento de audio es demasiado largo.', 'bytes: ' . $archivo['size']);
}
if (!is_uploaded_file($archivo['tmp_name'])) {
    Respuesta::error(400, 'subida_invalida', 'El archivo recibido no es una subida válida.');
}

// El tipo se comprueba por el contenido, no por lo que declare el cliente.
$tipoReal = function_exists('mime_content_type') ? (string) mime_content_type($archivo['tmp_name']) : '';
$tiposAdmitidos = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'video/webm'];

if ($tipoReal !== '' && !in_array($tipoReal, $tiposAdmitidos, true)) {
    Respuesta::error(415, 'formato_no_admitido', 'El formato del audio no está admitido.', 'detectado: ' . $tipoReal);
}

// ---------------------------------------------------------------------------
// 2. Credencial y límite
// ---------------------------------------------------------------------------
$clave = Config::obtener('ELEVENLABS_API_KEY');
if ($clave === null || $clave === '') {
    Respuesta::error(
        503,
        'sin_credencial',
        'La transcripción por servidor no está configurada. Usa un navegador con reconocimiento de voz propio.',
        'ELEVENLABS_API_KEY ausente'
    );
}

// Límite propio, más generoso que el de la síntesis porque cada fragmento es
// corto, pero límite al fin y al cabo.
$limitador = new RateLimiter(
    Config::entero('LIMITE_TRANSCRIPCIONES_HORA', 120),
    3600,
    'transcripcion',
    Config::entero('TOPE_DIARIO_TRANSCRIPCION', 1500)
);
$cupo = $limitador->consumir();
header('X-Orbis-Cupo-Restante: ' . $cupo['restantes']);

if (!$cupo['permitido']) {
    header('Retry-After: ' . $cupo['esperaSegundos']);
    $porElSitio = ($cupo['motivo'] ?? null) === 'tope_diario';
    Respuesta::error(
        429,
        'limite_alcanzado',
        $porElSitio
            ? 'Hoy ya se ha alcanzado el máximo de transcripciones de todo el sitio. Escribe la pregunta '
                . 'en lugar de dictarla.'
            : 'Se ha alcanzado el límite de transcripciones por hora.',
        $porElSitio ? 'tope diario del sitio' : 'cupo por IP agotado'
    );
}

// ---------------------------------------------------------------------------
// 3. Llamada a ElevenLabs
// ---------------------------------------------------------------------------
if (!extension_loaded('curl')) {
    Respuesta::error(503, 'sin_curl', 'El servidor no puede transcribir audio.', 'extensión curl ausente');
}

$nombre = 'fragmento.' . (strpos($tipoReal, 'ogg') !== false ? 'ogg' : 'webm');
$cuerpo = [
    'file' => new CURLFile($archivo['tmp_name'], $tipoReal ?: 'audio/webm', $nombre),
    'model_id' => Config::obtener('ELEVENLABS_STT_MODEL', 'scribe_v1'),
    'language_code' => 'spa',
];

$ch = curl_init('https://api.elevenlabs.io/v1/speech-to-text');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $cuerpo,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_HTTPHEADER => ['xi-api-key: ' . $clave],
]);

$respuesta = curl_exec($ch);
$codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$errorCurl = curl_error($ch);
curl_close($ch);

// El archivo temporal se descarta en cuanto deja de hacer falta. ORBIS no
// guarda audio de nadie, ni siquiera unos segundos de más.
@unlink($archivo['tmp_name']);

if ($respuesta === false || $codigo === 0) {
    Respuesta::error(502, 'sin_conexion', 'No se pudo contactar con el servicio de transcripción.', 'curl: ' . $errorCurl);
}
if ($codigo !== 200) {
    Respuesta::error(
        502,
        'error_transcripcion',
        'El servicio de transcripción devolvió un error.',
        'HTTP ' . $codigo . ' — ' . substr((string) $respuesta, 0, 300)
    );
}

$datos = json_decode((string) $respuesta, true);
if (!is_array($datos) || !isset($datos['text'])) {
    Respuesta::error(502, 'respuesta_inesperada', 'La transcripción llegó en un formato inesperado.', substr((string) $respuesta, 0, 300));
}

// Solo se devuelve el texto. Nada de identificadores de petición, marcas de
// tiempo por palabra ni metadatos de la cuenta.
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'texto' => trim((string) $datos['text']),
    'idioma' => (string) ($datos['language_code'] ?? 'spa'),
], JSON_UNESCAPED_UNICODE);

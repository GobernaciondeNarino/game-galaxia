<?php
/**
 * ORBIS — Conversación con el asistente.
 *
 * Petición:  POST application/json
 *            { "mensajes": [{"rol":"usuario","texto":"…"}, …],
 *              "cuerpo": "marte"|null, "nombre": "Ana"|null }
 *
 * Respuesta: { "texto": "…", "acciones": [{"tipo":"mostrar","cuerpo":"marte"}],
 *              "fuentes": ["…"], "voz": "<hash>" }
 *
 * POR QUÉ DEVUELVE UN «VOZ» Y NO EL TEXTO PARA SINTETIZAR
 * ──────────────────────────────────────────────────────
 * api/tts.php no sintetiza texto que venga del navegador, y con razón: sería un
 * proxy abierto hacia una API de pago. Pero la respuesta del asistente SÍ la ha
 * escrito el servidor, así que puede decirse en voz alta sin romper esa regla.
 * La forma de conciliarlo es guardarla aquí y devolver su hash: el cliente pide
 * «sintetiza la respuesta tal», nunca «sintetiza este texto». Quien no haya
 * pasado por aquí no tiene ningún hash que pedir.
 *
 * SIN CLAVE NO ES UN ERROR
 * ────────────────────────
 * Se responde 503 con un motivo claro y el cliente vuelve al reconocedor de
 * patrones de siempre, que sigue funcionando entero. Un despliegue sin clave de
 * Anthropic pierde la conversación libre, no la aplicación.
 *
 * Sintaxis: PHP 8.1 en adelante (lo exige el SDK vendorizado).
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/Config.php';
require_once __DIR__ . '/../lib/Respuesta.php';
require_once __DIR__ . '/../lib/RateLimiter.php';
require_once __DIR__ . '/../lib/Asistente.php';
require_once __DIR__ . '/../lib/Conversacion.php';

header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    Respuesta::error(405, 'metodo_no_permitido', 'Este endpoint solo acepta POST.');
}

if (!Conversacion::disponible()) {
    Respuesta::error(
        503,
        'asistente_no_configurado',
        'La conversación libre necesita una clave de Anthropic. Sin ella el asistente sigue '
            . 'respondiendo las preguntas del catálogo, pero no conversa.',
        'define ANTHROPIC_API_KEY en el entorno o en config/secrets.php'
    );
}

// Cada respuesta cuesta dinero, así que el límite es más estrecho que el de la
// narración: sin él, una pestaña con un bucle vaciaría la cuenta en una tarde.
$limitador = new RateLimiter(
    Config::entero('LIMITE_CONVERSACION_HORA', 60),
    3600,
    'conversacion',
    Config::entero('TOPE_DIARIO_CONVERSACION', 400)
);
$cuota = $limitador->consumir();
if (!($cuota['permitido'] ?? true)) {
    header('Retry-After: ' . (string) ($cuota['esperaSegundos'] ?? 600));
    $porElSitio = ($cuota['motivo'] ?? null) === 'tope_diario';
    Respuesta::error(
        429,
        'demasiadas_preguntas',
        $porElSitio
            ? 'Hoy ya se ha alcanzado el máximo de conversaciones de todo el sitio. Vuelve mañana; '
                . 'mientras tanto, el módulo Curiosidades sigue respondiendo del catálogo.'
            : 'Has hecho muchas preguntas seguidas. Espera un poco y sigue: los datos no se van a ninguna parte.',
        $porElSitio ? 'tope diario del sitio' : 'cupo por IP agotado'
    );
}

$crudo = (string) file_get_contents('php://input');
if (strlen($crudo) > 20000) {
    Respuesta::error(413, 'peticion_grande', 'La conversación enviada es demasiado larga.');
}
$peticion = json_decode($crudo, true);
if (!is_array($peticion) || !isset($peticion['mensajes']) || !is_array($peticion['mensajes'])) {
    Respuesta::error(400, 'peticion_invalida', 'Falta la lista de mensajes.');
}

// El identificador del cuerpo activo solo sirve para que el asistente entienda
// «y este», así que se valida su forma y si no encaja se ignora sin más.
$cuerpo = null;
if (isset($peticion['cuerpo']) && preg_match('/^[a-z0-9-]{1,40}$/', (string) $peticion['cuerpo']) === 1) {
    $cuerpo = (string) $peticion['cuerpo'];
}

// El nombre pasa por la MISMA validación que en las frases del asistente: es el
// único texto del cliente que puede acabar dicho en voz alta.
$nombre = Asistente::limpiarNombre(
    isset($peticion['nombre']) ? (string) $peticion['nombre'] : null
);

try {
    $resultado = Conversacion::responder($peticion['mensajes'], $cuerpo, $nombre);
} catch (Throwable $e) {
    Respuesta::registrar('error', 'Conversación fallida: ' . $e->getMessage());
    Respuesta::error(502, 'asistente_no_responde',
        'El asistente no ha podido responder ahora mismo. Vuelve a intentarlo en un momento.');
}

if ($resultado === null) {
    Respuesta::error(502, 'sin_respuesta', 'El asistente no ha devuelto ninguna respuesta.');
}

// Se guarda el texto para que tts.php pueda sintetizarlo sin aceptar texto del
// cliente. Caduca solo: son respuestas de una conversación, no un archivo.
$hash = substr(hash('sha256', $resultado['texto']), 0, 32);
$directorio = Config::contenido('cache/respuestas');
if (is_dir($directorio) || @mkdir($directorio, 0775, true)) {
    @file_put_contents($directorio . '/' . $hash . '.txt', $resultado['texto'], LOCK_EX);
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode([
    'texto' => $resultado['texto'],
    'acciones' => $resultado['acciones'],
    'fuentes' => $resultado['fuentes'],
    'herramientas' => $resultado['herramientas'],
    'voz' => $hash,
], JSON_UNESCAPED_UNICODE);

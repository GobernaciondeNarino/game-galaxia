<?php
/**
 * ORBIS — Texto de una frase del asistente, sin sintetizar.
 *
 * Devuelve lo que el asistente diría, en texto. Existe por dos motivos:
 *
 *   · Los subtítulos son obligatorios. Una frase que suena y no se escribe deja
 *     fuera a quien no puede oírla, así que el cliente necesita el texto aunque
 *     el audio lo genere otro.
 *   · No todos los despliegues tienen clave de ElevenLabs. Sin ella la
 *     narración recurre a la voz del navegador, y para hablar con esa voz hace
 *     falta el texto AQUÍ, en el navegador. Sin este endpoint, quien no paga
 *     una API de voz se quedaba sin asistente personalizado.
 *
 * No sintetiza nada, no gasta cuota, no necesita credenciales y no toca la
 * caché de audio. Es una consulta de solo lectura al mismo catálogo de frases
 * que usa api/tts.php, con la misma validación del nombre.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/Respuesta.php';
require_once __DIR__ . '/../lib/Asistente.php';
require_once __DIR__ . '/../lib/Catalogo.php';

header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    Respuesta::error(405, 'metodo_no_permitido', 'Este endpoint solo acepta GET.');
}

$fraseId = isset($_GET['frase']) ? (string) $_GET['frase'] : '';
if (preg_match('/^[a-z-]{1,32}$/', $fraseId) !== 1) {
    Respuesta::error(400, 'frase_invalida', 'El identificador de frase no tiene un formato válido.');
}

$variante = isset($_GET['variante']) ? (int) $_GET['variante'] : 0;
$nombre = Asistente::limpiarNombre(isset($_GET['nombre']) ? (string) $_GET['nombre'] : null);

// Igual que en tts.php: el cliente dice de qué cuerpo habla y el servidor mira
// de qué tipo es. Así el texto que se lee en el subtítulo es exactamente el
// mismo que se sintetiza, que es lo que hace que no se descuadren.
$tipo = null;
$idCuerpo = isset($_GET['cuerpo']) ? (string) $_GET['cuerpo'] : '';
if ($idCuerpo !== '' && preg_match('/^[a-z0-9-]{1,40}$/', $idCuerpo) === 1) {
    $cuerpo = Catalogo::cuerpo($idCuerpo);
    $tipo = isset($cuerpo['tipo']) ? (string) $cuerpo['tipo'] : null;
}

$texto = Asistente::frase($fraseId, $nombre, $variante, $tipo);
if ($texto === null) {
    // Que no haya versión aplicable no es un error del cliente: «presentacion»
    // sin nombre no existe a propósito. Se responde 204 y el cliente se calla,
    // que es exactamente lo que debe hacer.
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
// El texto no cambia salvo que se edite data/asistente.json, así que puede
// cachearse un rato en el navegador sin más consecuencias.
header('Cache-Control: public, max-age=600');
echo json_encode(['texto' => $texto], JSON_UNESCAPED_UNICODE);

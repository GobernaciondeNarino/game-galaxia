<?php
/**
 * ORBIS — Respuesta a una pregunta sobre un cuerpo, en texto.
 *
 * El cliente entiende la pregunta y manda DOS identificadores: qué cuerpo y qué
 * atributo. La frase la compone el servidor a partir del catálogo, igual que
 * las narraciones y las frases del asistente, y por el mismo motivo: aquí nunca
 * se sintetiza ni se devuelve texto que venga del navegador.
 *
 * Devuelve también la fuente, porque una cifra sin procedencia no vale nada en
 * este proyecto, y una marca de si el dato falta, para que la interfaz pueda
 * mostrar SIN DATOS en lugar de disimularlo.
 *
 * No necesita credenciales ni gasta cuota: es una consulta al catálogo.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/Respuesta.php';
require_once __DIR__ . '/../lib/Respuestas.php';

header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    Respuesta::error(405, 'metodo_no_permitido', 'Este endpoint solo acepta GET.');
}

$bodyId = isset($_GET['bodyId']) ? (string) $_GET['bodyId'] : '';
if (preg_match('/^[a-z0-9-]{1,40}$/', $bodyId) !== 1) {
    Respuesta::error(400, 'id_invalido', 'El identificador del cuerpo no tiene un formato válido.');
}

$atributo = isset($_GET['atributo']) ? (string) $_GET['atributo'] : '';
if (preg_match('/^[a-z]{1,24}$/', $atributo) !== 1) {
    Respuesta::error(400, 'atributo_invalido', 'El atributo no tiene un formato válido.');
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

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');
echo json_encode($resultado, JSON_UNESCAPED_UNICODE);

<?php
/**
 * ORBIS — Qué lluvia de meteoros está activa en una fecha.
 *
 * El cliente envía la fecha simulada —dos números— y recibe el texto compuesto
 * por el servidor a partir de data/meteoros.json, con su fuente. Igual que las
 * narraciones, las frases del asistente y las respuestas: el texto lo pone
 * siempre el servidor.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/Respuesta.php';
require_once __DIR__ . '/../lib/Meteoros.php';

header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    Respuesta::error(405, 'metodo_no_permitido', 'Este endpoint solo acepta GET.');
}

$mes = isset($_GET['mes']) ? (int) $_GET['mes'] : 0;
$dia = isset($_GET['dia']) ? (int) $_GET['dia'] : 0;

if ($mes < 1 || $mes > 12 || $dia < 1 || $dia > 31) {
    Respuesta::error(400, 'fecha_invalida', 'La fecha no es válida.');
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600');
echo json_encode(Meteoros::relato($mes, $dia), JSON_UNESCAPED_UNICODE);

<?php
/**
 * ORBIS — Reduce una textura a su nivel ligero.
 *
 * POR QUÉ EXISTE, SI COMMONS YA SIRVE MINIATURAS
 * ─────────────────────────────────────────────
 * Porque no las sirve del tamaño que se le piden. `tools/texturas.mjs` pedía a
 * la API una miniatura de 512 px y la API respondía, literalmente,
 * «thumbwidth: 512» acompañado de una URL que apunta a la de 960: Wikimedia
 * redondea a sus tamaños en caché. El resultado era que los 35 archivos «@512»
 * medían 960 px y pesaban 3,53 MB entre todos —casi lo mismo que los
 * completos—, así que el nivel ligero que existe para que la escena sea
 * navegable de inmediato en una conexión lenta no aligeraba nada.
 *
 * Reducido de verdad a 512 px y recodificado a JPEG de calidad 82, ese mismo
 * conjunto pesa 0,79 MB: cuatro veces y media menos en la carga inicial.
 *
 * POR QUÉ EN PHP
 * ──────────────
 * Porque PHP ya es un requisito del proyecto —es el backend entero— y GD viene
 * con él. La alternativa era añadir una dependencia de Node solo para esto, y
 * la regla 1 del pliego dice que no hay paso de compilación ni npm. Esto se
 * ejecuta SOLO en desarrollo, al regenerar las texturas; el servidor de
 * producción no lo llama nunca.
 *
 *   php tools/reducir-textura.php <origen> <destino> [ancho] [calidad]
 */

declare(strict_types=1);

if (!extension_loaded('gd')) {
    fwrite(STDERR, "gd no está disponible\n");
    exit(2);
}

$origen  = $argv[1] ?? '';
$destino = $argv[2] ?? '';
$ancho   = (int) ($argv[3] ?? 512);
$calidad = (int) ($argv[4] ?? 82);

if ($origen === '' || $destino === '' || !is_readable($origen)) {
    fwrite(STDERR, "uso: php tools/reducir-textura.php <origen> <destino> [ancho] [calidad]\n");
    exit(2);
}

$info = @getimagesize($origen);
if ($info === false) {
    fwrite(STDERR, "no se pudo leer la imagen: $origen\n");
    exit(3);
}

// El formato se decide por el CONTENIDO, no por la extensión. Es lo que hacía
// falta aquí: la textura de Titán se llamaba .jpg y era un PNG, porque el
// nombre lo pone el catálogo y el contenido lo pone la fuente.
switch ($info[2]) {
    case IMAGETYPE_PNG:  $imagen = @imagecreatefrompng($origen); break;
    case IMAGETYPE_JPEG: $imagen = @imagecreatefromjpeg($origen); break;
    case IMAGETYPE_WEBP: $imagen = @imagecreatefromwebp($origen); break;
    default:
        fwrite(STDERR, "formato no admitido en $origen\n");
        exit(3);
}
if ($imagen === false) {
    fwrite(STDERR, "no se pudo decodificar: $origen\n");
    exit(3);
}

[$anchoOriginal, $altoOriginal] = $info;

// Nunca se agranda: si el original ya es más pequeño, se recodifica y ya está.
$anchoFinal = min($ancho, $anchoOriginal);
$altoFinal  = (int) round($altoOriginal * $anchoFinal / $anchoOriginal);

$reducida = imagecreatetruecolor($anchoFinal, $altoFinal);
imagecopyresampled($reducida, $imagen, 0, 0, 0, 0, $anchoFinal, $altoFinal, $anchoOriginal, $altoOriginal);

if (!imagejpeg($reducida, $destino, $calidad)) {
    fwrite(STDERR, "no se pudo escribir: $destino\n");
    exit(4);
}

imagedestroy($imagen);
imagedestroy($reducida);

printf(
    "%dx%d -> %dx%d · %.0f kB -> %.0f kB\n",
    $anchoOriginal,
    $altoOriginal,
    $anchoFinal,
    $altoFinal,
    filesize($origen) / 1024,
    filesize($destino) / 1024
);

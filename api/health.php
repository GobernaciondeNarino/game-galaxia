<?php
/**
 * ORBIS — Diagnóstico de despliegue.
 *
 * Devuelve en JSON si el servidor reúne lo necesario para la narración con
 * ElevenLabs. Lo consulta la pantalla de arranque del frontend y sirve como
 * prueba de humo tras subir el proyecto a Plesk.
 *
 * NUNCA devuelve la clave de API: solo si está configurada o no.
 *
 * Uso:
 *   GET api/health.php          comprobaciones locales (sin salida a Internet)
 *   GET api/health.php?red=1    añade la prueba de conectividad con ElevenLabs
 *
 * Sintaxis compatible con PHP 7.4 a propósito, para que el diagnóstico se
 * pueda ejecutar incluso en un Plesk que aún no haya migrado a 8.1.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const PHP_MINIMO = '8.1.0';
const RAIZ = __DIR__ . '/..';

/** @var array<int,array<string,mixed>> */
$comprobaciones = [];

/**
 * Registra una comprobación.
 *
 * La etiqueta es lo que ve la persona en la pantalla de arranque; la clave es
 * el identificador estable para el código. Nunca se muestran claves internas
 * en la interfaz.
 *
 * @param string $clave      identificador estable, usado por el frontend
 * @param string $etiqueta   nombre legible, en español
 * @param string $resultado  'ok' | 'aviso' | 'error'
 */
function comprobar(string $clave, string $etiqueta, string $resultado, string $nota): void
{
    global $comprobaciones;
    $comprobaciones[] = [
        'clave'     => $clave,
        'etiqueta'  => $etiqueta,
        'resultado' => $resultado,
        'nota'      => $nota,
    ];
}

// --------------------------------------------------------------------------
// 1. Versión de PHP
// --------------------------------------------------------------------------
$versionOk = version_compare(PHP_VERSION, PHP_MINIMO, '>=');
comprobar(
    'php', 'versión de PHP',
    $versionOk ? 'ok' : 'aviso',
    $versionOk
        ? 'versión soportada'
        : 'ORBIS se prueba en PHP ' . PHP_MINIMO . '+; esta es ' . PHP_VERSION
);

// --------------------------------------------------------------------------
// 2. Extensiones necesarias
//    curl es imprescindible para hablar con ElevenLabs; json y openssl para
//    firmar el hash de caché y verificar TLS.
// --------------------------------------------------------------------------
foreach (['curl' => true, 'json' => true, 'openssl' => true, 'mbstring' => false] as $ext => $critica) {
    $presente = extension_loaded($ext);
    comprobar(
        'ext_' . $ext,
        'extensión ' . $ext,
        $presente ? 'ok' : ($critica ? 'error' : 'aviso'),
        $presente ? 'disponible' : 'no cargada'
    );
}

// --------------------------------------------------------------------------
// 3. Escritura en la caché de audio
//    Sin esto cada visita regeneraría el MP3 y la factura de ElevenLabs se
//    dispararía: es un fallo crítico, no un detalle.
// --------------------------------------------------------------------------
$dirCache = RAIZ . '/cache/audio';
if (!is_dir($dirCache)) {
    @mkdir($dirCache, 0755, true);
}
if (!is_dir($dirCache)) {
    comprobar('cache_audio', 'escritura en cache/audio', 'error', 'cache/audio no existe y no se pudo crear');
} elseif (!is_writable($dirCache)) {
    comprobar('cache_audio', 'escritura en cache/audio', 'error', 'cache/audio no es escribible (revisa permisos y propietario)');
} else {
    $prueba = $dirCache . '/.escritura-' . bin2hex(random_bytes(4));
    $escrito = @file_put_contents($prueba, 'ok') !== false;
    @unlink($prueba);
    comprobar(
        'cache_audio',
        'escritura en cache/audio',
        $escrito ? 'ok' : 'error',
        $escrito ? 'escribible' : 'escritura denegada'
    );
}

// --------------------------------------------------------------------------
// 4. Clave de ElevenLabs
//    Orden de búsqueda: variable de entorno (recomendado en Plesk) →
//    config/secrets.php. Solo se informa de su presencia.
// --------------------------------------------------------------------------
$clave = getenv('ELEVENLABS_API_KEY');
$origenClave = $clave !== false && $clave !== '' ? 'entorno' : null;

if ($origenClave === null && is_file(RAIZ . '/config/secrets.php')) {
    /** @var array<string,string> $secretos */
    $secretos = require RAIZ . '/config/secrets.php';
    if (is_array($secretos) && !empty($secretos['ELEVENLABS_API_KEY'])) {
        $clave = $secretos['ELEVENLABS_API_KEY'];
        $origenClave = 'config/secrets.php';
    }
}

comprobar(
    'clave_elevenlabs', 'clave de ElevenLabs',
    $origenClave !== null ? 'ok' : 'aviso',
    $origenClave !== null
        ? 'configurada (origen: ' . $origenClave . ')'
        : 'ausente — la narración usará la voz del navegador'
);

// --------------------------------------------------------------------------
// 5. config/secrets.php no debe ser accesible por HTTP
// --------------------------------------------------------------------------
comprobar(
    'config_protegido', 'protección de config/',
    is_file(RAIZ . '/config/.htaccess') ? 'ok' : 'error',
    is_file(RAIZ . '/config/.htaccess')
        ? 'config/.htaccess presente'
        : 'FALTA config/.htaccess: las claves quedarían expuestas'
);

// --------------------------------------------------------------------------
// 6. Datos maestros
// --------------------------------------------------------------------------
$rutaDatos = RAIZ . '/data/sistema-solar.json';
if (!is_readable($rutaDatos)) {
    comprobar('datos', 'catálogo de datos', 'error', 'data/sistema-solar.json no legible');
} else {
    $datos = json_decode((string) file_get_contents($rutaDatos), true);
    if (!is_array($datos) || !isset($datos['cuerpos'])) {
        comprobar('datos', 'catálogo de datos', 'error', 'JSON inválido o sin la clave "cuerpos"');
    } else {
        $total = count($datos['cuerpos']);
        comprobar(
            'datos',
            'catálogo de datos',
            $total > 0 ? 'ok' : 'aviso',
            $total > 0 ? $total . ' cuerpos catalogados' : 'catálogo vacío (se completa en la fase 2)'
        );
    }
}

// --------------------------------------------------------------------------
// 7. Copias locales de las dependencias del frontend
// --------------------------------------------------------------------------
$vendorThree = RAIZ . '/vendor/three/build/three.module.min.js';
comprobar(
    'vendor_three', 'Three.js en el servidor',
    is_readable($vendorThree) ? 'ok' : 'error',
    is_readable($vendorThree) ? 'Three.js vendorizado' : 'falta vendor/three — ¿subiste la carpeta completa?'
);

$modeloManos = RAIZ . '/assets/models/hand_landmarker.task';
comprobar(
    'modelo_manos', 'modelo de detección de manos',
    is_readable($modeloManos) ? 'ok' : 'aviso',
    is_readable($modeloManos)
        ? 'hand_landmarker.task presente'
        : 'ausente — el control por gestos quedará desactivado'
);

// --------------------------------------------------------------------------
// 8. Conectividad con ElevenLabs (solo con ?red=1)
//    Se hace bajo demanda para no gastar una salida a Internet en cada carga.
// --------------------------------------------------------------------------
if (isset($_GET['red']) && $_GET['red'] === '1') {
    if (!extension_loaded('curl')) {
        comprobar('red_elevenlabs', 'conexión con ElevenLabs', 'error', 'curl no está disponible');
    } else {
        $ch = curl_init('https://api.elevenlabs.io/v1/models');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_SSL_VERIFYPEER => true,   // Verificación TLS obligatoria.
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER     => $clave ? ['xi-api-key: ' . $clave] : [],
        ]);
        curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $errorCurl = curl_error($ch);
        curl_close($ch);

        if ($codigo === 200) {
            comprobar('red_elevenlabs', 'conexión con ElevenLabs', 'ok', 'API alcanzable y clave válida');
        } elseif ($codigo === 401) {
            comprobar('red_elevenlabs', 'conexión con ElevenLabs', 'error', 'API alcanzable pero la clave es inválida');
        } elseif ($codigo > 0) {
            comprobar('red_elevenlabs', 'conexión con ElevenLabs', 'aviso', 'API alcanzable, respuesta HTTP ' . $codigo);
        } else {
            // No se expone el mensaje crudo de curl para no filtrar rutas internas.
            comprobar(
                'red_elevenlabs',
                'conexión con ElevenLabs',
                'error',
                'sin salida a Internet' . ($errorCurl !== '' ? ' (fallo de conexión)' : '')
            );
        }
    }
}

// --------------------------------------------------------------------------
// Veredicto
// --------------------------------------------------------------------------
$hayError = false;
$hayAviso = false;
foreach ($comprobaciones as $c) {
    if ($c['resultado'] === 'error') {
        $hayError = true;
    } elseif ($c['resultado'] === 'aviso') {
        $hayAviso = true;
    }
}

$estado = $hayError ? 'error' : ($hayAviso ? 'aviso' : 'ok');
http_response_code($hayError ? 503 : 200);

echo json_encode([
    'aplicacion'     => 'ORBIS',
    'version'        => '0.1.0',
    'estado'         => $estado,
    'php'            => ['version' => PHP_VERSION, 'minimo' => PHP_MINIMO],
    'comprobaciones' => $comprobaciones,
    'sugerencia'     => $hayError
        ? 'Revisa docs/DESPLIEGUE-PLESK.md, apartado «Resolución de problemas».'
        : null,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

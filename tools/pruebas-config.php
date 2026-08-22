<?php
/**
 * ORBIS — Coherencia entre lo que el código lee y lo que la plantilla ofrece.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * `config/secrets.example.php` es lo ÚNICO que ve quien despliega. Si el código
 * empieza a leer una variable nueva y la plantilla no la menciona, esa variable
 * es invisible: nadie la va a configurar, y el fallo no se parecerá en nada a
 * su causa.
 *
 * Pasó de verdad. Se añadió el asistente conversacional con `ANTHROPIC_API_KEY`
 * y la plantilla se quedó como estaba: quien desplegara se habría encontrado un
 * 503 sin ninguna pista de qué le faltaba. Lo mismo con
 * `LIMITE_CONVERSACION_HORA` y `LIMITE_TRANSCRIPCIONES_HORA`, dos topes de
 * gasto que existían solo en el código.
 *
 * Y al revés: una clave documentada que ya nadie lee es peor que ninguna, porque
 * quien la rellene creerá haber configurado algo.
 *
 *   php tools/pruebas-config.php
 */

declare(strict_types=1);

$raiz = dirname(__DIR__);
$fallos = 0;

function comprobar(string $nombre, $real, $esperado): void
{
    global $fallos;
    $ok = $real === $esperado;
    if (!$ok) {
        $fallos++;
    }
    printf(
        "  %s %s%s\n",
        $ok ? '✔' : '✘',
        $nombre,
        $ok ? '' : sprintf("\n      esperado: %s\n      obtenido: %s", var_export($esperado, true), var_export($real, true))
    );
}

/** Todos los .php del backend, sin las dependencias de terceros. */
function fuentesDelBackend(string $raiz): array
{
    $encontrados = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($raiz . '/api'));
    foreach ($it as $archivo) {
        $ruta = $archivo->getPathname();
        if (substr($ruta, -4) !== '.php' || strpos($ruta, '/vendor/') !== false) {
            continue;
        }
        $encontrados[] = $ruta;
    }
    sort($encontrados);
    return $encontrados;
}

echo "\n▸ Toda variable que el código lee está en la plantilla\n";

$plantilla = file_get_contents($raiz . '/config/secrets.example.php');
preg_match_all("/^\s*'([A-Z0-9_]+)'\s*=>/m", $plantilla, $m);
$documentadas = array_values(array_unique($m[1]));
sort($documentadas);

$leidas = [];
foreach (fuentesDelBackend($raiz) as $archivo) {
    // Config::obtener('X'…) y Config::entero('X'…) son las dos únicas puertas.
    preg_match_all("/Config::(?:obtener|entero)\(\s*'([A-Z0-9_]+)'/", (string) file_get_contents($archivo), $usos);
    foreach ($usos[1] as $clave) {
        $leidas[$clave] = true;
    }
}
$leidas = array_keys($leidas);
sort($leidas);

printf("     %d leídas por el código · %d documentadas en la plantilla\n", count($leidas), count($documentadas));
comprobar('el código lee alguna variable', count($leidas) > 0, true);
comprobar('ninguna variable del código falta en la plantilla', array_values(array_diff($leidas, $documentadas)), []);
comprobar('ninguna variable de la plantilla es ya inútil', array_values(array_diff($documentadas, $leidas)), []);

echo "\n▸ La plantilla no lleva ninguna credencial rellenada\n";
{
    // Una plantilla con una clave dentro es una clave versionada. Las dos de
    // API tienen que viajar vacías; el resto puede traer su valor por omisión.
    $valores = [];
    preg_match_all("/^\s*'([A-Z0-9_]+)'\s*=>\s*(.+?),\s*$/m", $plantilla, $pares, PREG_SET_ORDER);
    foreach ($pares as $par) {
        $valores[$par[1]] = trim($par[2]);
    }
    foreach (['ELEVENLABS_API_KEY', 'ANTHROPIC_API_KEY'] as $clave) {
        comprobar(sprintf('%s viaja vacía', $clave), $valores[$clave] ?? null, "''");
    }
}

echo "\n▸ La plantilla se puede cargar y devuelve un array\n";
{
    // Un error de sintaxis aquí no rompe nada al desplegar —Config lo ignora en
    // silencio— y por eso mismo se tarda muchísimo en encontrar.
    $cargado = require $raiz . '/config/secrets.example.php';
    comprobar('devuelve un array', is_array($cargado), true);
    comprobar('con todas las claves', count($cargado), count($documentadas));
}

echo "\n▸ El archivo real está protegido por partida doble\n";
{
    $gitignore = (string) file_get_contents($raiz . '/.gitignore');
    comprobar('config/secrets.php está en .gitignore', strpos($gitignore, 'config/secrets.php') !== false, true);

    $htaccess = (string) @file_get_contents($raiz . '/config/.htaccess');
    comprobar('config/ está denegado por Apache', strpos($htaccess, 'Require all denied') !== false, true);

    // El SDK de Anthropic vive bajo api/, que sí se sirve. Sin su propio
    // .htaccess, sus 2.339 archivos quedan accesibles por HTTP.
    $vendor = (string) @file_get_contents($raiz . '/api/vendor/.htaccess');
    comprobar('api/vendor/ también', strpos($vendor, 'Require all denied') !== false, true);

    // cache/ guarda el audio ya pagado, las respuestas del asistente y los
    // contadores por IP. Apache hereda la directiva en los subdirectorios, así
    // que un solo .htaccess arriba los cubre a los cuatro.
    $cache = (string) @file_get_contents($raiz . '/cache/.htaccess');
    comprobar('cache/ está denegado por Apache', strpos($cache, 'Require all denied') !== false, true);
}

echo "\n▸ Los cuatro directorios de caché viajan en el repositorio\n";
{
    // Se versionan vacíos, con su .gitkeep, por la misma razón que el modelo de
    // MediaPipe se versiona entero: que desplegar sea un «git pull» y no una
    // lista de carpetas que hay que acordarse de crear a mano. El olvido más
    // caro es cache/limites: sin contadores, los topes de gasto no se aplican y
    // nadie se entera hasta que llega la factura.
    foreach (['audio', 'limites', 'efemerides', 'respuestas'] as $dir) {
        comprobar(
            sprintf('cache/%s existe y está marcado', $dir),
            is_file($raiz . '/cache/' . $dir . '/.gitkeep'),
            true
        );
    }
}

echo "\n▸ api/health.php informa de cada pieza configurable\n";
{
    // Sin esto, el diagnóstico diría que todo está bien mientras el asistente
    // devuelve 503. Cada clave que se añada arriba tiene que verse aquí.
    $salud = (string) file_get_contents($raiz . '/api/health.php');
    foreach ([
        'clave_elevenlabs', 'voz_elevenlabs', 'clave_anthropic', 'sdk_anthropic',
        'modelo_asistente', 'cache_audio', 'cache_respuestas', 'cache_efemerides',
        'cache_limites', 'config_protegido',
    ] as $clave) {
        comprobar(sprintf('comprueba «%s»', $clave), strpos($salud, "'" . $clave . "'") !== false, true);
    }
}

echo "\n▸ api/health.php NO filtra el valor de ninguna credencial\n";
{
    // Se ejecuta de verdad con unas claves inventadas y se busca el texto de
    // esas claves en la salida. Es la única forma honesta de comprobarlo:
    // leyendo el código a ojo, un `var_dump` de depuración olvidado pasaría
    // desapercibido, y este diagnóstico es público.
    $ruta = $raiz . '/config/secrets.php';
    if (is_file($ruta)) {
        // Nunca se pisa un archivo real: en un servidor, este archivo son LAS
        // claves de producción.
        echo "  · omitida: ya existe un config/secrets.php y no se toca\n";
    } else {
        $centinelas = [
            'ELEVENLABS_API_KEY' => 'CENTINELA-ELEVENLABS-NO-DEBE-SALIR',
            'ANTHROPIC_API_KEY'  => 'CENTINELA-ANTHROPIC-NO-DEBE-SALIR',
            'ELEVENLABS_VOICE_ID' => 'VOZ-VISIBLE-A-PROPOSITO',
        ];
        file_put_contents($ruta, "<?php\nreturn " . var_export($centinelas, true) . ";\n");

        $salida = (string) shell_exec(sprintf('php %s 2>&1', escapeshellarg($raiz . '/api/health.php')));
        unlink($ruta);

        comprobar('la clave de ElevenLabs no aparece', strpos($salida, $centinelas['ELEVENLABS_API_KEY']) === false, true);
        comprobar('la de Anthropic tampoco', strpos($salida, $centinelas['ANTHROPIC_API_KEY']) === false, true);

        // Sí dice que están y de dónde salen: sin eso el diagnóstico no sirve.
        // Se busca «configurada (origen» y no la ruta: en JSON las barras van
        // escapadas («config\/secrets.php») y la comparación literal fallaba.
        comprobar('pero sí dice que están las dos', substr_count($salida, 'configurada (origen'), 2);

        // Y el código de voz SÍ se publica, a propósito: es un identificador
        // público y verlo es lo que resuelve «he cambiado la voz y suena igual».
        comprobar('el código de voz sí se ve', strpos($salida, $centinelas['ELEVENLABS_VOICE_ID']) !== false, true);
    }
}

echo $fallos ? "\n✘ $fallos comprobación(es) fallida(s)\n\n" : "\n✔ Todas las comprobaciones pasan\n\n";
exit($fallos ? 1 : 0);

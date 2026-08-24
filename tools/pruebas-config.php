<?php
/**
 * ORBIS — Coherencia entre lo que el código lee y lo que la plantilla ofrece.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * `wj-config-ejemplo.php` es lo ÚNICO que ve quien despliega. Si el código
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
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($raiz . '/wj-includes'));
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

$plantilla = file_get_contents($raiz . '/wj-config-ejemplo.php');
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
// Hay una que NO pasa por Config, y es a propósito: la clave del panel la lee
// SesionAdmin directamente del entorno y de wj-config.php, saltándose la capa
// del panel. Si pasara por Config, el panel podría cambiarse su propia
// cerradura, y quien entrase una vez con la clave por omisión dejaría fuera al
// administrador. Se declara aquí para que el rastreo no la dé por inútil, y
// para que quede escrito el motivo.
$fueraDeConfig = ['WJ_ADMIN_CLAVE' => 'la lee SesionAdmin, que no consulta el panel a propósito'];
foreach ($fueraDeConfig as $clave => $porque) {
    $leidas[$clave] = true;
}

$leidas = array_keys($leidas);
sort($leidas);

printf("     %d leídas por el código · %d documentadas en la plantilla\n", count($leidas), count($documentadas));
comprobar('el código lee alguna variable', count($leidas) > 0, true);
comprobar('ninguna variable del código falta en la plantilla', array_values(array_diff($leidas, $documentadas)), []);
comprobar('ninguna variable de la plantilla es ya inútil', array_values(array_diff($documentadas, $leidas)), []);

// La clave del panel tiene que seguir SIN pasar por Config: es lo que impide
// que el panel se cambie su propia cerradura.
$config = (string) file_get_contents($raiz . '/wj-includes/lib/SesionAdmin.php');
comprobar(
    'la clave del panel NO se lee con Config::obtener',
    strpos($config, "Config::obtener('WJ_ADMIN_CLAVE')") === false,
    true
);
comprobar(
    'y sí del entorno y de wj-config.php',
    strpos($config, "getenv(self::AJUSTE)") !== false && strpos($config, 'deWjConfig') !== false,
    true
);

echo "\n▸ El valor por omisión que enseña el panel es el que usa el código\n";
{
    // El panel enseña en cada campo vacío cuál es el valor que ORBIS va a usar
    // igualmente: «30 (el que trae ORBIS)». Ese texto sale de
    // Ajustes::CAMPOS[...]['omision'], y el valor de VERDAD está en la llamada
    // a Config de cada endpoint. Son dos sitios, así que se desvían solos: se
    // cambia el tope en api/tts.php y el panel sigue prometiendo el anterior.
    //
    // Aquí se leen las llamadas reales y se contrastan. Un valor por omisión
    // mal anunciado es peor que ninguno: el número está ahí, se lee como un
    // dato y no lo es.
    require_once $raiz . '/wj-includes/lib/Ajustes.php';

    $enElCodigo = [];
    foreach (fuentesDelBackend($raiz) as $archivo) {
        $texto = (string) file_get_contents($archivo);
        // Config::entero('CLAVE', 30)  y  Config::obtener('CLAVE', 'valor')
        preg_match_all("/Config::entero\(\s*'([A-Z0-9_]+)'\s*,\s*(\d+)\s*\)/", $texto, $enteros, PREG_SET_ORDER);
        foreach ($enteros as $u) {
            $enElCodigo[$u[1]] = $u[2];
        }
        preg_match_all("/Config::obtener\(\s*'([A-Z0-9_]+)'\s*,\s*'([^']*)'\s*\)/", $texto, $textos, PREG_SET_ORDER);
        foreach ($textos as $u) {
            if ($u[2] !== '') {
                $enElCodigo[$u[1]] = $u[2];
            }
        }
    }

    $anunciados = 0;
    foreach (Ajustes::CAMPOS as $clave => $campo) {
        if (!isset($campo['omision'])) {
            continue;
        }
        $anunciados++;
        comprobar(
            sprintf('«%s» anuncia lo que el código usa', $clave),
            $campo['omision'],
            $enElCodigo[$clave] ?? '(el código no lo declara en ninguna llamada a Config)'
        );
    }
    comprobar('y hay campos que lo anuncian', $anunciados > 0, true);
}

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
    $cargado = require $raiz . '/wj-config-ejemplo.php';
    comprobar('devuelve un array', is_array($cargado), true);
    comprobar('con todas las claves', count($cargado), count($documentadas));
}

echo "\n▸ El archivo real está protegido por partida doble\n";
{
    $gitignore = (string) file_get_contents($raiz . '/.gitignore');
    comprobar('wj-config.php está en .gitignore', strpos($gitignore, 'wj-config.php') !== false, true);

    $htaccess = (string) @file_get_contents($raiz . '/.htaccess');
    comprobar('wj-config.php está denegado por Apache', strpos($htaccess, 'FilesMatch "^wj-config') !== false, true);

    // Las clases del backend y el SDK de Anthropic viven bajo wj-includes, que
    // sí se sirve: de ahí salen js/, css/, externos/ y los endpoints. Sin su
    // propio .htaccess, los más de dos mil .php del SDK quedan accesibles por
    // HTTP, y enumerarlos revela la versión exacta de cada librería.
    foreach (['lib', 'vendor'] as $privada) {
        $h = (string) @file_get_contents($raiz . '/wj-includes/' . $privada . '/.htaccess');
        comprobar(
            sprintf('wj-includes/%s/ está denegado', $privada),
            strpos($h, 'Require all denied') !== false,
            true
        );
    }

    // Y la regla del .htaccess raíz: la segunda cerradura, por si el hosting no
    // honra los .htaccess de subdirectorio.
    comprobar(
        'y también desde la raíz',
        strpos($htaccess, 'RewriteRule ^wj-includes/(lib|vendor)/') !== false,
        true
    );

    // cache/ guarda el audio ya pagado, las respuestas del asistente y los
    // contadores por IP. Apache hereda la directiva en los subdirectorios, así
    // que un solo .htaccess arriba los cubre a los cuatro.
    $cache = (string) @file_get_contents($raiz . '/wj-content/cache/.htaccess');
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
            is_file($raiz . '/wj-content/cache/' . $dir . '/.gitkeep'),
            true
        );
    }
}

echo "\n▸ api/health.php informa de cada pieza configurable\n";
{
    // Sin esto, el diagnóstico diría que todo está bien mientras el asistente
    // devuelve 503. Cada clave que se añada arriba tiene que verse aquí.
    $salud = (string) file_get_contents($raiz . '/wj-includes/api/health.php');
    foreach ([
        'clave_elevenlabs', 'voz_elevenlabs', 'clave_anthropic', 'sdk_anthropic',
        'modelo_asistente', 'cache_audio', 'cache_respuestas', 'cache_efemerides',
        'cache_limites', 'config_protegido', 'ajustes_panel',
    ] as $clave) {
        comprobar(sprintf('comprueba «%s»', $clave), strpos($salud, "'" . $clave . "'") !== false, true);
    }

    // EL DIAGNÓSTICO ESTUVO MINTIENDO. «config_protegido» daba error cuando
    // wj-config.php NO existía —y decía que faltaba un config/.htaccess que ya
    // no existe, porque config/ desapareció al reorganizar el proyecto—. Con
    // las claves en las variables de entorno de Plesk, que es lo recomendado,
    // una instalación impecable daba estado «error» y health.php respondía 503.
    // El sitio al que se mira cuando algo va mal, diciendo que va mal.
    comprobar(
        'no exige que wj-config.php exista',
        strpos($salud, 'la configuración sale del entorno o del panel') !== false,
        true
    );
    comprobar(
        'y ya no acusa de que falte un config/.htaccess',
        strpos($salud, 'FALTA config/.htaccess') !== false,
        false
    );
    // Lo que sí importa: que si el archivo existe, el .htaccess lo deniegue.
    comprobar(
        'sí comprueba la regla que lo deniega',
        strpos($salud, 'FilesMatch "^wj-config') !== false,
        true
    );
}

echo "\n▸ api/health.php NO filtra el valor de ninguna credencial\n";
{
    // Se ejecuta de verdad con unas claves inventadas y se busca el texto de
    // esas claves en la salida. Es la única forma honesta de comprobarlo:
    // leyendo el código a ojo, un `var_dump` de depuración olvidado pasaría
    // desapercibido, y este diagnóstico es público.
    $ruta = $raiz . '/wj-config.php';
    if (is_file($ruta)) {
        // Nunca se pisa un archivo real: en un servidor, este archivo son LAS
        // claves de producción.
        echo "  · omitida: ya existe un wj-config.php y no se toca\n";
    } else {
        $centinelas = [
            'ELEVENLABS_API_KEY' => 'CENTINELA-ELEVENLABS-NO-DEBE-SALIR',
            'ANTHROPIC_API_KEY'  => 'CENTINELA-ANTHROPIC-NO-DEBE-SALIR',
            'ELEVENLABS_VOICE_ID' => 'VOZ-VISIBLE-A-PROPOSITO',
        ];
        file_put_contents($ruta, "<?php\nreturn " . var_export($centinelas, true) . ";\n");

        $salida = (string) shell_exec(sprintf('php %s 2>&1', escapeshellarg($raiz . '/wj-includes/api/health.php')));
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

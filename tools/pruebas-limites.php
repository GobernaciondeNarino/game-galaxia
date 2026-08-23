<?php
/**
 * ORBIS — Pruebas del limitador de peticiones.
 *
 * POR QUÉ IMPORTA MÁS QUE OTRAS
 * ─────────────────────────────
 * Esto es lo único que separa un día normal de una factura inesperada. Las tres
 * APIs que usa ORBIS —narración, transcripción y conversación— se pagan por uso
 * y el sitio es público: cualquiera entra sin identificarse. Si el limitador
 * falla, no se rompe nada visible; simplemente se gasta dinero, y no se sabe
 * hasta que llega el recibo. Un fallo silencioso y caro es justo el que hay que
 * probar.
 *
 * QUÉ SE COMPRUEBA
 * ────────────────
 *   · Que el cupo por IP corta donde dice.
 *   · Que el techo diario del sitio corta AUNQUE cada visitante vaya sobrado,
 *     que es el agujero que tenía: sesenta conversaciones por IP y hora, sin
 *     ningún límite del conjunto, son seiscientas con diez direcciones.
 *   · Que se distingue quién ha llegado al tope, para no decirle a alguien que
 *     ha preguntado demasiado cuando quien se pasó fue el sitio entero.
 *   · Que la IP no queda escrita en el disco.
 *   · Que la limpieza periódica NO se lleva por delante el contador del día.
 *
 *   php tools/pruebas-limites.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/RateLimiter.php';

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
        $ok ? '' : sprintf(' — esperado %s, obtenido %s', var_export($esperado, true), var_export($real, true))
    );
}

$directorio = dirname(__DIR__) . '/wj-content/cache/limites';

/** Deja el directorio como estaba: estas pruebas escriben contadores de verdad. */
function limpiarTodo(string $directorio): void
{
    foreach (glob($directorio . '/*.json') ?: [] as $f) {
        @unlink($f);
    }
}

// Cada ejecución parte de una IP distinta para no arrastrar la anterior.
$_SERVER['REMOTE_ADDR'] = '203.0.113.' . random_int(1, 254);
limpiarTodo($directorio);

echo "\n▸ El cupo por IP corta donde dice\n";
{
    $limitador = new RateLimiter(3, 3600);
    $resultados = [];
    for ($i = 0; $i < 5; $i++) {
        $resultados[] = $limitador->consumir()['permitido'];
    }
    comprobar('pasan las tres primeras y no la cuarta', $resultados, [true, true, true, false, false]);

    $ultimo = $limitador->consumir();
    comprobar('el motivo es el cupo propio', $ultimo['motivo'], 'por_ip');
    comprobar('dice cuánto falta para el reinicio', $ultimo['esperaSegundos'] > 0, true);
}

echo "\n▸ Otra IP tiene su propio cupo\n";
{
    // Si el contador fuera compartido, el primer visitante dejaría mudo al resto.
    $_SERVER['REMOTE_ADDR'] = '203.0.113.250';
    $otro = new RateLimiter(3, 3600);
    comprobar('empieza de cero', $otro->consumir()['permitido'], true);
}

echo "\n▸ El techo del sitio corta aunque cada visitante vaya sobrado\n";
{
    // ESTE es el agujero que se cerró. Cupo por IP altísimo, techo del sitio de
    // cuatro: a la quinta petición se corta, venga de donde venga.
    limpiarTodo($directorio);
    $permitidas = 0;
    $motivo = null;
    for ($i = 1; $i <= 8; $i++) {
        // Una dirección distinta cada vez: lo que un límite por IP no ve.
        $_SERVER['REMOTE_ADDR'] = '198.51.100.' . $i;
        $limitador = new RateLimiter(1000, 3600, 'pruebas', 4);
        $r = $limitador->consumir();
        if ($r['permitido']) {
            $permitidas++;
        } else {
            $motivo = $r['motivo'];
        }
    }
    comprobar('solo pasan cuatro de ocho', $permitidas, 4);
    comprobar('y el motivo es el techo del sitio', $motivo, 'tope_diario');
}

echo "\n▸ Cada ámbito lleva su propia cuenta\n";
{
    // La narración y la conversación cuestan cosas distintas: gastar el cupo de
    // una no puede dejar sin voz a la otra.
    //
    // Los ámbitos llevan sufijo de prueba a propósito. Con los nombres reales,
    // ejecutar esto dejaba un «tope-narracion.json» con el límite puesto a UNO,
    // y el sitio se quedaba sin narrar hasta el día siguiente. Una prueba no
    // puede apagar lo que prueba.
    $_SERVER['REMOTE_ADDR'] = '198.51.100.77';
    $narracion = new RateLimiter(1000, 3600, 'pruebanarracion', 1);
    comprobar('la primera de narración pasa', $narracion->consumir()['permitido'], true);
    comprobar('la segunda ya no', $narracion->consumir()['permitido'], false);

    $conversacion = new RateLimiter(1000, 3600, 'pruebaconversacion', 1);
    comprobar('la de conversación no se ve afectada', $conversacion->consumir()['permitido'], true);
}

echo "\n▸ Sin techo declarado, solo manda el cupo por IP\n";
{
    // El comportamiento de antes tiene que seguir estando: un despliegue que no
    // configure el techo no se queda con el sitio a medias.
    limpiarTodo($directorio);
    $_SERVER['REMOTE_ADDR'] = '198.51.100.99';
    $sinTecho = new RateLimiter(5, 3600);
    $n = 0;
    for ($i = 0; $i < 5; $i++) {
        if ($sinTecho->consumir()['permitido']) {
            $n++;
        }
    }
    comprobar('pasan las cinco', $n, 5);
}

echo "\n▸ En el disco no queda ninguna dirección IP\n";
{
    // El contador funciona igual con un hash, y así en cache/limites no hay una
    // lista de quién ha entrado.
    limpiarTodo($directorio);
    $_SERVER['REMOTE_ADDR'] = '198.51.100.123';
    (new RateLimiter(5, 3600, 'pruebas', 10))->consumir();

    $nombres = array_map('basename', glob($directorio . '/*.json') ?: []);
    $contenido = '';
    foreach (glob($directorio . '/*.json') ?: [] as $f) {
        $contenido .= (string) file_get_contents($f);
    }
    comprobar('la IP no está en ningún nombre de archivo', strpos(implode(' ', $nombres), '198.51.100.123'), false);
    comprobar('ni dentro de ningún contador', strpos($contenido, '198.51.100.123'), false);
    comprobar('el contador del sitio se llama por su ámbito', in_array('tope-pruebas.json', $nombres, true), true);
}

echo "\n▸ Un ámbito con caracteres raros se descarta, no se usa\n";
{
    // El ámbito acaba siendo parte de un nombre de archivo. Hoy lo fija el
    // código —«narracion», «conversacion», «transcripcion»— y el prefijo
    // «tope-» ya impide por sí solo un «../» al principio, porque deja el
    // segmento en «tope-..», que es un directorio que no existe. Aun así se
    // filtra: es una línea, y la alternativa es confiar en que nadie construya
    // nunca un ámbito a partir de algo que venga de fuera.
    //
    // Lo observable es esto: un ámbito que no encaja se queda en vacío, y sin
    // ámbito no hay techo diario. Prefiere quedarse sin freno a escribir un
    // contador con un nombre que nadie eligió.
    limpiarTodo($directorio);
    $_SERVER['REMOTE_ADDR'] = '198.51.100.5';
    $raro = new RateLimiter(5, 3600, '../../evasion', 1);
    comprobar('la primera pasa', $raro->consumir()['permitido'], true);
    comprobar('y la segunda también: el techo no se aplica', $raro->consumir()['permitido'], true);
    comprobar('no se ha creado ningún contador de techo', glob($directorio . '/tope-*.json'), []);
    comprobar('ni nada fuera del directorio', is_file(dirname(__DIR__) . '/evasion.json'), false);
}

echo "\n▸ La limpieza no se lleva el contador del día\n";
{
    // Se ejecuta con 1 de cada 50 peticiones y borra lo que lleva dos ventanas
    // sin tocarse. Con la ventana de una hora, un «tope-*» con tres horas de
    // tráfico flojo se habría borrado y el techo del día habría vuelto a cero.
    limpiarTodo($directorio);
    $_SERVER['REMOTE_ADDR'] = '198.51.100.6';
    (new RateLimiter(5, 3600, 'pruebas', 10))->consumir();

    $tope = $directorio . '/tope-pruebas.json';
    comprobar('el contador del día existe', is_file($tope), true);

    // Se envejece a mano cinco horas y se fuerzan muchas pasadas de limpieza.
    touch($tope, time() - 5 * 3600);
    for ($i = 0; $i < 400; $i++) {
        $_SERVER['REMOTE_ADDR'] = '198.51.100.' . ($i % 200 + 20);
        (new RateLimiter(5, 3600, 'pruebas', 10000))->consumir();
    }
    comprobar('y sigue ahí tras cientos de limpiezas', is_file($tope), true);
}

limpiarTodo($directorio);

echo $fallos ? "\n✘ $fallos comprobación(es) fallida(s)\n\n" : "\n✔ Todas las comprobaciones pasan\n\n";
exit($fallos ? 1 : 0);

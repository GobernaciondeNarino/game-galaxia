<?php
/**
 * ORBIS — Pruebas del cliente de JPL Horizons.
 *
 * SIN RED, A PROPÓSITO
 * ────────────────────
 * Lo que se comprueba aquí es el PARSEO, no que el JPL esté en pie. Una prueba
 * que sale a internet falla los días que hay corte, tarda un minuto y no dice
 * nada nuevo cuando pasa. Así que trabaja sobre tablas guardadas en
 * tools/fixtures/, capturadas literalmente de la API, y comprueba lo único que
 * puede romperse por nuestra parte: leer mal esas columnas.
 *
 * Y ese riesgo es real. La cabecera de Horizons cambia de largo según el cuerpo
 * —los cuerpos menores traen párrafos de referencias que los planetas no
 * tienen—, por eso el bloque de datos va marcado entre $$SOE y $$EOE. Cualquier
 * intento de contar líneas desde arriba se rompería con Ceres.
 *
 * La comprobación del catálogo contra la API en vivo es otra cosa y vive en
 * tools/verificar-horizons.php, que sí sale a la red y se ejecuta a mano.
 *
 *   php tools/pruebas-horizons.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/Horizons.php';

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
        $ok ? '' : sprintf(' — esperado «%s», obtenido «%s»', var_export($esperado, true), var_export($real, true))
    );
}

$muestras = __DIR__ . '/fixtures';

echo "\n▸ Los códigos de Horizons salen del catálogo, no del cliente\n";
{
    comprobar('Marte es 499', Horizons::codigo('marte'), '499');
    comprobar('Titán es 606', Horizons::codigo('titan'), '606');
    // Los cuerpos menores vienen entrecomillados en el catálogo; si las comillas
    // llegasen a la consulta se duplicarían y Horizons no resolvería el objeto.
    comprobar('Ceres llega sin comillas', Horizons::codigo('ceres'), 'DES=2000001;');
    comprobar('un cuerpo inventado no tiene código', Horizons::codigo('planeta-x'), null);
    comprobar('los 33 del catálogo son consultables', count(Horizons::consultables()), 33);
}

echo "\n▸ Se lee la tabla de un planeta\n";
{
    $tabla = (string) @file_get_contents($muestras . '/horizons-marte.txt');
    comprobar('la muestra existe', $tabla !== '', true);

    $e = Horizons::interpretar($tabla, '2026-08-21');
    comprobar('devuelve algo', is_array($e), true);
    if (is_array($e)) {
        comprobar('ascensión recta', $e['ascensionRecta'], '06 26 02.28');
        comprobar('declinación', $e['declinacion'], '+23 40 24.1');
        comprobar('distancia en ua', round((float) $e['distanciaUA'], 5), 1.9072);
        comprobar('velocidad radial', round((float) $e['velocidadRadialKms'], 3), -8.576);
        comprobar('cita su fuente', strpos((string) $e['fuente'], 'Horizons') !== false, true);

        // La conversión a kilómetros usa la definición exacta de la IAU, no una
        // aproximación: 1 ua = 149 597 870,7 km por convenio, no por medida.
        comprobar(
            'los kilómetros salen de la ua exacta',
            round((float) $e['distanciaKm']),
            round((float) $e['distanciaUA'] * 149597870.7)
        );
    }
}

echo "\n▸ Y la de un cuerpo menor, con su cabecera más larga\n";
{
    // Ceres trae media página de referencias bibliográficas antes de la tabla.
    // Si el parseo contase líneas en vez de buscar $$SOE, aquí se rompería.
    $tabla = (string) @file_get_contents($muestras . '/horizons-ceres.txt');
    comprobar('la muestra existe', $tabla !== '', true);

    $e = Horizons::interpretar($tabla, '2026-08-21');
    comprobar('devuelve algo', is_array($e), true);
    if (is_array($e)) {
        comprobar('trae distancia', is_float($e['distanciaUA']), true);
        // Ceres vive en el cinturón principal: entre dos y cuatro unidades del
        // Sol, así que desde la Tierra nunca puede salir un número disparatado.
        comprobar('la distancia es plausible', $e['distanciaUA'] > 1.0 && $e['distanciaUA'] < 5.0, true);
        comprobar('trae ascensión recta', $e['ascensionRecta'] !== null, true);
    }
}

echo "\n▸ Una tabla rota no se inventa nada\n";
{
    comprobar('texto vacío', Horizons::interpretar('', '2026-08-21'), null);
    comprobar('sin marcas $$SOE/$$EOE', Horizons::interpretar('Mars is nice', '2026-08-21'), null);
    comprobar('marcas al revés', Horizons::interpretar('$$EOE algo $$SOE', '2026-08-21'), null);
    comprobar('bloque vacío', Horizons::interpretar("\$\$SOE\n\$\$EOE", '2026-08-21'), null);
    // Columnas de menos: una tabla pedida con otras QUANTITIES no debe leerse
    // como si tuviera las nuestras, porque las cifras caerían en otro sitio.
    comprobar(
        'columnas insuficientes',
        Horizons::interpretar("\$\$SOE\n 2026-Aug-21 00:00, , , 06 26 02.28,\n\$\$EOE", '2026-08-21'),
        null
    );
    // Y una línea con la distancia ilegible se salta en vez de dar un cero.
    comprobar(
        'distancia no numérica',
        Horizons::interpretar("\$\$SOE\n 2026-Aug-21 00:00, , , 06 26, +23 40, n.a., n.a.,\n\$\$EOE", '2026-08-21'),
        null
    );
}

echo "\n▸ La fecha se valida antes de viajar a la consulta\n";
{
    // Es la única parte de la petición que puede venir del cliente, así que no
    // puede colarse nada que no sea una fecha.
    $metodo = new ReflectionMethod('Horizons', 'fechaValida');
    $metodo->setAccessible(true);
    $hoy = gmdate('Y-m-d');

    comprobar('una fecha válida se respeta', $metodo->invoke(null, '2026-08-21'), '2026-08-21');
    comprobar('null es hoy', $metodo->invoke(null, null), $hoy);
    comprobar('30 de febrero no existe', $metodo->invoke(null, '2026-02-30'), $hoy);
    comprobar('mes 13 tampoco', $metodo->invoke(null, '2026-13-01'), $hoy);
    comprobar('texto suelto', $metodo->invoke(null, 'ayer'), $hoy);
    comprobar('intento de inyección', $metodo->invoke(null, "2026-08-21' OR '1"), $hoy);
    comprobar('formato corto', $metodo->invoke(null, '21/08/2026'), $hoy);
}

echo "\n▸ La Tierra no se consulta contra sí misma\n";
{
    // El centro de coordenadas ES la Tierra: preguntar por ella devolvería una
    // distancia de cero o un error del JPL, y ninguna de las dos cosas es una
    // respuesta. Se corta antes de salir a la red.
    comprobar('devuelve null sin preguntar', Horizons::efemerides('tierra', '2026-08-21'), null);
    comprobar('un cuerpo desconocido también', Horizons::efemerides('planeta-x', '2026-08-21'), null);
}

echo $fallos ? "\n✘ $fallos comprobación(es) fallida(s)\n\n" : "\n✔ Todas las comprobaciones pasan\n\n";
exit($fallos ? 1 : 0);

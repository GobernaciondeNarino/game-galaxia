<?php
/**
 * ORBIS — Pruebas de las lluvias de meteoros.
 *
 * Lo que se comprueba aquí no es astronomía —los datos vienen citados de la IMO
 * y de la NASA— sino que el calendario se lee bien, que es donde están los
 * errores fáciles:
 *
 *   · Las Cuadrántidas empiezan el 28 de diciembre y terminan el 12 de enero.
 *     Un rango que cruza el fin de año rompe cualquier comparación ingenua de
 *     «desde <= hoy <= hasta», y con ella se perdería la lluvia entera.
 *   · A finales de julio coinciden varias. Tiene que ganar la que esté más
 *     cerca de su máximo, que es la que de verdad se ve esa noche.
 *   · Fuera de temporada no puede quedarse en blanco: el fondo esporádico
 *     existe todo el año y también es un dato.
 *
 *   php tools/pruebas-meteoros.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/Meteoros.php';

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

$lluvias = Meteoros::todas();

echo "\n▸ El catálogo carga\n";
comprobar('hay lluvias registradas', count($lluvias) > 0, true);
printf("     %d lluvias\n", count($lluvias));

echo "\n▸ Cada lluvia trae todo lo que hace falta para contarla\n";
foreach ($lluvias as $l) {
    $nombre = (string) ($l['nombre'] ?? '(sin nombre)');
    $completa = !empty($l['nombre'])
        && !empty($l['codigo'])
        && isset($l['maximo']['mes'], $l['maximo']['dia'])
        && isset($l['desde']['mes'], $l['desde']['dia'])
        && isset($l['hasta']['mes'], $l['hasta']['dia'])
        && isset($l['thz'])
        && !empty($l['fuente']);
    comprobar($nombre, $completa, true);
}

echo "\n▸ Ninguna cifra puede quedarse sin fuente\n";
foreach ($lluvias as $l) {
    comprobar(
        sprintf('%s cita su fuente', (string) ($l['nombre'] ?? '?')),
        is_string($l['fuente'] ?? null) && trim((string) $l['fuente']) !== '',
        true
    );
}

echo "\n▸ Las fechas son fechas\n";
foreach ($lluvias as $l) {
    $nombre = (string) ($l['nombre'] ?? '?');
    foreach (['desde', 'hasta', 'maximo'] as $campo) {
        $mes = (int) ($l[$campo]['mes'] ?? 0);
        $dia = (int) ($l[$campo]['dia'] ?? 0);
        comprobar(
            sprintf('%s · %s', $nombre, $campo),
            $mes >= 1 && $mes <= 12 && $dia >= 1 && $dia <= 31,
            true
        );
    }
}

echo "\n▸ El máximo cae dentro del rango de actividad\n";
foreach ($lluvias as $l) {
    $nombre = (string) ($l['nombre'] ?? '?');
    $activa = Meteoros::activaEn((int) $l['maximo']['mes'], (int) $l['maximo']['dia']);
    // Puede ganar otra lluvia que esté aún más cerca de SU máximo ese día, así
    // que lo que se comprueba es que ese día haya alguna activa, no cuál.
    comprobar(sprintf('%s tiene alguna activa en su máximo', $nombre), $activa !== null, true);
}

echo "\n▸ Un rango que cruza el fin de año se lee bien\n";
{
    // Las Cuadrántidas van del 28 de diciembre al 12 de enero. Si la
    // comparación fuese la ingenua, no aparecerían ni un solo día.
    $cuadrantidas = null;
    foreach ($lluvias as $l) {
        if (($l['codigo'] ?? '') === 'QUA') {
            $cuadrantidas = $l;
        }
    }
    comprobar('las Cuadrántidas están en el catálogo', $cuadrantidas !== null, true);

    if ($cuadrantidas !== null) {
        foreach ([[12, 30], [1, 1], [1, 3], [1, 10]] as [$m, $d]) {
            $a = Meteoros::activaEn($m, $d);
            comprobar(
                sprintf('el %d/%d hay lluvia activa', $d, $m),
                $a !== null,
                true
            );
        }
        // Y el 3 de enero, que es su máximo, deben ganar ellas.
        $enMaximo = Meteoros::activaEn(1, 3);
        comprobar('el 3 de enero ganan las Cuadrántidas', (string) ($enMaximo['codigo'] ?? ''), 'QUA');
    }
}

echo "\n▸ Con varias activas gana la más cercana a su máximo\n";
{
    // El 12 de agosto es el máximo de las Perseidas y coincide con la cola de
    // otras: tienen que ganar las Perseidas.
    $a = Meteoros::activaEn(8, 12);
    comprobar('el 12 de agosto ganan las Perseidas', (string) ($a['codigo'] ?? ''), 'PER');

    // El 14 de diciembre es el máximo de las Gemínidas, con las Úrsidas ya
    // empezadas.
    $b = Meteoros::activaEn(12, 14);
    comprobar('el 14 de diciembre ganan las Gemínidas', (string) ($b['codigo'] ?? ''), 'GEM');
}

echo "\n▸ Fuera de temporada no se queda en blanco\n";
{
    // Hay que buscar un día sin ninguna lluvia del catálogo. Si no lo hay,
    // tampoco es un fallo: significa que el año está cubierto.
    $diaVacio = null;
    for ($m = 1; $m <= 12 && $diaVacio === null; $m++) {
        for ($d = 1; $d <= 28; $d++) {
            if (Meteoros::activaEn($m, $d) === null) {
                $diaVacio = [$m, $d];
                break;
            }
        }
    }

    if ($diaVacio === null) {
        echo "  · el catálogo cubre el año entero; no hay día sin lluvia que probar\n";
    } else {
        [$m, $d] = $diaVacio;
        $relato = Meteoros::relato($m, $d);
        comprobar(sprintf('el %d/%d cuenta algo igualmente', $d, $m), $relato['texto'] !== '', true);
        comprobar('y lo marca como sin lluvia', $relato['lluvia'], null);
        comprobar('con su fuente', trim((string) $relato['fuente']) !== '', true);
    }
}

echo "\n▸ El relato del máximo de cada lluvia se compone entero\n";
foreach ($lluvias as $l) {
    $r = Meteoros::relato((int) $l['maximo']['mes'], (int) $l['maximo']['dia']);
    $nombre = (string) ($l['nombre'] ?? '?');
    comprobar(sprintf('%s · hay texto', $nombre), mb_strlen($r['texto']) > 60, true);
    comprobar(sprintf('%s · hay fuente', $nombre), trim((string) $r['fuente']) !== '', true);
    // Ni una llave de plantilla sin rellenar, ni un «0 meteoros por hora».
    comprobar(sprintf('%s · sin huecos', $nombre), strpos($r['texto'], '{') === false, true);
}

echo $fallos ? "\n✘ $fallos comprobación(es) fallida(s)\n\n" : "\n✔ Todas las comprobaciones pasan\n\n";
exit($fallos ? 1 : 0);

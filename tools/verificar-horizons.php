<?php
/**
 * ORBIS — Contrasta la escena contra JPL Horizons, en vivo.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * ORBIS mueve la escena propagando órbitas keplerianas en el navegador a partir
 * de elementos osculadores de una época fija. Eso es rápido y no necesita red,
 * pero se desvía con los años: no modela las perturbaciones que los cuerpos se
 * hacen entre sí. Horizons integra numéricamente el problema de N cuerpos, así
 * que su respuesta es la buena.
 *
 * Esta herramienta pregunta a Horizons dónde está de verdad cada cuerpo hoy y
 * lo compara con la distancia que da el catálogo. No corrige nada: informa. La
 * decisión de regenerar el catálogo o de aceptar la desviación es de quien lo
 * mantiene, no de un script.
 *
 * NO ESTÁ EN LA LISTA DE COMPROBACIONES OBLIGATORIAS, y es deliberado: sale a
 * internet, tarda medio minuto y fallaría los días que el JPL esté de
 * mantenimiento. Una prueba que falla por motivos ajenos al código enseña a
 * ignorar los fallos, que es lo peor que le puede pasar a una suite. El parseo
 * —lo único que podemos romper nosotros— se prueba sin red en
 * tools/pruebas-horizons.php.
 *
 *   php tools/verificar-horizons.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/Horizons.php';
require_once __DIR__ . '/../wj-includes/lib/Catalogo.php';

/**
 * Holgura sobre el rango que permite la órbita.
 *
 * Los elementos son osculadores de una época concreta y la medida es de hoy, así
 * que un roce con el borde del rango es normal y no significa nada. Lo que este
 * contraste busca son cuerpos que caen MUY fuera, que es como se manifiesta un
 * elemento orbital mal transcrito.
 */
const MARGEN = 0.08;

$fecha = gmdate('Y-m-d');
printf("\n▸ Contraste con JPL Horizons — %s\n\n", $fecha);
printf("  %-20s %14s %14s %13s\n", 'cuerpo', 'Horizons (ua)', 'semieje (ua)', 'rango posible');
echo '  ' . str_repeat('─', 62) . "\n";

$revisar = [];
$sinRespuesta = [];
$comparados = 0;

foreach (Horizons::consultables() as $id) {
    if ($id === 'tierra') {
        continue;                      // es el origen de coordenadas
    }

    $cuerpo = Catalogo::cuerpo($id);
    // Solo tiene sentido comparar los que orbitan al Sol. La distancia
    // geocéntrica de una luna la domina la de su planeta, así que contrastarla
    // contra el semieje mayor de la luna alrededor de ese planeta compararía
    // dos cosas que no tienen nada que ver.
    if (($cuerpo['padre'] ?? null) !== 'sol') {
        continue;
    }

    $e = Horizons::efemerides($id, $fecha);
    if ($e === null) {
        $sinRespuesta[] = $id;
        printf("  %-20s %14s\n", $id, 'sin respuesta');
        continue;
    }

    // El catálogo da el semieje mayor respecto al Sol: una constante orbital,
    // no una distancia a la Tierra. La comparación honesta es contra el rango
    // que la órbita permite, y ese rango NO se deduce del semieje solo: hay que
    // meter la excentricidad. Sin ella, este contraste marcaba a Plutón, Eris,
    // Makemake y Haumea como erróneos, y no lo estaban: son transneptunianos
    // muy excéntricos, y Eris pasa de 38 unidades en el perihelio a 97 en el
    // afelio. Comparar contra el semieje era el fallo del contraste, no del
    // catálogo.
    //
    //   perihelio = a(1 - e)      afelio = a(1 + e)
    //
    // y a eso se le suma o resta la unidad astronómica de la órbita terrestre,
    // según dónde caiga la Tierra en el suyo.
    $a = $cuerpo['orbita']['semiejeMayorUA'] ?? null;
    if ($a === null) {
        continue;
    }
    $exc = (float) ($cuerpo['orbita']['excentricidad'] ?? 0.0);
    $perihelio = (float) $a * (1 - $exc);
    $afelio = (float) $a * (1 + $exc);

    $minimo = max(0.0, $perihelio - 1.0);
    $maximo = $afelio + 1.0;
    $medida = (float) $e['distanciaUA'];

    $comparados++;
    $dentro = $medida >= $minimo * (1 - MARGEN) && $medida <= $maximo * (1 + MARGEN);
    if (!$dentro) {
        $revisar[] = $id;
    }

    printf(
        "  %-20s %14.4f %14.4f %13s  %s\n",
        $id,
        $medida,
        (float) $a,
        sprintf('%.1f–%.1f', $minimo, $maximo),
        $dentro ? '✔' : '✘ REVISAR'
    );
}

echo "\n";
printf("  %d cuerpos comparados contra la API.\n", $comparados);

if ($sinRespuesta !== []) {
    printf("  %d sin respuesta (¿sin salida a internet, o el JPL caído?): %s\n",
        count($sinRespuesta), implode(', ', $sinRespuesta));
}

if ($revisar === []) {
    echo "\n✔ Todas las distancias medidas caen dentro de lo que permite su órbita.\n\n";
    exit(0);
}

printf("\n✘ Revisar: %s\n", implode(', ', $revisar));
echo "  Una distancia fuera del rango que permite la órbita significa que los\n";
echo "  elementos orbitales del catálogo no describen a ese cuerpo. Regenera con\n";
echo "  «node tools/datos-jpl.mjs» y vuelve a comparar.\n\n";
exit(1);

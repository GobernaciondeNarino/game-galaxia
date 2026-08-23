<?php
/**
 * ORBIS — Pruebas de las frases del asistente.
 *
 * La parte que de verdad hay que vigilar es la validación del nombre. Es el
 * único texto que llega del navegador y acaba dicho en voz alta por una API de
 * pago, así que estas pruebas son sobre todo una lista de cosas que NO deben
 * colarse: cifras, signos, etiquetas, frases largas disfrazadas de nombre.
 *
 * Está en PHP y no en Node porque la lógica está en PHP: probarla desde otro
 * lenguaje sería probar una reimplementación, no lo que corre en el servidor.
 *
 *   php tools/pruebas-asistente.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/Asistente.php';

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

echo "\n▸ Nombres reales que deben aceptarse\n";
foreach ([
    'Juan' => 'Juan',
    'María José' => 'María José',
    'Ñoño' => 'Ñoño',
    "O'Brien" => "O'Brien",
    'Ana-Lucía' => 'Ana-Lucía',
    'José María Fernández' => 'José María Fernández',
    '  juan  ' => 'juan',                      // se recortan los espacios
    "Ana\tLucía" => 'Ana Lucía',               // y se normaliza el espaciado
] as $entrada => $esperado) {
    comprobar(sprintf('«%s»', $entrada), Asistente::limpiarNombre($entrada), $esperado);
}

echo "\n▸ Lo que NO puede colarse\n";
foreach ([
    'con cifras' => 'Juan123',
    'con etiquetas' => 'Juan <script>alert(1)</script>',
    'con signos' => 'Juan; rm -rf /',
    'con salto de línea' => "Juan\nOtra frase entera",
    'con llaves de plantilla' => 'Juan{nombre}',
    'demasiado largo' => 'Un nombre absurdamente largo que no cabe',
    'demasiadas palabras' => 'a b c d',
    'vacío' => '',
    'solo espacios' => '   ',
    'empieza por espacio significativo' => '-Juan',
] as $caso => $entrada) {
    comprobar($caso, Asistente::limpiarNombre($entrada), null);
}

echo "\n▸ Un nombre nunca puede pasar de los topes declarados\n";
{
    $largo = str_repeat('a', Asistente::MAX_NOMBRE);
    comprobar('justo en el tope se acepta', Asistente::limpiarNombre($largo), $largo);
    comprobar('uno más se rechaza', Asistente::limpiarNombre($largo . 'a'), null);
}

echo "\n▸ El nombre se encaja en la frase, y la frase la pone el servidor\n";
{
    $conNombre = Asistente::frase('bienvenida', 'Juan', 0);
    comprobar('aparece el nombre', str_contains((string) $conNombre, 'Juan'), true);
    comprobar('no queda el hueco sin rellenar', str_contains((string) $conNombre, '{nombre}'), false);

    $sinNombre = Asistente::frase('bienvenida', null, 0);
    comprobar('la versión sin nombre existe', is_string($sinNombre) && $sinNombre !== '', true);
    comprobar('y no lleva hueco', str_contains((string) $sinNombre, '{nombre}'), false);
}

echo "\n▸ Quien no da su nombre también recibe entradilla\n";
{
    // Antes «presentacion» no tenía versiones sinNombre y quien no daba su
    // nombre entraba en cada cuerpo sin que el asistente dijese nada.
    comprobar('presentacion sin nombre devuelve texto', is_string(Asistente::frase('presentacion', null, 0)), true);
    comprobar('presentacion con nombre también', is_string(Asistente::frase('presentacion', 'Ana', 0)), true);

    // Y sin nombre no puede colarse un hueco a medio rellenar.
    foreach (Asistente::identificadores() as $id) {
        for ($v = 0; $v < 12; $v++) {
            $t = (string) Asistente::frase($id, null, $v);
            comprobar(
                sprintf('«%s» v%d sin nombre no deja hueco', $id, $v),
                strpos($t, '{nombre}') === false,
                true
            );
        }
    }
}

echo "\n▸ Ninguna frase da por supuesto el género de quien escucha\n";
{
    // «Bienvenido, María» y «Atento, María» estaban mal para media humanidad.
    // El asistente no sabe el género de quien tiene delante, así que no puede
    // usar ninguna forma que lo presuponga.
    // Se buscan las formas ADJETIVAS, que son las que presuponen el género de
    // quien escucha. El sustantivo no: «te doy la bienvenida» vale para
    // cualquiera, y prohibirlo por parecerse habría sido un falso positivo.
    $prohibidas = [
        '/(^|[.!?¡¿]\s*)bienvenid[oa]\b/iu'       => 'saludo con género',
        '/\b(atent[oa]|preparad[oa]|list[oa])\s*,/iu' => 'adjetivo con género antes del nombre',
        '/\b(encantad[oa])\b/iu'                   => 'participio con género',
    ];
    $encontradas = 0;
    foreach (Asistente::identificadores() as $id) {
        for ($v = 0; $v < 14; $v++) {
            foreach ([null, 'Ana'] as $nombre) {
                $t = (string) Asistente::frase($id, $nombre, $v);
                foreach ($prohibidas as $patron => $motivo) {
                    if (preg_match($patron, $t) === 1) {
                        $encontradas++;
                        comprobar(sprintf('«%s» v%d: %s → «%s»', $id, $v, $motivo, $t), false, true);
                    }
                }
            }
        }
    }
    if ($encontradas === 0) {
        echo "  ✔ ninguna forma con género en ninguna versión\n";
    }
}

echo "\n▸ Entradillas por tipo de cuerpo\n";
{
    // El encuadre es estructural —lo dice el catálogo—, no un dato inventado:
    // una luna no se presenta igual que un cinturón entero.
    $tipos = Asistente::tiposConVersionPropia('presentacion');
    comprobar('«presentacion» declara tipos propios', count($tipos) > 0, true);
    printf("     tipos: %s\n", implode(', ', $tipos));

    foreach ($tipos as $tipo) {
        $conTipo = Asistente::frase('presentacion', 'Ana', 0, $tipo);
        $sinTipo = Asistente::frase('presentacion', 'Ana', 0, null);
        comprobar(sprintf('%s estrena versión propia', $tipo), $conTipo !== $sinTipo, true);

        // Y el total incluye las generales: si las sustituyera, un tipo con tres
        // versiones repetiría cada tres visitas.
        comprobar(
            sprintf('%s suma las generales', $tipo),
            Asistente::cuantasVersiones('presentacion', true, $tipo)
                > Asistente::cuantasVersiones('presentacion', true, null),
            true
        );
    }

    // Un tipo sin versiones propias no rompe nada: cae en las generales.
    comprobar(
        'un tipo desconocido cae en las generales',
        Asistente::frase('presentacion', 'Ana', 0, 'no-existe'),
        Asistente::frase('presentacion', 'Ana', 0, null)
    );
}

echo "\n▸ Rotando se recorren TODAS las versiones antes de repetir\n";
{
    // Esta es la comprobación que habría cazado el fallo de raíz: la entradilla
    // pedía la misma variante que la narración, y como la primera visita usa
    // siempre la narración 0, el asistente decía «Mira esto» en todos y cada
    // uno de los cuerpos. Ocho versiones escritas y una sola sonando.
    foreach (['presentacion', 'regreso'] as $id) {
        foreach ([true, false] as $conNombre) {
            foreach (array_merge([null], Asistente::tiposConVersionPropia($id)) as $tipo) {
                $total = Asistente::cuantasVersiones($id, $conNombre, $tipo);
                $vistas = [];
                for ($v = 0; $v < $total; $v++) {
                    $vistas[] = Asistente::frase($id, $conNombre ? 'Ana' : null, $v, $tipo);
                }
                comprobar(
                    sprintf('%s · %s · %s → %d sin repetir', $id, $conNombre ? 'con nombre' : 'sin nombre', $tipo ?? 'general', $total),
                    count(array_unique($vistas)),
                    $total
                );
                // Y a la vuelta empieza otra vez por la primera.
                comprobar(
                    sprintf('%s · %s · %s vuelve a empezar', $id, $conNombre ? 'con nombre' : 'sin nombre', $tipo ?? 'general'),
                    Asistente::frase($id, $conNombre ? 'Ana' : null, $total, $tipo),
                    $vistas[0]
                );
            }
        }
    }
}

echo "\n▸ Dos cuerpos seguidos no se presentan igual\n";
{
    // Se recorre el catálogo entero como lo haría quien va pulsando cuerpos, con
    // el mismo contador por tipo que lleva el Narrator.
    require_once __DIR__ . '/../wj-includes/lib/Catalogo.php';
    $turnos = [];
    $anterior = null;
    $repetidasSeguidas = 0;
    $dichas = [];
    foreach (Catalogo::identificadores() as $id) {
        $cuerpo = Catalogo::cuerpo($id);
        $tipo = isset($cuerpo['tipo']) ? (string) $cuerpo['tipo'] : null;
        $t = $turnos[$tipo] ?? 0;
        $turnos[$tipo] = $t + 1;
        $frase = Asistente::frase('presentacion', 'Ana', $t, $tipo);
        if ($frase === $anterior) {
            $repetidasSeguidas++;
        }
        $anterior = $frase;
        $dichas[] = $frase;
    }
    comprobar('ninguna se repite dos veces seguidas', $repetidasSeguidas, 0);
    printf("     %d cuerpos, %d entradillas distintas\n", count($dichas), count(array_unique($dichas)));
    // Con 33 cuerpos y ocho generales más las propias de cada tipo, tiene que
    // haber bastante más de una docena de aperturas diferentes.
    comprobar('hay al menos 12 aperturas distintas', count(array_unique($dichas)) >= 12, true);
}

echo "\n▸ La variante se envuelve en lugar de fallar\n";
{
    $id = 'regreso';
    $todas = [];
    foreach ([0, 1, 2, 3, 99, -1, -7] as $v) {
        $t = Asistente::frase($id, null, $v);
        comprobar(sprintf('variante %d devuelve texto', $v), is_string($t) && $t !== '', true);
        $todas[] = $t;
    }
    // Y rotando de verdad: si siempre saliera la misma, no habría variedad.
    comprobar('hay más de una versión distinta', count(array_unique($todas)) > 1, true);
}

echo "\n▸ Identificador desconocido\n";
comprobar('devuelve null', Asistente::frase('no-existe', 'Juan', 0), null);

echo "\n▸ Todas las frases declaradas resuelven\n";
foreach (Asistente::identificadores() as $id) {
    $conNombre = Asistente::frase($id, 'Ana', 0);
    comprobar(sprintf('«%s» con nombre', $id), is_string($conNombre) && $conNombre !== '', true);
}

echo $fallos ? "\n✘ $fallos comprobación(es) fallida(s)\n\n" : "\n✔ Todas las comprobaciones pasan\n\n";
exit($fallos ? 1 : 0);

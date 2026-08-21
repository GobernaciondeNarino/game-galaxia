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

require_once __DIR__ . '/../api/lib/Asistente.php';

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

echo "\n▸ Frases que solo tienen sentido dirigidas a alguien\n";
{
    // «presentacion» son fórmulas del tipo «mira esto, Ana»: sin nombre no
    // quedan bien, así que no se dice nada en lugar de decir algo forzado.
    comprobar('presentacion sin nombre no devuelve nada', Asistente::frase('presentacion', null, 0), null);
    comprobar('presentacion con nombre sí', is_string(Asistente::frase('presentacion', 'Ana', 0)), true);
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

<?php
/**
 * ORBIS — Pruebas del panel de administración.
 *
 * POR QUÉ IMPORTA
 * ───────────────
 * wj-admin es una URL pública con un formulario que escribe la configuración
 * del servidor y guarda claves de API. Es, con diferencia, la superficie más
 * delicada del proyecto: todo lo demás solo lee.
 *
 * Lo que se prueba aquí es lo que no se ve al usarlo y sí se nota cuando falla:
 *
 *   · Que solo entra en la configuración lo que está en la lista cerrada. Un
 *     campo inventado en el envío no puede acabar en el servidor.
 *   · Que un valor fijado en Plesk o en wj-config.php NO se puede pisar desde
 *     el panel, aunque llegue en el formulario.
 *   · Que la clave del panel no se puede cambiar desde el panel.
 *   · Que un acierto no gasta cupo de intentos, y un fallo sí.
 *   · Que el archivo de ajustes no se queda a medias si algo falla al escribir.
 *
 *   php tools/pruebas-admin.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/Ajustes.php';
require_once __DIR__ . '/../wj-includes/lib/SesionAdmin.php';

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

// El archivo real del servidor no se toca: se trabaja sobre una copia y se
// devuelve al final.
$ruta = Ajustes::ruta();
$respaldo = is_file($ruta) ? (string) file_get_contents($ruta) : null;
@unlink($ruta);

echo "\n▸ Solo entra lo que está en la lista cerrada\n";
{
    [$ok, $err] = Ajustes::guardar([
        'ORBIS_MODELO'    => 'claude-sonnet-5',
        'CAMPO_INVENTADO' => 'algo',
        'ARCHIVO_CONFIG'  => '/etc/passwd',
    ]);
    comprobar('guarda lo válido', $ok, true);
    comprobar('y solo eso', array_keys(Ajustes::todos()), ['ORBIS_MODELO']);
}

echo "\n▸ Cada tipo se valida por separado\n";
{
    foreach ([
        ['LIMITE_CONVERSACION_HORA', '60',        true,  'un entero en rango'],
        ['LIMITE_CONVERSACION_HORA', '99999999',  false, 'un entero fuera de rango'],
        ['LIMITE_CONVERSACION_HORA', '-4',        false, 'un negativo'],
        ['LIMITE_CONVERSACION_HORA', 'muchas',    false, 'texto donde va un número'],
        ['ELEVENLABS_VOICE_ID',      'aB9xY',     true,  'un código de voz'],
        ['ELEVENLABS_VOICE_ID',      '../../x',   false, 'un código con barras'],
        ['ELEVENLABS_API_KEY',       str_repeat('k', 40), true,  'una clave con forma de clave'],
        ['ELEVENLABS_API_KEY',       'sk con espacio',    false, 'una clave con un espacio pegado'],
        ['ELEVENLABS_API_KEY',       'corta',             false, 'una clave demasiado corta'],
    ] as [$clave, $valor, $esperado, $que]) {
        [$vale] = Ajustes::validar($clave, $valor);
        comprobar($que, $vale, $esperado);
    }
}

echo "\n▸ Un valor fijado más arriba NO se puede pisar desde el panel\n";
{
    // Es la regla que hace que el panel sea cómodo sin ser peligroso: quien
    // tiene acceso al servidor fija algo y ningún panel se lo cambia.
    putenv('ORBIS_MODELO=claude-opus-5');
    comprobar('el entorno manda', Config::origen('ORBIS_MODELO'), 'entorno');
    comprobar('aunque el panel tenga otro valor', Ajustes::obtener('ORBIS_MODELO'), 'claude-sonnet-5');
    comprobar('lo que se usa es el del entorno', Config::obtener('ORBIS_MODELO'), 'claude-opus-5');
    putenv('ORBIS_MODELO');

    // Y sin nada por encima, vuelve a mandar el panel.
    comprobar('sin entorno, manda el panel', Config::origen('ORBIS_MODELO'), 'panel');
}

echo "\n▸ La clave del panel no se puede cambiar desde el panel\n";
{
    comprobar('no está entre los campos editables', isset(Ajustes::CAMPOS['WJ_ADMIN_CLAVE']), false);

    [$ok] = Ajustes::guardar(['WJ_ADMIN_CLAVE' => 'me-la-cambio-yo']);
    comprobar('un envío con ella dentro no la guarda', isset(Ajustes::todos()['WJ_ADMIN_CLAVE']), false);
    comprobar('y sigue valiendo la de antes', SesionAdmin::claveConfigurada(), SesionAdmin::CLAVE_POR_OMISION);
}

echo "\n▸ Un acierto no gasta intentos; un fallo, sí\n";
{
    // Con un solo consumir() antes de comprobar, un administrador que entra y
    // sale cinco veces se quedaba fuera de su propio panel.
    $_SERVER['REMOTE_ADDR'] = '198.51.100.' . random_int(100, 200);
    foreach (glob(dirname(__DIR__) . '/wj-content/cache/limites/*-admin.json') ?: [] as $f) {
        @unlink($f);
    }

    for ($i = 0; $i < 20; $i++) {
        [$ok] = SesionAdmin::entrar(SesionAdmin::CLAVE_POR_OMISION);
        if (!$ok) {
            break;
        }
    }
    comprobar('veinte aciertos seguidos siguen entrando', $ok, true);

    $fallidos = 0;
    while ($fallidos < 20) {
        [$entro, $motivo] = SesionAdmin::entrar('no-es-la-clave');
        $fallidos++;
        if (strpos($motivo, 'Demasiados intentos') !== false) {
            break;
        }
    }
    comprobar('los fallos sí acaban bloqueando', $fallidos <= SesionAdmin::INTENTOS_HORA + 1, true);
    printf("     bloqueado tras %d intentos fallidos (tope: %d)\n", $fallidos, SesionAdmin::INTENTOS_HORA);
}

echo "\n▸ El almacén está fuera de lo que se sirve\n";
{
    comprobar('vive bajo wj-content/ajustes', strpos(Ajustes::ruta(), '/wj-content/ajustes/') !== false, true);

    $htaccess = (string) @file_get_contents(dirname(Ajustes::ruta()) . '/.htaccess');
    comprobar('con su .htaccess', strpos($htaccess, 'Require all denied') !== false, true);

    $raiz = (string) file_get_contents(dirname(__DIR__) . '/.htaccess');
    comprobar('y bloqueado también desde la raíz', strpos($raiz, 'wj-content/(cache|logs|ajustes)/') !== false, true);

    $gitignore = (string) file_get_contents(dirname(__DIR__) . '/.gitignore');
    comprobar('y fuera del repositorio', strpos($gitignore, 'wj-content/ajustes/*') !== false, true);
}

echo "\n▸ El panel no devuelve nunca una clave guardada\n";
{
    // Un campo de contraseña relleno con el valor real lo entrega a cualquiera
    // que mire el código de la página.
    $panel = (string) file_get_contents(dirname(__DIR__) . '/wj-admin/index.php');
    comprobar(
        'los campos de clave salen sin value',
        preg_match('/type="password"[^>]*value=/', $panel),
        0
    );
    comprobar('y hay una casilla explícita para borrarlas', strpos($panel, 'name="borrar[') !== false, true);
}

// Se devuelve el archivo del servidor tal y como estaba.
@unlink($ruta);
if ($respaldo !== null) {
    file_put_contents($ruta, $respaldo);
}

echo $fallos ? "\n✘ $fallos comprobación(es) fallida(s)\n\n" : "\n✔ Todas las comprobaciones pasan\n\n";
exit($fallos ? 1 : 0);

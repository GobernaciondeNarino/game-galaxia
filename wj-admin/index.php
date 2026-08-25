<?php
/**
 * ORBIS — Panel de administración.  https://tu-dominio/wj-admin/
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  QUÉ ES Y QUÉ NO ES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Es la forma de poner las claves y los topes de gasto sin abrir un archivo por
 * FTP, y lo que se guarde aquí MANDA: por encima de las variables de entorno de
 * Plesk y por encima de wj-config.php.
 *
 * No era así. El orden era el contrario y bastaba con rellenar wj-config.php
 * —el paso 1 de las instrucciones de instalación— para que el panel enseñara
 * esos campos bloqueados y sin poder tocarlos. El motivo por el que cambió está
 * escrito entero en wj-includes/lib/Config.php.
 *
 * A cambio, la regla no puede ser invisible: cada campo dice si hay un valor
 * debajo, dónde está y que no se está usando. Una discrepancia silenciosa entre
 * dos sitios es justo lo que hace perder tardes enteras, y da igual en qué
 * dirección vaya.
 *
 * LO ÚNICO QUE ESTE PANEL NO PUEDE CAMBIAR es su propia clave de entrada
 * (WJ_ADMIN_CLAVE): no está en Ajustes::CAMPOS y SesionAdmin la lee saltándose
 * la capa del panel. Si pudiera cambiarla, quien entrase una vez con la clave
 * por omisión dejaría fuera al administrador de verdad.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  SIN JAVASCRIPT, A PROPÓSITO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Un formulario no lo necesita, y la CSP del proyecto no admite scripts en
 * línea: cualquier JS aquí habría obligado a un archivo aparte y a un hash más
 * que mantener. Todo funciona con HTML y PHP, que además es lo que sigue
 * funcionando cuando algo va mal.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  LAS CLAVES NUNCA VUELVEN AL NAVEGADOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Un campo de contraseña relleno con el valor real lo entrega a cualquiera que
 * mire el código de la página. Aquí los campos de clave salen SIEMPRE vacíos y
 * al lado dice si hay una guardada. Vacío significa «no la toques»; para
 * quitarla hay una casilla explícita.
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/Config.php';
require_once __DIR__ . '/../wj-includes/lib/Ajustes.php';
require_once __DIR__ . '/../wj-includes/lib/SesionAdmin.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

SesionAdmin::iniciar();

$aviso = '';
$tono = 'info';
$erroresCampo = [];
$accion = $_POST['accion'] ?? '';

// ---------------------------------------------------------------------------
// Salir
// ---------------------------------------------------------------------------
if ($accion === 'salir') {
    SesionAdmin::salir();
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------
if ($accion === 'entrar' && !SesionAdmin::dentro()) {
    [$ok, $motivo] = SesionAdmin::entrar((string) ($_POST['clave'] ?? ''));
    if ($ok) {
        // Redirección tras entrar: así el navegador no reenvía la clave al
        // recargar ni la deja en el historial de formularios.
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
        exit;
    }
    $aviso = $motivo;
    $tono = 'error';
}

$dentro = SesionAdmin::dentro();

// Si el panel no puede escribir, hay que decirlo AL ABRIR y no al guardar:
// los campos de clave salen siempre vacíos, así que un fallo al guardar
// obliga a volver a pegarlas todas.
[$sePuedeGuardar, $porQueNo] = $dentro ? Ajustes::escribible() : [true, ''];

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------
if ($accion === 'guardar' && $dentro) {
    if (!SesionAdmin::testigoValido($_POST['testigo'] ?? null)) {
        $aviso = 'La sesión caducó mientras rellenabas el formulario. Vuelve a intentarlo.';
        $tono = 'error';
    } else {
        $entrantes = [];
        foreach (Ajustes::CAMPOS as $clave => $campo) {
            // Ya no se descarta nada por venir fijado más arriba: el panel
            // manda. La lista cerrada de Ajustes::CAMPOS sigue siendo la
            // cerradura —un campo inventado en el envío no entra— y
            // WJ_ADMIN_CLAVE no está en ella, a propósito.
            if ($campo['tipo'] === 'clave') {
                if (!empty($_POST['borrar'][$clave])) {
                    $entrantes[$clave] = '';
                } elseif (($_POST[$clave] ?? '') !== '') {
                    $entrantes[$clave] = (string) $_POST[$clave];
                }
                continue;   // Vacío y sin casilla = no se toca.
            }
            $entrantes[$clave] = (string) ($_POST[$clave] ?? '');
        }

        [$guardado, $erroresCampo] = Ajustes::guardar($entrantes);
        if ($guardado) {
            $aviso = 'Ajustes guardados.';
            $tono = 'ok';
        } else {
            $aviso = isset($erroresCampo['_'])
                ? $erroresCampo['_']
                : 'Hay ' . count($erroresCampo) . ' campo(s) que revisar.';
            $tono = 'error';
        }
    }
}

/** Escapa para HTML. Se usa en TODO lo que se imprime. */
function e(?string $t): string
{
    return htmlspecialchars((string) $t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$GRUPOS = [
    'voz'       => ['titulo' => 'Narración con voz', 'nota' => 'ElevenLabs. Sin clave, ORBIS narra con la voz del navegador.'],
    'asistente' => ['titulo' => 'Asistente conversacional', 'nota' => 'Anthropic. Sin clave, el asistente no conversa; las preguntas del catálogo se siguen respondiendo.'],
    'gasto'     => ['titulo' => 'Topes de gasto', 'nota' => 'Los primeros acotan lo que gasta una persona; los siguientes, lo que gasta el sitio entero en un día. Vacío deja el valor que trae ORBIS; cero desactiva el tope, que no es lo mismo.'],
];
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>ORBIS · Administración</title>
<link rel="icon" href="../wj-content/assets/orbis.svg" type="image/svg+xml">
<link rel="stylesheet" href="../wj-includes/css/fuentes.css">
<link rel="stylesheet" href="../wj-includes/css/nucleo.css">
<link rel="stylesheet" href="panel.css">
</head>
<body class="admin">

<header class="admin__cabecera">
  <p class="admin__marca">ORBIS</p>
  <p class="admin__subtitulo">Administración</p>
  <?php if ($dentro): ?>
    <form method="post" class="admin__salir">
      <button type="submit" name="accion" value="salir" class="boton boton--tenue">Salir</button>
    </form>
  <?php endif; ?>
</header>

<main class="admin__cuerpo">

<?php if ($aviso !== ''): ?>
  <p class="mensaje mensaje--<?= e($tono) ?>" role="<?= $tono === 'error' ? 'alert' : 'status' ?>" tabindex="-1" id="mensaje">
    <?= e($aviso) ?>
  </p>
<?php endif; ?>

<?php if (!$dentro): ?>

  <form method="post" class="tarjeta tarjeta--entrada">
    <h1 class="tarjeta__titulo">Entrar</h1>
    <p class="ayuda">
      La clave se fija en las variables de entorno de Plesk (<code>WJ_ADMIN_CLAVE</code>)
      o en <code>wj-config.php</code>. No se puede cambiar desde aquí.
    </p>
    <label class="campo">
      <span class="campo__etiqueta">Clave de administración</span>
      <input type="password" name="clave" autocomplete="current-password" required autofocus>
    </label>
    <button type="submit" name="accion" value="entrar" class="boton">Entrar</button>
  </form>

<?php else: ?>

  <?php if (SesionAdmin::esPorOmision()): ?>
    <div class="mensaje mensaje--error" role="alert">
      <strong>Estás usando la clave por omisión</strong>, la que viene escrita en el
      repositorio: cualquiera que vea el código la conoce. Ponle una propia en
      Plesk (Dominios → Configuración de PHP → Variables de entorno) con el nombre
      <code>WJ_ADMIN_CLAVE</code>, o en <code>wj-config.php</code>. Mejor aún, guarda ahí
      el resultado de <code>password_hash()</code> en lugar de la clave en claro.
    </div>
  <?php endif; ?>

  <?php if (!$sePuedeGuardar): ?>
    <div class="mensaje mensaje--error" role="alert">
      <strong>Este panel no puede guardar nada</strong>: <?= e($porQueNo) ?>.
      Todo lo que escribas aquí se perderá al pulsar Guardar.
      <br><br>
      Hay que dar permiso de escritura a
      <code><?= e('wj-content/ajustes/') ?></code> para el usuario con el que corre
      PHP. En Plesk, desde el gestor de archivos, o por SSH:
      <br><code>chmod 775 wj-content/ajustes/</code>
      <br><br>
      Pasa cuando el despliegue se hace con un usuario y PHP corre con otro.
      Mientras tanto, la configuración se puede poner igualmente en
      <code>wj-config.php</code> o en las variables de entorno de Plesk, que
      además mandan sobre este panel.
    </div>
  <?php endif; ?>

  <?php $faltan = Ajustes::faltan(); ?>
  <?php if ($faltan !== []): ?>
    <section class="tarjeta">
      <h2 class="tarjeta__titulo">Lo que falta por configurar</h2>
      <p class="ayuda">
        ORBIS funciona sin esto —no se cae ni se queda en blanco— pero cada línea
        es algo que ahora mismo no hace. Los campos están más abajo.
      </p>
      <ul class="faltan">
        <?php foreach ($faltan as $clave => $campo): ?>
          <li class="faltan__una">
            <a class="faltan__ir" href="#<?= e($clave) ?>"><?= e($campo['etiqueta']) ?></a>
            <span class="faltan__consecuencia"><?= e($campo['sinEsto']) ?></span>
          </li>
        <?php endforeach; ?>
      </ul>
    </section>
  <?php endif; ?>

  <?php
    // Cuántos campos tienen algo escrito en otro sitio. Se explica UNA vez
    // aquí, y cada campo lleva solo la línea corta: doce párrafos en ámbar
    // repitiendo lo mismo hacen que un panel correcto parezca una alarma.
    $conOtroValor = 0;
    foreach (Ajustes::CAMPOS as $c => $_) {
        if (array_diff(Config::origenes($c), ['panel']) !== []) {
            $conOtroValor++;
        }
    }
  ?>
  <?php if ($conOtroValor > 0): ?>
    <p class="ayuda ayuda--suelta">
      Lo que guardes aquí <strong>manda</strong> sobre las variables de entorno de Plesk y
      sobre <code>wj-config.php</code>. Hay <?= (int) $conOtroValor ?> campo(s) con un valor
      escrito también en otro sitio; cada uno lo dice debajo, en ámbar. Para volver al de
      abajo, deja el campo vacío y guarda.
    </p>
  <?php endif; ?>

  <p class="ayuda ayuda--suelta">
    Clave de este panel: <strong><?= e(SesionAdmin::origenClave()) ?></strong>.
    Diagnóstico completo del servidor en
    <a href="../wj-includes/api/health.php?red=1">health.php</a>.
  </p>

  <form method="post" class="ajustes">
    <input type="hidden" name="testigo" value="<?= e(SesionAdmin::testigo()) ?>">

    <?php foreach (Ajustes::porGrupo() as $grupo => $campos): ?>
      <section class="tarjeta">
        <h2 class="tarjeta__titulo"><?= e($GRUPOS[$grupo]['titulo']) ?></h2>
        <p class="ayuda"><?= e($GRUPOS[$grupo]['nota']) ?></p>

        <?php foreach ($campos as $clave => $campo):
            $guardado = Ajustes::obtener($clave);
            $idError = 'e-' . strtolower($clave);
            $error = $erroresCampo[$clave] ?? null;

            // TODOS los sitios donde hay un valor, en orden de mando. Nada se
            // bloquea ya, pero lo que queda debajo tiene que verse: si no, se
            // cambia wj-config.php, no pasa nada, y no hay forma de saber por
            // qué. El panel manda, y lo dice.
            $origenes = Config::origenes($clave);
            $debajo = array_values(array_diff($origenes, ['panel']));
            $mandaElPanel = in_array('panel', $origenes, true);

            // Un campo vacío no significa «sin valor»: significa que manda lo
            // de debajo, o el valor que trae ORBIS. Decir cuál, en el texto de
            // ejemplo, evita rellenar los seis topes «por si acaso».
            $ejemplo = $debajo !== []
                ? 'ahora manda el valor de ' . $debajo[0]
                : (isset($campo['omision']) ? $campo['omision'] . ' (el que trae ORBIS)' : '');
        ?>
          <div class="campo">
            <label class="campo__etiqueta" for="<?= e($clave) ?>"><?= e($campo['etiqueta']) ?></label>

            <?php if ($campo['tipo'] === 'clave'): ?>
              <input type="password" id="<?= e($clave) ?>" name="<?= e($clave) ?>"
                     autocomplete="off" placeholder="<?= $guardado !== null ? 'guardada — escribe para cambiarla' : e($ejemplo !== '' ? $ejemplo : 'sin configurar') ?>"
                     <?= $error ? 'aria-invalid="true" aria-describedby="' . e($idError) . '"' : '' ?>>
              <?php if ($guardado !== null): ?>
                <label class="casilla">
                  <input type="checkbox" name="borrar[<?= e($clave) ?>]" value="1">
                  <span>Borrar la guardada aquí<?= $debajo !== [] ? ' y volver a la de ' . e($debajo[0]) : '' ?></span>
                </label>
              <?php endif; ?>

            <?php elseif ($clave === 'ELEVENLABS_VOICE_ID'): ?>
              <?php
                // Lo guardado en el panel es lo que se elige; lo de debajo, lo
                // que se usaría si aquí no hubiera nada. Antes se enseñaba «La
                // que trae ORBIS» aunque wj-config.php tuviera otra puesta, que
                // es mentir sobre lo que está sonando.
                $actual = (string) $guardado;
                if ($debajo === []) {
                    $sinElegir = 'La que trae ORBIS — '
                        . (Ajustes::VOCES[Config::VOZ_PREDETERMINADA] ?? Config::VOZ_PREDETERMINADA);
                } elseif ($actual === '') {
                    // Sin nada elegido aquí, lo efectivo ES lo de debajo, y se
                    // puede nombrar: es lo que está sonando ahora mismo.
                    $efectivo = (string) Config::obtener($clave, Config::VOZ_PREDETERMINADA);
                    $sinElegir = 'Sin elegir aquí — suena ' . (Ajustes::VOCES[$efectivo] ?? $efectivo)
                        . ' (de ' . $debajo[0] . ')';
                } else {
                    // Con algo elegido aquí, lo efectivo es ESTO, no lo de
                    // debajo: nombrar la voz efectiva y atribuirla a
                    // wj-config.php sería decir justo lo contrario de la verdad.
                    $sinElegir = 'Sin elegir aquí — volver a la de ' . $debajo[0];
                }
              ?>
              <select id="<?= e($clave) ?>" name="<?= e($clave) ?>">
                <option value=""><?= e($sinElegir) ?></option>
                <?php foreach (Ajustes::VOCES as $id => $descripcion): ?>
                  <option value="<?= e($id) ?>" <?= $actual === $id ? 'selected' : '' ?>><?= e($descripcion) ?></option>
                <?php endforeach; ?>
                <?php if ($actual !== '' && !isset(Ajustes::VOCES[$actual])): ?>
                  <option value="<?= e($actual) ?>" selected><?= e($actual) ?> — escrita a mano</option>
                <?php endif; ?>
              </select>

              <p class="campo__ayuda">
                Escúchalas antes de decidir. Cada una dice la misma frase, con los mismos
                ajustes que usa la narración de verdad.
              </p>
              <ul class="voces">
                <?php foreach (Ajustes::VOCES as $id => $descripcion): ?>
                  <li class="voces__una">
                    <span class="voces__nombre"><?= e(explode(' — ', $descripcion)[0]) ?></span>
                    <audio controls preload="none" src="probar-voz.php?voz=<?= e($id) ?>"
                           aria-label="Probar la voz <?= e(explode(' — ', $descripcion)[0]) ?>"></audio>
                  </li>
                <?php endforeach; ?>
              </ul>

            <?php elseif ($campo['tipo'] === 'entero'): ?>
              <input type="number" id="<?= e($clave) ?>" name="<?= e($clave) ?>"
                     min="<?= (int) $campo['min'] ?>" max="<?= (int) $campo['max'] ?>" inputmode="numeric"
                     value="<?= e((string) $guardado) ?>"
                     placeholder="<?= e($ejemplo) ?>"
                     <?= $error ? 'aria-invalid="true" aria-describedby="' . e($idError) . '"' : '' ?>>

            <?php else: ?>
              <input type="text" id="<?= e($clave) ?>" name="<?= e($clave) ?>" autocomplete="off"
                     value="<?= e((string) $guardado) ?>"
                     placeholder="<?= e($ejemplo) ?>"
                     <?= $error ? 'aria-invalid="true" aria-describedby="' . e($idError) . '"' : '' ?>>
            <?php endif; ?>

            <?php if ($error): ?>
              <p class="campo__error" id="<?= e($idError) ?>" role="alert"><?= e($error) ?></p>
            <?php endif; ?>

            <?php if ($campo['ayuda'] !== ''): ?>
              <p class="campo__ayuda"><?= e($campo['ayuda']) ?></p>
            <?php endif; ?>

            <?php if ($debajo !== []): ?>
              <p class="campo__ayuda campo__ayuda--debajo">
                <?php if ($mandaElPanel): ?>
                  Manda esto. Debajo hay otro valor en <strong><?= e(implode(' y en ', $debajo)) ?></strong>,
                  sin usar.
                <?php else: ?>
                  Ahora manda el de <strong><?= e($debajo[0]) ?></strong>.
                <?php endif; ?>
              </p>
            <?php endif; ?>
          </div>
        <?php endforeach; ?>
      </section>
    <?php endforeach; ?>

    <div class="ajustes__pie">
      <button type="submit" name="accion" value="guardar" class="boton" <?= $sePuedeGuardar ? '' : 'disabled' ?>>Guardar</button>
      <p class="ayuda">
        Se escribe en <code>wj-content/ajustes/ajustes.json</code>, fuera de lo que se sirve por HTTP.
      </p>
    </div>
  </form>

<?php endif; ?>

</main>

<footer class="admin__pie">
  <p>ORBIS · Interfaz Galáctica del Sistema Solar</p>
  <p>Idea y diseño original: <strong>Jonnathan Bucheli Galindo</strong></p>
  <p>Gobernación de Nariño</p>
</footer>

</body>
</html>

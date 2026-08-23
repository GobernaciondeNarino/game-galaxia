<?php
/**
 * ORBIS — Entrada al panel de wj-admin.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  LA CLAVE NO SE CAMBIA DESDE EL PANEL, Y ESO ES DELIBERADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Se fija en las variables de entorno de Plesk o en wj-config.php, y en ningún
 * otro sitio. Si se pudiera cambiar desde dentro, quien entrase una sola vez
 * con la clave por omisión podría cambiarla y dejar fuera al administrador de
 * verdad. Un panel que puede reescribir su propia cerradura no es una cerradura.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  LA CLAVE POR OMISIÓN EXISTE PARA PODER ENTRAR, NO PARA QUEDARSE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Un panel sin clave configurada sería inaccesible, y quien despliega necesita
 * entrar antes de haber configurado nada. Así que hay una por omisión y el
 * panel avisa —de forma que no se puede ignorar— mientras siga puesta. Está
 * escrita aquí, en el repositorio: cualquiera que vea el código la sabe, y por
 * eso el aviso.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  CONTRA LA FUERZA BRUTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Una contraseña única y sin límite de intentos se adivina sola. Se reutiliza
 * el mismo RateLimiter que frena el gasto de las APIs: cinco intentos por hora
 * y dirección. No es un sistema de cuentas —no lo pide el encargo— pero sí lo
 * mínimo para que una URL pública con un formulario no sea una invitación.
 *
 * La comparación va con hash_equals: comparar cadenas con === tarda distinto
 * según cuántos caracteres coincidan, y eso, medido muchas veces, deja adivinar
 * la clave carácter a carácter.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/RateLimiter.php';

final class SesionAdmin
{
    /** La clave mientras nadie configure otra. El panel avisa si sigue puesta. */
    const CLAVE_POR_OMISION = 'orbis-admin';

    /** Nombre del ajuste, para poder nombrarlo en los mensajes. */
    const AJUSTE = 'WJ_ADMIN_CLAVE';

    /** Intentos FALLIDOS de entrada por dirección y hora. Un acierto no cuenta. */
    const INTENTOS_HORA = 8;

    /** Cuánto dura la sesión sin actividad. */
    const CADUCIDAD = 3600;

    /** Arranca la sesión con las cookies bien puestas. Idempotente. */
    public static function iniciar(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $seguro = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['SERVER_PORT'] ?? '') === '443';

        session_name('orbis_admin');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,   // Fuera del alcance de cualquier JavaScript.
            'secure'   => $seguro,
            'samesite' => 'Strict',
        ]);
        session_start();
    }

    /**
     * La clave configurada. Solo del entorno o de wj-config.php: NO se consulta
     * el panel, que es lo que impide que se cambie desde dentro.
     */
    public static function claveConfigurada(): string
    {
        $entorno = getenv(self::AJUSTE);
        if ($entorno !== false && $entorno !== '') {
            return (string) $entorno;
        }
        $delArchivo = self::deWjConfig();
        return $delArchivo !== null ? $delArchivo : self::CLAVE_POR_OMISION;
    }

    /** ¿Sigue puesta la del repositorio? El panel lo dice en rojo si es que sí. */
    public static function esPorOmision(): bool
    {
        return hash_equals(self::CLAVE_POR_OMISION, self::claveConfigurada());
    }

    /** De dónde sale la clave, para poder decirlo en el panel. */
    public static function origenClave(): string
    {
        $entorno = getenv(self::AJUSTE);
        if ($entorno !== false && $entorno !== '') {
            return 'variable de entorno de Plesk';
        }
        return self::deWjConfig() !== null ? 'wj-config.php' : 'valor por omisión del código';
    }

    /**
     * Comprueba la clave y abre la sesión.
     *
     * @return array{0:bool,1:string} [entró, motivo si no]
     */
    public static function entrar(string $clave): array
    {
        // Se MIRA el cupo antes de comprobar la clave, y solo se GASTA si
        // falla. Así los fallidos se frenan y los aciertos no cuentan: quien
        // entra y sale varias veces en una mañana no se queda fuera de su
        // propio panel, que es justo a quien no hay que bloquear.
        $limitador = new RateLimiter(self::INTENTOS_HORA, 3600, 'admin');
        $cupo = $limitador->disponible();
        if (!$cupo['permitido']) {
            return [false, sprintf(
                'Demasiados intentos. Vuelve a probar en %d minutos.',
                (int) ceil($cupo['esperaSegundos'] / 60)
            )];
        }

        // Se acepta tanto una clave en claro como un hash de password_hash(),
        // que es lo que conviene poner en wj-config.php: así la clave real no
        // queda escrita en el disco del servidor ni en una copia de seguridad.
        $configurada = self::claveConfigurada();
        $vale = strpos($configurada, '$2y$') === 0 || strpos($configurada, '$argon2') === 0
            ? password_verify($clave, $configurada)
            : hash_equals($configurada, $clave);

        if (!$vale) {
            $restante = $limitador->consumir();
            require_once __DIR__ . '/Respuesta.php';
            Respuesta::registrar('aviso', sprintf(
                'Intento fallido de entrada en wj-admin. Quedan %d de %d por hora.',
                $restante['restantes'],
                self::INTENTOS_HORA
            ));
            return [false, sprintf(
                'Clave incorrecta. %s',
                $restante['restantes'] > 0
                    ? sprintf('Te quedan %d intentos.', $restante['restantes'])
                    : 'Se acabaron los intentos de esta hora.'
            )];
        }

        self::iniciar();
        // Identificador nuevo al entrar: si alguien pudo fijar el anterior, con
        // esto deja de servirle.
        session_regenerate_id(true);
        $_SESSION['orbis_admin'] = true;
        $_SESSION['visto'] = time();
        return [true, ''];
    }

    /** ¿Hay sesión abierta y viva? */
    public static function dentro(): bool
    {
        self::iniciar();
        if (empty($_SESSION['orbis_admin'])) {
            return false;
        }
        if (time() - (int) ($_SESSION['visto'] ?? 0) > self::CADUCIDAD) {
            self::salir();
            return false;
        }
        $_SESSION['visto'] = time();
        return true;
    }

    /** Cierra la sesión y borra su cookie. */
    public static function salir(): void
    {
        self::iniciar();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }

    /**
     * Un testigo contra el envío de formularios desde otro sitio.
     *
     * Sin esto, una página cualquiera podría hacer que el navegador de quien
     * tenga la sesión abierta envíe un formulario a wj-admin sin que se entere.
     * `SameSite=Strict` ya lo cubre en los navegadores actuales; esto es la
     * segunda cerradura, y no cuesta nada.
     */
    public static function testigo(): string
    {
        self::iniciar();
        if (empty($_SESSION['testigo'])) {
            $_SESSION['testigo'] = bin2hex(random_bytes(32));
        }
        return (string) $_SESSION['testigo'];
    }

    /** ¿Viene el testigo correcto en el formulario? */
    public static function testigoValido(?string $recibido): bool
    {
        self::iniciar();
        return is_string($recibido)
            && !empty($_SESSION['testigo'])
            && hash_equals((string) $_SESSION['testigo'], $recibido);
    }

    /** Lee la clave directamente de wj-config.php, sin pasar por el panel. */
    private static function deWjConfig(): ?string
    {
        $ruta = Config::raiz() . '/' . Config::ARCHIVO_CONFIG;
        if (!is_file($ruta)) {
            return null;
        }
        $datos = require $ruta;
        if (!is_array($datos) || empty($datos[self::AJUSTE])) {
            return null;
        }
        return (string) $datos[self::AJUSTE];
    }
}

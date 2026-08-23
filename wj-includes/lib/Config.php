<?php
/**
 * Lectura de la configuración del servidor, y mapa de las carpetas.
 *
 * Orden de búsqueda de cada valor:
 *   1. variable de entorno (recomendado en Plesk: la clave no toca el disco),
 *   2. wj-config.php, en la raíz,
 *   3. lo guardado desde el panel de wj-admin.
 *
 * El panel va el ÚLTIMO a propósito: es la capa cómoda, no la que manda. Quien
 * tiene acceso al servidor puede fijar un valor y saber que ningún panel se lo
 * va a cambiar. Y el panel, en vez de dejar escribir algo que luego no tendría
 * efecto, enseña esos valores bloqueados y dice de dónde salen.
 *
 * Aquí viven también las dos rutas base del proyecto. Estaban repartidas en
 * literales por todo el backend —'/data/…', '/cache/…', '/api/vendor/…'— y
 * mover una carpeta obligaba a buscarlos uno por uno. Ahora se mueven cambiando
 * una constante.
 *
 * Este archivo NUNCA devuelve una credencial a la salida HTTP. Los scripts de
 * api/ lo usan para leerlas y usarlas, nada más.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

final class Config
{
    /**
     * Voz de la narración de ORBIS en ElevenLabs.
     *
     * Un identificador de voz es PÚBLICO: sin la clave de API no sirve para
     * nada, así que puede vivir en el repositorio. Se sustituye sin tocar el
     * código con la variable de entorno ELEVENLABS_VOICE_ID o con
     * wj-config.php; el panel de wj-admin dice cuál está ganando.
     */
    const VOZ_PREDETERMINADA = 'lE5ZJB6jGeeuvSNxOvs2';

    /** El motor: código PHP, JS, CSS y librerías de terceros. */
    const INCLUDES = 'wj-includes';

    /** Lo que el sitio TIENE y GENERA: datos, medios, caché y registros. */
    const CONTENIDO = 'wj-content';

    /** El archivo de configuración real, en la raíz. Nunca se versiona. */
    const ARCHIVO_CONFIG = 'wj-config.php';

    /** @var array<string,string>|null */
    private static $secretos = null;

    /**
     * Devuelve un valor de configuración.
     *
     * @param string      $clave        nombre de la variable
     * @param string|null $predeterminado valor si no se encuentra
     */
    public static function obtener(string $clave, ?string $predeterminado = null): ?string
    {
        $entorno = getenv($clave);
        if ($entorno !== false && $entorno !== '') {
            return $entorno;
        }

        self::cargarSecretos();

        if (isset(self::$secretos[$clave]) && self::$secretos[$clave] !== '') {
            return (string) self::$secretos[$clave];
        }

        // Tercera fuente: el panel. Se carga aquí y no arriba para no leer un
        // archivo más en cada petición cuando el valor ya venía del entorno.
        require_once __DIR__ . '/Ajustes.php';
        $delPanel = Ajustes::obtener($clave);
        if ($delPanel !== null) {
            return $delPanel;
        }

        return $predeterminado;
    }

    /**
     * De dónde sale un valor: 'entorno', 'wj-config.php', 'panel' o null.
     *
     * Existe para api/health.php, que tiene que poder decir POR QUÉ está
     * ganando un valor y no otro. Es la respuesta a «he cambiado la voz y
     * suena igual»: casi siempre hay una variable de entorno antigua que gana
     * a lo que se acaba de escribir en wj-config.php.
     *
     * Nunca devuelve el valor, solo su procedencia: así el diagnóstico puede
     * ser público sin filtrar una credencial.
     */
    public static function origen(string $clave): ?string
    {
        $entorno = getenv($clave);
        if ($entorno !== false && $entorno !== '') {
            return 'entorno';
        }

        self::cargarSecretos();
        if (isset(self::$secretos[$clave]) && self::$secretos[$clave] !== '') {
            return 'wj-config.php';
        }

        require_once __DIR__ . '/Ajustes.php';
        if (Ajustes::obtener($clave) !== null) {
            return 'panel';
        }

        return null;
    }

    /** Lee wj-config.php una sola vez por petición. */
    private static function cargarSecretos(): void
    {
        if (self::$secretos !== null) {
            return;
        }
        $ruta = self::raiz() . '/' . self::ARCHIVO_CONFIG;
        $cargado = is_file($ruta) ? require $ruta : [];
        self::$secretos = is_array($cargado) ? $cargado : [];
    }

    /** Igual que obtener() pero para valores numéricos. */
    public static function entero(string $clave, int $predeterminado): int
    {
        $valor = self::obtener($clave);
        return $valor === null ? $predeterminado : (int) $valor;
    }

    /** Ruta absoluta a la raíz del proyecto. */
    public static function raiz(): string
    {
        return dirname(__DIR__, 2);
    }

    /**
     * Ruta dentro de wj-content: datos, medios, caché y registros.
     *
     * @param string $sub por ejemplo 'data/sistema-solar.json' o 'cache/audio'
     */
    public static function contenido(string $sub = ''): string
    {
        $base = self::raiz() . '/' . self::CONTENIDO;
        return $sub === '' ? $base : $base . '/' . ltrim($sub, '/');
    }

    /** Ruta dentro de wj-includes: el motor. */
    public static function includes(string $sub = ''): string
    {
        $base = self::raiz() . '/' . self::INCLUDES;
        return $sub === '' ? $base : $base . '/' . ltrim($sub, '/');
    }
}

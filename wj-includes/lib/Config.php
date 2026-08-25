<?php
/**
 * Lectura de la configuración del servidor, y mapa de las carpetas.
 *
 * Orden de búsqueda de cada valor:
 *   1. lo guardado desde el panel de wj-admin,
 *   2. variable de entorno (en Plesk: la clave no toca el disco),
 *   3. wj-config.php, en la raíz,
 *   4. el valor por omisión del código.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  EL PANEL VA EL PRIMERO, Y ANTES IBA EL ÚLTIMO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El orden era el contrario, con este razonamiento: quien tiene acceso al
 * servidor fija un valor y ningún panel web se lo mueve. Como principio no está
 * mal. En la práctica dejaba el panel inservible.
 *
 * Basta con rellenar wj-config.php —que es literalmente el paso 1 de las
 * instrucciones de instalación— para que el panel enseñe esos campos
 * bloqueados. Y quien administra el sitio no es un intruso: es la misma persona
 * que escribió el archivo, y que ahora quiere cambiar la voz sin abrir un gestor
 * de archivos por FTP. Un panel de administración que no puede administrar no
 * protege de nada; solo obliga a rodearlo.
 *
 * LO QUE SÍ SIGUE PROTEGIDO, porque es lo único que de verdad importa: la clave
 * de entrada al panel (WJ_ADMIN_CLAVE) NO pasa por aquí. La lee SesionAdmin
 * directamente del entorno y de wj-config.php, saltándose esta capa. Un panel
 * que puede reescribir su propia cerradura no es una cerradura, y eso no ha
 * cambiado: quien entrase una vez podría cambiarlo todo menos la forma de
 * volver a entrar.
 *
 * EL PELIGRO NUEVO es el silencio al revés: alguien cambia wj-config.php y no
 * pasa nada, porque el panel tiene un valor por encima. Para eso existe
 * origenes(): el panel enseña, campo por campo, TODOS los sitios donde hay un
 * valor y cuál está ganando, y api/health.php dice lo mismo. La regla no puede
 * ser invisible; si lo fuera volveríamos al «lo cambio y suena igual» de
 * siempre, solo que por el otro lado.
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
     * ANTES ERA UNA VOZ DE DIBUJOS ANIMADOS, Y NADIE LO SABÍA
     * ──────────────────────────────────────────────────────
     * El identificador que llevaba —lE5ZJB6jGeeuvSNxOvs2— corresponde a
     * «Marshal - Toon Character»: personaje de caricatura, INGLÉS, acento
     * americano, hombre joven, etiquetado «excited», con style 0,78 y speed
     * 1,2. Con `eleven_multilingual_v2` habla español, sí, pero con la
     * entonación de un dibujo animado estadounidense a velocidad y pico.
     *
     * No se detectó antes porque nada lo delataba: la síntesis funcionaba, el
     * audio llegaba y la caché lo guardaba. Solo se oía.
     *
     * ESTA
     * ────
     * «Enrique M. Nieto». De las 75 voces de la cuenta, es la ÚNICA en español
     * cuyo caso de uso declarado es `informative_educational`, que es
     * exactamente el registro de ORBIS: divulgación, no dramatización. Su
     * descripción en ElevenLabs dice «Great for Narrations».
     *
     * No la he escuchado —la clave configurada no tiene permiso para
     * sintetizar— así que esto es la elección más defendible con los datos del
     * catálogo, no un veredicto de oído. En wj-admin hay una lista de las otras
     * candidatas en español y un botón para oírlas antes de decidir.
     *
     * Un identificador de voz es PÚBLICO: sin la clave de API no sirve para
     * nada, así que puede vivir en el repositorio. Se sustituye sin tocar el
     * código con la variable de entorno ELEVENLABS_VOICE_ID, con wj-config.php
     * o desde el panel; wj-admin dice cuál está ganando.
     */
    const VOZ_PREDETERMINADA = 'gbTn1bmCvNgk0QEAVyfM';

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
        // El panel, primero. Ajustes guarda el archivo en memoria tras la
        // primera lectura, así que esto es un acceso a disco por petición, no
        // uno por cada consulta.
        require_once __DIR__ . '/Ajustes.php';
        $delPanel = Ajustes::obtener($clave);
        if ($delPanel !== null) {
            return $delPanel;
        }

        $entorno = getenv($clave);
        if ($entorno !== false && $entorno !== '') {
            return $entorno;
        }

        self::cargarSecretos();
        if (isset(self::$secretos[$clave]) && self::$secretos[$clave] !== '') {
            return (string) self::$secretos[$clave];
        }

        return $predeterminado;
    }

    /**
     * De dónde sale el valor que GANA: 'panel', 'entorno', 'wj-config.php', o
     * null si no hay ninguno.
     *
     * Existe para api/health.php, que tiene que poder decir POR QUÉ está
     * ganando un valor y no otro. Es la respuesta a «he cambiado la voz y
     * suena igual».
     *
     * Nunca devuelve el valor, solo su procedencia: así el diagnóstico puede
     * ser público sin filtrar una credencial.
     */
    public static function origen(string $clave): ?string
    {
        $todos = self::origenes($clave);
        return $todos === [] ? null : $todos[0];
    }

    /**
     * TODOS los sitios donde hay un valor para esa clave, en orden de mando: el
     * primero es el que gana y los demás están escritos sin usarse.
     *
     * Sin esto, que el panel mande sería una trampa: se cambiaría wj-config.php,
     * no pasaría nada, y no habría ninguna pista de por qué. El panel usa esta
     * lista para decir, campo por campo, qué hay debajo de lo que se ve.
     *
     * @return list<string> por ejemplo ['panel', 'wj-config.php']
     */
    public static function origenes(string $clave): array
    {
        $encontrados = [];

        require_once __DIR__ . '/Ajustes.php';
        if (Ajustes::obtener($clave) !== null) {
            $encontrados[] = 'panel';
        }

        $entorno = getenv($clave);
        if ($entorno !== false && $entorno !== '') {
            $encontrados[] = 'entorno';
        }

        self::cargarSecretos();
        if (isset(self::$secretos[$clave]) && self::$secretos[$clave] !== '') {
            $encontrados[] = 'wj-config.php';
        }

        return $encontrados;
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

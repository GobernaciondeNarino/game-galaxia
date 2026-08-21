<?php
/**
 * Horizons — dónde está de verdad un cuerpo hoy, según JPL.
 *
 * POR QUÉ ESTA API Y NO OTRA
 * ──────────────────────────
 * De las dos que recomienda el informe, Solar System OpenData exige una clave
 * Bearer. Una clave en el navegador está prohibida por el pliego, y un proxy
 * para esconderla solo tendría sentido si aportara algo que Horizons no da: no
 * es el caso, porque lo que ofrece son propiedades físicas ESTÁTICAS, que es
 * justo lo que el catálogo ya tiene y con mejor procedencia. Horizons, en
 * cambio, no pide clave alguna y da lo único que un catálogo estático no puede
 * dar por definición: la posición de HOY.
 *
 * Y ya es la fuente del proyecto. data/fisica-jpl.json sale de Horizons con
 * tools/datos-jpl.mjs, y cada cifra guarda la línea literal de la que se
 * extrajo. Añadir aquí su API en vivo no mete una segunda versión de la verdad:
 * cierra el círculo con la misma.
 *
 * LO QUE APORTA QUE EL CATÁLOGO NO PUEDE
 * ──────────────────────────────────────
 * ORBIS propaga órbitas keplerianas en el navegador a partir de elementos
 * osculadores de una época fija. Eso vale para mover la escena, pero se desvía
 * con los años porque no modela las perturbaciones mutuas entre cuerpos.
 * Horizons integra numéricamente el problema de N cuerpos en tiempo dinámico
 * baricéntrico, así que su respuesta es la buena. Preguntar «¿a qué distancia
 * está Marte ahora?» tiene una respuesta que cambia cada día y que ningún
 * archivo del repositorio puede contener.
 *
 * EL CLIENTE NO ELIGE QUÉ SE CONSULTA
 * ───────────────────────────────────
 * Llega un identificador del catálogo —«marte»— y este archivo lo traduce al
 * código de Horizons leyéndolo de data/fisica-jpl.json. El parámetro COMMAND
 * jamás se compone con texto del navegador. Es la misma regla que rige tts.php
 * y Asistente.php: el cliente dice de qué se habla, nunca qué se pide.
 *
 * SI NO SE PUEDE PREGUNTAR, SE DICE
 * ─────────────────────────────────
 * Un Plesk sin salida a internet, un corte en el JPL o un tiempo de espera
 * agotado devuelven null, y quien llama lo cuenta. Nunca se rellena el hueco
 * con la posición simulada haciéndola pasar por la medida: son dos cosas
 * distintas y confundirlas sería exactamente lo que el pliego prohíbe.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';

final class Horizons
{
    /** Punto de entrada de la API REST. Público y sin clave. */
    const ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api';

    /**
     * Centro de coordenadas: el geocentro.
     *
     * `500@399` es el centro de la Tierra, NO el sitio donde está quien mira.
     * Se elige a conciencia: las coordenadas del observador darían una altura y
     * un acimut más útiles, pero exigirían pedir la ubicación, y no se piden
     * permisos que no hacen falta. La distancia geocéntrica es la misma cifra
     * para todo el mundo y se entiende sin explicar nada.
     */
    const CENTRO = '500@399';

    /** Lo que se tarda como mucho en preguntar. Pasado eso, se dice que no. */
    const ESPERA_SEGUNDOS = 8;

    /** @var array|null mapa id del catálogo → código de Horizons */
    private static $codigos = null;

    /** Carga los códigos de Horizons del catálogo generado. */
    private static function cargarCodigos(): void
    {
        if (self::$codigos !== null) {
            return;
        }
        self::$codigos = [];

        $ruta = Config::raiz() . '/data/fisica-jpl.json';
        if (!is_readable($ruta)) {
            return;
        }
        $datos = json_decode((string) file_get_contents($ruta), true);
        foreach ($datos['cuerpos'] ?? [] as $id => $cuerpo) {
            if (empty($cuerpo['horizons'])) {
                continue;
            }
            // Los cuerpos menores vienen ya entrecomillados en el catálogo
            // —«'DES=2000001;'»— porque así se escriben en la interfaz web de
            // Horizons. Aquí las comillas las pone la consulta, así que dejarlas
            // las duplicaría y Ceres, Eris, Makemake y Haumea no resolvían.
            self::$codigos[(string) $id] = trim((string) $cuerpo['horizons'], "'");
        }
    }

    /** @return string|null el código de Horizons de un cuerpo del catálogo. */
    public static function codigo(string $idCuerpo): ?string
    {
        self::cargarCodigos();
        return self::$codigos[$idCuerpo] ?? null;
    }

    /** @return string[] los identificadores que se pueden consultar. */
    public static function consultables(): array
    {
        self::cargarCodigos();
        return array_keys(self::$codigos ?? []);
    }

    /**
     * Efemérides de un cuerpo para una fecha.
     *
     * @param string      $idCuerpo identificador del catálogo
     * @param string|null $fecha    AAAA-MM-DD; hoy si se omite
     * @return array|null ['fecha','ascensionRecta','declinacion','distanciaUA',
     *                     'distanciaKm','velocidadRadialKms','fuente'] o null
     */
    public static function efemerides(string $idCuerpo, ?string $fecha = null): ?array
    {
        $codigo = self::codigo($idCuerpo);
        if ($codigo === null) {
            return null;
        }

        $fecha = self::fechaValida($fecha);

        // La Tierra vista desde el centro de la Tierra no significa nada, y
        // Horizons rechaza la consulta. Mejor decirlo aquí que traducir su
        // error a media pantalla de texto.
        if ($codigo === self::CENTRO || $idCuerpo === 'tierra') {
            return null;
        }

        $crudo = self::consultar($codigo, $fecha);
        if ($crudo === null) {
            return null;
        }
        return self::interpretar($crudo, $fecha);
    }

    /** Normaliza la fecha a AAAA-MM-DD; cualquier cosa rara pasa a ser hoy. */
    private static function fechaValida(?string $fecha): string
    {
        if ($fecha !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) === 1) {
            $partes = explode('-', $fecha);
            if (checkdate((int) $partes[1], (int) $partes[2], (int) $partes[0])) {
                return $fecha;
            }
        }
        return gmdate('Y-m-d');
    }

    /**
     * Pide la tabla a Horizons, con caché en disco.
     *
     * La posición de un cuerpo no cambia dentro del mismo día a la escala en
     * que se cuenta aquí, así que una consulta por cuerpo y día basta. Sin la
     * caché, treinta y tres cuerpos por cada visita serían una tromba de
     * peticiones a un servicio público y gratuito, que es la mejor forma de que
     * dejen de dárnoslo.
     */
    private static function consultar(string $codigo, string $fecha): ?string
    {
        $cache = self::rutaCache($codigo, $fecha);
        if ($cache !== null && is_readable($cache)) {
            $guardado = (string) file_get_contents($cache);
            if ($guardado !== '') {
                return $guardado;
            }
        }

        if (!function_exists('curl_init')) {
            return null;
        }

        $manana = gmdate('Y-m-d', strtotime($fecha . ' +1 day'));
        $url = self::ENDPOINT . '?' . http_build_query([
            'format' => 'json',
            'COMMAND' => "'" . $codigo . "'",
            'OBJ_DATA' => "'NO'",
            'MAKE_EPHEM' => "'YES'",
            'EPHEM_TYPE' => "'OBSERVER'",
            'CENTER' => "'" . self::CENTRO . "'",
            'START_TIME' => "'" . $fecha . "'",
            'STOP_TIME' => "'" . $manana . "'",
            'STEP_SIZE' => "'1 d'",
            // 1 = ascensión recta y declinación (ICRF); 20 = distancia y su
            // derivada. Pedir solo lo que se va a usar mantiene la respuesta
            // en unos pocos kilobytes.
            'QUANTITIES' => "'1,20'",
            'CSV_FORMAT' => "'YES'",
        ]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::ESPERA_SEGUNDOS,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT => 'ORBIS/1.0 (+interfaz educativa del Sistema Solar)',
        ]);
        $respuesta = curl_exec($ch);
        $estado = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if (!is_string($respuesta) || $estado !== 200) {
            return null;
        }

        $json = json_decode($respuesta, true);
        $tabla = is_array($json) && isset($json['result']) ? (string) $json['result'] : '';
        if (strpos($tabla, '$$SOE') === false) {
            return null;
        }

        if ($cache !== null) {
            @file_put_contents($cache, $tabla, LOCK_EX);
        }
        return $tabla;
    }

    private static function rutaCache(string $codigo, string $fecha): ?string
    {
        $directorio = Config::raiz() . '/cache/efemerides';
        if (!is_dir($directorio) && !@mkdir($directorio, 0775, true) && !is_dir($directorio)) {
            return null;
        }
        return $directorio . '/' . sha1($codigo . '|' . $fecha) . '.txt';
    }

    /**
     * Saca las cifras del bloque entre $$SOE y $$EOE.
     *
     * Horizons envuelve la tabla entre esas dos marcas precisamente para que se
     * pueda separar de la cabecera sin adivinar cuántas líneas ocupa, que
     * cambia de un cuerpo a otro. Con CSV_FORMAT las columnas son fijas:
     *
     *   fecha, , , ascensión recta, declinación, distancia, velocidad radial,
     *
     * @return array|null
     */
    public static function interpretar(string $tabla, string $fecha): ?array
    {
        $inicio = strpos($tabla, '$$SOE');
        $fin = strpos($tabla, '$$EOE');
        if ($inicio === false || $fin === false || $fin <= $inicio) {
            return null;
        }

        $bloque = substr($tabla, $inicio + 5, $fin - $inicio - 5);
        foreach (explode("\n", $bloque) as $linea) {
            $linea = trim($linea);
            if ($linea === '') {
                continue;
            }
            $campos = array_map('trim', explode(',', $linea));
            if (count($campos) < 7) {
                continue;
            }

            $distanciaUA = self::aNumero($campos[5]);
            if ($distanciaUA === null) {
                continue;
            }

            return [
                'fecha' => $fecha,
                'instante' => $campos[0],
                'ascensionRecta' => $campos[3] !== '' ? $campos[3] : null,
                'declinacion' => $campos[4] !== '' ? $campos[4] : null,
                'distanciaUA' => $distanciaUA,
                // 1 ua = 149 597 870,7 km exactos por definición de la IAU
                // (Resolución B2 de 2012). No es una medida, es una convención.
                'distanciaKm' => $distanciaUA * 149597870.7,
                'velocidadRadialKms' => self::aNumero($campos[6]),
                'centro' => 'geocentro (500@399)',
                'fuente' => 'NASA/JPL Horizons, consultado el ' . $fecha,
            ];
        }
        return null;
    }

    private static function aNumero(string $texto): ?float
    {
        $limpio = trim($texto);
        if ($limpio === '' || !is_numeric($limpio)) {
            return null;
        }
        return (float) $limpio;
    }
}

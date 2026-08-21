<?php
/**
 * Frases del asistente, resueltas EN EL SERVIDOR.
 *
 * Es la hermana de Catalogo: existe por el mismo motivo y con la misma regla.
 * api/tts.php no sintetiza texto que venga del navegador, porque eso lo
 * convertiría en un proxy abierto hacia una API de pago. El cliente elige QUÉ
 * frase con un identificador, y el texto lo pone este archivo.
 *
 * LA ÚNICA EXCEPCIÓN, Y POR QUÉ SE PERMITE
 * ────────────────────────────────────────
 * El hueco {nombre} sí llega del cliente: no hay otra forma de que el asistente
 * llame a alguien por su nombre. Es una excepción acotada a conciencia y no un
 * agujero:
 *
 *   · como mucho 24 caracteres, y solo letras, espacios, apóstrofos y guiones;
 *     ni cifras, ni signos, ni saltos de línea;
 *   · como mucho tres palabras, que es lo que ocupa un nombre compuesto;
 *   · va siempre DENTRO de una frase que escribe el servidor: quien lo envía no
 *     elige la oración, solo a quién va dirigida;
 *   · el limitador por IP y hora sigue aplicándose igual que a todo lo demás.
 *
 * Con eso, lo peor que se puede sintetizar son veinticuatro letras encajadas en
 * una frase ajena. No es un proxy de texto libre, que es lo que había que
 * impedir. Si el nombre no pasa la validación no se rechaza la petición: se usa
 * la versión sin nombre, que siempre existe salvo en las frases que solo tienen
 * sentido dirigidas a alguien.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';

final class Asistente
{
    /** @var array<string,array>|null */
    private static $frases = null;

    /** Tope de caracteres del nombre. Un nombre real no llega ni de lejos. */
    const MAX_NOMBRE = 24;

    /** Y de palabras: «María José Fernández» son tres. */
    const MAX_PALABRAS = 3;

    private static function cargar(): void
    {
        if (self::$frases !== null) {
            return;
        }
        self::$frases = [];

        $ruta = Config::raiz() . '/data/asistente.json';
        if (!is_readable($ruta)) {
            return;
        }
        $datos = json_decode((string) file_get_contents($ruta), true);
        if (is_array($datos) && isset($datos['frases']) && is_array($datos['frases'])) {
            self::$frases = $datos['frases'];
        }
    }

    /**
     * Limpia un nombre propio. Devuelve null si no lo parece.
     *
     * No se trata de adivinar si alguien se llama así de verdad —no es asunto
     * de este archivo—, sino de garantizar que lo que se cuela en la frase es
     * un puñado corto de letras y nada más.
     */
    public static function limpiarNombre(?string $crudo): ?string
    {
        if ($crudo === null) {
            return null;
        }

        // Espacios de cualquier clase, incluidos los no separables, a uno solo.
        $nombre = trim(preg_replace('/\s+/u', ' ', $crudo) ?? '');
        if ($nombre === '' || mb_strlen($nombre) > self::MAX_NOMBRE) {
            return null;
        }

        // Letras Unicode —para que Ñ, tildes y cualquier alfabeto valgan—, más
        // espacio, apóstrofo y guion, que aparecen en nombres reales.
        if (preg_match('/^[\p{L}][\p{L} \x27\x{2019}\-]*$/u', $nombre) !== 1) {
            return null;
        }

        if (count(explode(' ', $nombre)) > self::MAX_PALABRAS) {
            return null;
        }

        return $nombre;
    }

    /**
     * Devuelve el texto de una frase.
     *
     * SOBRE EL TIPO DE CUERPO
     * ───────────────────────
     * Cuando se indica, las versiones propias de ese tipo se ponen DELANTE de
     * las generales y se rota sobre el total. No sustituyen a las generales: si
     * lo hicieran, un tipo con tres versiones repetiría cada tres visitas,
     * mientras que juntando ambas listas hay muchas más y además se alternan
     * las que encuadran («bajamos a una luna») con las que solo abren («mira
     * esto»), que es como habla alguien de verdad.
     *
     * El tipo NO lo elige el cliente. Lo resuelve el servidor a partir del
     * identificador del cuerpo, contra el mismo catálogo de siempre. Es la misma
     * regla de todo este archivo: el cliente dice de qué está hablando, nunca
     * qué se dice.
     *
     * @param string      $id       identificador de data/asistente.json
     * @param string|null $nombre   nombre propio ya validado, o null
     * @param int         $variante cuál de las versiones; se envuelve al rango
     * @param string|null $tipo     tipo del cuerpo que se presenta, si aplica
     * @return string|null null si la frase no existe o no hay versión aplicable
     */
    public static function frase(
        string $id,
        ?string $nombre = null,
        int $variante = 0,
        ?string $tipo = null
    ): ?string {
        self::cargar();
        $entrada = self::$frases[$id] ?? null;
        if (!is_array($entrada)) {
            return null;
        }

        $clave = $nombre === null ? 'sinNombre' : 'conNombre';
        $generales = isset($entrada[$clave]) && is_array($entrada[$clave]) ? $entrada[$clave] : [];

        $propias = [];
        if ($tipo !== null
            && isset($entrada['porTipo'][$tipo][$clave])
            && is_array($entrada['porTipo'][$tipo][$clave])
        ) {
            $propias = $entrada['porTipo'][$tipo][$clave];
        }

        $versiones = array_values(array_merge($propias, $generales));

        // Una frase puede no tener versión aplicable a propósito. En ese caso no
        // se dice nada, que es mejor que decir algo forzado.
        if ($versiones === []) {
            return null;
        }

        $indice = $variante % count($versiones);
        if ($indice < 0) {
            $indice += count($versiones);
        }

        $texto = (string) $versiones[$indice];
        return $nombre === null ? $texto : str_replace('{nombre}', $nombre, $texto);
    }

    /** @return string[] identificadores de frase válidos */
    public static function identificadores(): array
    {
        self::cargar();
        return array_keys(self::$frases ?? []);
    }

    /**
     * Cuántas versiones distintas hay de una frase, contando las del tipo.
     *
     * Lo usan las pruebas para comprobar que rotando se recorren todas sin
     * repetir ninguna antes de tiempo.
     */
    public static function cuantasVersiones(string $id, bool $conNombre, ?string $tipo = null): int
    {
        self::cargar();
        $entrada = self::$frases[$id] ?? null;
        if (!is_array($entrada)) {
            return 0;
        }
        $clave = $conNombre ? 'conNombre' : 'sinNombre';
        $n = is_array($entrada[$clave] ?? null) ? count($entrada[$clave]) : 0;
        if ($tipo !== null && is_array($entrada['porTipo'][$tipo][$clave] ?? null)) {
            $n += count($entrada['porTipo'][$tipo][$clave]);
        }
        return $n;
    }

    /** @return string[] los tipos de cuerpo con entradilla propia para esa frase. */
    public static function tiposConVersionPropia(string $id): array
    {
        self::cargar();
        $porTipo = self::$frases[$id]['porTipo'] ?? null;
        return is_array($porTipo) ? array_keys($porTipo) : [];
    }
}

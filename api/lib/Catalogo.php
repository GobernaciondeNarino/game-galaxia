<?php
/**
 * Acceso al catálogo del Sistema Solar desde el servidor.
 *
 * Es la pieza que impide que api/tts.php sea un proxy abierto hacia una API de
 * pago: el cliente solo envía un identificador de cuerpo, y el TEXTO que se
 * sintetiza lo pone el servidor a partir de su propia copia del catálogo. Aunque
 * alguien enviara un texto arbitrario, no se usaría.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';

final class Catalogo
{
    /** @var array<string,array>|null */
    private static $porId = null;

    /** Carga el catálogo una sola vez por petición. */
    private static function cargar(): void
    {
        if (self::$porId !== null) {
            return;
        }
        self::$porId = [];

        $ruta = Config::raiz() . '/data/sistema-solar.json';
        if (!is_readable($ruta)) {
            return;
        }

        $datos = json_decode((string) file_get_contents($ruta), true);
        if (!is_array($datos) || !isset($datos['cuerpos']) || !is_array($datos['cuerpos'])) {
            return;
        }

        foreach ($datos['cuerpos'] as $cuerpo) {
            if (isset($cuerpo['id'])) {
                self::$porId[(string) $cuerpo['id']] = $cuerpo;
            }
        }
    }

    /** @return array|null la entrada del catálogo, o null si el id no existe */
    public static function cuerpo(string $id): ?array
    {
        self::cargar();
        return self::$porId[$id] ?? null;
    }

    /**
     * Texto que se debe narrar para un cuerpo.
     *
     * Cada cuerpo tiene varias narraciones y el cliente elige cuál con un
     * NÚMERO, nunca con un texto: esa es la razón de ser de esta clase. El
     * número se envuelve con módulo, así que cualquier valor —un 7, un 99, un
     * negativo— cae dentro del rango en lugar de fallar. No hay nada que
     * validar contra un ataque porque no hay forma de salirse.
     *
     * @param int $variante índice de la narración; se envuelve al rango real
     * @return string|null null si el cuerpo no existe o no tiene narración
     */
    public static function narracion(string $id, int $variante = 0): ?string
    {
        $variantes = self::narraciones($id);
        if ($variantes === []) {
            return null;
        }
        $indice = $variante % count($variantes);
        if ($indice < 0) {
            $indice += count($variantes);
        }
        return $variantes[$indice];
    }

    /**
     * Todas las narraciones escritas para un cuerpo, ya limpias y sin vacías.
     *
     * @return string[] lista vacía si el cuerpo no existe o no tiene ninguna
     */
    public static function narraciones(string $id): array
    {
        $cuerpo = self::cuerpo($id);
        if ($cuerpo === null || !isset($cuerpo['narraciones']) || !is_array($cuerpo['narraciones'])) {
            return [];
        }

        $limpias = [];
        foreach ($cuerpo['narraciones'] as $texto) {
            $texto = trim((string) $texto);
            if ($texto !== '') {
                $limpias[] = $texto;
            }
        }
        return $limpias;
    }

    /** @return string[] todos los identificadores válidos */
    public static function identificadores(): array
    {
        self::cargar();
        return array_keys(self::$porId ?? []);
    }
}

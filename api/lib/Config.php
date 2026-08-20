<?php
/**
 * Lectura de la configuración del servidor.
 *
 * Orden de búsqueda de cada valor:
 *   1. variable de entorno (recomendado en Plesk: la clave no toca el disco),
 *   2. config/secrets.php.
 *
 * Este archivo NUNCA devuelve una credencial a la salida HTTP. Los scripts de
 * api/ lo usan para leerlas y usarlas, nada más.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

final class Config
{
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

        if (self::$secretos === null) {
            $ruta = __DIR__ . '/../../config/secrets.php';
            $cargado = is_file($ruta) ? require $ruta : [];
            self::$secretos = is_array($cargado) ? $cargado : [];
        }

        if (isset(self::$secretos[$clave]) && self::$secretos[$clave] !== '') {
            return (string) self::$secretos[$clave];
        }

        return $predeterminado;
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
}

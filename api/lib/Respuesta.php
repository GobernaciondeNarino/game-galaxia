<?php
/**
 * Salida HTTP uniforme para los endpoints de api/.
 *
 * Dos reglas que no se negocian:
 *   · nunca se devuelve la respuesta cruda de un tercero al cliente;
 *   · nunca se devuelve una ruta del servidor, una traza ni un mensaje de curl.
 *
 * El detalle técnico va al registro; al cliente le llega un texto en español
 * que le sirve para saber qué pasa y, si procede, qué hacer.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';

final class Respuesta
{
    /**
     * Devuelve un error en JSON y termina la ejecución.
     *
     * @param int    $codigo   código HTTP
     * @param string $clave    identificador estable para el frontend
     * @param string $mensaje  texto legible, en español, sin datos internos
     * @param string $interno  detalle técnico: va al registro, no a la salida
     */
    public static function error(int $codigo, string $clave, string $mensaje, string $interno = ''): void
    {
        if ($interno !== '') {
            self::registrar('error', $clave . ' — ' . $interno);
        }

        http_response_code($codigo);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(
            ['error' => $clave, 'mensaje' => $mensaje],
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }

    /** Escribe una línea en el registro propio, fuera del alcance HTTP. */
    public static function registrar(string $nivel, string $mensaje): void
    {
        $directorio = Config::raiz() . '/api/logs';
        if (!is_dir($directorio)) {
            @mkdir($directorio, 0755, true);
        }

        $linea = sprintf(
            "[%s] %s %s\n",
            gmdate('Y-m-d H:i:s'),
            strtoupper($nivel),
            // Una sola línea por entrada: un salto de línea en el mensaje
            // rompería cualquier lectura posterior del registro.
            str_replace(["\r", "\n"], ' ', $mensaje)
        );

        @file_put_contents($directorio . '/orbis.log', $linea, FILE_APPEND | LOCK_EX);
    }
}

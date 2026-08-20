<?php
/**
 * Limitador de peticiones por IP.
 *
 * Solo cuenta las generaciones NUEVAS: servir un audio que ya está en caché no
 * cuesta dinero ni salida a Internet, así que no debe consumir cupo. Un límite
 * que penalizara los aciertos de caché castigaría al visitante normal y no
 * frenaría al que intenta abusar.
 *
 * Se apoya en archivos porque el destino es un Plesk compartido: no hay Redis
 * ni memcached, y una tabla en base de datos sería una dependencia nueva para
 * guardar un contador.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';

final class RateLimiter
{
    /** @var string */
    private $directorio;
    /** @var int */
    private $limite;
    /** @var int */
    private $ventanaSegundos;

    public function __construct(int $limite = 30, int $ventanaSegundos = 3600)
    {
        $this->limite = $limite;
        $this->ventanaSegundos = $ventanaSegundos;
        $this->directorio = Config::raiz() . '/cache/limites';
        if (!is_dir($this->directorio)) {
            @mkdir($this->directorio, 0755, true);
        }
    }

    /**
     * Identificador del cliente.
     *
     * Se usa un hash de la IP con una sal derivada de la instalación, no la IP
     * en claro: el contador funciona igual y en el disco no queda una lista de
     * direcciones de visitantes.
     */
    private function identificador(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

        // Detrás del proxy de Plesk la IP real llega en X-Forwarded-For. Se
        // toma solo el primer valor y solo si el proxy es local: la cabecera la
        // puede falsificar cualquiera si se acepta sin más.
        $confiable = in_array($ip, ['127.0.0.1', '::1'], true);
        if ($confiable && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $partes = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            $ip = trim($partes[0]);
        }

        $sal = Config::obtener('ORBIS_SAL_LIMITES', 'orbis-limite-predeterminado');
        return hash('sha256', $ip . '|' . $sal);
    }

    /**
     * Comprueba y consume una unidad de cupo.
     *
     * @return array{permitido:bool, restantes:int, esperaSegundos:int}
     */
    public function consumir(): array
    {
        $archivo = $this->directorio . '/' . $this->identificador() . '.json';
        $ahora = time();

        $manejador = @fopen($archivo, 'c+');
        if ($manejador === false) {
            // Sin poder escribir el contador no se puede limitar. Se deja pasar
            // y se registra: es preferible que la narración funcione a que un
            // permiso mal puesto deje el sitio mudo, pero tiene que verse.
            require_once __DIR__ . '/Respuesta.php';
            Respuesta::registrar('aviso', 'No se pudo abrir el contador de límites: ' . $archivo);
            return ['permitido' => true, 'restantes' => $this->limite, 'esperaSegundos' => 0];
        }

        flock($manejador, LOCK_EX);
        $contenido = stream_get_contents($manejador);
        $datos = json_decode((string) $contenido, true);

        if (!is_array($datos) || !isset($datos['inicio'], $datos['cuenta'])) {
            $datos = ['inicio' => $ahora, 'cuenta' => 0];
        }

        // Ventana deslizante simple: al agotarse, se reinicia.
        if ($ahora - (int) $datos['inicio'] >= $this->ventanaSegundos) {
            $datos = ['inicio' => $ahora, 'cuenta' => 0];
        }

        $permitido = $datos['cuenta'] < $this->limite;
        if ($permitido) {
            $datos['cuenta']++;
        }

        ftruncate($manejador, 0);
        rewind($manejador);
        fwrite($manejador, json_encode($datos));
        fflush($manejador);
        flock($manejador, LOCK_UN);
        fclose($manejador);

        $this->limpiar();

        return [
            'permitido' => $permitido,
            'restantes' => max(0, $this->limite - (int) $datos['cuenta']),
            'esperaSegundos' => max(0, $this->ventanaSegundos - ($ahora - (int) $datos['inicio'])),
        ];
    }

    /**
     * Borra contadores caducados. Se ejecuta con poca probabilidad para no
     * recorrer el directorio en cada petición.
     */
    private function limpiar(): void
    {
        if (random_int(1, 50) !== 1) {
            return;
        }
        $limite = time() - $this->ventanaSegundos * 2;
        foreach (glob($this->directorio . '/*.json') ?: [] as $archivo) {
            if (filemtime($archivo) < $limite) {
                @unlink($archivo);
            }
        }
    }
}

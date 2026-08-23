<?php
/**
 * Caché de audio en disco.
 *
 * ElevenLabs cobra por carácter sintetizado. Sin caché, cada visita a un cuerpo
 * generaría de nuevo su narración y la factura crecería con el número de
 * visitantes en lugar de con el de textos. La caché es obligatoria, no una
 * optimización.
 *
 * El nombre de cada archivo es el hash SHA-256 del texto, la voz y el modelo:
 * cambiar cualquiera de los tres produce un archivo nuevo y el anterior queda
 * huérfano, sin necesidad de invalidar nada a mano.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';

final class Cache
{
    /** @var string */
    private $directorio;

    public function __construct(?string $directorio = null)
    {
        $this->directorio = $directorio ?? (Config::contenido('cache/audio'));
        if (!is_dir($this->directorio)) {
            @mkdir($this->directorio, 0755, true);
        }
    }

    /** Calcula la clave de un audio. */
    public function clave(string $texto, string $voz, string $modelo): string
    {
        return hash('sha256', $texto . '|' . $voz . '|' . $modelo);
    }

    /**
     * Ruta del archivo de una clave.
     *
     * La clave se valida con una expresión regular antes de construir la ruta.
     * Es la barrera contra el recorrido de directorios: aunque la clave siempre
     * se calcula en el servidor, un cambio futuro que la aceptara del cliente
     * no podría escaparse de cache/audio.
     */
    public function ruta(string $clave): string
    {
        if (preg_match('/^[a-f0-9]{64}$/', $clave) !== 1) {
            throw new InvalidArgumentException('Clave de caché con formato inválido.');
        }
        return $this->directorio . '/' . $clave . '.mp3';
    }

    public function existe(string $clave): bool
    {
        $ruta = $this->ruta($clave);
        return is_file($ruta) && filesize($ruta) > 0;
    }

    /**
     * Guarda un audio de forma atómica: se escribe en un temporal y se renombra.
     * Si el proceso muere a mitad de la escritura, no queda un MP3 truncado que
     * la caché daría por bueno para siempre.
     */
    public function guardar(string $clave, string $contenido): bool
    {
        $destino = $this->ruta($clave);
        $temporal = $destino . '.' . bin2hex(random_bytes(6)) . '.tmp';

        if (@file_put_contents($temporal, $contenido, LOCK_EX) === false) {
            @unlink($temporal);
            return false;
        }
        if (!@rename($temporal, $destino)) {
            @unlink($temporal);
            return false;
        }
        @chmod($destino, 0644);
        return true;
    }

    /** Envía el audio al cliente con las cabeceras adecuadas. */
    public function servir(string $clave, bool $desdeCache): void
    {
        $ruta = $this->ruta($clave);
        $tamano = filesize($ruta);

        header('Content-Type: audio/mpeg');
        header('Content-Length: ' . $tamano);
        // El contenido de una clave nunca cambia: se puede cachear un año.
        header('Cache-Control: public, max-age=31536000, immutable');
        header('ETag: "' . $clave . '"');
        header('X-Orbis-Cache: ' . ($desdeCache ? 'hit' : 'miss'));

        // Si el navegador ya lo tiene, se ahorra la transferencia entera.
        $etagCliente = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
        if (trim($etagCliente, '"') === $clave) {
            http_response_code(304);
            exit;
        }

        readfile($ruta);
    }

    /** Espacio ocupado y número de archivos, para el diagnóstico. */
    public function estadisticas(): array
    {
        $archivos = glob($this->directorio . '/*.mp3') ?: [];
        $bytes = 0;
        foreach ($archivos as $archivo) {
            $bytes += (int) filesize($archivo);
        }
        return ['archivos' => count($archivos), 'bytes' => $bytes];
    }
}

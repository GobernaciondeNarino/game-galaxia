<?php
/**
 * Limitador de peticiones: por IP y hora, y por sitio y día.
 *
 * Solo cuenta las generaciones NUEVAS: servir un audio que ya está en caché no
 * cuesta dinero ni salida a Internet, así que no debe consumir cupo. Un límite
 * que penalizara los aciertos de caché castigaría al visitante normal y no
 * frenaría al que intenta abusar.
 *
 * POR QUÉ NO BASTA CON EL LÍMITE POR IP
 * ─────────────────────────────────────
 * Porque acota lo que gasta UNA persona, no lo que gasta el sitio. Con sesenta
 * conversaciones por IP y hora, diez direcciones distintas son seiscientas
 * respuestas de un modelo de pago en una tarde, y nada las frenaba: no había
 * ningún techo del conjunto. En un sitio público, al que cualquiera entra sin
 * identificarse, ese techo es lo único que separa un día normal de una factura
 * inesperada.
 *
 * El tope diario NO es un objetivo de uso: es un freno de emergencia. Un día
 * normal no se acerca. Si se alcanza, algo está pasando —un bucle, un rastreador,
 * alguien probando— y es mejor que el sitio deje de sintetizar durante unas
 * horas a que siga pagando.
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
    /** @var string */
    private $ambito;
    /** @var int */
    private $topeDiario;

    /** Un día. La ventana del tope global. */
    const DIA = 86400;

    /**
     * @param int    $limite          peticiones por IP en la ventana
     * @param int    $ventanaSegundos duración de esa ventana
     * @param string $ambito          qué se está limitando: «narracion»,
     *                                «conversacion», «transcripcion». Cada uno
     *                                lleva su propio contador diario, porque
     *                                cuestan cosas distintas.
     * @param int    $topeDiario      techo del SITIO entero para ese ámbito en
     *                                24 h. Cero lo desactiva.
     */
    public function __construct(int $limite = 30, int $ventanaSegundos = 3600, string $ambito = '', int $topeDiario = 0)
    {
        $this->limite = $limite;
        $this->ventanaSegundos = $ventanaSegundos;
        // Solo letras: el ámbito acaba siendo parte de un nombre de archivo.
        $this->ambito = preg_match('/^[a-z]{1,24}$/', $ambito) === 1 ? $ambito : '';
        $this->topeDiario = max(0, $topeDiario);
        $this->directorio = Config::contenido('cache/limites');
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
        $ahora = time();

        // 1. Cupo de quien pregunta.
        $propio = $this->contar(
            $this->directorio . '/' . $this->identificador() . '.json',
            $this->limite,
            $this->ventanaSegundos,
            $ahora
        );
        if (!$propio['permitido']) {
            return [
                'permitido' => false,
                'restantes' => 0,
                'esperaSegundos' => $propio['esperaSegundos'],
                'motivo' => 'por_ip',
            ];
        }

        // 2. Techo del sitio entero. Se comprueba DESPUÉS del cupo propio: así,
        //    en el caso normal —que es no llegar a ninguno de los dos— se abre
        //    un archivo y no dos, y quien ya se ha pasado de su cupo no gasta
        //    del techo común.
        if ($this->topeDiario > 0 && $this->ambito !== '') {
            $global = $this->contar(
                $this->directorio . '/tope-' . $this->ambito . '.json',
                $this->topeDiario,
                self::DIA,
                $ahora
            );
            if (!$global['permitido']) {
                require_once __DIR__ . '/Respuesta.php';
                Respuesta::registrar(
                    'aviso',
                    'Tope diario alcanzado en «' . $this->ambito . '»: ' . $this->topeDiario
                        . ' en 24 h. Se deja de gastar hasta dentro de ' . $global['esperaSegundos'] . ' s.'
                );
                return [
                    'permitido' => false,
                    'restantes' => 0,
                    'esperaSegundos' => $global['esperaSegundos'],
                    'motivo' => 'tope_diario',
                ];
            }
        }

        $this->limpiar();

        return [
            'permitido' => true,
            'restantes' => $propio['restantes'],
            'esperaSegundos' => $propio['esperaSegundos'],
            'motivo' => null,
        ];
    }

    /**
     * Cuenta una unidad en un archivo con ventana deslizante.
     *
     * El cuerpo lo compartían el contador por IP y el del sitio, así que vive
     * aquí una sola vez. `flock` es lo que evita que dos visitas simultáneas se
     * pisen el contador y el techo se quede sin aplicar.
     *
     * @return array{permitido:bool, restantes:int, esperaSegundos:int}
     */
    private function contar(string $archivo, int $limite, int $ventana, int $ahora): array
    {
        $manejador = @fopen($archivo, 'c+');
        if ($manejador === false) {
            // Sin poder escribir el contador no se puede limitar. Se deja pasar
            // y se registra: es preferible que la narración funcione a que un
            // permiso mal puesto deje el sitio mudo, pero tiene que verse.
            require_once __DIR__ . '/Respuesta.php';
            Respuesta::registrar('aviso', 'No se pudo abrir el contador de límites: ' . $archivo);
            return ['permitido' => true, 'restantes' => $limite, 'esperaSegundos' => 0];
        }

        flock($manejador, LOCK_EX);
        $datos = json_decode((string) stream_get_contents($manejador), true);

        if (!is_array($datos) || !isset($datos['inicio'], $datos['cuenta'])) {
            $datos = ['inicio' => $ahora, 'cuenta' => 0];
        }
        // Ventana deslizante simple: al agotarse, se reinicia.
        if ($ahora - (int) $datos['inicio'] >= $ventana) {
            $datos = ['inicio' => $ahora, 'cuenta' => 0];
        }

        $permitido = $datos['cuenta'] < $limite;
        if ($permitido) {
            $datos['cuenta']++;
        }

        ftruncate($manejador, 0);
        rewind($manejador);
        fwrite($manejador, json_encode($datos));
        fflush($manejador);
        flock($manejador, LOCK_UN);
        fclose($manejador);

        return [
            'permitido' => $permitido,
            'restantes' => max(0, $limite - (int) $datos['cuenta']),
            'esperaSegundos' => max(0, $ventana - ($ahora - (int) $datos['inicio'])),
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
        // Los contadores por IP caducan pronto; los del techo diario, no. Barrer
        // un «tope-*.json» porque lleve dos horas sin tocarse reiniciaría la
        // cuenta del día a media noche de tráfico flojo, y el techo dejaría de
        // ser un techo.
        $caducidad = time() - $this->ventanaSegundos * 2;
        foreach (glob($this->directorio . '/*.json') ?: [] as $archivo) {
            $esTope = strpos(basename($archivo), 'tope-') === 0;
            $limite = $esTope ? time() - self::DIA * 2 : $caducidad;
            if (filemtime($archivo) < $limite) {
                @unlink($archivo);
            }
        }
    }
}

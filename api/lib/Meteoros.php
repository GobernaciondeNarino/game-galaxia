<?php
/**
 * Meteoros — qué lluvia de meteoros está activa en una fecha, y qué contar.
 *
 * El trazo que cruza la pantalla es decoración con su marca SIMULACIÓN. Lo que
 * se cuenta al pulsarlo NO lo es: son los datos publicados de la lluvia que de
 * verdad está activa en la fecha simulada, con su fuente.
 *
 * LA DISTINCIÓN QUE SOSTIENE TODO ESTO
 * ────────────────────────────────────
 * Nunca se afirma que ese trazo concreto sea un meteoro que pasó. Eso sería
 * inventar un dato, que es justo lo que el pliego prohíbe. Lo que se dice es:
 * «en esta fecha están cayendo las Perseidas, y las Perseidas son esto». La
 * diferencia parece sutil y no lo es: una afirmación es comprobable y la otra
 * es mentira.
 *
 * Fuera de las fechas de cualquier lluvia importante no se calla: se dice que
 * no hay ninguna activa y se explica qué se está viendo entonces, que también
 * es un dato real —el fondo esporádico existe todo el año—.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';

final class Meteoros
{
    /** @var array|null */
    private static $datos = null;

    private static function cargar(): void
    {
        if (self::$datos !== null) {
            return;
        }
        self::$datos = ['lluvias' => [], 'esporadico' => null];

        $ruta = Config::raiz() . '/data/meteoros.json';
        if (!is_readable($ruta)) {
            return;
        }
        $leido = json_decode((string) file_get_contents($ruta), true);
        if (is_array($leido)) {
            self::$datos = [
                'lluvias' => is_array($leido['lluvias'] ?? null) ? $leido['lluvias'] : [],
                'esporadico' => $leido['esporadico'] ?? null,
            ];
        }
    }

    /** Convierte un día y un mes en un número comparable: 812 es el 12 de agosto. */
    private static function clave(int $mes, int $dia): int
    {
        return $mes * 100 + $dia;
    }

    /**
     * ¿Qué lluvia está activa el día indicado?
     *
     * Si hay varias —ocurre: a finales de julio coinciden las Delta Acuáridas
     * con el arranque de las Perseidas— gana la que esté más cerca de su
     * máximo, que es la que de verdad se ve.
     *
     * @return array|null la entrada de la lluvia, o null si no hay ninguna
     */
    public static function activaEn(int $mes, int $dia): ?array
    {
        self::cargar();
        $hoy = self::clave($mes, $dia);

        $mejor = null;
        $mejorDistancia = PHP_INT_MAX;

        foreach (self::$datos['lluvias'] as $lluvia) {
            if (!self::estaDentro($lluvia, $hoy)) {
                continue;
            }
            $distancia = self::distanciaAlMaximo($lluvia, $hoy);
            if ($distancia < $mejorDistancia) {
                $mejor = $lluvia;
                $mejorDistancia = $distancia;
            }
        }
        return $mejor;
    }

    /** ¿Cae la fecha dentro del rango de actividad? Contempla el cambio de año. */
    private static function estaDentro(array $lluvia, int $hoy): bool
    {
        $desde = self::clave((int) $lluvia['desde']['mes'], (int) $lluvia['desde']['dia']);
        $hasta = self::clave((int) $lluvia['hasta']['mes'], (int) $lluvia['hasta']['dia']);

        // Las Úrsidas empiezan en diciembre y acaban en diciembre, pero las
        // Cuadrántidas arrancan el 28 de diciembre y terminan el 12 de enero:
        // ahí el rango cruza el fin de año y la comparación se invierte.
        if ($desde <= $hasta) {
            return $hoy >= $desde && $hoy <= $hasta;
        }
        return $hoy >= $desde || $hoy <= $hasta;
    }

    /** Cuántos días faltan o sobran respecto al máximo, cruzando el año si hace falta. */
    private static function distanciaAlMaximo(array $lluvia, int $hoy): int
    {
        $max = self::clave((int) $lluvia['maximo']['mes'], (int) $lluvia['maximo']['dia']);
        $directa = abs(self::aDiaDelAno($hoy) - self::aDiaDelAno($max));
        return min($directa, 365 - $directa);
    }

    /** Día del año aproximado. Sirve para comparar, no para calendarios. */
    private static function aDiaDelAno(int $clave): int
    {
        $mes = intdiv($clave, 100);
        $dia = $clave % 100;
        $acumulado = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        return ($acumulado[$mes] ?? 0) + $dia;
    }

    /**
     * Compone lo que el asistente cuenta al observar una estrella fugaz.
     *
     * @return array ['texto' => string, 'fuente' => string, 'lluvia' => string|null,
     *                'datos' => array]
     */
    public static function relato(int $mes, int $dia): array
    {
        self::cargar();
        $lluvia = self::activaEn($mes, $dia);

        if ($lluvia === null) {
            $esporadico = self::$datos['esporadico'];
            return [
                'texto' => is_array($esporadico)
                    ? (string) ($esporadico['texto'] ?? '')
                    : 'En esta fecha no hay ninguna lluvia importante activa.',
                'fuente' => is_array($esporadico) ? (string) ($esporadico['fuente'] ?? '') : '',
                'lluvia' => null,
                'datos' => [],
            ];
        }

        $partes = [];
        $partes[] = sprintf(
            'Estás en plenas %s, activas del %d de %s al %d de %s.',
            (string) $lluvia['nombre'],
            (int) $lluvia['desde']['dia'], self::mes((int) $lluvia['desde']['mes']),
            (int) $lluvia['hasta']['dia'], self::mes((int) $lluvia['hasta']['mes'])
        );
        $partes[] = sprintf(
            'Su máximo cae el %d de %s, con unos %d meteoros por hora en condiciones ideales.',
            (int) $lluvia['maximo']['dia'], self::mes((int) $lluvia['maximo']['mes']),
            (int) $lluvia['thz']
        );

        if (!empty($lluvia['progenitor'])) {
            $partes[] = sprintf(
                'Lo que se quema en la atmósfera son restos %s.',
                (string) $lluvia['progenitor']
            );
        }
        if (!empty($lluvia['velocidadKms'])) {
            $partes[] = sprintf(
                'Entran a unos %s kilómetros por segundo.',
                str_replace('.', ',', (string) $lluvia['velocidadKms'])
            );
        }
        if (!empty($lluvia['nota'])) {
            $partes[] = (string) $lluvia['nota'];
        }

        return [
            'texto' => implode(' ', $partes),
            'fuente' => (string) ($lluvia['fuente'] ?? ''),
            'lluvia' => (string) $lluvia['nombre'],
            'datos' => [
                'codigo' => (string) ($lluvia['codigo'] ?? ''),
                'radiante' => (string) ($lluvia['radiante'] ?? ''),
                'thz' => (int) ($lluvia['thz'] ?? 0),
                'velocidadKms' => $lluvia['velocidadKms'] ?? null,
                'progenitor' => (string) ($lluvia['progenitor'] ?? ''),
            ],
        ];
    }

    private static function mes(int $n): string
    {
        $meses = [
            1 => 'enero', 2 => 'febrero', 3 => 'marzo', 4 => 'abril',
            5 => 'mayo', 6 => 'junio', 7 => 'julio', 8 => 'agosto',
            9 => 'septiembre', 10 => 'octubre', 11 => 'noviembre', 12 => 'diciembre',
        ];
        return $meses[$n] ?? '';
    }

    /** @return array todas las lluvias, para las pruebas y la documentación. */
    public static function todas(): array
    {
        self::cargar();
        return self::$datos['lluvias'];
    }
}

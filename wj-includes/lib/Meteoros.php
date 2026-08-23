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
        self::$datos = ['lluvias' => [], 'esporadico' => null, 'bolidos' => []];

        $ruta = Config::contenido('data/meteoros.json');
        if (!is_readable($ruta)) {
            return;
        }
        $leido = json_decode((string) file_get_contents($ruta), true);
        if (is_array($leido)) {
            self::$datos = [
                'lluvias' => is_array($leido['lluvias'] ?? null) ? $leido['lluvias'] : [],
                'esporadico' => $leido['esporadico'] ?? null,
                'bolidos' => is_array($leido['bolidos'] ?? null) ? $leido['bolidos'] : [],
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

        // La fecha del máximo la fija la longitud solar, no el calendario, así
        // que se corre alrededor de un día de un año a otro. Decirlo cuesta una
        // oración subordinada y evita dar por exacta una fecha que no lo es.
        $partes[] = sprintf(
            'Su máximo cae el %d de %s, aunque la fecha se corre un día de un año a otro.',
            (int) $lluvia['maximo']['dia'], self::mes((int) $lluvia['maximo']['mes'])
        );

        $partes[] = self::fraseThz($lluvia);

        $progenitor = $lluvia['progenitor'] ?? null;
        if (is_array($progenitor) && !empty($progenitor['nombre'])) {
            $partes[] = sprintf(
                'Lo que se quema en la atmósfera son restos %s.',
                (string) $progenitor['nombre']
            );
        }

        if (!empty($lluvia['velocidadKms'])) {
            $partes[] = sprintf(
                'Entran a unos %s kilómetros por segundo.',
                str_replace('.', ',', (string) $lluvia['velocidadKms'])
            );
        }

        $radiante = $lluvia['radiante'] ?? null;
        if (is_array($radiante) && !empty($radiante['constelacion'])) {
            $partes[] = sprintf(
                'Su radiante está en %s.',
                (string) $radiante['constelacion']
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
                'iau' => (string) ($lluvia['iau'] ?? ''),
                'radiante' => is_array($radiante) ? (string) ($radiante['constelacion'] ?? '') : '',
                'radianteDerivado' => is_array($radiante) && ($radiante['origenConstelacion'] ?? '') === 'derivada',
                'thz' => self::thzEscrito($lluvia),
                'velocidadKms' => $lluvia['velocidadKms'] ?? null,
                'progenitor' => is_array($progenitor) ? (string) ($progenitor['nombre'] ?? '') : '',
                'progenitorProbable' => is_array($progenitor) && ($progenitor['certeza'] ?? '') !== 'confirmado',
            ],
        ];
    }

    /**
     * La frase del THZ, con la advertencia que le corresponde.
     *
     * El THZ es una tasa TEÓRICA: la que se vería con el radiante en el cénit y
     * un cielo perfecto. Lo que ve una persona real es bastante menos —la NASA
     * da 40 a 50 por hora para las Gemínidas frente a un THZ de 150—, así que
     * soltar el número a secas sería prometer un espectáculo que no va a
     * ocurrir. Y donde las fuentes discrepan se da el rango, no un valor
     * elegido a dedo.
     */
    private static function fraseThz(array $lluvia): string
    {
        $thz = $lluvia['thz'] ?? null;
        if (!is_array($thz)) {
            return '';
        }
        $min = (int) ($thz['min'] ?? 0);
        $max = (int) ($thz['max'] ?? $min);

        $cifra = $min === $max
            ? sprintf('unos %d meteoros por hora', $min)
            : sprintf('entre %d y %d meteoros por hora', $min, $max);

        // Cuando la lluvia trae su propia nota sobre el THZ, la advertencia
        // general sobra: la nota ya la da con más detalle, y decir dos veces lo
        // mismo con distintas palabras cansa a quien escucha.
        if (!empty($thz['nota'])) {
            return sprintf('En el máximo llega a %s, aunque es una tasa teórica. %s', $cifra, (string) $thz['nota']);
        }

        return sprintf(
            'En el máximo llega a %s, pero es una tasa teórica: la que se vería con el radiante en lo alto y un cielo perfectamente oscuro. A ojo, en un sitio real, se ven bastantes menos.',
            $cifra
        );
    }

    /** El THZ para el panel: un número o un rango. */
    private static function thzEscrito(array $lluvia): string
    {
        $thz = $lluvia['thz'] ?? null;
        if (!is_array($thz)) {
            return '';
        }
        $min = (int) ($thz['min'] ?? 0);
        $max = (int) ($thz['max'] ?? $min);
        return $min === $max ? (string) $min : $min . '-' . $max;
    }

    /**
     * Un bólido histórico, de los documentados.
     *
     * Estos SÍ son sucesos concretos que ocurrieron, con fecha y con artículo
     * publicado. Se separa lo medido de lo estimado, porque en Tunguska —donde
     * la primera expedición llegó veinte años tarde— todo lo cuantitativo es
     * reconstrucción, y presentarlo como medida sería falsearlo.
     *
     * @return array|null
     */
    public static function bolido(?string $id = null): ?array
    {
        self::cargar();
        $bolidos = self::$datos['bolidos'];
        if ($bolidos === []) {
            return null;
        }

        if ($id !== null) {
            foreach ($bolidos as $b) {
                if (($b['id'] ?? '') === $id) {
                    return $b;
                }
            }
            return null;
        }
        return $bolidos[0];
    }

    /** @return string[] los identificadores de bólido registrados. */
    public static function bolidosRegistrados(): array
    {
        self::cargar();
        return array_map(static function ($b) {
            return (string) ($b['id'] ?? '');
        }, self::$datos['bolidos']);
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

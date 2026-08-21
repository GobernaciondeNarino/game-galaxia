<?php
/**
 * Respuestas — compone en castellano la respuesta a una pregunta del catálogo.
 *
 * Vive en el servidor por la misma razón que Catalogo y Asistente: api/tts.php
 * no sintetiza texto que venga del navegador. El cliente entiende la pregunta y
 * envía DOS identificadores —qué cuerpo y qué atributo—; la frase la escribe
 * este archivo a partir de los datos del catálogo.
 *
 * TRES REGLAS QUE NO SE SALTAN
 * ────────────────────────────
 *   1. SIN DATO NO HAY RESPUESTA. Si el campo es null se dice que no se sabe.
 *      No se estima, no se redondea desde otro cuerpo, no se rellena. Media
 *      docena de campos del catálogo están vacíos a propósito y así se dicen.
 *   2. CADA CIFRA CON SU FUENTE. La respuesta la lleva aparte para que la
 *      interfaz pueda mostrarla; quien pregunta «¿de dónde sacas eso?» recibe
 *      la línea literal de JPL Horizons de la que salió el número.
 *   3. NÚMEROS QUE SE PUEDAN OÍR. Esto acaba en un sintetizador de voz, así que
 *      «5,97 × 10²⁴ kg» no sirve: se dice «5,97 cuatrillones de kilogramos».
 *      La cifra exacta se ve escrita en el panel, no se recita.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Catalogo.php';
require_once __DIR__ . '/Horizons.php';

final class Respuestas
{
    /**
     * Nombres de las potencias de mil en español, para decir una masa en voz
     * alta sin recitar exponentes. Escala larga, que es la de España y América
     * Latina: un billón son 10¹², no 10⁹.
     */
    private static $escalaLarga = [
        6 => 'millones',
        12 => 'billones',
        18 => 'trillones',
        24 => 'cuatrillones',
        30 => 'quintillones',
    ];

    /**
     * Por encima de 90 grados de inclinación axial, un cuerpo gira al revés.
     *
     * No es una interpretación libre: es la definición de la IAU. La oblicuidad
     * se mide desde la normal a la órbita, así que pasar de 90 significa que el
     * polo norte apunta por debajo del plano y la rotación es retrógrada. Venus
     * tiene 177,3 y Urano casi 98, y ese número ya está en el catálogo con su
     * fuente: no hace falta añadir ningún campo nuevo para saberlo.
     */
    const LIMITE_RETROGRADO = 90.0;

    /** Nombres que en castellano piden artículo. Los demás no lo llevan. */
    private static $articulos = [
        'sol' => 'el',
        'tierra' => 'la',
        'luna' => 'la',
    ];

    /**
     * El nombre del cuerpo tal y como se dice en una frase.
     *
     * «Tierra mide 12.742 kilómetros» está mal escrito y peor dicho. Con
     * artículo cuando toca, y en mayúscula si abre la oración.
     */
    public static function conArticulo(array $cuerpo, bool $inicioDeFrase = false): string
    {
        $nombre = (string) ($cuerpo['nombre'] ?? '');
        $id = (string) ($cuerpo['id'] ?? '');

        $articulo = self::$articulos[$id] ?? null;
        if ($articulo === null && ($cuerpo['tipo'] ?? '') === 'cinturon') {
            $articulo = 'el';
        }
        if ($articulo === null) {
            return $nombre;
        }
        return ($inicioDeFrase ? ucfirst($articulo) : $articulo) . ' ' . $nombre;
    }

    /**
     * El nombre precedido de «de», con la contracción hecha.
     *
     * «la gravedad de el Sol» no lo escribe nadie. En castellano «de» + «el» es
     * «del», y como el artículo lo pone conArticulo(), la contracción hay que
     * hacerla aquí o se cuela en cada respuesta.
     */
    public static function deCuerpo(array $cuerpo): string
    {
        $conArticulo = self::conArticulo($cuerpo, false);
        if (strpos($conArticulo, 'el ') === 0) {
            return 'del ' . substr($conArticulo, 3);
        }
        return 'de ' . $conArticulo;
    }

    /** ¿Gira al revés que la mayoría? */
    public static function esRetrogrado(array $cuerpo): bool
    {
        $obl = $cuerpo['fisica']['inclinacionAxialGrados'] ?? null;
        return is_numeric($obl) && (float) $obl > self::LIMITE_RETROGRADO;
    }

    /**
     * Compara una magnitud con la de la Tierra.
     *
     * «1.898 cuatrillones de kilogramos» no le dice nada a nadie; «318 veces la
     * Tierra» sí. La comparación no inventa: divide dos cifras que ya están en
     * el catálogo, las dos con su fuente. Devuelve null cuando comparar no
     * aporta —al hablar de la propia Tierra, o si falta alguno de los dos
     * valores—.
     */
    private static function frenteALaTierra(array $cuerpo, string $ruta, string $que): ?string
    {
        if (($cuerpo['id'] ?? '') === 'tierra') {
            return null;
        }
        $tierra = Catalogo::cuerpo('tierra');
        if ($tierra === null) {
            return null;
        }
        $mio = self::valor($cuerpo, $ruta);
        $suyo = self::valor($tierra, $ruta);
        if ($mio === null || $suyo === null || (float) $suyo == 0.0) {
            return null;
        }

        $veces = (float) $mio / (float) $suyo;
        if ($veces >= 1) {
            return sprintf('%s veces %s la Tierra', self::numero($veces, $veces >= 10 ? 0 : 1), $que);
        }
        // Por debajo de uno se entiende mucho mejor al revés: «81 veces menos»
        // en lugar de «0,012 veces». Y sin repetir la magnitud, que ya la ha
        // dicho la frase de la que cuelga esta comparación.
        return sprintf('%s veces menos que la Tierra', self::numero(1 / $veces, 1 / $veces >= 10 ? 0 : 1));
    }

    /** Formatea un número al castellano: coma decimal y punto de millar. */
    public static function numero(float $valor, int $decimales = 2): string
    {
        return number_format($valor, $decimales, ',', '.');
    }

    /**
     * Una masa en kilogramos, dicha de forma que se pueda escuchar.
     * 5.97e24 → «5,97 cuatrillones de kilogramos».
     */
    public static function masaHablada(float $kg): string
    {
        foreach ([30, 24, 18, 12, 6] as $exponente) {
            if ($kg >= 10 ** $exponente) {
                $mantisa = $kg / (10 ** $exponente);
                // Los decimales dependen del tamaño de la cifra, no son fijos.
                // La escala larga solo nombra las potencias de seis, así que
                // entre una y la siguiente caben seis órdenes de magnitud y la
                // mantisa puede ser 5,97 o 641.710. Con dos decimales para todo,
                // Marte quedaba en «641.710,00 trillones de kilogramos»: unos
                // céntimos de trillón, que no significan nada y suenan a
                // plantilla mal rellenada.
                $decimales = $mantisa >= 100 ? 0 : ($mantisa >= 10 ? 1 : 2);
                return self::numero($mantisa, $decimales) . ' ' . self::$escalaLarga[$exponente] . ' de kilogramos';
            }
        }
        return self::numero($kg, 0) . ' kilogramos';
    }

    /**
     * Una masa escrita, para el panel. En notación científica y no con todas
     * sus cifras: formatear 1,9e27 con separadores de millar produce
     * «1.898.190.000.000.000.107.831.361.536», donde de la mitad en adelante
     * todo es ruido del binario flotante y no una medida de nadie.
     */
    public static function masaEscrita(float $kg): string
    {
        if ($kg <= 0) {
            return '0 kg';
        }
        $exponente = (int) floor(log10($kg));
        $mantisa = $kg / (10 ** $exponente);
        return sprintf('%s × 10^%d kg', self::numero($mantisa, 3), $exponente);
    }

    /** Una duración en horas, dicha en la unidad que le queda mejor. */
    public static function duracionHoras(float $horas): string
    {
        $abs = abs($horas);
        if ($abs < 48) {
            return self::numero($abs, 2) . ' horas';
        }
        $dias = $abs / 24;
        return self::numero($dias, 1) . ' días terrestres';
    }

    /** Una duración en días, en días o en años según convenga. */
    public static function duracionDias(float $dias): string
    {
        if ($dias < 700) {
            return self::numero($dias, 1) . ' días';
        }
        return self::numero($dias / 365.25, 1) . ' años terrestres';
    }

    /**
     * Responde una pregunta.
     *
     * @return array|null  ['texto' => string, 'fuente' => string|null,
     *                      'valor' => string|null, 'sinDato' => bool]
     *                     null si el cuerpo o el atributo no existen.
     */
    public static function responder(string $idCuerpo, string $atributo): ?array
    {
        $cuerpo = Catalogo::cuerpo($idCuerpo);
        if ($cuerpo === null) {
            return null;
        }
        // Dos formas del nombre: con artículo para abrir la frase y sin él para
        // el resto, porque «la Tierra» al principio y «de la Tierra» dentro no
        // se escriben igual.
        $nombre = self::conArticulo($cuerpo, true);
        $enMedio = self::conArticulo($cuerpo, false);

        switch ($atributo) {
            /**
             * El único atributo que NO sale del catálogo.
             *
             * Todos los demás son propiedades que no cambian y por eso están en
             * un archivo. Dónde está un cuerpo hoy cambia cada día, así que
             * ningún archivo del repositorio puede contenerlo: se le pregunta a
             * JPL Horizons, que es de donde salió el resto del catálogo.
             *
             * Se distingue a propósito de «distancia», que es el semieje mayor
             * respecto al Sol y es una constante orbital. Esto otro es la
             * separación real respecto a la Tierra en esta fecha, y las dos
             * cifras no se parecen: Marte está a 1,52 ua del Sol siempre, y a
             * entre 0,4 y 2,7 de nosotros según cuándo se mire.
             */
            case 'posicion': {
                // La Tierra es el punto desde el que se mide todo lo demás, así
                // que preguntar a qué distancia está de sí misma no tiene
                // respuesta. Decirlo es más útil que devolver un cero o fingir
                // que falló la consulta.
                if ($idCuerpo === 'tierra') {
                    return [
                        'texto' => 'Estás en ella. La Tierra es el punto desde el que mido las distancias de todo lo demás, así que su distancia a sí misma no es una pregunta con respuesta.',
                        'fuente' => 'NASA/JPL Horizons — el geocentro es el origen de coordenadas',
                        'valor' => null,
                        'sinDato' => false,
                    ];
                }

                $e = Horizons::efemerides($idCuerpo);
                if ($e === null || $e['distanciaUA'] === null) {
                    // Sin conexión con el JPL no se rellena el hueco con la
                    // posición simulada de la escena: son cosas distintas y
                    // hacerlas pasar por la misma sería inventar un dato.
                    return [
                        'texto' => sprintf(
                            'Ahora mismo no puedo consultar dónde está %s. Esa cifra la calcula JPL Horizons en el momento y no está en mi catálogo, así que prefiero no dártela a medias.',
                            $enMedio
                        ),
                        'fuente' => 'NASA/JPL Horizons (no disponible)',
                        'valor' => null,
                        'sinDato' => true,
                    ];
                }

                $partes = [sprintf(
                    'Hoy %s está a %s de la Tierra, es decir %s kilómetros.',
                    $enMedio,
                    self::numero((float) $e['distanciaUA'], 3) . ' unidades astronómicas',
                    self::numero((float) $e['distanciaKm'], 0)
                )];

                $v = $e['velocidadRadialKms'];
                if ($v !== null && abs($v) > 0.05) {
                    $partes[] = sprintf(
                        'Se %s a %s kilómetros por segundo.',
                        $v < 0 ? 'acerca' : 'aleja',
                        self::numero(abs((float) $v), 1)
                    );
                }

                if (!empty($e['ascensionRecta']) && !empty($e['declinacion'])) {
                    $partes[] = sprintf(
                        'En el cielo está en ascensión recta %s y declinación %s.',
                        (string) $e['ascensionRecta'],
                        (string) $e['declinacion']
                    );
                }

                // Medido desde el centro de la Tierra, no desde donde esté
                // quien pregunta: no se pide la ubicación de nadie.
                $partes[] = 'Medido desde el centro de la Tierra.';

                return [
                    'texto' => implode(' ', $partes),
                    'fuente' => (string) $e['fuente'],
                    'valor' => self::numero((float) $e['distanciaUA'], 3) . ' ua',
                    'sinDato' => false,
                ];
            }

            case 'tamano':
                $tam = self::cifra($cuerpo, $nombre, 'fisica.diametroKm',
                    '%s mide %s kilómetros de diámetro.', 0, 'el diámetro ' . self::deCuerpo($cuerpo));
                $comparado = self::frenteALaTierra($cuerpo, 'fisica.diametroKm', 'el diámetro de');
                if (!$tam['sinDato'] && $comparado !== null) {
                    $tam['texto'] = rtrim($tam['texto'], '.') . ': ' . $comparado . '.';
                }
                return $tam;

            case 'masa':
                $kg = self::valor($cuerpo, 'fisica.masaKg');
                if ($kg === null) {
                    return self::sinDato($nombre, 'la masa ' . self::deCuerpo($cuerpo));
                }
                $comparada = self::frenteALaTierra($cuerpo, 'fisica.masaKg', 'la masa de');
                return [
                    'texto' => sprintf(
                        '%s tiene una masa de %s%s.',
                        $nombre,
                        self::masaHablada((float) $kg),
                        $comparada === null ? '' : ': ' . $comparada
                    ),
                    'fuente' => self::fuenteDe($cuerpo, 'masaKg'),
                    'valor' => self::masaEscrita((float) $kg),
                    'sinDato' => false,
                ];

            case 'gravedad':
                return self::cifra($cuerpo, $enMedio, 'fisica.gravedadMs2',
                    'La gravedad en la superficie de %s es de %s metros por segundo al cuadrado.',
                    2, 'la gravedad ' . self::deCuerpo($cuerpo));

            case 'densidad':
                return self::cifra($cuerpo, $enMedio, 'fisica.densidadGcm3',
                    'La densidad media de %s es de %s gramos por centímetro cúbico.',
                    2, 'la densidad ' . self::deCuerpo($cuerpo));

            case 'escape':
                return self::cifra($cuerpo, $enMedio, 'fisica.velocidadEscapeKms',
                    'Para escapar de %s hay que alcanzar %s kilómetros por segundo.',
                    2, 'la velocidad de escape ' . self::deCuerpo($cuerpo));

            case 'inclinacion':
                $inc = self::cifra($cuerpo, $enMedio, 'fisica.inclinacionAxialGrados',
                    'El eje de %s está inclinado %s grados.',
                    2, 'la inclinación axial ' . self::deCuerpo($cuerpo));
                if (!$inc['sinDato'] && self::esRetrogrado($cuerpo)) {
                    $inc['texto'] .= ' Al pasar de noventa, su rotación es retrógrada: gira al revés que la mayoría.';
                }
                return $inc;

            case 'albedo':
                $albedo = self::valor($cuerpo, 'fisica.albedoGeometrico');
                if ($albedo === null) {
                    return self::sinDato($nombre, 'el albedo ' . self::deCuerpo($cuerpo));
                }
                return [
                    'texto' => sprintf(
                        '%s refleja alrededor del %s por ciento de la luz que recibe.',
                        $nombre, self::numero(((float) $albedo) * 100, 0)
                    ),
                    'fuente' => self::fuenteDe($cuerpo, 'albedoGeometrico'),
                    'valor' => self::numero((float) $albedo, 3),
                    'sinDato' => false,
                ];

            case 'rotacion':
                $horas = self::valor($cuerpo, 'fisica.periodoRotacionHoras');
                if ($horas === null) {
                    return self::sinDato($nombre, 'el periodo de rotación ' . self::deCuerpo($cuerpo));
                }
                $texto = sprintf('Un día en %s dura %s.', $enMedio, self::duracionHoras((float) $horas));
                // Que gire al revés es parte de la respuesta, no una nota al pie:
                // Venus tarda 243 días terrestres en dar una vuelta Y la da en
                // sentido contrario, y contar solo lo primero se queda corto.
                if (self::esRetrogrado($cuerpo)) {
                    $texto .= sprintf(
                        ' Y la da al revés que la mayoría: su eje está inclinado %s grados, más de noventa.',
                        self::numero((float) $cuerpo['fisica']['inclinacionAxialGrados'], 1)
                    );
                }
                return [
                    'texto' => $texto,
                    'fuente' => self::fuenteDe($cuerpo, 'periodoRotacionHoras'),
                    'valor' => self::numero((float) $horas, 2) . ' h',
                    'sinDato' => false,
                ];

            case 'orbita':
                $dias = self::valor($cuerpo, 'orbita.periodoOrbitalDias');
                if ($dias === null) {
                    return self::sinDato($nombre, 'el periodo orbital ' . self::deCuerpo($cuerpo));
                }
                return [
                    'texto' => sprintf('%s completa una órbita en %s.', $nombre, self::duracionDias((float) $dias)),
                    'fuente' => (string) ($cuerpo['fuente'] ?? 'JPL Horizons'),
                    'valor' => self::numero((float) $dias, 1) . ' días',
                    'sinDato' => false,
                ];

            case 'distancia':
                $ua = self::valor($cuerpo, 'orbita.semiejeMayorUA');
                if ($ua === null) {
                    return self::sinDato($nombre, 'la distancia ' . self::deCuerpo($cuerpo) . ' al Sol');
                }
                // Una unidad astronómica ES la distancia de la Tierra al Sol, así
                // que decírselo a la propia Tierra sobra.
                $texto = ($cuerpo['id'] ?? '') === 'tierra'
                    ? sprintf(
                        '%s orbita a una unidad astronómica del Sol. Esa distancia es precisamente la definición de la unidad astronómica.',
                        $nombre
                    )
                    : sprintf(
                        '%s orbita a %s unidades astronómicas del Sol: %s veces la distancia a la que está la Tierra.',
                        $nombre, self::numero((float) $ua, 2), self::numero((float) $ua, 1)
                    );
                return [
                    'texto' => $texto,
                    'fuente' => (string) ($cuerpo['fuente'] ?? 'JPL Horizons'),
                    'valor' => self::numero((float) $ua, 3) . ' UA',
                    'sinDato' => false,
                ];

            case 'temperatura':
                return self::temperatura($cuerpo);

            case 'atmosfera':
                return self::atmosfera($cuerpo);

            case 'satelites':
                return self::satelites($cuerpo);

            case 'magnetosfera':
                return self::magnetosfera($cuerpo);

            case 'geologia':
                return self::geologia($cuerpo);

            case 'curiosidad':
                return self::curiosidad($cuerpo);

            case 'tipo':
                return [
                    'texto' => sprintf('%s es %s.', $nombre, self::articuloTipo((string) ($cuerpo['tipo'] ?? ''))),
                    'fuente' => 'Unión Astronómica Internacional · clasificación del catálogo de ORBIS',
                    'valor' => (string) ($cuerpo['tipo'] ?? ''),
                    'sinDato' => false,
                ];

            case 'padre':
                return self::padre($cuerpo);

            case 'fuente':
                return [
                    'texto' => sprintf('Los datos de %s vienen de %s.', $enMedio, (string) ($cuerpo['fuente'] ?? 'JPL Horizons')),
                    'fuente' => (string) ($cuerpo['fuente'] ?? 'JPL Horizons'),
                    'valor' => null,
                    'sinDato' => false,
                ];

            default:
                return null;
        }
    }

    // -----------------------------------------------------------------------
    // Piezas
    // -----------------------------------------------------------------------

    /** Lee un campo anidado con notación de puntos. Devuelve null si falta. */
    private static function valor(array $cuerpo, string $ruta)
    {
        $actual = $cuerpo;
        foreach (explode('.', $ruta) as $parte) {
            if (!is_array($actual) || !array_key_exists($parte, $actual)) {
                return null;
            }
            $actual = $actual[$parte];
        }
        return is_numeric($actual) ? $actual : null;
    }

    /** La fuente concreta de un campo físico, con su línea literal si la hay. */
    private static function fuenteDe(array $cuerpo, string $campo): ?string
    {
        $p = $cuerpo['procedencia'][$campo] ?? null;
        if (is_array($p)) {
            return trim((string) ($p['fuente'] ?? '')) ?: null;
        }
        return (string) ($cuerpo['fuente'] ?? 'JPL Horizons');
    }

    /** Respuesta genérica para una cifra con unidad. */
    private static function cifra(array $cuerpo, string $nombre, string $ruta, string $plantilla, int $decimales, string $queEs): array
    {
        $v = self::valor($cuerpo, $ruta);
        if ($v === null) {
            return self::sinDato($nombre, $queEs);
        }
        $campo = substr($ruta, (int) strrpos($ruta, '.') + 1);
        return [
            'texto' => sprintf($plantilla, $nombre, self::numero((float) $v, $decimales)),
            'fuente' => self::fuenteDe($cuerpo, $campo),
            'valor' => self::numero((float) $v, $decimales),
            'sinDato' => false,
        ];
    }

    /** Lo que se responde cuando el catálogo no trae el dato. */
    private static function sinDato(string $nombre, string $queEs): array
    {
        return [
            'texto' => sprintf(
                'No tengo %s. En el catálogo ese campo está vacío, y prefiero decírtelo a inventarlo.',
                $queEs
            ),
            'fuente' => null,
            'valor' => null,
            'sinDato' => true,
        ];
    }

    private static function temperatura(array $cuerpo): array
    {
        $nombre = self::conArticulo($cuerpo, true);
        $enMedio = self::conArticulo($cuerpo, false);
        $t = $cuerpo['temperatura'] ?? null;
        if (!is_array($t)) {
            return self::sinDato($nombre, 'la temperatura ' . self::deCuerpo($cuerpo));
        }

        $partes = [];
        if (isset($t['mediaC']) && is_numeric($t['mediaC'])) {
            $partes[] = sprintf('%s grados de media', self::numero((float) $t['mediaC'], 0));
        }
        if (isset($t['minC']) && is_numeric($t['minC']) && isset($t['maxC']) && is_numeric($t['maxC'])) {
            $partes[] = sprintf(
                'con extremos entre %s y %s',
                self::numero((float) $t['minC'], 0),
                self::numero((float) $t['maxC'], 0)
            );
        }
        if ($partes === []) {
            return self::sinDato($nombre, 'la temperatura de ' . $nombre);
        }

        $texto = sprintf('En %s hace %s.', $enMedio, implode(', ', $partes));
        if (!empty($t['nota'])) {
            $texto .= ' ' . ucfirst((string) $t['nota']) . '.';
        }
        return [
            'texto' => $texto,
            'fuente' => (string) ($t['fuente'] ?? ''),
            'valor' => isset($t['mediaC']) ? self::numero((float) $t['mediaC'], 0) . ' °C' : null,
            'sinDato' => false,
        ];
    }

    private static function atmosfera(array $cuerpo): array
    {
        $nombre = self::conArticulo($cuerpo, true);
        $enMedio = self::conArticulo($cuerpo, false);
        $a = $cuerpo['atmosfera'] ?? null;
        if (!is_array($a)) {
            return [
                'texto' => sprintf('%s no tiene atmósfera registrada en el catálogo.', $nombre),
                'fuente' => (string) ($cuerpo['fuente'] ?? ''),
                'valor' => null,
                'sinDato' => true,
            ];
        }

        $trozos = [];
        foreach (($a['componentes'] ?? []) as $c) {
            if (!isset($c['compuesto'])) {
                continue;
            }
            $trozos[] = isset($c['porcentaje']) && is_numeric($c['porcentaje'])
                ? sprintf('%s, un %s por ciento', $c['compuesto'], self::numero((float) $c['porcentaje'], 1))
                : (string) $c['compuesto'];
        }

        $texto = $trozos === []
            ? sprintf('La atmósfera de %s está registrada, pero sin proporciones medidas.', $enMedio)
            : sprintf('La atmósfera de %s es %s.', $enMedio, implode('; ', $trozos));

        if (!empty($a['nota'])) {
            $texto .= ' ' . ucfirst((string) $a['nota']);
            if (substr(trim((string) $a['nota']), -1) !== '.') {
                $texto .= '.';
            }
        }
        return [
            'texto' => $texto,
            'fuente' => (string) ($a['fuente'] ?? ''),
            'valor' => $trozos === [] ? null : implode(' · ', $trozos),
            'sinDato' => false,
        ];
    }

    private static function satelites(array $cuerpo): array
    {
        $nombre = self::conArticulo($cuerpo, true);
        $enMedio = self::conArticulo($cuerpo, false);
        $s = $cuerpo['satelitesConocidos'] ?? null;
        $n = is_array($s) ? ($s['valor'] ?? null) : $s;

        if (!is_numeric($n)) {
            return self::sinDato($nombre, 'el número de satélites ' . self::deCuerpo($cuerpo));
        }
        $n = (int) $n;

        if ($n === 0) {
            $texto = sprintf('%s no tiene ningún satélite conocido.', $nombre);
        } elseif ($n === 1) {
            $texto = sprintf('%s tiene un satélite conocido.', $nombre);
        } else {
            $texto = sprintf('%s tiene %s satélites conocidos.', $nombre, self::numero((float) $n, 0));
        }

        // El recuento sube con cada campaña de observación, así que decir de
        // cuándo es la cifra no es un detalle: es parte del dato.
        if (is_array($s) && !empty($s['recuentoA'])) {
            $texto .= sprintf(' Es el recuento de %s.', (string) $s['recuentoA']);
        }

        $enEscena = is_array($cuerpo['satelites'] ?? null) ? count($cuerpo['satelites']) : 0;
        if ($enEscena > 0 && $enEscena < $n) {
            $texto .= sprintf(' En la escena están los %s mayores.', self::numero((float) $enEscena, 0));
        }

        return [
            'texto' => $texto,
            'fuente' => is_array($s) ? (string) ($s['fuente'] ?? '') : (string) ($cuerpo['fuente'] ?? ''),
            'valor' => (string) $n,
            'sinDato' => false,
        ];
    }

    private static function magnetosfera(array $cuerpo): array
    {
        $nombre = self::conArticulo($cuerpo, true);
        $enMedio = self::conArticulo($cuerpo, false);
        $m = $cuerpo['magnetosfera'] ?? null;
        if (!is_array($m)) {
            return self::sinDato($nombre, 'el campo magnético ' . self::deCuerpo($cuerpo));
        }

        $tiene = !empty($m['tieneCampoGlobal']);
        $texto = $tiene
            ? sprintf('%s tiene campo magnético global.', $nombre)
            : sprintf('%s no tiene campo magnético global.', $nombre);

        if ($tiene && isset($m['campoSuperficieNt']) && is_numeric($m['campoSuperficieNt'])) {
            $texto .= sprintf(' En la superficie mide %s nanoteslas.', self::numero((float) $m['campoSuperficieNt'], 0));
        }
        if (!empty($m['nota'])) {
            $texto .= ' ' . ucfirst((string) $m['nota']);
            if (substr(trim((string) $m['nota']), -1) !== '.') {
                $texto .= '.';
            }
        }
        return [
            'texto' => $texto,
            'fuente' => (string) ($m['fuente'] ?? ''),
            'valor' => $tiene && isset($m['campoSuperficieNt']) ? self::numero((float) $m['campoSuperficieNt'], 0) . ' nT' : ($tiene ? 'sí' : 'no'),
            'sinDato' => false,
        ];
    }

    private static function geologia(array $cuerpo): array
    {
        $nombre = self::conArticulo($cuerpo, true);
        $enMedio = self::conArticulo($cuerpo, false);
        $g = $cuerpo['geologia'] ?? null;
        if (!is_array($g)) {
            return self::sinDato($nombre, 'la actividad geológica ' . self::deCuerpo($cuerpo));
        }

        $estados = [
            'activa' => 'está geológicamente activo',
            'residual' => 'conserva actividad geológica residual',
            'inactiva' => 'está geológicamente inactivo',
        ];
        $estado = (string) ($g['estado'] ?? '');
        $texto = isset($estados[$estado])
            ? sprintf('%s %s.', $nombre, $estados[$estado])
            : sprintf('De la geología de %s el catálogo no da un estado.', $enMedio);

        if (!empty($g['nota'])) {
            $texto .= ' ' . ucfirst((string) $g['nota']);
            if (substr(trim((string) $g['nota']), -1) !== '.') {
                $texto .= '.';
            }
        }
        return [
            'texto' => $texto,
            'fuente' => (string) ($g['fuente'] ?? ''),
            'valor' => $estado ?: null,
            'sinDato' => !isset($estados[$estado]),
        ];
    }

    private static function curiosidad(array $cuerpo): array
    {
        $nombre = self::conArticulo($cuerpo, true);
        $enMedio = self::conArticulo($cuerpo, false);
        $lista = is_array($cuerpo['curiosidades'] ?? null) ? $cuerpo['curiosidades'] : [];
        if ($lista === []) {
            return self::sinDato($nombre, 'ninguna curiosidad registrada ' . self::deCuerpo($cuerpo));
        }
        // Se devuelven todas: quien pregunta elige cuál con la variante, igual
        // que con las narraciones, y así no se repite la misma cada vez.
        return [
            'texto' => (string) $lista[0],
            'fuente' => (string) ($cuerpo['fuente'] ?? ''),
            'valor' => null,
            'sinDato' => false,
            'variantes' => array_map('strval', $lista),
        ];
    }

    private static function padre(array $cuerpo): array
    {
        $nombre = self::conArticulo($cuerpo, true);
        $enMedio = self::conArticulo($cuerpo, false);
        $padre = $cuerpo['padre'] ?? null;
        if (!is_string($padre) || $padre === '') {
            return [
                'texto' => sprintf('%s no orbita alrededor de nada: es el centro del sistema.', $nombre),
                'fuente' => (string) ($cuerpo['fuente'] ?? ''),
                'valor' => null,
                'sinDato' => false,
            ];
        }
        $delPadre = Catalogo::cuerpo($padre);
        $nombrePadre = $delPadre === null
            ? $padre
            : self::conArticulo($delPadre, false);
        return [
            'texto' => sprintf('%s orbita alrededor %s.', $nombre, $delPadre === null ? 'de ' . $padre : self::deCuerpo($delPadre)),
            'fuente' => (string) ($cuerpo['fuente'] ?? ''),
            'valor' => $nombrePadre,
            'sinDato' => false,
        ];
    }

    private static function articuloTipo(string $tipo): string
    {
        $mapa = [
            'estrella' => 'una estrella',
            'planeta' => 'un planeta',
            'planeta-enano' => 'un planeta enano',
            'satelite' => 'un satélite',
            'cinturon' => 'una región de cuerpos menores',
        ];
        return $mapa[$tipo] ?? 'un cuerpo del Sistema Solar';
    }
}

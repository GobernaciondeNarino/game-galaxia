<?php
/**
 * ORBIS — Ajustes editables desde el panel de wj-admin.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  POR QUÉ UN JSON Y NO REESCRIBIR wj-config.php
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Porque generar código PHP a partir de un formulario web es la forma más
 * corta de acabar ejecutando lo que escriba quien entre en el panel. Aunque se
 * escape bien hoy, basta un descuido futuro para convertir un campo de texto en
 * ejecución de código en el servidor.
 *
 * Aquí no se genera nada ejecutable: los valores van a un JSON, se leen con
 * json_decode y solo se aceptan las claves de una lista cerrada. Un valor
 * inesperado se descarta; uno con forma rara, también.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  QUIÉN GANA A QUIÉN
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   1º  ESTE ARCHIVO (lo que se guarda desde el panel)
 *   2º  variable de entorno de Plesk
 *   3º  wj-config.php
 *   4º  el valor por omisión del código
 *
 * El panel MANDA. Iba el último, y bastaba con rellenar wj-config.php —el paso
 * 1 de las instrucciones de instalación— para que el panel enseñara esos campos
 * bloqueados: un panel de administración que no podía administrar. El
 * razonamiento completo está en Config.php.
 *
 * A cambio, lo que queda debajo tiene que verse. Config::origenes() devuelve
 * TODOS los sitios donde hay un valor y el panel los enseña campo por campo. Si
 * no, cambiaríamos el «he cambiado la voz y suena igual» por el mismo silencio
 * en la otra dirección.
 *
 * La clave del panel NO se puede tocar desde el panel, a propósito: quien
 * entrase con la clave por omisión podría cambiarla y dejar fuera al
 * administrador de verdad. Se fija en Plesk o en wj-config.php y punto.
 *
 * Sintaxis compatible con PHP 7.4.
 */

declare(strict_types=1);

require_once __DIR__ . '/Config.php';

final class Ajustes
{
    /** Dónde se guarda. Fuera de data/ y assets/, que sí se sirven. */
    const ARCHIVO = 'ajustes/ajustes.json';

    /**
     * Lo único que el panel puede escribir, y cómo se valida cada cosa.
     *
     * Una lista cerrada, no «todo lo que llegue». Sin esto, un campo añadido al
     * formulario —o inventado por quien envíe la petición a mano— entraría
     * directo a la configuración del servidor.
     *
     *   tipo:    'clave'   secreto; el panel nunca lo devuelve, solo dice si está
     *            'texto'   cadena corta con formato comprobado
     *            'entero'  número dentro de un rango
     *   sinEsto: qué deja de funcionar mientras el campo esté vacío. Solo lo
     *            llevan los que de verdad hacen falta, y es lo que el panel
     *            lista arriba en «Lo que falta por configurar». Un campo sin
     *            esto es un ajuste fino: su valor por omisión ya vale.
     *   omision: el valor que usa ORBIS si el campo se deja vacío. El panel lo
     *            enseña como texto de ejemplo, para que un campo en blanco no
     *            parezca «sin valor» cuando en realidad hay uno en marcha.
     *            El valor de verdad vive en la llamada a Config, no aquí:
     *            tools/pruebas-config.php comprueba que los dos coinciden, que
     *            si no esto se convierte en una segunda copia que se desvía.
     */
    const CAMPOS = [
        'ELEVENLABS_API_KEY' => [
            'tipo' => 'clave', 'grupo' => 'voz',
            'etiqueta' => 'Clave de ElevenLabs',
            'ayuda' => 'elevenlabs.io → Profile → API Key. Necesita el permiso «text_to_speech».',
            'sinEsto' => 'ORBIS narra con la voz del navegador, que suena bastante peor.',
        ],
        'ELEVENLABS_VOICE_ID' => [
            'tipo' => 'texto', 'grupo' => 'voz', 'patron' => '/^[A-Za-z0-9]{0,40}$/',
            'etiqueta' => 'Voz de la narración',
            'ayuda' => 'Elige una y pruébala con el botón. Al cambiarla hay que vaciar la caché de audio, '
                . 'o las narraciones ya generadas seguirán sonando con la anterior.',
        ],
        'ELEVENLABS_MODEL_ID' => [
            'omision' => 'eleven_multilingual_v2',
            'tipo' => 'texto', 'grupo' => 'voz', 'patron' => '/^[a-z0-9_]{0,40}$/',
            'etiqueta' => 'Modelo de síntesis',
            'ayuda' => 'eleven_multilingual_v2 da la mejor prosodia en español.',
        ],
        'ELEVENLABS_STT_MODEL' => [
            'omision' => 'scribe_v1',
            'tipo' => 'texto', 'grupo' => 'voz', 'patron' => '/^[a-z0-9_]{0,40}$/',
            'etiqueta' => 'Modelo de transcripción',
            'ayuda' => 'Para el dictado por voz en navegadores sin reconocimiento propio.',
        ],
        'ANTHROPIC_API_KEY' => [
            'tipo' => 'clave', 'grupo' => 'asistente',
            'etiqueta' => 'Clave de Anthropic',
            'ayuda' => 'console.anthropic.com → Settings → API Keys. Sin ella el asistente no conversa.',
            'sinEsto' => 'El asistente no conversa: responde 503. Las preguntas del catálogo '
                . 'se siguen contestando.',
        ],
        'ORBIS_MODELO' => [
            'omision' => 'claude-opus-5',
            'tipo' => 'texto', 'grupo' => 'asistente', 'patron' => '/^[a-z0-9.\-]{0,60}$/',
            'etiqueta' => 'Modelo del asistente',
            'ayuda' => 'Vacío = el que trae ORBIS. Uno más pequeño gasta menos y responde algo peor. '
                . 'Los identificadores llevan GUIONES, no puntos: claude-sonnet-4-6, no claude-sonnet-4.6. '
                . 'Uno mal escrito no da error hasta que alguien pregunta algo; health.php?red=1 lo comprueba.',
        ],
        'LIMITE_GENERACIONES_HORA' => [
            'omision' => '30',
            'tipo' => 'entero', 'grupo' => 'gasto', 'min' => 0, 'max' => 10000,
            'etiqueta' => 'Narraciones nuevas por visitante y hora',
            'ayuda' => 'Las que ya están en caché no cuentan.',
        ],
        'LIMITE_TRANSCRIPCIONES_HORA' => [
            'omision' => '120',
            'tipo' => 'entero', 'grupo' => 'gasto', 'min' => 0, 'max' => 10000,
            'etiqueta' => 'Transcripciones por visitante y hora',
            'ayuda' => '',
        ],
        'LIMITE_CONVERSACION_HORA' => [
            'omision' => '60',
            'tipo' => 'entero', 'grupo' => 'gasto', 'min' => 0, 'max' => 10000,
            'etiqueta' => 'Respuestas del asistente por visitante y hora',
            'ayuda' => 'Es el más caro de los tres.',
        ],
        'TOPE_DIARIO_NARRACION' => [
            'omision' => '500',
            'tipo' => 'entero', 'grupo' => 'gasto', 'min' => 0, 'max' => 100000,
            'etiqueta' => 'Narraciones nuevas de TODO el sitio, al día',
            'ayuda' => 'Freno de emergencia, no objetivo de uso. Cero lo desactiva.',
        ],
        'TOPE_DIARIO_TRANSCRIPCION' => [
            'omision' => '1500',
            'tipo' => 'entero', 'grupo' => 'gasto', 'min' => 0, 'max' => 100000,
            'etiqueta' => 'Transcripciones de TODO el sitio, al día',
            'ayuda' => '',
        ],
        'TOPE_DIARIO_CONVERSACION' => [
            'omision' => '400',
            'tipo' => 'entero', 'grupo' => 'gasto', 'min' => 0, 'max' => 100000,
            'etiqueta' => 'Respuestas del asistente de TODO el sitio, al día',
            'ayuda' => '',
        ],
        // La sal es lo único de este grupo que no es un número, y estaba
        // solo en wj-config.php: quien configurara desde el panel no llegaba
        // a enterarse de que existe, y se quedaba con la de por omisión —la
        // misma en todas las instalaciones, que es como no tener ninguna—.
        // Se admiten los caracteres de base64 porque la forma de generarla
        // que documenta la plantilla los produce: head -c 32 … | base64.
        'ORBIS_SAL_LIMITES' => [
            'tipo' => 'clave', 'grupo' => 'gasto',
            'patron' => '/^[A-Za-z0-9._\-+\/=]{16,200}$/',
            'etiqueta' => 'Sal para anonimizar las direcciones IP',
            'ayuda' => 'Los topes cuentan por visitante, y se guarda un hash de la IP en vez de '
                . 'la IP. Sin una sal propia ese hash se deshace probando. Genera una con: '
                . 'head -c 32 /dev/urandom | base64',
            'sinEsto' => 'Los contadores por visitante usan la sal por omisión, la misma en '
                . 'todas las instalaciones: el hash de cada IP se puede deshacer probando.',
        ],
    ];

    /**
     * Voces candidatas en español, leídas del catálogo real de la cuenta.
     *
     * NO es la lista completa —hay 75 voces— sino las que encajan con lo que
     * ORBIS hace: narrar divulgación en español. Se filtraron por idioma «es» y
     * caso de uso `informative_educational` o `narrative_story`, que es lo que
     * ElevenLabs declara de cada una. Las descripciones son suyas, resumidas.
     *
     * Está aquí y no en un desplegable suelto porque el panel las ofrece Y el
     * botón de prueba las sintetiza: una sola lista evita que se pueda pedir la
     * prueba de una voz que el desplegable no ofrece.
     *
     * Cualquier otro identificador se puede escribir a mano: esto es un atajo,
     * no una cerradura.
     */
    const VOCES = [
        'gbTn1bmCvNgk0QEAVyfM' => 'Enrique M. Nieto — divulgación, acento mexicano. La única «informative_educational» en español',
        'J2Jb9yZNvpXUNAL3a2bw' => 'Yorman Andrés — colombiano, acento neutro, expresivo',
        '8mBRP99B2Ng2QwsJMFQl' => 'El Faraón 4 — grave, para documentales y audiolibros',
        'GTY55jD77hLBRrnQOhNk' => 'Ludovico — latinoamericano, grave y aterciopelado, narración épica',
        'RyfjEHnKbtma4Srae2za' => 'Juan Carlos — español de España, sereno y cálido',
        'PHKlYg202ODwQRa3Fxuo' => 'Julio — adulto, algo grave, pensada para narrar',
        'YqZLNYWZm98oKaaLZkUA' => 'Edoardo — contenido, medido, tono serio',
        '5z6tF6eAwkAluMyjDFJJ' => 'Alejo — latinoamericano, íntimo, como quien habla al lado',
        'oqO5cdAzjE5Ik5xWIZRL' => 'Iván — mayor, susurrante, tono de relato antiguo',
        'xf3Xv0R9rgFTExG0MVNo' => 'Jaime — joven, dicción precisa, cercano',
    ];

    /** @var array<string,string>|null */
    private static $cache = null;

    /** Ruta absoluta del archivo de ajustes. */
    public static function ruta(): string
    {
        return Config::contenido(self::ARCHIVO);
    }

    /**
     * ¿Se puede escribir el archivo de ajustes? Y si no, por qué.
     *
     * POR QUÉ SE COMPRUEBA ANTES Y NO SOLO AL GUARDAR
     * ───────────────────────────────────────────────
     * Porque el fallo llega tarde. Guardar solo falla DESPUÉS de haber
     * rellenado el formulario entero, y como los campos de clave salen siempre
     * vacíos, el reintento obliga a volver a pegar las dos claves. Sabiéndolo
     * al abrir el panel, se arregla el permiso primero y se rellena una vez.
     *
     * Es el fallo típico de un despliegue en Plesk: el «git pull» se hace con
     * un usuario y PHP corre con otro, así que wj-content/ajustes/ llega con
     * dueño equivocado y el panel guarda en el vacío.
     *
     * @return array{0:bool,1:string} [se puede, motivo si no]
     */
    public static function escribible(): array
    {
        return self::escribibleEn(self::ruta());
    }

    /**
     * Lo mismo, para una ruta cualquiera. Es una función pura y está separada
     * para poder probar los tres desenlaces sin tocar el archivo real del
     * servidor: existe y no se puede escribir, no existe la carpeta, y la
     * carpeta existe pero está cerrada.
     *
     * @return array{0:bool,1:string}
     */
    public static function escribibleEn(string $ruta): array
    {
        if (is_file($ruta)) {
            return is_writable($ruta)
                ? [true, '']
                : [false, 'el archivo existe pero PHP no puede escribirlo'];
        }

        $directorio = dirname($ruta);
        if (!is_dir($directorio)) {
            // El directorio se versiona con su .gitkeep justamente para que
            // exista tras un «git pull». Si falta, el despliegue se hizo por
            // FTP saltándose los archivos ocultos.
            return [false, 'la carpeta no existe'];
        }
        return is_writable($directorio)
            ? [true, '']
            : [false, 'la carpeta existe pero PHP no puede escribir dentro'];
    }

    /**
     * Lo que falta por configurar: los campos con «sinEsto» que no tienen
     * valor por ninguna de las tres vías.
     *
     * Se pregunta a Config, no a este archivo, porque un valor puesto en Plesk
     * o en wj-config.php TAMBIÉN cuenta como configurado. Listar como
     * pendiente algo que ya está resuelto arriba es la forma más rápida de que
     * el aviso deje de leerse.
     *
     * @return array<string,array> clave => definición del campo
     */
    public static function faltan(): array
    {
        $pendientes = [];
        foreach (self::CAMPOS as $clave => $campo) {
            if (!isset($campo['sinEsto'])) {
                continue;
            }
            $valor = Config::obtener($clave);
            if ($valor === null || $valor === '') {
                $pendientes[$clave] = $campo;
            }
        }
        return $pendientes;
    }

    /**
     * Lo guardado desde el panel. Nunca lanza: si el archivo no está, no se
     * puede leer o trae basura, se comporta como si estuviera vacío. Un panel
     * roto no puede tumbar el sitio.
     *
     * @return array<string,string>
     */
    public static function todos(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $ruta = self::ruta();
        $datos = is_readable($ruta) ? json_decode((string) file_get_contents($ruta), true) : null;
        if (!is_array($datos)) {
            $datos = [];
        }
        // Solo sobrevive lo que está en la lista cerrada, aunque el archivo se
        // haya editado a mano con otra cosa dentro.
        $limpio = [];
        foreach ($datos as $clave => $valor) {
            if (isset(self::CAMPOS[$clave]) && is_scalar($valor)) {
                $limpio[$clave] = (string) $valor;
            }
        }
        self::$cache = $limpio;
        return $limpio;
    }

    /** Un valor guardado desde el panel, o null si no lo hay. */
    public static function obtener(string $clave): ?string
    {
        $todos = self::todos();
        return isset($todos[$clave]) && $todos[$clave] !== '' ? $todos[$clave] : null;
    }

    /**
     * Valida un valor contra su definición. Devuelve el valor ya normalizado o
     * null si no encaja.
     *
     * @return array{0:bool,1:string,2:string} [válido, valor, motivo]
     */
    public static function validar(string $clave, string $valor): array
    {
        if (!isset(self::CAMPOS[$clave])) {
            return [false, '', 'ese ajuste no existe'];
        }
        $campo = self::CAMPOS[$clave];
        $valor = trim($valor);

        if ($campo['tipo'] === 'entero') {
            if ($valor === '') {
                return [true, '', ''];
            }
            // Se separan los dos motivos. Decir «tiene que ser un número
            // entero» ante un 99999999 es mentira —lo es— y manda a buscar el
            // problema donde no está. El tope de dígitos es solo para que no
            // llegue una cadena enorme a (int).
            if (preg_match('/^\d{1,9}$/', $valor) !== 1) {
                return [false, '', 'tiene que ser un número entero, sin signos ni separadores'];
            }
            $n = (int) $valor;
            if ($n < $campo['min'] || $n > $campo['max']) {
                return [false, '', sprintf('tiene que estar entre %d y %d', $campo['min'], $campo['max'])];
            }
            return [true, (string) $n, ''];
        }

        if ($campo['tipo'] === 'clave') {
            // Las claves de API no tienen un formato público estable, así que
            // solo se comprueba lo que sí se sabe: que no traiga espacios ni
            // saltos de línea —el error de copiar y pegar de siempre— y que
            // tenga una longitud sensata. Un campo puede traer su propio
            // patrón: la sal se genera en base64 y lleva «+/=».
            if ($valor === '') {
                return [true, '', ''];
            }
            $patron = $campo['patron'] ?? '/^[A-Za-z0-9._\-]{16,200}$/';
            if (preg_match($patron, $valor) !== 1) {
                return [false, '', 'no vale: revisa que no se haya colado un espacio y que tenga al menos 16 caracteres'];
            }
            return [true, $valor, ''];
        }

        if ($valor !== '' && preg_match($campo['patron'], $valor) !== 1) {
            return [false, '', 'tiene caracteres que no se admiten'];
        }
        return [true, $valor, ''];
    }

    /**
     * Guarda el conjunto entero. Solo entra lo que valida.
     *
     * Se escribe a un temporal y se renombra: si el disco se llena o PHP muere
     * a mitad, el archivo anterior sigue entero en lugar de quedar truncado y
     * dejar el sitio sin configuración.
     *
     * @param  array<string,string> $valores
     * @return array{0:bool,1:array<string,string>} [guardado, errores por campo]
     */
    public static function guardar(array $valores): array
    {
        $limpio = self::todos();
        $errores = [];

        foreach ($valores as $clave => $valor) {
            if (!isset(self::CAMPOS[$clave])) {
                continue;   // Silencio: un campo inventado no es un error del usuario.
            }
            [$ok, $normalizado, $motivo] = self::validar($clave, (string) $valor);
            if (!$ok) {
                $errores[$clave] = $motivo;
                continue;
            }
            if ($normalizado === '') {
                unset($limpio[$clave]);
            } else {
                $limpio[$clave] = $normalizado;
            }
        }

        if ($errores !== []) {
            return [false, $errores];
        }

        $directorio = dirname(self::ruta());
        if (!is_dir($directorio) && !@mkdir($directorio, 0775, true) && !is_dir($directorio)) {
            return [false, ['_' => 'no se pudo crear ' . $directorio]];
        }

        $temporal = self::ruta() . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $json = json_encode($limpio, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (@file_put_contents($temporal, $json, LOCK_EX) === false || !@rename($temporal, self::ruta())) {
            @unlink($temporal);
            return [false, ['_' => 'no se pudo escribir ' . self::ruta() . ' (revisa permisos)']];
        }
        @chmod(self::ruta(), 0640);

        self::$cache = $limpio;
        return [true, []];
    }

    /** Los campos agrupados como los enseña el panel. */
    public static function porGrupo(): array
    {
        $grupos = [];
        foreach (self::CAMPOS as $clave => $campo) {
            $grupos[$campo['grupo']][$clave] = $campo;
        }
        return $grupos;
    }
}

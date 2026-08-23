<?php
/**
 * ORBIS — Contrasta la voz configurada con el catálogo real de ElevenLabs.
 *
 * FUERA DE LA LISTA OBLIGATORIA, como tools/verificar-horizons.php: sale a
 * internet y necesita una clave, y una prueba que depende de las dos cosas
 * acaba sin ejecutarse nunca.
 *
 * POR QUÉ HACE FALTA
 * ──────────────────
 * ORBIS llevaba meses narrando con «Marshal - Toon Character»: un personaje de
 * dibujos animados, en INGLÉS, acento americano, con style 0,78 y speed 1,2.
 * Nada lo delataba. La síntesis funcionaba, el audio llegaba con su HTTP 200,
 * la caché lo guardaba y el diagnóstico daba verde. El único síntoma era el
 * sonido, y el sonido no lo mira ninguna prueba.
 *
 * Esto pregunta a ElevenLabs QUÉ ES la voz que está configurada y avisa si no
 * encaja con lo que ORBIS hace: narrar divulgación en español.
 *
 *   php tools/verificar-voz.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../wj-includes/lib/Config.php';
require_once __DIR__ . '/../wj-includes/lib/Ajustes.php';

/** Casos de uso que encajan con narrar una interfaz de divulgación. */
const USOS_BUENOS = ['informative_educational', 'narrative_story'];

/** Los que no encajan, con el motivo. */
const USOS_MALOS = [
    'characters_animation' => 'es una voz de personaje de dibujos animados',
    'social_media'         => 'está pensada para redes sociales, no para narrar',
    'advertisement'        => 'está pensada para publicidad, con entonación de anuncio',
];

$clave = Config::obtener('ELEVENLABS_API_KEY');
if ($clave === null || $clave === '') {
    fwrite(STDERR, "\n✘ No hay ELEVENLABS_API_KEY configurada. Nada que contrastar.\n\n");
    exit(2);
}

$voz = (string) Config::obtener('ELEVENLABS_VOICE_ID', Config::VOZ_PREDETERMINADA);
$origen = Config::origen('ELEVENLABS_VOICE_ID') ?? 'valor fijado en Config.php';

printf("\n▸ Voz configurada: %s  (origen: %s)\n\n", $voz, $origen);

$ch = curl_init('https://api.elevenlabs.io/v1/voices/' . rawurlencode($voz));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 25,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_HTTPHEADER     => ['xi-api-key: ' . $clave],
]);
$cuerpo = curl_exec($ch);
$codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($codigo === 401) {
    fwrite(STDERR, "✘ La clave no vale, o no tiene permiso para leer el catálogo de voces.\n\n");
    exit(1);
}
if ($codigo === 404) {
    fwrite(STDERR, "✘ Esa voz NO EXISTE en la cuenta. ORBIS narrará con la voz del navegador.\n\n");
    exit(1);
}
if ($codigo !== 200) {
    fwrite(STDERR, sprintf("✘ ElevenLabs respondió HTTP %d.\n\n", $codigo));
    exit(1);
}

$v = json_decode((string) $cuerpo, true);
$etiquetas = $v['labels'] ?? [];
$idioma = (string) ($etiquetas['language'] ?? '');
$uso = (string) ($etiquetas['use_case'] ?? '');
$ajustes = $v['settings'] ?? [];

printf("  nombre      %s\n", $v['name'] ?? '?');
printf("  idioma      %s\n", $idioma !== '' ? $idioma : 'no declarado');
printf("  uso         %s\n", $uso !== '' ? $uso : 'no declarado');
printf("  perfil      %s · %s\n", $etiquetas['gender'] ?? '?', $etiquetas['age'] ?? '?');
if ($ajustes !== []) {
    printf("  ajustes     style %s · speed %s\n", $ajustes['style'] ?? '—', $ajustes['speed'] ?? '—');
}
printf("  descripción %s\n\n", substr(str_replace("\n", ' ', (string) ($v['description'] ?? '—')), 0, 150));

$problemas = [];

if ($idioma !== '' && $idioma !== 'es') {
    $problemas[] = sprintf(
        'está declarada en «%s», no en español. Con eleven_multilingual_v2 hablará '
            . 'español, pero con la entonación y el acento de ese idioma',
        $idioma
    );
}
if (isset(USOS_MALOS[$uso])) {
    $problemas[] = USOS_MALOS[$uso];
} elseif ($uso !== '' && !in_array($uso, USOS_BUENOS, true)) {
    $problemas[] = sprintf('su uso declarado es «%s», que no es narrar', $uso);
}
if (isset($ajustes['style']) && (float) $ajustes['style'] > 0.5) {
    $problemas[] = sprintf('trae style %s: demasiado interpretada para divulgación', $ajustes['style']);
}
if (isset($ajustes['speed']) && (float) $ajustes['speed'] > 1.1) {
    $problemas[] = sprintf('trae speed %s: habla más rápido de lo que conviene leer datos', $ajustes['speed']);
}

if ($problemas === []) {
    echo "✔ Encaja con lo que ORBIS necesita: narración de divulgación en español.\n\n";
    exit(0);
}

echo "✘ Esta voz NO encaja con lo que ORBIS hace:\n";
foreach ($problemas as $p) {
    echo "    · " . $p . "\n";
}
echo "\n  Candidatas en español que sí encajan (también en el panel de wj-admin,\n";
echo "  con un botón para oírlas):\n\n";
foreach (Ajustes::VOCES as $id => $descripcion) {
    printf("    %s  %s\n", $id, $descripcion);
}
echo "\n";
exit(1);

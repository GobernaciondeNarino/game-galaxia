<?php
/**
 * Plantilla de credenciales de ORBIS.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  CÓMO USARLA
 *  1. Copia este archivo a  config/secrets.php  EN EL SERVIDOR.
 *  2. Rellena los valores.
 *  3. Comprueba que devuelve 403:  https://tu-dominio/config/secrets.php
 *
 *  config/secrets.php está en .gitignore y bloqueado por config/.htaccess.
 *  NUNCA lo subas al repositorio ni lo copies a ninguna carpeta servida.
 *
 *  MEJOR AÚN: define ELEVENLABS_API_KEY como variable de entorno en el panel
 *  de Plesk (Dominios → PHP → Variables de entorno). api/tts.php la busca
 *  primero ahí y solo recurre a este archivo si no la encuentra. Así la clave
 *  no toca el disco del sitio.
 * ────────────────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

return [
    // Clave de la API de ElevenLabs (https://elevenlabs.io → Profile → API Key).
    'ELEVENLABS_API_KEY' => '',

    // Voz por defecto de la narración en español.
    // Consulta los ids disponibles en https://api.elevenlabs.io/v1/voices
    'ELEVENLABS_VOICE_ID' => '',

    // Modelo de síntesis. eleven_multilingual_v2 da la mejor prosodia en español.
    'ELEVENLABS_MODEL_ID' => 'eleven_multilingual_v2',

    // Límite de generaciones NUEVAS por IP y hora (las cacheadas no cuentan).
    'LIMITE_GENERACIONES_HORA' => 30,
];

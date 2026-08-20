# Despliegue de ORBIS en Plesk

Guía completa para publicar ORBIS en un hosting Plesk con Apache y PHP, sin
Node.js en el servidor, sin acceso root y sin procesos en segundo plano.

---

## 1. Requisitos del servidor

| Requisito | Valor | Cómo comprobarlo |
|---|---|---|
| PHP | 8.1 o superior | Plesk → *Dominios* → **Configuración de PHP** |
| Extensión `curl` | activada | `api/health.php` la comprueba |
| Extensión `json` | activada | idem |
| Extensión `openssl` | activada | idem |
| `allow_url_fopen` | no es necesario | ORBIS usa `curl`, no `file_get_contents` remoto |
| Módulos de Apache | `mod_rewrite`, `mod_headers`, `mod_deflate` (y `mod_brotli` si está) | Plesk → *Apache y nginx* |
| Certificado SSL | válido y activo | **Imprescindible**: sin HTTPS no hay cámara ni micrófono |

> **Si el servidor está en PHP 7.4:** el código de `api/` está escrito con
> sintaxis compatible con 7.4 a propósito, así que arrancará. Aun así, PHP 7.4
> lleva sin soporte de seguridad desde noviembre de 2022 y **no se da soporte a
> esa configuración**. Sube a 8.1+ desde el propio panel de Plesk antes de
> publicar: es un desplegable, no requiere migración de código.

---

## 2. Preparar el paquete antes de subirlo

Las copias locales de las librerías y las tipografías se generan en tu equipo,
no en el servidor. En una carpeta de trabajo con Node.js instalado:

```bash
node tools/vendor.mjs three       # vendor/three/  (~450 kB)
node tools/vendor.mjs fuentes     # assets/fonts/  (~140 kB) + css/fuentes.css
node tools/vendor.mjs mediapipe   # vendor/mediapipe/ + assets/models/ (~15 MB)
node tools/csp-hash.mjs           # sincroniza el hash CSP del importmap
```

Comprueba que no se cuela ninguna credencial:

```bash
bash tools/comprobar-secretos.sh
```

---

## 3. Subir los archivos

Destino: la raíz del documento del dominio, normalmente
`/var/www/vhosts/<dominio>/httpdocs/`.

### Opción A — Git (recomendada)

Plesk → *Dominios* → **Git** → *Añadir repositorio*:

- URL: `https://github.com/GobernaciondeNarino/game-galaxia.git`
- Rama: la que corresponda
- Ruta de despliegue: `httpdocs`
- Modo: *Despliegue automático*

`vendor/` y `assets/fonts/` están versionados, así que llegan con el repositorio.
`assets/models/hand_landmarker.task` **no** lo está (7,5 MB): súbelo por FTP.

### Opción B — FTP / Administrador de archivos

Sube **todo** el árbol respetando la estructura. Comprueba especialmente que
llegan los archivos ocultos, que muchos clientes FTP esconden por omisión:

```
.htaccess          config/.htaccess          cache/.htaccess
api/lib/.htaccess  api/logs/.htaccess
```

**Si `.htaccess` no llega, la página funciona pero queda sin HTTPS forzado, sin
CSP y con `config/` accesible.** Es el error de despliegue más frecuente.

---

## 4. Permisos

```bash
# Lectura para todo el sitio
find httpdocs -type d -exec chmod 755 {} \;
find httpdocs -type f -exec chmod 644 {} \;

# Escritura para la caché de audio y los registros
chmod 775 httpdocs/cache/audio httpdocs/api/logs
```

El propietario debe ser el usuario del suscriptor de Plesk (habitualmente el
mismo con el que corre PHP-FPM). Desde el *Administrador de archivos* de Plesk
esto ya se respeta; por FTP con otro usuario, no siempre.

Verificación rápida: `api/health.php` marca `cache_audio` en verde solo si la
carpeta es realmente escribible por PHP.

---

## 5. La clave de ElevenLabs

### Recomendado: variable de entorno

Plesk → *Dominios* → **Configuración de PHP** → *Variables de entorno*:

| Nombre | Valor |
|---|---|
| `ELEVENLABS_API_KEY` | tu clave |
| `ELEVENLABS_VOICE_ID` | id de la voz en español elegida |

Así la clave no toca el disco del sitio y no puede filtrarse por una regla de
Apache mal escrita.

> Con PHP-FPM puede hacer falta reiniciar el *pool* del dominio para que las
> variables se apliquen (Plesk lo ofrece en la misma pantalla).

### Alternativa: `config/secrets.php`

```bash
cp config/secrets.example.php config/secrets.php
# edita config/secrets.php y rellena los valores
chmod 640 config/secrets.php
```

Después **comprueba que está bloqueado**:

```
https://tu-dominio/config/secrets.php   →  debe devolver 403
```

Si devuelve una página en blanco o el contenido del archivo, detén el despliegue
y revisa `config/.htaccess` y que `AllowOverride` esté habilitado.

---

## 6. Prueba de humo

En este orden:

1. **`https://tu-dominio/api/health.php`**
   Debe devolver JSON con `"estado": "ok"` o `"aviso"`. Cualquier `"error"`
   aparece detallado en `comprobaciones`.

2. **`https://tu-dominio/api/health.php?red=1`**
   Añade la prueba de conectividad y de validez de la clave con ElevenLabs.

3. **`http://tu-dominio/`** (sin la ese)
   Debe redirigir a `https://` con un 301.

4. **`https://tu-dominio/config/secrets.php`** → 403
   **`https://tu-dominio/cache/audio/`** → 403

5. **`https://tu-dominio/`**
   La pantalla de arranque debe mostrar todos los chequeos en verde o ámbar.
   Uno solo en rojo impide continuar.

6. **Consola del navegador (F12).** Cero errores. En particular, ningún
   `Failed to load module script: … MIME type of "text/plain"`.

7. **Pestaña Red.** `three.module.min.js` debe llegar con
   `content-encoding: br` (o `gzip`) y `cache-control: …immutable`.

---

## 7. Resolución de problemas

| Síntoma | Causa habitual | Solución |
|---|---|---|
| `Failed to load module script … MIME type of "text/plain"` | Apache no reconoce `.js` o `.mjs` | Falta `.htaccess`, o `AllowOverride None`. Pide a soporte `AllowOverride All` en el vhost |
| `Failed to resolve module specifier "three"` | `/vendor/three/` no llegó al servidor | Vuelve a subir la carpeta completa |
| La pantalla de arranque se queda en «Comprobando datos del sistema» | `data/sistema-solar.json` no legible o con JSON inválido | Revisa permisos (644) y valida el JSON |
| `cache_audio: escritura denegada` | Propietario o permisos incorrectos | `chmod 775 cache/audio` con el propietario correcto |
| El navegador bloquea el importmap (`Refused to execute inline script`) | El hash de la CSP no coincide con `index.html` | `node tools/csp-hash.mjs` y vuelve a subir `.htaccess` |
| La cámara no arranca | Sin HTTPS, o falta `Permissions-Policy` | Activa el certificado; comprueba que `.htaccess` llegó |
| El modelo de manos da 404 | `hand_landmarker.task` no subido (no está en git) | `node tools/vendor.mjs mediapipe` y súbelo por FTP |
| Error 500 en `api/*.php` | Versión de PHP o extensión ausente | Mira el registro de errores del dominio en Plesk |

### Registros

- Errores de PHP: Plesk → *Dominios* → **Registros**.
- Errores propios de ORBIS: `api/logs/` (no accesible por HTTP).

---

## 8. Actualizar una instalación existente

```bash
git pull                       # o vuelve a subir por FTP
node tools/csp-hash.mjs        # si tocaste el importmap
```

`js/`, `css/` y `data/` se sirven con `no-cache, must-revalidate`, así que los
cambios se ven sin vaciar la caché del navegador. `vendor/` y `assets/` van con
caché de un año: si cambias una textura, cambia también su nombre de archivo.

**Nunca hace falta borrar `cache/audio/`** salvo que edites el texto de una
narración: el nombre de cada MP3 es el hash del texto, la voz y el modelo, de
modo que un texto nuevo genera un archivo nuevo y el antiguo queda huérfano.
Un borrado periódico de huérfanos es opcional.

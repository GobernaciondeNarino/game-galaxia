# ORBIS · Interfaz Galáctica del Sistema Solar

Interfaz holográfica e inmersiva del Sistema Solar completo, con navegación por
**gestos de mano**, **comandos de voz** y **narración en audio**. Se ejecuta
íntegramente en el navegador y se despliega como estáticos sobre Apache: **sin
paso de compilación, sin Node.js en producción y sin procesos en segundo plano**.

> **Estado: fases 0 a 4 completadas.** Escena tridimensional navegable con el
> Sol, los ocho planetas, cinco planetas enanos, diecinueve satélites, anillos,
> cinturones y entorno galáctico; catálogo cuyas cifras proceden de JPL
> Horizons; HUD completa en DOM con sus dos vistas, transición interrumpible,
> anotaciones ancladas a la superficie y arco de datos; y narración por audio
> con subtítulos sincronizados. Quedan los gestos (fase 6) y la voz (fase 7).
> Consulta el [plan de fases](#plan-de-fases).

---

## Puesta en marcha

Necesitas PHP para probar `api/`; para el frontend basta cualquier servidor
estático.

```bash
git clone https://github.com/GobernaciondeNarino/game-galaxia.git
cd game-galaxia

# Copias locales de Three.js y de las tipografías (solo la primera vez)
node tools/vendor.mjs three
node tools/vendor.mjs fuentes

# Modelo de MediaPipe, ~7,5 MB (necesario a partir de la fase 6)
node tools/vendor.mjs mediapipe

# Servidor de desarrollo, equivalente a lo que hará Apache
php -S localhost:8080
```

Abre <http://localhost:8080>. Verás la pantalla de arranque con el diagnóstico
del entorno. Con `?debug=1` se activa el registro detallado en consola.

Comprobación del backend: <http://localhost:8080/api/health.php>
(añade `?red=1` para probar además la conectividad con ElevenLabs).

---

## Versiones fijadas

| Dependencia | Versión | Por qué esa |
|---|---|---|
| **Three.js** | `r0.184.0` | Es la última versión cuya superficie de API está verificada contra este código. `WebGLRenderer`, `EffectComposer`, `UnrealBloomPass`, `OutputPass`, `Lensflare` y `CSS2DRenderer` se comportan como espera ORBIS. Se descarta la rama r0.185, publicada después, para no arrastrar cambios de API no verificados a mitad de proyecto. La compilación minificada pesa **356 kB** (≈90 kB con Brotli). |
| **MediaPipe Tasks Vision** | `0.10.35` | Última de la línea `0.10.x`, la que usa la API `FilesetResolver.forVisionTasks()` + `HandLandmarker.createFromOptions()` documentada y estable. La línea `1.0.x` es posterior y reestructura el paquete; migrar a ella es trabajo de la fase 6, no una suposición de partida. |
| **PHP** | `8.1+` | El código de `api/` se escribe en sintaxis compatible con 7.4 para que funcione también en instalaciones de Plesk sin migrar, pero solo se da soporte a 8.1+. Ver `docs/DESPLIEGUE-PLESK.md`. |

Ambas librerías se sirven desde `/vendor`, **nunca desde un CDN de terceros**.
`tools/vendor.mjs` las descarga en desarrollo y resuelve por sí solo los
imports internos de cada addon de Three.js.

---

## Arquitectura

```
index.html          Cáscara: importmap, precargas y contenedores de la HUD
.htaccess           HTTPS, MIME, compresión, caché, CSP y rutas privadas
css/                fuentes · nucleo (reinicio + fichas de diseño) · hud
                    animaciones · responsive
js/
  main.js           Arranque
  core/             App (estado y bus) · Diagnostico · SceneManager · PostFX
                    CameraRig · Loop
  system/           SolarSystem · CelestialBody · Orbit · Sun · Rings
                    AsteroidBelt · Galaxy
  ui/               HUD · panels/ · Reticle · Subtitles
  input/            HandTracking · GestureRecognizer · VoiceCommands
                    FallbackControls
  audio/            Narrator · SFX
  utils/            dom · storage (memoria) · debug · math
data/               sistema-solar.json (GENERADO, catálogo maestro)
                    fisica-jpl.json (GENERADO desde Horizons)
                    complementos.json · textos.json · comandos-voz.json
assets/             textures · skybox · models · fonts · sfx
api/                health.php · tts.php · stt.php · lib/
config/             secrets.example.php (la copia real nunca se versiona)
cache/audio/        MP3 generados, con nombre por hash
vendor/             Three.js y MediaPipe, versión fijada
tools/              vendor.mjs · texturas.mjs · datos-jpl.mjs
                    construir-datos.mjs · contraste.mjs · csp-hash.mjs
                    comprobar-secretos.sh
docs/               Despliegue, gestos y comandos, notas técnicas
```

### Decisiones técnicas

**Sin empaquetador, por obligación y por conveniencia.** El destino es un Plesk
sin Node.js. El `importmap` de `index.html` resuelve los especificadores
desnudos (`three`, `three/addons/…`) contra `/vendor`, así que el mismo código
que se edita es el que se despliega: no hay *source maps* ni un artefacto
compilado que pueda divergir del fuente.

**Un solo objeto global: `App`.** Vive en `js/core/App.js` y hace de estado de
sesión y bus de eventos. Los subsistemas no se conocen entre sí; se comunican
emitiendo y escuchando eventos (`estado:cuerpoActivo`, `voz:comando`…). Es lo
que permite que un cuerpo seleccionado por gesto, por voz o con el ratón siga
exactamente el mismo camino.

**La HUD es DOM, no textura.** Texto real, seleccionable, accesible a lectores
de pantalla y navegable con Tab. Una HUD dibujada en una textura 3D se ve mejor
en capturas y es inutilizable para quien no ve la pantalla.

**Funciona en cualquier ruta.** Todas las rutas internas —incluidas las del
`importmap`— son relativas al directorio de la aplicación, y `js/utils/rutas.js`
deduce la raíz de la URL de su propio módulo. ORBIS se puede servir tanto en
`https://ejemplo.gov.co/` como en `https://ejemplo.gov.co/juegos/orbis/` sin
cambiar una línea. Ver `docs/DESPLIEGUE-PLESK.md` §3 bis.

**Los errores dicen de quién es el problema.** El diagnóstico de arranque
distingue un fallo del navegador (WebGL desactivado) de un fallo del despliegue
(falta `vendor/`, MIME mal configurado, PHP apagado) y, en el segundo caso,
muestra la ruta exacta que falta y el comando para arreglarlo. Nunca anuncia
«tu navegador no puede» cuando lo que falla es el servidor.

**Ninguna cifra se escribe a mano.** El catálogo se genera con
`tools/datos-jpl.mjs`, que consulta la API de JPL Horizons y guarda, junto a
cada valor, la línea literal de la que se extrajo. Lo que Horizons no publica
—el radio de Eris, por ejemplo— se toma de literatura citada en
`data/complementos.json`. Lo que no está en ninguna de las dos vale `null` y la
interfaz lo muestra como `SIN DATOS`. Ver `docs/DATOS.md`.

**Órbitas keplerianas reales.** Cada cuerpo se sitúa resolviendo la ecuación de
Kepler con sus seis elementos orbitales referidos a J2000. Si el reloj de la
escena marca una fecha, los planetas están donde estaban ese día — no en una
fase decorativa.

**Accesibilidad comprobada, no supuesta.** `tools/contraste.mjs` calcula la
relación de contraste WCAG de cada pareja texto/fondo de las fichas de diseño y
falla el *push* si alguna baja de 4,5:1. En una interfaz oscura con paneles
translúcidos es facilísimo dejar texto a 2,7:1 que se lee bien en el monitor de
quien lo programó; de hecho pasó, y el verificador lo cazó.

**Estado en memoria, nunca en `localStorage`.** Las preferencias
(`js/utils/storage.js`) duran lo que dure la pestaña. No se deja rastro en el
equipo del visitante.

**Rejilla persistente.** Los paneles laterales y las barras se maquetan una vez
y no se recrean al alternar entre `VISTA DE SISTEMA` y `VISTA DE CUERPO`: solo
cambia el contenido de la zona central. Por eso la transición no parpadea.

### Estrategia de rendimiento en red

El público accederá desde conexiones locales de velocidad desigual, así que la
carga se ha diseñado como un requisito, no como un ajuste posterior:

1. **Un único origen.** Cero peticiones a CDN: sin DNS, sin *handshake* TLS
   adicional, sin depender de que un tercero esté accesible desde la red del
   visitante.
2. **Compresión en Apache.** Brotli con respaldo a gzip para HTML, CSS, JS y
   JSON (`.htaccess` §3). Three.js baja de 356 kB a unos 90 kB.
3. **Caché inmutable de un año** para `vendor/`, tipografías, texturas, modelos
   y audio; revalidación obligatoria para `js/`, `css/` y `data/`, de modo que
   se pueda corregir sin pedir a nadie que vacíe la caché.
4. **Tipografías recortadas.** Solo los subconjuntos `latin` y `latin-ext`, y
   Oswald en su versión variable: 140 kB en total en lugar de casi 400 kB.
5. **Precarga de la ruta crítica** (`preload` de tipografías y datos,
   `modulepreload` de `main.js` y Three.js) para adelantar las peticiones sin
   esperar a que el analizador de CSS las descubra.
6. **Texturas por niveles** (fase 2): primero una versión de 512 px para que la
   escena sea navegable de inmediato y, solo al enfocar un cuerpo, la de 2K.
7. **Progreso real en el arranque**, medido con el `LoadingManager` de Three.js.
   Nunca una barra simulada.
8. **Audio de narración cacheado en el servidor** y precargado únicamente para
   el cuerpo activo y sus dos vecinos en la tira de navegación.

---

## Seguridad

- **Ninguna credencial llega al navegador.** La clave de ElevenLabs se lee de la
  variable de entorno `ELEVENLABS_API_KEY` de Plesk o, en su defecto, de
  `config/secrets.php`, que está en `.gitignore` y bloqueado por `.htaccess`.
- **`api/tts.php` no acepta texto del cliente.** Recibe un `bodyId`, y el texto
  que sintetiza lo toma de su propia copia de `data/sistema-solar.json`. Un
  endpoint que sintetizara el texto recibido sería una pasarela gratuita hacia
  una API de pago a costa del titular de la cuenta; así, el conjunto de textos
  posibles es finito, conocido y cacheable, y el gasto está acotado.
- Límite de generaciones **nuevas** por IP; servir de caché y precargar no
  consumen cupo. Verificación TLS obligatoria en las llamadas salientes. La
  respuesta cruda de ElevenLabs va al registro, nunca al cliente.
- **CSP sin `unsafe-inline` en los scripts.** El único bloque en línea es el
  `importmap` —los navegadores no admiten import maps externos—, autorizado por
  su hash SHA-256. Si lo modificas, ejecuta `node tools/csp-hash.mjs`.
- `tools/comprobar-secretos.sh` rastrea credenciales en todo lo que se sirve al
  navegador y se ejecuta en cada *push*.

---

## Plan de fases

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Estructura, `index.html` con importmap, `.htaccess`, `api/health.php`, documentación inicial | ✅ Completada |
| 1 | Escena Three.js: Sol, ocho planetas, órbitas, skybox, controles de ratón, bloom | ✅ Completada |
| 2 | `sistema-solar.json` con datos verificados, satélites, anillos y cinturón de asteroides | ✅ Completada |
| 3 | HUD en DOM: elementos persistentes, `VISTA DE SISTEMA`, gráficos y tira de navegación | ✅ Completada |
| 4 | `VISTA DE CUERPO`, transición interrumpible, `CameraRig`, anotaciones y arco de datos | ✅ Completada |
| 5 | `api/tts.php` con caché y límite de peticiones; `Narrator.js` con subtítulos | ✅ Completada |
| 6 | Control por manos con MediaPipe y todos los gestos | Pendiente |
| 7 | Control por voz con parser de intenciones y alternativa vía `stt.php` | Pendiente |
| 8 | Optimización, pruebas cruzadas de navegador y guía de despliegue | Pendiente |

---

## Documentación

- [`docs/DESPLIEGUE-PLESK.md`](docs/DESPLIEGUE-PLESK.md) — subida, permisos,
  variables de entorno y prueba de humo.
- [`docs/GESTOS-Y-COMANDOS.md`](docs/GESTOS-Y-COMANDOS.md) — referencia para la
  persona que usa la interfaz.
- [`docs/DATOS.md`](docs/DATOS.md) — esquema del catálogo y política de rigor.

## Licencia y créditos

Código de ORBIS: Gobernación de Nariño.
Three.js (MIT), MediaPipe Tasks Vision (Apache-2.0), Oswald y Hind Madurai
(SIL OFL 1.1) y la skill `ui-ux-pro-max` (MIT) conservan sus respectivas
licencias en `vendor/`, `assets/fonts/` y `.claude/skills/`.

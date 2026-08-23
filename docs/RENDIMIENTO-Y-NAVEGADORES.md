# Rendimiento y compatibilidad

Resultados de la fase 8. Todo lo que aparece aquí está medido, no estimado; lo
que no se ha podido medir se dice expresamente.

---

## 1. Qué se descarga al abrir la página

Medido en Chromium con la caché vacía, contando cada recurso una vez, hasta que
la aplicación se declara cargada.

| Recurso | Peso | Notas |
|---|---|---|
| `three.module.min.js` + `three.core.min.js` | 732 kB | ≈ 190 kB con Brotli |
| Texturas, **nivel ligero** | 718 kB | 33 archivos de 512 px |
| Código de ORBIS | 407 kB | 50 módulos, sin minimizar |
| Texturas, resolución completa | 253 kB | el cielo estrellado y el cuerpo inicial |
| Datos (JSON) | 242 kB | ≈ 30 kB con Brotli |
| Addons de Three.js | 104 kB | OrbitControls, post-procesado, CSS2D |
| Hojas de estilo | 96 kB | |
| Tipografías (`woff2`) | 56 kB | solo subconjuntos `latin` y `latin-ext` |
| **Total hasta poder navegar** | **2,56 MB** | 115 recursos |

> Con `php -S` salen 145 peticiones para esos 115 recursos: el servidor de
> desarrollo no manda cabeceras de caché, así que el navegador vuelve a pedir la
> textura ligera que ya tiene cuando la piden a la vez la esfera y su miniatura
> de la tira. En producción no pasa: el `.htaccess` marca las imágenes como
> `immutable`.

**Lo que NO se descarga al abrir:**

- los mapas en resolución completa (42 MB en total): solo el del cuerpo que
  se enfoca;
- los modelos de manos (7,8 MB) y de rostro (3,8 MB) y el WASM de MediaPipe
  (22 MB): solo si se enciende la cámara. El de rostro se carga después del de
  manos y solo sirve para distinguir un guiño de un parpadeo; si falla, se avisa
  y el control por manos sigue funcionando igual;
- el audio de las narraciones: solo el del cuerpo activo y sus dos vecinos.

Sin el nivel de detalle de las texturas, el arranque descargaría los **42 MB**
de los mapas completos en lugar de 718 kB.

El nivel ligero estuvo roto sin que se notara. `tools/texturas.mjs` le pedía a
la API de Commons una miniatura de 512 px y la API respondía «thumbwidth: 512»
acompañada de una URL que apunta a la de 960, porque Wikimedia redondea a sus
tamaños en caché. Los 35 archivos «@512» medían en realidad 960 px y pesaban
3,53 MB entre todos, casi lo mismo que los completos: el nivel que existe para
que la escena sea navegable de inmediato no aligeraba nada. Ahora se derivan en
local del archivo completo con `tools/reducir-textura.php`, miden de verdad 512
px y pesan 836 kB en disco. La carga inicial bajó de 5,24 MB a 2,56 MB.

---

## 2. Nivel de detalle de las texturas

Cada textura existe en dos tamaños, generados por `tools/texturas.mjs`:

```
jupiter@512.jpg     18 kB   se carga en el arranque
jupiter.jpg        487 kB   se carga al enfocar Júpiter
```

El nivel ligero siempre es `.jpg`, aunque el completo no lo sea: lo produce GD
recodificando. Un PNG de 512 px de una fotografía pesa cinco veces más que el
JPEG equivalente y a ese tamaño no se distingue. Es lo que pasaba con Titán, el
único mapa del catálogo que es un PNG.

El intercambio ocurre durante el viaje de cámara, que dura más de un segundo,
así que no se percibe. La textura reducida se libera **solo cuando la nueva ya
está en la GPU**, de modo que no hay un fotograma con el cuerpo en gris.

Verificado: tras recorrer los 33 cuerpos dos veces, el recuento de texturas de
Three.js sube de 33 a 34 y ahí se queda. Los intercambios liberan lo anterior.

---

## 3. Fugas de recursos

La prueba recorre el catálogo completo dos veces (70 selecciones), vuelve a la
vista general y alterna 65 veces entre escala didáctica y real.

| Recuento | Inicio | Final | Diferencia |
|---|---|---|---|
| Geometrías | 71 | 76 | +5, y se estabiliza |
| Texturas | 33 | 34 | +1 |
| Programas de shader | 28 | 28 | 0 |
| Nodos del DOM | 867 | 893 | +26, y se estabiliza |

El crecimiento se detiene: es la subida a la GPU de la geometría que solo se ve
en escala real, no una fuga. Un aumento proporcional al número de interacciones
sí lo sería.

---

## 4. Fotogramas por segundo

**Las cifras de fps del entorno de pruebas no son representativas.** El
contenedor de integración renderiza por software (SwiftShader) y da entre 1 y 3
fps; una tarjeta gráfica real no tiene nada que ver. Lo que sí se ha verificado
es que el sistema de degradación automática funciona:

- por debajo de 32 fps sostenidos, el post-procesado baja su resolución;
- si sigue bajando, el bloom se desactiva por completo;
- la inferencia de manos pasa de 30 Hz a 15 Hz cuando la escena no llega a 40 fps
  (comprobado: con la cámara activa en el entorno de pruebas, `hz` valía 15).

Ese sistema estuvo inoperativo durante parte del desarrollo por un error real: el
contador de fps se calculaba con el delta acotado a 0,1 s, así que **nunca podía
bajar de 10** y el umbral de 32 no se alcanzaba jamás. Corregido usando el
tiempo real sin acotar.

**Queda pendiente medir en hardware real** los 60 fps que fija el pliego. La
escena completa son 33 cuerpos, 8.000 instancias de asteroides, 3.000 de Kuiper
y bloom a resolución completa.

---

## 5. Navegadores

| Motor | Estado | Detalle |
|---|---|---|
| **Chromium** | ✅ Verificado | Escena, HUD, gestos, voz y narración. 41/41 módulos. |
| **Firefox** | ⚠️ Parcialmente verificado | Los 41 módulos se importan y la lógica de voz y gestos funciona. La escena no se pudo probar: el Firefox del contenedor no crea contexto WebGL. |
| **WebKit / Safari** | ❌ No verificado | El WebKit de Playwright no arranca en este contenedor por librerías del sistema ausentes (`libgtk-4`, `libgraphene`, `libevent`…). **Requiere una pasada manual en un Mac o un iPad.** |

### Error de compatibilidad encontrado y corregido

La prueba en Firefox destapó un fallo que **habría dejado ORBIS inservible en
Firefox y Safari** y que en Chrome no daba ni un aviso:

```
Import maps are not allowed after a module load or preload has started.
The specifier "three" was a bare specifier, but was not remapped to anything.
```

El `<script type="importmap">` estaba después de los `<link rel="modulepreload">`.
La especificación exige que el mapa de importaciones preceda a **toda** carga o
precarga de módulos; Firefox lo aplica al pie de la letra y descartaba el mapa
entero. Chrome era permisivo y no avisaba.

Corregido moviendo el `importmap` justo detrás de `<base>`, antes que cualquier
precarga. `index.html` lleva un comentario explicando por qué ese orden no se
puede tocar.

### Compatibilidades aplicadas para Safari

Basadas en diferencias conocidas del motor, no en suposiciones:

- `-webkit-backdrop-filter` junto a `backdrop-filter` en los cuatro sitios donde
  se usa: sin el prefijo, los paneles de Safari salen opacos.
- `MediaRecorder` con lista de formatos: Safari solo graba `audio/mp4`, Firefox
  no lo admite. Se prueba `webm` → `ogg` → `mp4` → `mpeg` y se usa el primero
  disponible; `wj-includes/api/stt.php` acepta los cuatro. Sin esto, la ruta alternativa de
  voz —que existe **precisamente para Safari**— habría fallado en Safari.
- `webkitSpeechRecognition` y `webkitAudioContext` ya estaban contemplados.

### Qué falta comprobar a mano en Safari

1. Que la escena arranca y que el buffer de profundidad logarítmico funciona.
2. Que los paneles con `backdrop-filter` se ven translúcidos.
3. Que la grabación en `audio/mp4` llega a `wj-includes/api/stt.php` y se transcribe.
4. Que el `importmap` se resuelve (debería, tras la corrección).

---

## 6. La escala real

Una unidad de escena son 1.000 km. Con eso:

| | Radio | Órbita |
|---|---|---|
| Sol | 695,7 | — |
| Tierra | 6,37 | 149.653 |
| Luna | 1,74 | 381 (alrededor de la Tierra) |
| Neptuno | 24,6 | 4.502.448 |

El rango va de 0,011 unidades (Fobos) a 4,5 millones. Un buffer de profundidad
lineal no tiene precisión para eso y produce parpadeo entre superficies, así que
el renderizador usa **buffer logarítmico**. Cuesta algo de relleno, pero sin él
la escala real es inutilizable.

Los cinturones se ocultan en modo real: reconstruir sus 8.000 instancias en cada
cambio de escala provocaría un tirón, y la interfaz lo declara en lugar de
dejarlos mal colocados.

## 7. Tamaños de pantalla

Comprobado con Chromium en 320x568, 375x667, 414x896, 768x1024, 1024x768,
1280x800, 1440x900 y 1920x1080, midiendo en cada uno: desborde horizontal,
contenido que cae fuera de la ventana sin forma de llegar a él, y tamaño de
cada objetivo pulsable. Los tamaños de 1024 para abajo se midieron además con
puntero táctil emulado, que es lo que decide si se aplican los 44 px.

| Ancho | Qué se ve |
|---|---|
| ≥1600 px | La HUD completa, tal como está diseñada |
| 1280–1600 | Paneles laterales más estrechos |
| 1024–1280 | Los cinco paneles de la derecha pasan a una fila que se desplaza |
| 720–1024 | Una sola columna; se retira el arco de datos y el panel de entradas |
| ≤720 | Escena, controles, perfil del cuerpo y navegación |
| ≤380 | El perfil pasa a una columna y los controles a una fila desplazable |

### Fallos encontrados y corregidos

**La barra superior ocupaba 640 px de alto en el móvil.** `.barra` lleva
`flex: 1 1 640px`, pensado para una barra en fila: 640 px de ancho base. Por
debajo de 720 px el contenedor pasa a `flex-direction: column`, el eje principal
se vuelve el vertical y esos 640 px pasaron a ser una **altura**: la barra sola
se comía 640 de los 667 px de un teléfono. Los controles caían fuera de la
pantalla —no había forma de pausar, cambiar de velocidad, silenciar ni abrir la
ayuda—, el perfil del cuerpo se quedaba en 0 px de alto y de toda la interfaz
solo se veía el rótulo ORBIS.

**En un teléfono no se veía el Sistema Solar.** El perfil ocupaba toda la fila
central y los paneles son opacos, así que la escena quedaba tapada de arriba
abajo. El perfil se limita ahora a 38 vh y se ancla abajo; lo que queda encima
es hueco transparente por el que se ve el lienzo.

**El panel galáctico se cortaba por abajo.** Entre 768 y 1280 px las tres cifras
citadas y su fuente quedaban bajo el borde inferior sin ningún contenedor con
desplazamiento por el que alcanzarlas. Ahora se limita al alto disponible y lo
que se encoge es la espiral, que es lo decorativo. Por debajo de 1280 px la fila
central de la rejilla se queda casi sin altura, así que ahí el panel pasa a ser
una capa centrada en lugar de un elemento de la rejilla.

**Objetivos táctiles por debajo del mínimo.** Los botones medían 32x24 px y las
pestañas de módulo 55x22. Con puntero táctil ahora son de 44x44 (WCAG 2.1
§2.5.5) y con ratón de 24x24 (WCAG 2.2 §2.5.8, nivel AA). Se consulta
`(pointer: coarse)` y no el ancho de la ventana: son cosas distintas —hay
tabletas de 1280 px que solo se tocan y portátiles de 1024 con ratón— y ampliar
por ancho habría estropeado la densidad de la HUD justo donde no hacía falta.

**Detalles menores.** A 320 px las cuatro pastillas de estado pedían 321 px en
una sola fila y la barra se salía por la derecha (ahora envuelven); las dos
columnas del perfil se pisaban entre sí por debajo de 380 px (ahora es una); y
el perfil usaba `align-content: end`, que en un contenedor con desplazamiento
empuja lo que sobra por el borde superior, donde no se llega desplazando: el
nombre del cuerpo quedaba cortado.

### Qué se sacrifica y en qué orden

Cuando deja de haber sitio, lo primero que se retira es lo decorativo
(proyección orbital, arco de datos), después lo que tiene otra vía de acceso
(panel de entradas, paneles de la derecha) y en último lugar nunca se toca lo
esencial: la escena, el perfil del cuerpo, la navegación y los controles. Ningún
control desaparece en ningún tamaño; en el más estrecho se recorre con el dedo.

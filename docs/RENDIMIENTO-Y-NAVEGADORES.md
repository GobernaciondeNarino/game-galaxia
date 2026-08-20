# Rendimiento y compatibilidad

Resultados de la fase 8. Todo lo que aparece aquí está medido, no estimado; lo
que no se ha podido medir se dice expresamente.

---

## 1. Qué se descarga al abrir la página

Medido con el inspector de red, con la caché vacía.

| Recurso | Peso | Notas |
|---|---|---|
| `three.module.min.js` + `three.core.min.js` | 731 kB | ≈ 190 kB con Brotli |
| Addons de Three.js | 105 kB | OrbitControls, post-procesado, CSS2D |
| Tipografías (`woff2`) | 140 kB | solo subconjuntos `latin` y `latin-ext` |
| Texturas de **512 px** | ~1,4 MB | 17 archivos |
| `data/sistema-solar.json` | 132 kB | ≈ 18 kB con Brotli |
| Código de ORBIS | ~150 kB | 41 módulos |
| **Total hasta poder navegar** | **≈ 2,6 MB** | |

**Lo que NO se descarga al abrir:**

- las texturas de 2048 px (≈ 8 MB): solo la del cuerpo que se enfoca;
- el modelo de manos (7,6 MB) y el WASM de MediaPipe (22 MB): solo si se
  enciende la cámara;
- el audio de las narraciones: solo el del cuerpo activo y sus dos vecinos.

Sin el nivel de detalle de las texturas, el arranque descargaría **8 MB en
lugar de 1,4 MB**. En una conexión de 2 Mb/s eso son 32 segundos frente a 6.

---

## 2. Nivel de detalle de las texturas

Cada textura existe en dos tamaños, generados por `tools/texturas.mjs`:

```
jupiter@512.jpg     89 kB   se carga en el arranque
jupiter.jpg        487 kB   se carga al enfocar Júpiter
```

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
  disponible; `api/stt.php` acepta los cuatro. Sin esto, la ruta alternativa de
  voz —que existe **precisamente para Safari**— habría fallado en Safari.
- `webkitSpeechRecognition` y `webkitAudioContext` ya estaban contemplados.

### Qué falta comprobar a mano en Safari

1. Que la escena arranca y que el buffer de profundidad logarítmico funciona.
2. Que los paneles con `backdrop-filter` se ven translúcidos.
3. Que la grabación en `audio/mp4` llega a `api/stt.php` y se transcribe.
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

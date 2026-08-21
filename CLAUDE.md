# ORBIS — Instrucciones del proyecto

Interfaz web 3D del Sistema Solar con control por gestos y voz. Se despliega en
un hosting **Plesk (Apache + PHP)**: sin Node.js en producción, sin procesos en
segundo plano, sin acceso root.

## Idioma

**Todo en español**: comentarios, nombres de variables y funciones, textos de
interfaz, documentación y mensajes de commit. Los nombres de archivo de módulos
que representan clases van en `PascalCase` en inglés solo cuando replican una
API de Three.js (`SceneManager.js`, `CameraRig.js`); el resto, en español.

## Reglas que no se negocian

1. **Sin paso de compilación.** Nada de bundlers, npm en producción,
   TypeScript ni JSX. Módulos ES resueltos por el `importmap` de `index.html`.
2. **Sin CDN de terceros en tiempo de ejecución.** Todo se sirve desde
   `/vendor` y `/assets`. `tools/vendor.mjs` genera esas copias.
3. **Ninguna credencial en el cliente.** Ni en HTML, ni en JS, ni en JSON, ni
   versionada. La clave de ElevenLabs se lee de una variable de entorno o de
   `config/secrets.php`. Antes de cada commit: `bash tools/comprobar-secretos.sh`.
4. **Ningún dato astronómico inventado.** Todo sale de `data/sistema-solar.json`
   con su campo `fuente`. Lo que falte va a `null` y se muestra como
   `SIN DATOS`. Lo decorativo se etiqueta `SIMULACIÓN`. Nunca `Math.random()`
   presentado como información real.
5. **La cámara y el micrófono son opcionales.** La aplicación debe ser
   completamente usable con ratón y teclado. No se piden permisos al cargar.
6. **Sin `localStorage` ni `sessionStorage`.** El estado de sesión vive en
   memoria (`js/utils/storage.js`).
7. **Un único global: `App`** (`js/core/App.js`). Todo lo demás son módulos ES
   de responsabilidad única.
8. **Liberar recursos de Three.js.** Toda geometría, material y textura creada
   se destruye con `dispose()` al cambiar de vista.
9. **Nunca ejecutar la inferencia de manos dentro del bucle de render.**
10. **Respetar `prefers-reduced-motion`** en cualquier animación nueva.
11. **Contraste AA como mínimo.** `node tools/contraste.mjs` no puede fallar.
    `--texto-decorativo` es la única ficha por debajo del umbral y solo vale
    para elementos ornamentales que no transmiten información.

## Comprobaciones antes de dar por buena una fase

```bash
bash tools/comprobar-secretos.sh           # credenciales en el cliente
node tools/contraste.mjs                   # contraste WCAG 2.1 AA
node tools/pruebas-gestos.mjs              # reconocedor de gestos
node tools/pruebas-guino.mjs               # guiño frente a parpadeo
node tools/pruebas-narracion.mjs           # las tres narraciones de cada cuerpo
php  tools/pruebas-asistente.php           # validación del nombre y frases
node tools/pruebas-voz.mjs                 # parser de intenciones de voz
node tools/csp-hash.mjs --verificar        # hash CSP del importmap al día
find api config -name '*.php' -exec php -l {} \;
php -S localhost:8080                      # y abrir http://localhost:8080
```

## Fichas de diseño

Están en `css/nucleo.css`. Usa siempre las variables, nunca un color literal:
`--cian-brillante`, `--ambar-seleccion`, `--panel-fondo`, `--curva`…

La skill `ui-ux-pro-max` está vendorizada en `.claude/skills/` y debe usarse
para cualquier decisión de diseño de la HUD.

## Estado

Fases 0 a 8 completadas, salvo la verificación manual en Safari. Ver el plan de fases en `README.md`.

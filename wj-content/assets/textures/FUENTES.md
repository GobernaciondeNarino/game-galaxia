# Texturas de los cuerpos celestes

Esta carpeta está **vacía en el repositorio a propósito**: las texturas
planetarias en 2K/4K suman decenas de megabytes y tienen licencias propias.
Se incorporan en la fase 2, junto con el catálogo de datos.

## De dónde salen

| Origen | Cobertura | Licencia |
|---|---|---|
| [NASA 3D Resources](https://nasa3d.arc.nasa.gov/images) | Planetas y satélites | Dominio público (NASA) |
| [USGS Astrogeology](https://astrogeology.usgs.gov/search) | Mapas cartográficos | Dominio público |
| [Solar System Scope](https://www.solarsystemscope.com/textures/) | Set completo, listo para esferas | CC BY 4.0 — exige atribución |
| [ESA/Hubble](https://esahubble.org/images/) | Fondo estelar y nebulosas | CC BY 4.0 |

Toda textura que se añada debe quedar anotada aquí con su origen y su licencia,
y la atribución debe aparecer en el panel de créditos de la interfaz.

## Convenciones de nombre

```
<id>.jpg              mapa difuso
<id>-normal.jpg       mapa de normales
<id>-especular.jpg    mapa especular (solo Tierra)
<id>-nubes.png        capa de nubes con alfa (solo Tierra)
<id>-noche.jpg        luces nocturnas (solo Tierra)
<id>-anillos.png      anillos con canal alfa (Saturno, Urano)
<id>@512.jpg          versión reducida para la carga inicial
```

El `id` es el mismo de `data/sistema-solar.json`.

## Preparación

Para que la escena sea navegable de inmediato en conexiones lentas, cada
textura se sirve en dos niveles: una versión de 512 px que se carga al arrancar
y la de 2K que se solicita solo al enfocar ese cuerpo.

```bash
# Versión reducida (requiere ImageMagick, solo en desarrollo)
magick jupiter.jpg -resize 512x256 -quality 82 jupiter@512.jpg
```

Formato: JPEG de calidad 82 para los mapas difusos —mejor relación
peso/calidad que PNG y compatible con todo—, y PNG solo donde hace falta canal
alfa. WebP y AVIF pesan menos pero su decodificación a textura es más lenta en
equipos modestos; se evaluará en la fase 8 con medidas reales.

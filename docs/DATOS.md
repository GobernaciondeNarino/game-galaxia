# Catálogo maestro · `wj-content/data/sistema-solar.json`

Todo lo que la interfaz muestra como dato sale de este archivo. El código no
contiene ni una sola cifra astronómica: así se pueden corregir los valores o
reescribir las narraciones sin tocar JavaScript.

---

## Política de rigor

Es la regla más importante del proyecto.

1. **Ninguna cifra inventada.** Los valores físicos y orbitales proceden de la
   [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/)
   y de [JPL Solar System Dynamics](https://ssd.jpl.nasa.gov/). Cada cuerpo
   lleva su campo `fuente`.
2. **Un dato que no se encuentra se pone a `null`**, jamás se estima. La
   interfaz lo muestra como `SIN DATOS` y atenúa el panel correspondiente.
3. **Lo decorativo se declara decorativo.** Si un gráfico no representa una
   medida real —por ejemplo la forma de onda de fondo de la magnetosfera—, la
   propia interfaz lo etiqueta como `SIMULACIÓN`.
4. **Nunca `Math.random()` presentado como información.** Ni para rellenar un
   gráfico, ni para «dar vida» a un panel de datos.

## Esquema por cuerpo

```json
{
  "id": "jupiter",
  "nombre": "Júpiter",
  "tipo": "planeta",
  "padre": "sol",

  "fisica": {
    "diametroKm": 139820,
    "masaKg": 1.898e27,
    "gravedadMs2": 24.79,
    "densidadGcm3": 1.33,
    "temperaturaMinC": -145,
    "temperaturaMaxC": -108,
    "inclinacionAxialGrados": 3.13
  },

  "orbita": {
    "semiejeMayorUA": 5.204,
    "excentricidad": 0.0489,
    "inclinacionGrados": 1.303,
    "periodoOrbitalDias": 4332.59,
    "periodoRotacionHoras": 9.925
  },

  "atmosfera": [
    { "compuesto": "H₂", "porcentaje": 89.8 },
    { "compuesto": "He", "porcentaje": 10.2 }
  ],

  "render": {
    "texturaDifusa": "wj-content/assets/textures/jupiter.jpg",
    "radioEscalado": 4.2,
    "anillos": null,
    "colorEtiqueta": "#E8A020"
  },

  "anotaciones": [
    { "etiqueta": "Gran Mancha Roja", "lat": -22, "lon": 0 }
  ],

  "satelites": ["io", "europa", "ganimedes", "calisto"],
  "narracion": "…150-220 palabras, tono divulgativo, en español…",
  "curiosidades": ["…", "…", "…"],
  "fuente": "NASA Planetary Fact Sheet"
}
```

### Campos

| Campo | Obligatorio | Notas |
|---|---|---|
| `id` | sí | Minúsculas, sin tildes ni espacios. Es la clave en toda la aplicación y la valida `wj-includes/api/tts.php`. |
| `tipo` | sí | `estrella` · `planeta` · `planeta-enano` · `satelite` · `cinturon` |
| `padre` | sí | `id` del cuerpo alrededor del que orbita. Los satélites orbitan su planeta, no el Sol. |
| `fisica.*` | sí, con `null` donde falte | Unidades explícitas en el nombre del campo. |
| `orbita.*` | sí para todo lo que orbite | Alimenta directamente el movimiento de la escena: nada de periodos aproximados en el código. |
| `atmosfera` | `null` si no tiene | Alimenta el gráfico de composición. |
| `render.radioEscalado` | sí | Radio en el **modo didáctico**. El modo real se calcula desde `fisica.diametroKm`. |
| `anotaciones` | opcional | `lat`/`lon` en grados; sitúan las etiquetas de la `VISTA DE CUERPO`. |
| `narracion` | sí | Lo que lee ElevenLabs. 150–220 palabras. |
| `fuente` | sí | Texto libre, pero verificable. |

---

## `data/comandos-voz.json`

Vocabulario del parser de intenciones: sinónimos de cada acción y alias de cada
cuerpo (por ejemplo `el planeta rojo` → `marte`). Vive fuera del código para
poder ampliarlo con lo que realmente diga la gente, sin tocar JavaScript.

Se define en la fase 7.

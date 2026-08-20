# ORBIS · Gestos y comandos de voz

Referencia para quien usa la interfaz.

> **Nada de esto es obligatorio.** ORBIS se maneja por completo con ratón y
> teclado. Los gestos y la voz son una capa adicional que se activa
> explícitamente y se puede apagar en cualquier momento.
>
> **Estado:** los gestos llegan en la fase 6 y la voz en la fase 7. Este
> documento fija ya el comportamiento acordado.

---

## Privacidad

- La cámara y el micrófono **no se activan al abrir la página**. Hay que pulsar
  un botón cada vez.
- El vídeo de la cámara **se procesa íntegramente dentro del navegador** y
  **no se envía a ningún servidor**. Ni se graba, ni se almacena, ni se
  transmite.
- Mientras la cámara está activa se muestra un indicador visible y un botón de
  apagado siempre accesible.
- El reconocimiento de voz usa por omisión el motor del propio navegador. Si no
  está disponible (Firefox, Safari), ORBIS lo dice y ofrece la alternativa por
  servidor, que **sí** envía fragmentos cortos de audio a transcribir. Nunca se
  cambia de motor sin avisar.

---

## Ratón, táctil y teclado

Siempre disponibles.

| Acción | Ratón / táctil | Teclado |
|---|---|---|
| Orbitar la cámara | Arrastrar con el botón izquierdo | `←` `→` `↑` `↓` |
| Acercar / alejar | Rueda o pellizco | `+` / `−` |
| Desplazar (pan) | Arrastrar con el botón derecho o dos dedos | `Mayús` + flechas |
| Seleccionar un cuerpo | Clic sobre él o sobre su miniatura | `Tab` hasta la tira inferior y `Intro` |
| Cuerpo anterior / siguiente | Flechas de la tira inferior | `Re Pág` / `Av Pág` |
| Volver a la vista general | Botón `VISTA GENERAL` | `Esc` |
| Pausar o reanudar el tiempo | Control de la barra superior | `Espacio` |
| Mostrar u ocultar órbitas | Control de la barra superior | `O` |
| Silenciar la narración | Control de volumen | `M` |
| Ayuda | Botón `?` | `F1` o `?` |

---

## Gestos de mano

Requieren cámara. Se activan con el botón de la esquina inferior derecha.

| Gesto | Acción |
|---|---|
| Pellizco índice-pulgar y arrastrar (una mano) | Rotar la escena / orbitar la cámara |
| Pellizco con las dos manos, separando o juntando | Acercar o alejar |
| Mano abierta desplazándose | Desplazamiento lateral |
| Índice apuntando, sostenido 1,2 s sobre un cuerpo | Seleccionar ese cuerpo |
| Puño cerrado | Detener el movimiento y anclar la vista |
| Palma abierta hacia la cámara, 1,5 s | Volver a la vista general |
| Deslizar horizontalmente con la mano abierta | Cuerpo anterior o siguiente |

**Cómo colocarse:** a entre 50 cm y 1,5 m de la cámara, con la mano dentro del
encuadre y luz suficiente sobre la palma. El recuadro de la esquina inferior
derecha muestra el esqueleto detectado; si no aparece, la mano no está siendo
vista.

**Retroalimentación.** Un cursor holográfico sigue la mano. Los gestos
sostenidos dibujan un aro de progreso: mientras se completa, se puede cancelar
retirando la mano. El gesto reconocido se escribe en el panel de entradas.

---

## Comandos de voz

Idioma: español (`es-ES` y `es-CO`). Se activan con el botón del micrófono.

### Navegación
- `ir a Júpiter` · `llévame a Marte` · `muéstrame Europa`
- `vista general` · `volver`
- `siguiente` · `anterior`

### Información
- `háblame de Saturno`
- `satélites de Júpiter`
- `comparar Marte con Venus`

### Escena
- `pausar` · `reanudar`
- `acelerar tiempo` · `frenar tiempo`
- `mostrar órbitas` · `ocultar órbitas`
- `modo real` · `modo didáctico`

### Audio
- `repetir` · `silencio` · `detener narración`

### Ayuda
- `ayuda` · `qué puedo decir`

### Si no te entiende

El reconocimiento falla a menudo con nombres como *Ganímedes*, *Encélado* o
*Umbriel*. ORBIS normaliza la transcripción (minúsculas, sin tildes, sin signos)
y compara por proximidad, de modo que «ganimedes», «ganímedez» o «ganimede»
llegan al mismo sitio.

Cuando aun así no reconoce el comando, **no falla en silencio**: propone las
tres alternativas más cercanas para que elijas con la voz, con un clic o con el
teclado.

---

## Accesibilidad

- Toda la narración lleva **subtítulos sincronizados**, activados por omisión.
- La interfaz completa es navegable con `Tab`, con foco siempre visible.
- Con `prefers-reduced-motion` activado en el sistema, las transiciones de
  barrido se sustituyen por un fundido corto y se detienen las animaciones
  decorativas.
- Los controles llevan texto alternativo; las cifras se anuncian con su unidad.
- Ningún dato depende únicamente del color: los estados llevan además icono o
  texto.

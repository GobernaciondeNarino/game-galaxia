# ORBIS · Gestos y comandos de voz

Referencia para quien usa la interfaz.

> **Nada de esto es obligatorio.** ORBIS se maneja por completo con ratón y
> teclado. Los gestos y la voz son una capa adicional que se activa
> explícitamente y se puede apagar en cualquier momento.

---

## Privacidad

- La cámara y el micrófono **no se activan al abrir la página**. Hay que pulsar
  un botón cada vez.
- El vídeo de la cámara **se procesa íntegramente dentro del navegador** y
  **no se envía a ningún servidor**. Ni se graba, ni se almacena, ni se
  transmite.
- Mientras la cámara está activa se muestra un indicador visible y un botón de
  apagado siempre accesible.
- El reconocimiento de voz usa el motor del propio navegador cuando existe
  (Chrome, Edge). Conviene saber que **Chrome envía el audio a servidores de
  Google** para transcribirlo: no es un procesamiento local.
- Si el navegador no reconoce voz (Firefox, Safari), ORBIS lo dice y ofrece la
  alternativa por servidor, que envía fragmentos cortos de audio a este
  servidor y de ahí a ElevenLabs. **El audio no se guarda**: se transcribe y se
  descarta.
- En ambos casos, el aviso aparece **antes** de pedir el permiso del micrófono,
  no después.

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
| Cambiar de escala | Interruptor `Escala real` | — |
| Silenciar la narración | Control de volumen | `M` |
| Ayuda | Botón `?` de la barra | `F1` o `?` |

---

## Gestos de mano

Requieren cámara. Se activan con el botón de la esquina inferior derecha.

Son tres gestos y cuatro acciones. No hay más, a propósito.

| Gesto | Acción |
|---|---|
| Pellizco índice-pulgar y arrastrar (una mano) | Rotar el elemento / orbitar la cámara |
| Pellizco con las dos manos, separando | Acercar |
| Pellizco con las dos manos, juntando | Alejar |
| Mano abierta, barriendo de un extremo a otro | Cuerpo siguiente o anterior |

**Por qué tan pocos.** Hubo más: apuntar sostenido para seleccionar, puño para
anclar la vista y palma abierta para volver a la vista general. Se retiraron
porque se disparaban solos. La mano abierta es la postura de reposo —es lo que
hace cualquiera al bajar el brazo o al dudar—, así que la palma sostenida abría
la interfaz galáctica una y otra vez en mitad de la interacción. Un vocabulario
corto que nunca se equivoca vale más que uno amplio que sí.

Seleccionar un cuerpo concreto, volver a la vista general y todo lo demás siguen
estando en el ratón, el teclado y la voz, que es donde vive el control fino. El
puño y el índice apuntando se siguen reconociendo y se nombran en pantalla —para
que se vea que la cámara sigue leyendo la mano— pero no hacen nada.

**Cómo colocarse:** a entre 50 cm y 1,5 m de la cámara, con la mano dentro del
encuadre y luz suficiente sobre la palma. El recuadro de la esquina inferior
derecha muestra el esqueleto detectado; si no aparece, la mano no está siendo
vista. Da igual que la mano esté de frente o de canto: para el barrido cuentan
las dos por igual.

**Retroalimentación.** Un cursor holográfico sigue la mano y el gesto reconocido
se escribe en el panel de entradas. El barrido dibuja además un aro de progreso,
porque es el único gesto que no se ve mientras se hace: rotar y hacer zoom mueven
la escena desde el primer fotograma, pero al barrer no ocurre nada hasta que se
completa. Mientras el aro no se cierre, se puede abortar cerrando la mano.

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

En **modo real** los tamaños y las distancias son los verdaderos: una unidad de
escena son 1.000 km. Neptuno queda a cuatro millones y medio de unidades del Sol
y navegar hasta él lleva su tiempo. Es incómodo a propósito: así es el Sistema
Solar de verdad. Los cinturones se ocultan en este modo.

### Audio
- `repetir` · `silencio` · `detener narración`

### Ayuda
- `ayuda` · `qué puedo decir`

### Si no te entiende

El reconocimiento falla a menudo con nombres poco frecuentes. ORBIS normaliza la
transcripción —minúsculas, sin tildes, sin signos, sin muletillas— y compara por
distancia de Levenshtein con un umbral proporcional a la longitud de la palabra:
en «Ío» un error de una letra lo cambia todo, en «Makemake» no.

El vocabulario de `data/comandos-voz.json` incluye además los errores de
transcripción que se dan de verdad. Todos estos funcionan:

| Lo que se transcribe | Lo que entiende ORBIS |
|---|---|
| «ir a ganimedez» | Ganímedes |
| «llévame a enselado» | Encélado |
| «muéstrame yo» | Ío |
| «llévame a make make» | Makemake |
| «ir a caronde» | Caronte |
| «llévame al planeta rojo» | Marte |
| «Neptuno» (a secas) | ir a Neptuno |

Ampliar esa lista con lo que la gente diga de verdad es la forma barata de
mejorar el reconocimiento, y **no requiere tocar código**: basta con añadir
alias al JSON.

Cuando aun así no reconoce el comando, **no falla en silencio**: propone las
tres alternativas más cercanas.

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

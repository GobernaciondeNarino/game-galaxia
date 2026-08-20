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
  transmite. Se puede comprobar en la pestaña Red del navegador: con la cámara
  encendida no sale ni una petición con imágenes.
- Con la cámara encendida se miran **las manos y la cara**. De la cara se lee
  una sola cosa: cuánto está cerrado cada ojo, para distinguir un guiño de un
  parpadeo. No se identifica a nadie, no se estima edad, sexo ni estado de
  ánimo, no se guarda ningún rasgo y nada de eso sale del navegador. Los dos
  modelos —manos y rostro— se sirven desde este mismo servidor, no desde Google.
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

Son cuatro gestos y cinco acciones. No hay más, a propósito.

| Gesto | Acción |
|---|---|
| Pellizco índice-pulgar y arrastrar (una mano) | Rotar el elemento / orbitar la cámara |
| Pellizco con las dos manos, separando | Acercar |
| Pellizco con las dos manos, juntando | Alejar |
| Mano abierta, barriendo de un extremo a otro | Cuerpo siguiente o anterior |
| Puño cerrado, mantenido 0,7 s | Detener la narración |
| Un ojo cerrado, mantenido 0,45 s | Detener la narración |

**Por qué tan pocos.** Hubo más: apuntar sostenido para seleccionar y palma
abierta para volver a la vista general. Se retiraron porque se disparaban solos.
La mano abierta es la postura de reposo —es lo que hace cualquiera al bajar el
brazo o al dudar—, así que la palma sostenida abría la interfaz galáctica una y
otra vez en mitad de la interacción. Un vocabulario corto que nunca se equivoca
vale más que uno amplio que sí.

Seleccionar un cuerpo concreto, volver a la vista general y todo lo demás siguen
estando en el ratón, el teclado y la voz, que es donde vive el control fino. El
índice apuntando se sigue reconociendo y se nombra en pantalla —para que se vea
que la cámara sigue leyendo la mano— pero no hace nada.

**Por qué el puño sí.** Contradice lo anterior y merece explicación. Cerrar el
puño es una postura deliberada: nadie la adopta sin querer, al contrario que la
mano abierta. Callar una voz es inofensivo y se deshace pidiendo que repita. Y
aun así hay que mantenerlo, con el aro de progreso avisando, y dispara una sola
vez: hay que abrir la mano antes de que vuelva a contar, así que sostener el
puño no manda callar treinta veces por segundo.

### El guiño

Cerrar un ojo y mantenerlo detiene la narración, lo mismo que el puño. Está
pensado para cuando se tienen las manos ocupadas.

**El problema es que parpadeamos**, unas quince veces por minuto y sin querer.
Si «un ojo cerrado» bastara, la voz se cortaría sola cada cuatro segundos y
nadie entendería por qué. Por eso hacen falta tres condiciones a la vez:

1. **Asimetría.** Un parpadeo cierra los dos ojos; se exige que uno esté
   claramente cerrado y el otro claramente abierto. Esta es la condición que
   separa el guiño del parpadeo.
2. **Distancia.** La diferencia entre ambos ojos debe ser grande, para descartar
   los parpadeos que el modelo captura a medias.
3. **Duración.** Un parpadeo dura entre 100 y 150 ms; el umbral está en 450.

Y la misma regla del puño: un guiño dispara una vez, y hay que abrir el ojo
antes de que vuelva a contar.

El guiño necesita un segundo modelo de MediaPipe (`face_landmarker.task`,
3,8 MB), que se descarga al encender la cámara, después del de manos. Si no
llega, se avisa en el panel de entradas y todo lo demás sigue funcionando: el
guiño es un atajo, no un requisito. Del rostro no se mide ni se guarda nada
más que cuánto está cerrado cada ojo.

`node tools/pruebas-guino.mjs` comprueba, entre otras cosas, que veinte
parpadeos seguidos no disparan nada.

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
- `repetir` · `silencio` · `cállate`
- Para callar la voz que está hablando: `detener narración`, `detén`, `detente`,
  `detener`, `parar`, `para ya`, `alto`, `stop`, `basta`, `ya basta`,
  `suficiente`, `no sigas`, `no hables`, `para de hablar`, `deja de hablar`.

**`silencio` y `detente` no son lo mismo.** `silencio` apaga la narración hasta
que se vuelva a activar; `detente` corta lo que se está diciendo ahora, pero la
siguiente narración vuelve a sonar. El puño y el guiño hacen lo segundo.

Las órdenes secas conviven con las de tiempo sin pisarse: el parser prueba los
patrones de más largo a más corto, así que `detener el tiempo` sigue pausando la
simulación aunque `detener` exista por su cuenta. `para` a secas **no** vale,
justamente porque está dentro de «llévame **para** Marte».

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

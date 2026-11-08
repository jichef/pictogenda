# Horario visual (kiosco para iPad)

Webapp estática (HTML + CSS + JS ES5, sin dependencias, sin backend) que muestra qué actividad toca, cuánto queda y qué viene después. El pictograma principal se va cubriendo de forma continua según la hora real, con tres hitos (25/50/75 %) y pictogramas secundarios informativos.

## Arquitectura
```
public/                  ← lo único que se despliega
  index.html, manifest.json, sw.js
  js/core.js             lógica pura: horario, estado, progreso, validación, migración, operación matemática
  js/storage.js          localStorage + IndexedDB + config inicial, verificación de escrituras
  js/ui.js               ayudas DOM, modal, reducción de imágenes, selector de pictogramas
  js/kiosk.js            pantalla principal (cobertura, hitos, columna lateral)
  js/admin.js            panel: Horarios / Pictogramas / Apariencia / Datos
  js/app.js              arranque, puerta con operación matemática, service worker
  data/default-config.json   configuración inicial (editable en el repositorio)
  pictos/*.svg           pictogramas incorporados (emoji sobre fondo de color)
tests/run.js             pruebas de lógica (node)     tools/  generadores y comprobador ES5
```
- **Progreso**: en cada tic (1 s, alineado con el reloj) se calcula `(ahora − inicio)/(fin − inicio)` con milisegundos desde `new Date()`. La capa se mueve con una transición CSS lineal de 1 s hacia el valor que marcará el reloj en el siguiente tic; es solo interpolación visual, no hay animaciones largas que puedan desincronizarse. Al volver de segundo plano (`visibilitychange`, `focus`, `pageshow`, salto de reloj > 3,5 s) se recalcula al instante sin animar y sin disparar efectos de hitos.
- **Esquema v2**: `days[1..5][].secondary = [{pictoId,label}]`. Las configuraciones v1 (sin secundarios) se migran solas.
- **Persistencia**: ajustes en `localStorage` y copia en IndexedDB; imágenes subidas solo en IndexedDB (reducidas a ≤400 px). Se usa el guardado más reciente válido; si uno está corrupto se conserva aparte (`hv_corrupt_backup`) y se repara desde la otra copia. Nada se guarda si la configuración no valida. Actualizar la web **nunca** toca estos datos (el service worker solo gestiona la caché de archivos).
- La configuración inicial solo se usa si no hay datos locales. Cada iPad tiene la suya; Vercel solo distribuye archivos.

## Uso local
```
npm install        # solo para el comprobador ES5 (acorn)
npm run serve      # http://localhost:8080
npm test           # pruebas de lógica
npm run check      # verifica sintaxis ES5 (iOS 12)
npm run build      # regenera la lista de precarga del service worker (Vercel lo ejecuta solo)
```

## Desplegar en Vercel
1. Sube el repositorio a GitHub. 2. En Vercel: *Add New › Project*, importa el repo. 3. Sin framework, sin variables de entorno (`vercel.json` ya indica `outputDirectory: public`). 4. Deploy.

## Añadir a la pantalla de inicio (iOS 12)
Safari › abre la URL › botón Compartir › **Añadir a pantalla de inicio**. Ábrela desde el icono para modo standalone. Recomendado: Ajustes › Pantalla › Bloqueo automático = Nunca, y **Acceso guiado** (Ajustes › General › Accesibilidad) para impedir salir de la app. La web no puede ocultar las barras de Safari ni mantener la pantalla encendida en iOS 12.

## Fuente tipográfica propia
Copia el archivo `.ttf` como `public/fonts/horario.ttf` (y opcionalmente `horario-bold.ttf` para negrita), ejecuta `npm run build` y despliega. Se carga desde el propio sitio, se guarda en la caché sin conexión y Safari de iOS 12 admite TTF. Comprueba que su licencia permite incrustarla en una web. Los pictogramas incorporados son emoji y no cambian con la fuente.

## Días
Lunes a viernes (con opción «mismo horario de lunes a viernes»), más **sábado y domingo** con horario propio e independiente. Un fin de semana sin actividades muestra «¡Buen fin de semana!». El panel incluye **Vista previa**: muestra el kiosco con el borrador sin guardar y un reloj simulado (día, hora, velocidad y saltos a los hitos).

## Panel de administración
Pulsa el pequeño ⚙ (abajo a la derecha) y resuelve la operación. **Es una barrera para evitar toques de niños, no seguridad**: cualquiera con conocimientos técnicos puede saltársela. Tres fallos bloquean 30 s.

## Copias de seguridad
*Ajustes › Datos y copias*: **Exportar** descarga un JSON (horarios, ajustes e imágenes). En iOS 12 no existe el atributo `download`, así que se abre el contenido en otra pestaña (Compartir › Guardar) y además aparece en un cuadro de texto que puedes copiar a Notas. **Restaurar**: *Importar desde archivo* o pega el texto y pulsa *Importar el texto de abajo*; se pide confirmación antes de sustituir nada. *Restaurar configuración inicial* vuelve a `data/default-config.json`.

## Límites honestos
- Safari puede borrar `localStorage`/IndexedDB/caché (poco espacio, limpieza de datos del sitio, inactividad prolongada). Exporta una copia al terminar de configurar.
- El service worker permite funcionar sin conexión tras una carga correcta, con estrategia *stale-while-revalidate*: una versión nueva se ve en la segunda apertura. Su caché tampoco está garantizada.
- WebP: iOS 12 no puede abrirlo; se avisa al subirlo. Los pictogramas incorporados son emoji en SVG (en iOS se ven con Apple Emoji); para pictogramas tipo ARASAAC súbelos como PNG (respeta su licencia).
- Verificado: pruebas de lógica, sintaxis ES5 y navegador de escritorio (Chromium, 1024×690, reloj simulado). **No se ha probado en un iPad con iOS 12.5.4 real**; revisa allí especialmente transiciones, Añadir a inicio y exportación.

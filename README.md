# Sangre Nueva — La Velada

App de producción para gestionar peleadores, emparejamientos (VS), cartelera
y venta/check-in de entradas de un evento de boxeo. React + Vite, con
sincronización en vivo vía Firebase Realtime Database y soporte PWA
(instalable, funciona offline).

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:8765` (puerto fijo configurado en `vite.config.js`).

## Build de producción

```bash
npm run build   # genera dist/
npm run preview # sirve dist/ localmente para probar el build final
```

## Despliegue — Cloudflare Pages

El proyecto se despliega en Cloudflare Pages
(`sangre-nueva-la-velada.pages.dev`). Configuración del build en el panel de
Cloudflare Pages:

- **Comando de build:** `npm run build`
- **Directorio de salida (output):** `dist`
- **Directorio raíz:** `/` (raíz del repo)

Cada push a la rama conectada dispara un nuevo deploy automáticamente.

## Firebase Realtime Database — reglas de seguridad

**Modelo de acceso** (`database.rules.json`):

- **Denegado por defecto** en la raíz.
- **Dueño** (`josnier.azuaje@gmail.com`): lectura/escritura total, siempre.
- **Staff**: para leer/escribir `sangre_nueva` su UID debe estar en el nodo
  `/staff`. Solo el dueño puede editar `/staff`. Una cuenta autenticada que
  **no** esté en la lista no ve ni toca los datos (antes bastaba con estar
  logueado — cualquier cuenta creada contra el proyecto tenía acceso total a
  datos de menores y boletas).
- **Borrado masivo reservado al dueño**: el staff puede vender, actualizar y
  borrar boletas **individuales** (`tickets/$id`) e incrementar contadores,
  pero **solo el dueño** puede borrar el nodo completo de `tickets` o
  `counters` (lo que hace "Reiniciar evento"). Así, ni un staff ni un
  dispositivo con la sesión abierta pueden destruir toda la venta desde la
  consola. Cualquier nodo no listado (`$other`) también queda reservado al
  dueño. *(Nota técnica: `.write` en Firebase se hereda hacia abajo, así que
  el permiso se otorga por hijo dentro de `sangre_nueva`, no a nivel del nodo.)*
- **Backups** (`sangre_nueva_backups`): solo el dueño.

**Probar las reglas sin riesgo:** antes de publicar, usa el **Rules Playground**
de la consola de Firebase (Realtime Database → Reglas → "Simulador") para
confirmar, simulando distintos usuarios: (a) un UID en `/staff` puede escribir
`sangre_nueva/tickets/<algo>` pero **no** borrar `sangre_nueva/tickets`; (b) el
dueño (por email) sí puede ambas; (c) un UID fuera de `/staff` no puede leer
`sangre_nueva`.

### ⚠️ Antes de publicar: sembrar `/staff` (o el equipo se queda afuera)

Estas reglas exigen que cada colaborador (que no sea el dueño) tenga su UID en
`/staff`. **Si publicas sin sembrarlo, todos menos el dueño pierden acceso.**
Hazlo primero:

1. Firebase Console → **Authentication → Users**: copia el **UID** de cada
   persona del staff (columna "User UID").
2. Firebase Console → **Realtime Database → Datos**: crea el nodo `staff` y,
   dentro, una clave por cada UID con valor `true`:
   ```
   staff/
     abc123UID… : true
     def456UID… : true
   ```
   (El dueño no necesita estar en `/staff`; entra por su correo.)
3. Para dar de alta o de baja a alguien después, agrega/borra su UID en
   `/staff` — **sin volver a desplegar reglas**.

### Publicar las reglas

Es un cambio de permisos sobre una base en producción; publícalo tú:

- Opción A — Consola: Firebase Console → proyecto `velada-sangre-nueva-22fb0`
  → Realtime Database → pestaña **Reglas** → pega el contenido de
  `database.rules.json` → Publicar.
- Opción B — CLI: `firebase deploy --only database` (requiere
  `firebase login` y el proyecto seleccionado en `.firebaserc`, que ya
  apunta a `velada-sangre-nueva-22fb0`).

### Verificación

1. **Anónimo:** en una ventana de incógnito abre
   `https://velada-sangre-nueva-22fb0-default-rtdb.firebaseio.com/sangre_nueva.json`
   — debe devolver `Permission denied`, nunca los datos.
2. **Staff sembrado:** inicia sesión en la app con una cuenta de staff cuyo
   UID sí pusiste en `/staff` — debe cargar los datos con normalidad.
3. **Cuenta fuera de la lista:** una cuenta autenticada cuyo UID no esté en
   `/staff` no debe ver datos (la app quedará vacía / sin sincronizar).

## Varias veladas en la misma app (multi-evento)

Cada velada es un **evento** con su propio padrón, cartelera, Super 4,
boletería y respaldos. Se cambia de una a otra desde el menú ⋮ → **Veladas**.

- **La velada de Chile no se movió**: su id interno es `sangre_nueva` y sigue
  leyendo y escribiendo en las rutas de siempre. Un dispositivo que ya tenía la
  PWA instalada la reabre y ve exactamente lo de antes, sin migrar nada.
- **Las veladas nuevas** viven en `eventos/{id}/…` y su dueño es quien las crea
  (`meta.ownerUid`), no un correo escrito en el código.
- **Cambiar de velada recarga la app** a propósito (ver `memoria_contexto.md`
  §14.5).
- **La moneda, los precios de las entradas, el aforo del recinto y la
  nomenclatura de categorías** son datos de cada velada: se editan en
  Veladas → "Precios y aforo".

### Dar de alta a alguien del staff en una velada nueva

Igual que antes, pero el nodo es del evento: Firebase Console → Realtime
Database → `eventos/{id}/staff/{UID}` con valor `true` (o `"puerta"` para la
cuenta del escáner). El dueño del evento no necesita estar en la lista.

### ⚠️ Antes de usar una velada nueva: publicar las reglas

El árbol `eventos/` y el índice `usuarios/` **no existen en las reglas
publicadas** hasta que se suba el `database.rules.json` de este repositorio
(Firebase Console → Realtime Database → Reglas, o `firebase deploy --only
database`). Sin eso, crear una velada nueva falla con "permiso denegado" —
la velada de Chile sigue funcionando igual, porque sus reglas no cambiaron.

## Fechas del evento (editables desde la app)

Las dos fechas de la velada —semifinales y final del Super 4— **ya no se
escriben en el código**. Son un dato del evento (`sangre_nueva/bm_event_dates`,
dos fechas ISO `{ semis, final }`) que se edita en la app: toca la barra de la
fecha (móvil) o el chip del pie del menú lateral (escritorio) y se abre el
diálogo **Datos del evento**, con el título y las dos fechas, y una vista previa
de cómo va a quedar escrita la fecha antes de guardar.

De ahí salen todas las etiquetas de fecha de la app (`src/lib/eventDates.js`):
la cabecera de la Cartelera, las tarjetas del Super 4, el PDF y la planilla
imprimible de llaves, y los subtítulos de las planillas CSV. Montar la próxima
velada ya no exige tocar el repositorio ni desplegar.

- **Solo el dueño cambia las fechas** (la regla de la base rechaza esa escritura
  al staff, y el diálogo se los deshabilita). El título sí lo puede editar el
  staff, como antes.
- **Casos raros cubiertos**: velada de un solo día (semifinales y final la misma
  noche), y fechas que cruzan de mes o de año — la frase nombra los dos meses o
  los dos años para que no quede ambigua.
- Un valor corrupto en la nube **no deja la app sin fecha**: cae a la fecha por
  defecto (`DEFAULT_EVENT_DATES`) campo por campo.
- La regla de `bm_event_dates` en `database.rules.json` es explícita, pero el
  nodo ya quedaba cubierto por `$other` (lectura del staff, escritura del
  dueño): **no hace falta volver a publicar las reglas** para que funcione.
  Publícalas cuando quieras la validación de formato que trae.

## Cierre del evento

Terminada la velada, los números quedan repartidos en cuatro pestañas y
desaparecen al reiniciar el evento. El menú ⋮ del dueño tiene **Cierre del
evento**: abre una hoja imprimible (o "guardar como PDF") con todo el evento en
una carilla —recaudación total y por tipo de entrada, desglose por método de
pago, asistencia real (personas que entraron vs. entradas vendidas), peleadores
por categoría y sexo, peleas que de verdad salieron en la cartelera, campeón de
cada cinturón y atletas por escuela.

Es el documento para rendir cuentas con los socios y para decidir la próxima
fecha. **Genéralo antes de "Reiniciar evento"** (el propio diálogo de reinicio lo
recuerda). La lógica es pura y está testeada en `src/lib/cierreEvento.js`:
distingue boletas de personas, no cuenta como vendidas las boletas anuladas, y
con cero ventas informa asistencia "—" en vez de un 0 % engañoso.

## PWA / offline

El service worker se genera automáticamente con `vite-plugin-pwa`
(`registerType: "autoUpdate"`), precacheando todo el bundle (JS, CSS,
fuentes, íconos) para que la app instalada funcione sin conexión. Las
fuentes de Google Fonts están auto-hospedadas en `public/fonts/` (no hay
dependencia de una CDN externa en tiempo de ejecución).

## Sincronización multi-dispositivo (boletas)

Las boletas (`Entradas`) viven en Firebase como nodos individuales
(`sangre_nueva/tickets/{id}`), no como un arreglo único, para que varios
dispositivos puedan vender/hacer check-in al mismo tiempo el día del evento
sin pisarse entre sí. El correlativo de cada boleta (`PRE-0007`, etc.) se
genera con un contador transaccional (`sangre_nueva/counters/{tipo}`),
atómico entre dispositivos; si un dispositivo está sin conexión, genera un
id de emergencia único (marcado con `-X`) en vez de arriesgar un duplicado.

Al conectarse, la app migra automáticamente (una sola vez, de forma
idempotente) las boletas del arreglo viejo (`bm_tickets_v4`) a esta
estructura si todavía no se había hecho. El arreglo viejo no se borra —
queda en Firebase como respaldo de solo lectura.

Peleadores, emparejamientos y el nombre del evento siguen sincronizados
como un solo bloque (todo el arreglo se sobrescribe en cada cambio). Se
acepta el riesgo de que dos ediciones simultáneas se pisen porque en la
práctica los edita una sola persona a la vez.

## Estructura

```
src/
  constants.js        # categorías de peso, niveles, tipos de entrada, helpers
  lib/
    storage.js          # localStorage, sync del "blob" y peleadores
    tickets.js          # boletas: venta, correlativo, puerta y sus colas
    backups.js          # respaldos del evento en la nube
    storageKeys.js      # claves de localStorage compartidas por los anteriores
    firebase.js         # inicialización y sync de Firebase (API modular)
    matchmaking.js      # algoritmo de emparejamiento y sorteo
    eventDates.js       # fechas del evento → etiquetas (puro)
    cierreEvento.js     # resumen final de la velada + hoja imprimible
  components/          # un componente por archivo
  App.jsx
  main.jsx
public/
  fonts/                # fuentes auto-hospedadas
  icons/, assets/, manifest.json
```

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
- **Backups** (`sangre_nueva_backups`): solo el dueño.

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
    storage.js         # localStorage + helpers de boletas/contadores
    firebase.js         # inicialización y sync de Firebase (API modular)
    matchmaking.js       # algoritmo de emparejamiento y sorteo
  components/          # un componente por archivo
  App.jsx
  main.jsx
public/
  fonts/                # fuentes auto-hospedadas
  icons/, assets/, manifest.json
```

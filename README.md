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

**Pendiente de publicar manualmente (ver Fase 2).** Las reglas viven en
`database.rules.json` en la raíz del repo. Para publicarlas:

- Opción A — Consola: Firebase Console → proyecto `velada-sangre-nueva-22fb0`
  → Realtime Database → pestaña **Reglas** → pega el contenido de
  `database.rules.json` → Publicar.
- Opción B — CLI: `firebase deploy --only database` (requiere
  `firebase login` y el proyecto seleccionado en `.firebaserc`, que ya
  apunta a `velada-sangre-nueva-22fb0`).

**Verificación:** abre en una ventana de incógnito
`https://velada-sangre-nueva-22fb0-default-rtdb.firebaseio.com/sangre_nueva.json`
— debe devolver `null` con un error de permisos ("Permission denied"), nunca
los datos. Si ves los datos, las reglas no se aplicaron.

## PWA / offline

El service worker se genera automáticamente con `vite-plugin-pwa`
(`registerType: "autoUpdate"`), precacheando todo el bundle (JS, CSS,
fuentes, íconos) para que la app instalada funcione sin conexión. Las
fuentes de Google Fonts están auto-hospedadas en `public/fonts/` (no hay
dependencia de una CDN externa en tiempo de ejecución).

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

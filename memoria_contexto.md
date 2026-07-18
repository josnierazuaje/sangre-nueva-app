# Memoria de contexto — Cartelera + Super 4

_Última actualización: 2026-07-17 · rama base: `main` (commit `ee2ac10`) · última ronda: fantasmas + confirmaciones de alta (§7)_

Resumen técnico de los cambios recientes en la **pestaña Cartelera** (nombres
FECHIBOX en el título de categoría al imprimir + reubicación de botones) y de
los próximos pasos lógicos.

---

## 1. Qué se implementó

### 1.1 Nombres FECHIBOX en el título de categoría al imprimir la cartelera
**Commit:** `06088eb` — _feat(cartelera): mostrar también el nombre FECHIBOX en el título de categoría al imprimir_

La app usa la nomenclatura **World Boxing** (U15 / U17 / U19 / Elite) para las
categorías de edad. El organizador también usa los nombres **FECHIBOX** (nombre
chileno). Ahora la planilla imprimible de la cartelera muestra **ambos**.

**`src/constants.js`** — se agregó el mapa canónico, justo después de
`AGE_CATEGORIES`:

```js
export const FECHIBOX_LABEL = { escolar: "Escolar", cadete: "Cadete", juvenil: "Juvenil", adulto: "Adulto/Elite" };
```

Equivalencias (clave interna → World Boxing → FECHIBOX → edad):

| key       | World Boxing | FECHIBOX      | edad    |
|-----------|--------------|---------------|---------|
| `escolar` | U15          | Escolar       | 13–14   |
| `cadete`  | U17          | Cadete        | 15–16   |
| `juvenil` | U19          | Juvenil       | 17–18   |
| `adulto`  | Elite        | Adulto/Elite  | 19–40   |

**`src/components/FightCardView.jsx`** — en `printSheet()`, al construir el
encabezado de cada bloque de categoría:

```js
const cat = k === "mixta" ? null : getAgeCategory(list[0].r.age);
const fechibox = cat ? FECHIBOX_LABEL[cat.key] : null;
const headerText = cat
  ? `${cat.label}${fechibox ? " · " + fechibox : ""} · ${cat.formato}`.toUpperCase()
  : "⚠ CATEGORÍAS DE EDAD MEZCLADAS — REVISAR (WORLD BOXING NO PERMITE ESTE CRUCE)";
```

Resultado (encabezados verificados capturando el HTML de impresión real):

```
U15 · ESCOLAR · 3R × 1,5MIN
U17 · CADETE · 3R × 2MIN
U19 · JUVENIL · 3R × 3MIN
ELITE · ADULTO/ELITE · 3R × 3MIN
```

Detalles de robustez:
- Si la categoría no tiene equivalencia FECHIBOX (fuera de rango: `infantil` /
  `veterano`), `FECHIBOX_LABEL[cat.key]` es `undefined` y el encabezado cae al
  formato anterior (solo World Boxing) sin romperse.
- El grupo "mixta" (cruce de categorías, prohibido por World Boxing) conserva su
  aviso rojo intacto.

### 1.2 Botones Imprimir / WhatsApp reubicados
**Commit:** `b9ae3fe` — _feat(cartelera): subir los botones Imprimir/WhatsApp arriba, bajo el título del evento_

Antes estaban al **final** de la lista de peleas (había que scrollear hasta el
fondo). Se movieron **dentro de la tarjeta**, justo debajo del banner
"Sangre Nueva — La Velada" y **antes** de la lista de peleas:

```jsx
<div className="flex gap-2 p-3 border-b border-gray-800">
  <button onClick={printSheet} ...>🖨️ Imprimir</button>
  <button onClick={shareWA} ...>📤 WhatsApp</button>
</div>
```

Verificado por posición: banner (y≈322) → botones (y≈422) → primera pelea (y≈523).

---

## 2. Cómo funciona la lógica de impresión (`printSheet`, FightCardView.jsx)

1. Toma `matchups` y resuelve cada uno a `{ m, r, b }` (peleador rojo/azul) vía
   `fighters.find(...)`, descartando los que no resuelven.
2. **Agrupa por categoría de edad** (`getAgeCategory(r.age).key`). Si el rojo y
   el azul caen en categorías distintas, el grupo es `"mixta"` (bloque de alerta).
3. Ordena cada grupo por peso (suma de ambos pesos) y los grupos por
   `AGE_GROUP_ORDER` (escolar → cadete → juvenil → adulto → …).
4. Construye una tabla HTML (`N° / Escuela / Atleta / VS / Atleta / Escuela /
   Peso / Nota`). El encabezado de cada bloque es el `headerText` de arriba.
5. Abre `window.open("", "_blank")`, escribe el HTML con `<style>` embebido y
   dispara `win.print()`.

Notas de estilo del CSS embebido (ya en producción por cambios previos):
- `td.esc { text-transform:uppercase }` → **nombres de escuela en mayúscula**.
- Colores de esquina y fondos forzados con `print-color-adjust:exact`.

> La función Super 4 (`printSuper4` en `Super4View.jsx`) es análoga pero
> separada, y ya imprime esquina roja/azul en color + mayúsculas y escuelas en
> mayúscula (commit `ca902a9`). **No** comparte código con `printSheet`.

---

## 3. Próximos pasos lógicos

Ordenados por valor/esfuerzo. Los tres primeros son consolidaciones que este
cambio dejó "a medio camino" (ahora existe la fuente canónica en `constants.js`).

1. ~~**Unificar `FECHIBOX_LABEL`.**~~ ✅ **HECHO** (rama `refactor/fechibox-unico`, commit `6b022e2`).
   Eliminadas las copias locales de `Super4View.jsx` y `FighterList.jsx`; las tres
   vistas importan la canónica de `constants.js`. Cambio visible: FighterList pasó
   de mostrar "Adulto" a "Adulto/Elite".

2. ~~**Mostrar FECHIBOX también en el Super 4 impreso.**~~ ✅ **HECHO** (misma rama, commit `99a4311`).
   Nuevo helper puro `bracketPrintTitle(b)` en `super4.js` (reconstruye
   "World Boxing · FECHIBOX · división" desde ageKey/divKey o parseando el catKey,
   robusto ante catLabel inconsistente). Usado en `printSuper4`. Con tests.

3. ~~**Unificar `escapeHtml`.**~~ ✅ **HECHO** (misma rama, commit `c526461`).
   Centralizado en `src/lib/html.js` (versión completa, 5 entidades incl. comilla
   simple); las tres vistas lo importan. La impresión del Super 4 ahora también
   escapa la comilla simple. Con tests (`html.test.js`).

4. ~~**Extraer la generación del HTML de impresión a funciones puras testeables.**~~
   ✅ **HECHO** (misma rama, commit `refactor(print)`). Dos módulos nuevos:
   - `src/lib/printCartelera.js` → `buildCarteleraHtml(matchups, fighters)` (puro,
     sin fecha). `FightCardView.printSheet` ahora solo lo llama y abre la ventana.
   - `src/lib/printSuper4.js` → `buildSuper4Html(super4, byId, fecha)` (la fecha se
     pasa desde el componente para que el builder sea puro). `Super4View.printSuper4`
     solo lo llama.
   Verificado **byte a byte** (hash del HTML antes/después idéntico: cartelera
   11506/1326861674, super4 11015/-455902613). Tests nuevos: `printCartelera.test.js`
   (7) y `printSuper4.test.js` (9) cubren agrupación, encabezados, orden por peso,
   reinicio de numeración, escape y placeholders. Suite total: 153 tests.

5. ~~**Centralizar las fechas del evento.**~~ ✅ **HECHO** (misma rama, commit `refactor(fechas)`).
   Barrido exhaustivo (workflow de 6 buscadores + síntesis): las fechas reales del
   evento (sáb 1 / dom 2 de agosto 2026) estaban quemadas en **7 sitios
   renderizados** del flujo Super 4 (`printSuper4.js:33,34,38,92` y
   `Super4View.jsx:354,380,388`), **independientes** del `eventLabel` (que es un
   título libre editable, `bm_event_label`, default "próxima fecha por definir" —
   ninguna fecha se derivaba de él). Nueva fuente única en `constants.js`:
   `EVENT_DATES` (día-semana completo/abreviado, `day` como string de 2 dígitos,
   mes, año) + `EVENT_LABELS` (6 etiquetas pre-compuestas: `semiAbbr` "Sáb 01",
   `finalAbbr` "Dom 02", `semiWd`/`finalWd`, `semiLong`/`finalLong`). Todos los
   sitios referencian `EVENT_LABELS`. Verificado **byte a byte** (super4 sigue en
   11015/-455902613). Test de contrato `eventDates.test.js` (no fija la fecha
   concreta). Cambiar la fecha ahora = editar solo `EVENT_DATES`. Suite: 156 tests.

   > Seguimiento (hecho, commit `feat(cartelera): fecha real del evento`): el
   > encabezado de la Cartelera y el texto de WhatsApp (`FightCardView.jsx`)
   > mostraban `new Date()` (la fecha de HOY). Ahora usan `EVENT_LABELS.rango`
   > ("sábado 01 y domingo 02 de agosto de 2026"), derivado de `EVENT_DATES`. La
   > impresión de la Cartelera no usa la fecha, así que quedó byte-idéntica.

---

## 4. Contexto rápido del proyecto

- **App:** "Sangre Nueva — La Velada" — gestión de un evento de boxeo (peleadores,
  emparejamientos VS, torneo Super 4, cartelera, venta/check-in de entradas).
- **Stack:** React 18 + Vite 6, Firebase Realtime Database, PWA. Deploy en
  **Cloudflare Pages** (auto-deploy al push a `main`).
- **URL de producción:** `https://sangre-nueva-la-velada.pages.dev` (el subdominio
  `pages.dev` es el nombre del proyecto en Cloudflare, **no** el del repo
  `sangre-nueva-app`). Fuente: `README.md` §Despliegue.
- **Gotcha de deploy:** la PWA (`registerType: autoUpdate`) sirve el bundle viejo
  en la 1ª carga tras un deploy — **recargar una vez** para ver los cambios.
- **Reglas de emparejamiento (duras, en `src/lib/matchmaking.js`):** no mezclar
  categoría de edad World Boxing ni sexo; no parear misma escuela; máx. 3 peleas
  de diferencia salvo ambos 15+; atletas del Super 4 excluidos de la cartelera.

---

## 5. Ronda Super 4 + búsqueda (jul 2026)

Stack: **React 18 + Tailwind 4 + Vite 6**, **Firebase Realtime Database**, **PWA**
(vite-plugin-pwa), tests con **Vitest**. Deploy en **Cloudflare Pages** (auto al
push a `main`). 179 tests.

Cambios (cada uno en su rama → PR → merge → deploy):

- **Búsqueda sin acentos** (`701f185`). La lista de Peleadores y el historial de
  entradas ahora buscan con `normName` (sin acentos/mayúsculas/espacios), igual
  que la deduplicación → "joaquin" encuentra a "Joaquín".

- **Super 4 · botón "＋ Elegir"** (`a926345`). Un cupo vacío o con "peleador
  eliminado" muestra un botón que abre el selector de peleadores elegibles de la
  categoría, para rellenarlo sin regenerar la llave.

- **Super 4 · "Cantidad de llaves"** (`b62538d`). Selector Todas/1–5 que topa
  cuántas llaves arma GENERAR. El tope realmente reemplaza las categorías
  elegidas (limpia las que quedan fuera; conserva legacy y no elegidas).

- **Super 4 · "Armar aunque falten peleadores"** (`1a0703a`). Interruptor que
  arma llaves INCOMPLETAS (categorías con ≥1 atleta) con cupos "＋ Elegir", para
  visualizar todas las categorías del evento (p.ej. los 5 cinturones) e irlas
  completando. El ✓ de una semi se bloquea hasta tener sus 2 peleadores reales.

- **Super 4 · regla de escuela** (`ba3f291`). No pueden ir dos peleadores de la
  misma escuela en la misma llave (si ambos ganan su semi chocarían en la final).
  Se aplica al generar y al rellenar con "＋ Elegir". Comparación de escuela con
  `normName` (insensible a acentos); escuelas vacías no bloquean.

Reglas duras vigentes del Super 4: tope de experiencia (novatos, ≤3 peleas por
defecto), 1 atleta por escuela por llave, atletas del Super 4 excluidos de la
cartelera. Estado actual del evento: 5 cinturones (U17·Superwélter incompleta +
4 Elite), sin violaciones de escuela ni duplicados.

---

## 6. Layout responsive de escritorio (jul 2026)

**Estado: MERGEADO y desplegado** (PR #25 `feat/responsive-desktop` + fix del
Super 4 abajo). En producción y verificado en vivo.

**Objetivo:** en PC la app ya no queda confinada en una columna central de 512px
con franjas negras a los lados. Se aprovecha el ancho con un sidebar + cuadrículas.

**Regla ESTRICTA (del organizador):** el diseño y la funcionalidad en **móvil
(<1024px) no se tocan ni un pixel**. Todo lo nuevo va detrás de la variante `lg:`
(Tailwind v4, `min-width: 64rem`) — mobile-first puro. Se eligió el corte en
**1024px (lg)** y no 768px para que teléfonos en horizontal y tablets chicas sigan
viendo el diseño móvil intacto.

Cambios (`29c5d5b` sidebar+grids · `43d09f1` corte en rem+contenedor exacto ·
`7cd9102` fix llave a 1024px):

- **Contenedor fluido** (`App.jsx`). La raíz pasa de `max-w-[512px]` (móvil, =
  el `maxWidth:512px` inline original, exacto) a `lg:max-w-none lg:flex-row`; el
  contenido se topa en `lg:max-w-6xl` centrado. Adiós franjas negras.
- **Sidebar fijo izquierdo** (`hidden lg:flex`, `w-64`/`xl:w-72`): branding+logo,
  las 6 pestañas en vertical, y al pie la fecha del evento (editable), el botón
  ☁ Nube y el menú ⋮ del dueño. El `<header>`, la barra de fecha y el `<nav>`
  inferior quedan `lg:hidden` (solo móvil). La navegación de ambas vive en una
  sola constante `NAV_ITEMS` (nunca se desalinean); helpers compartidos `go()`,
  `editEventLabel()`, `menuActions`, `syncBtnCls`/`syncLabel` (mismo DOM en móvil).
- **Cuadrículas**: Peleadores `lg:grid-cols-2 xl:grid-cols-3` (búsqueda+filtros en
  una fila); VS `lg:grid-cols-2` (acciones centradas `lg:max-w-xl`); Historial de
  entradas `lg:grid-cols-2`. Super 4 en **dos columnas solo desde `xl`** (controles
  `xl:w-[420px]` + llaves `xl:flex-1`); entre 1024–1279px queda en una sola columna
  a todo el ancho — ver el fix abajo. Cartelera, formulario y Entradas centrados
  con ancho cómodo (`lg:max-w-3xl`/`2xl`/`4xl`).
- **index.css**: la media query del anti-zoom iOS (`font-size:16px`) se acotó a
  `@media (max-width: 63.98rem)` — en **rem** para coincidir con el breakpoint
  `lg` aunque cambie la fuente base del navegador; en PC los inputs recuperan su
  tamaño de diseño.

**Fix del Super 4 en la banda 1024–1279px** (commit `b3aa041`, fast-forward a
`main`). Una auditoría adversarial multi-lente del diff (4 lentes de revisión + 3
refutadores por hallazgo, veredicto por mayoría) marcó **1 hallazgo menor**: con
el split de dos columnas activándose en `lg`, entre 1024 y ~1279px la columna de
llaves quedaba MÁS angosta que en móvil (bracket `grid "1fr 18px 1fr"` en ~166px
por lado) y **truncaba el nombre del finalista a ~9 caracteres** ("Benjamín Fu…").
Fix: el split (`Super4View.jsx`, wrappers de columnas) pasó de `lg:` a `xl:`, así
entre 1024–1279 el Super 4 es una sola columna a todo el ancho (nombres completos)
y solo desde `xl` (≥1280px, controles 420px) se divide. La auditoría también
levantó y **descartó** (refutado 0/3) un supuesto "hueco" de 0.32px entre `63.98rem`
y `64rem` en la media query del anti-zoom: no cae ningún viewport entero ahí.

**Verificación:** 179/179 tests + build OK en cada cambio. Las 6 vistas revisadas
en navegador a 1440px y 1024px; paridad móvil a 375px confirmada pixel-idéntica
contra `main`. El fix se verificó **en producción** a 1024px con los datos reales
del evento: el wrapper del split es `display:block` (una columna) y **0 nombres
truncados** en las llaves (medido por JS + captura). Para probar sin login se usó
un bypass temporal (`dev_bypass` en localStorage) que **no** se commitea.

**Gotcha de la PWA (confirmado en vivo):** tras cada deploy la 1ª carga sirve el
bundle viejo cacheado por el service worker — hay que **recargar una vez** (o
cerrar/reabrir) para ver el bundle nuevo. La URL de producción es
`sangre-nueva-la-velada.pages.dev` (ver §4).

---

## 7. Peleadores "fantasma" + confirmaciones de alta (jul 2026)

**Estado: MERGEADO y desplegado** (3 PRs fast-forward a main: `d5e9b11`,
`26e1129`, `ee2ac10`; bundle verificado en producción).

### 7.1 El bug: un peleador que "no aparece pero sí existe"

**Síntoma reportado:** al buscar a "Matias Marin" en Peleadores → "Sin
resultados"; pero al intentar agregarlo de nuevo → alerta "Ya existe un peleador
con el mismo sexo y peso". Contradicción total, con sesión fresca y sincronizada.

**Diagnóstico (contra los datos reales de producción, no contra supuestos):**
- La búsqueda NUNCA estuvo rota: los 87 peleadores de la nube eran encontrables
  por su nombre (auditado con la misma `normName` del código). Los primeros
  intentos de "arreglar acentos/mayúsculas" atacaban algo sano.
- La nube NO tenía a "Matias Marin" (verificado con lectura autoritativa
  `get()` + estado 100% limpio). El registro vivía **solo en el localStorage del
  dispositivo del dueño**: un alta cuya escritura a Firebase FALLÓ y quedó
  atascada local — un **fantasma**. La lista sincronizada muestra la verdad de
  la nube (no está), pero el chequeo de duplicados del formulario lee el arreglo
  local (sí está) → la contradicción exacta.
- Se reprodujo el mecanismo en vivo (con un peleador de prueba en producción,
  luego eliminado): el doble-registro NO borra al original ni rompe la búsqueda;
  el fantasma requiere un guardado fallido.

**Lección de diagnóstico:** si "no aparece en la lista pero sí en el chequeo de
duplicados" → comparar **localStorage vs nube** (`get()` directo a
`sangre_nueva/bm_fighters_v4`). No asumir bug de UI.

**Limpieza manual del fantasma** (solo hizo falta una vez, antes del auto-reparo):
borrar los datos del sitio. Ojo: el dueño usa la app **instalada como PWA**
(ventana sin barra de direcciones) — hay que "Abrir en Chrome" y desde ahí
Configuración de sitios → Borrar datos, o `chrome://settings/content/all`.

### 7.2 Lo que quedó en la app (todo en main, desplegado y verificado)

- **Auto-reparo de fantasmas** (`26e1129`, App.jsx + storage.js). Una vez por
  sesión, al conectar y tras hidratar, lee la copia autoritativa de la nube
  (`fetchCloudArray`) y quita los peleadores locales cuyo id no está en ella.
  Lógica pura `stripLocalGhosts(local, cloud)` con 6 tests: **nunca borra
  reales**, y con nube nula/vacía **no toca nada** (una lectura dudosa jamás
  vacía la lista). Verificado en producción: fantasma inyectado solo-local →
  recarga → eliminado (87 reales intactos).
- **Botón "Recargar desde la nube"** (menú ⋮): borra lo local y recarga desde la
  copia compartida — arreglo de un clic sin tocar la nube ni otros dispositivos.
  "Reiniciar evento" (destructivo) se movió al final del menú.
- **Anti-duplicado sin trampa** (`d5e9b11`, FighterForm). El confirm
  "¿Agregar de todos modos?" creaba un registro que la reconciliación borraba en
  silencio ("lo agregué pero no aparece"). Ahora: banner ámbar visible
  «"X" ya estaba registrado (peso · escuela) — no se duplicó» y NO se crea nada.
- **Deshacer borrado** (`d5e9b11`, App). Toast fijo "Eliminaste a X ·
  Deshacer" (8s); Deshacer re-crea con el MISMO id (transacción por id). Un
  toque errado en la papelera ya no es irreversible.
- **Confirmación de alta imposible de perder** (`ee2ac10`). El banner verde del
  formulario dura 7s (antes 4s, se perdía registrando de corrido) y además un
  **toast verde fijo** abajo al centro ("✓ X fue agregado a la base de datos",
  6s, cierre manual) confirma cada alta en cualquier vista/scroll. Comparte
  contenedor con el toast de Deshacer (se apilan). Un duplicado NO dispara el
  toast verde (solo el banner ámbar). **Señal rápida de alta exitosa: el
  formulario se limpia.**

### 7.3 Cómo verificar un alta si hay dudas

1. Al agregar: deben verse el banner verde (form) y el toast verde (abajo), y el
   formulario queda vacío.
2. En la nube: el contador de "Peleadores (N)" sube; la búsqueda lo encuentra.
3. Si algo no cuadra: menú ⋮ → "Recargar desde la nube" (o simplemente recargar:
   el auto-reparo corre solo al conectar).

# Memoria de contexto — Cartelera + Super 4

_Última actualización: 2026-07-17 · rama base: `main` (commit `ba3f291`)_

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

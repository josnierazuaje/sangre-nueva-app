# Seguridad de Sangre Nueva

Qué protege esta app, qué se hizo, qué falta hacer **en las consolas** (yo no
tengo acceso) y qué de la lista habitual de seguridad **no aplica aquí y por
qué**. Lo último importa tanto como lo primero: creer que tienes puesta una
protección que en realidad no existe es peor que saber que te falta.

## Cómo está armada la app (esto decide todo lo demás)

No hay servidor propio. Es un sitio **estático** (Cloudflare Pages) que habla
**directo** con **Firebase Realtime Database** desde el navegador. No existe un
"backend" nuestro donde poner middleware, CORS o rate limiting: **el backend es
Firebase**, y ahí se manda con dos cosas: **el login** y las **reglas de la base**
(`database.rules.json`). Todo lo que sigue gira alrededor de eso.

---

## Hecho en este cambio

### 1. Validación en el servidor, no solo en la pantalla

`database.rules.json` ahora valida lo que entra, para peleadores, cartelera,
Super 4 y título del evento (las boletas y las fechas ya lo hacían):

- **Peleadores**: `id` y `fullName` obligatorios y de tipo texto; nombre de 2 a
  80 caracteres; escuela ≤ 80; teléfono ≤ 40; notas ≤ 2000; `sexo` solo `M`/`F`.
- **Cartelera y Super 4**: `id` obligatorio; los ids de los rivales, texto ≤ 40;
  notas y etiquetas con tope de largo.
- **Título**: texto ≤ 80.
- **Estos nodos solo aceptan una lista o el centinela.** La app marca "vaciado a
  propósito" escribiendo el texto `__EMPTY__`; cualquier **otra** cadena suelta
  ahora se rechaza. Antes, una cuenta robada podía reemplazar el padrón entero
  por un texto cualquiera —incluido uno de megabytes— y dejar la app en blanco.

Un intento que se probó y se descartó: **reservar el centinela al dueño**. Suena
bien, pero rompe algo legítimo —cuando el staff borra al último peleador de la
lista, la app escribe justo ese centinela— y no protege de nada, porque quien
pudiera escribir `__EMPTY__` puede escribir igual de fácil una lista de un solo
elemento. Las pruebas del repositorio (`reglas.test.js`) lo detectaron antes de
publicarlo.

El límite honesto: las reglas topan **forma y tamaño**, no intención. Una cuenta
de staff robada todavía puede escribir un peleador falso o borrar de a uno — con
`.validate` no se puede contar cuántos elementos trae un arreglo. La defensa
contra eso son pocas cuentas, contraseñas rotadas después de cada evento y el
respaldo antes de cada borrado.

Todo esto está cubierto por pruebas: `reglas.test.js` evalúa el **texto real**
del archivo de reglas (538 pruebas en total, 13 nuevas en este cambio), así que
si alguien afloja una validación, el repositorio lo canta.

> **Estas reglas hay que publicarlas a mano** — ver "Lo que tienes que hacer tú".

### 2. Content Security Policy (bloquea scripts no autorizados)

`public/_headers` (Cloudflare Pages lo aplica a todo el sitio). Lo importante:

- `script-src 'self'`: solo corre JavaScript servido desde el propio dominio.
  El build **no genera ningún script en línea**, así que no hizo falta abrir
  `'unsafe-inline'`, que es lo que suele dejar inútil a una CSP.
- `connect-src` solo a Firebase: **si un script inyectado intentara mandar el
  padrón a otro servidor, el navegador lo bloquea**. Probado de verdad: un
  `fetch` a un dominio ajeno queda bloqueado por la política, y el de Firebase
  pasa.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`: nadie puede meter tu app
  dentro de un iframe en otro sitio para robar clics o hacerla pasar por suya.
- Se dejó habilitada la **cámara** (`camera=(self)`): la necesita el escáner de
  entradas. Micrófono, ubicación, pagos y USB, apagados.

Verificado contra el sitio ya compilado, sirviéndolo con estas cabeceras: la app
carga con sus tipografías y su diseño, las hojas imprimibles siguen aplicando
sus estilos, los QR en `data:` cargan, Firebase responde y la fuga a un dominio
ajeno queda bloqueada.

### 3. Sanitización

Ya estaba bien resuelto y se confirmó revisando el código: la app **guarda el
texto tal cual y lo escapa al mostrarlo**, que es el orden correcto (sanear al
guardar destruye datos legítimos: apellidos con apóstrofo, nombres con `&`).

- En pantalla: React escapa todo por defecto. **No hay un solo
  `dangerouslySetInnerHTML` ni `eval` en el código.**
- En las hojas imprimibles (cartelera, Super 4, cierre, planillas), que sí arman
  HTML a mano, cada dato pasa por `escapeHtml` — 29 usos, con pruebas que fijan
  que un nombre con `<script>` sale escapado.
- Nuevo: las reglas de arriba topan el largo, así nadie puede meter 10 MB de
  texto en el campo "notas".

---

## Lo que tienes que hacer tú (son consolas, yo no tengo acceso)

### A. Publicar las reglas nuevas — **necesario para que el punto 1 exista**

1. Firebase → tu proyecto → **Realtime Database** → pestaña **Reglas**.
2. Pega el contenido completo de `database.rules.json` y **Publicar**.
3. Prueba después de publicar, en este orden: **registrar un peleador**,
   **editarlo**, **borrarlo**, **vender una entrada** y **escanearla**. Si algo
   rebota, el chip de sincronización se pone en rojo y la consola del navegador
   dice `PERMISSION_DENIED`: avísame con esa línea y lo corrijo.

Hazlo con calma y **no el día del evento**.

### B. Restringir la clave de la API por dominio — esto es tu "CORS"

Firebase Realtime Database **no tiene CORS**: no se puede decir "solo mi
dominio". Lo más parecido, y sí existe:

1. Google Cloud Console → **APIs y servicios** → **Credenciales**.
2. La clave del proyecto (`AIzaSy…`, la que está en `src/lib/firebase.js`).
3. **Restricciones de aplicación** → *Sitios web (referrers HTTP)* → agrega:
   - `https://sangre-nueva-la-velada.pages.dev/*`
   - `http://localhost:8765/*` (para poder seguir probando en tu Mac)

Ojo con lo que esto sí y no hace: **estorba**, no blinda — un referrer se puede
falsificar. Lo que de verdad protege los datos son las reglas y el login.

### C. App Check — clave correcta puesta y verificada, en modo MONITOREO

> **Estado (14-ago-2026):** en `RECAPTCHA_SITE_KEY` llegó a cargarse por error la
> clave **secreta** del par en vez de la del **sitio**; reCAPTCHA respondía
> "Invalid site key" y App Check fallaba cada 30 segundos, sin romper la app
> (la capa está en `try/catch`). Ya está la clave correcta, **comprobada en
> producción**: `grecaptcha.execute` desde el dominio real devolvió un token.
>
> **Queda pendiente rotar esa clave secreta**: quedó en el historial del
> repositorio —que es público— y en un bundle desplegado. Borrarla del código no
> la borra del historial; lo único que la anula es **generar un par nuevo** en la
> consola de reCAPTCHA y borrar el viejo (y entonces hay que actualizar las dos
> puntas: la secreta en Firebase, la del sitio en el código).
>
> Qué se puede hacer con esa clave filtrada, sin dramatizar: **no** sirve para
> falsificar tokens de App Check —esos los emite Firebase—, así que nadie se
> salta la protección con ella; sí permite gastar tu cuota de verificación de
> reCAPTCHA.
>
> **Esa clave secreta hay que rotarla**: quedó en el historial del repositorio
> —que es público— y en un bundle desplegado. Borrarla del código no la borra
> del historial; lo único que la anula es **generar un par nuevo** en la consola
> de reCAPTCHA (y borrar el viejo).
>
> Las dos claves son indistinguibles a la vista: 40 caracteres y las dos
> empiezan con `6L`. La única forma fiable de comprobar una clave es pedir un
> token **desde el dominio de verdad** — abre el sitio publicado y, en la
> consola del navegador:
>
> ```js
> grecaptcha.execute("LA_CLAVE", { action: "prueba" }).then(t => console.log(t.length))
> ```
>
> Un número de cuatro cifras = clave y dominio correctos. "Invalid site key" =
> no es la clave del sitio (probablemente es la secreta). "Invalid domain for
> site key" = falta autorizar el dominio.
>
> Dos atajos que **no** funcionan, para que nadie los vuelva a intentar:
> `siteverify` responde `invalid-input-response` hasta con una cadena inventada
> (valida el token antes que la clave), y el endpoint `anchor` da "invalid
> domain" en dominios que sí están autorizados cuando la clave es v3.

Cuando esté la clave correcta, esto es lo que ya está resuelto:

Es la respuesta real a "solo mi app puede hablar con mi backend": cada petición
viaja con un token que solo se consigue ejecutando la app real en un dominio
autorizado, así que **una copia de la app, un script o un navegador cualquiera
no pueden escribir**, aunque tengan una cuenta válida.

Hecho: la app web está registrada en App Check con **reCAPTCHA v3**, y el código
lo inicializa en `initAppCheck` (`src/lib/firebase.js`) antes de tocar la base.
La clave del sitio es pública y va en el código; la secreta vive solo en la
consola. La CSP se abrió lo justo para reCAPTCHA (`www.google.com` y
`www.gstatic.com` en cuatro directivas).

**Está en monitoreo: registra, no bloquea.** Lo que falta es la decisión final:

1. Firebase → **App Check** → pestaña **APIs** → *Realtime Database*: ahí se ve
   el porcentaje de peticiones **verificadas** frente a las que no.
2. Déjalo correr unos días de uso normal, **incluida una velada** si puedes.
3. Cuando el gráfico muestre que prácticamente todo sale verificado, y **nunca
   en la semana de un evento**, activa *Aplicar*. Desde ese momento lo no
   verificado se rechaza.

> Antes de aplicar, piensa en el recinto: si su wifi tiene portal cautivo o
> bloquea Google, los teléfonos no consiguen token y **dejan de vender**. En
> monitoreo eso no puede pasar. No hay prisa por activarlo.

**Para seguir programando en `localhost`**: al abrir `npm run dev`, la consola
del navegador imprime `App Check debug token: <uuid>`. Ese token se registra en
App Check → Apps → ⋮ → *Administrar tokens de depuración*. Es un pase que
salta la verificación: registra solo el del equipo de desarrollo y bórralo
cuando no se use.

Si App Check falla (sin señal, un bloqueador, reCAPTCHA caído), la app **sigue
funcionando**: el código lo envuelve en un `try/catch` y solo avisa por consola.
Un fallo de esta capa nunca puede impedir registrar un peleador ni vender una
entrada.

### D. Alerta de gasto — el sustituto honesto del rate limiting

Firebase RTDB **no ofrece rate limiting** por usuario ni por endpoint: no hay
dónde ponerlo. Lo que sí puedes tener es que te avisen si alguien abusa:

1. Firebase → **Uso y facturación** → **Alertas de presupuesto** → un correo al
   pasar cierto consumo (descargas por día).
2. Con App Check activo, el abuso desde fuera de tu app se corta solo.

Los intentos de login ya tienen freno: Firebase Authentication bloquea por IP
tras varios fallos seguidos.

---

## Lo que NO aplica a esta app (y por qué)

### "Guarda las claves de entorno, nunca en el código"

Revisado: **en el repositorio no hay ningún secreto** (ni `.env` en el
historial, ni claves privadas, ni cuentas de servicio; `.gitignore` ya cubre
`.env`). Lo único que parece una clave es el `firebaseConfig` de
`src/lib/firebase.js`, y **no es un secreto**: identifica al proyecto, no
autoriza nada. Firebase la publica a propósito y viaja en cualquier app web.

Moverla a una variable de entorno **no cambiaría nada**: Vite las incrusta en el
bundle al compilar, así que terminaría igual de visible, solo que más difícil de
mantener. Lo que impide que alguien con esa clave lea tus datos es el **login**
y las **reglas**. La restricción por dominio (punto B) es el candado que sí le
corresponde a esa clave.

### "Row Level Security, cada usuario solo ve sus datos"

RLS es de bases SQL (Postgres/Supabase). Aquí no hay tablas ni filas, y sobre
todo: **los datos no son de cada usuario, son del evento**. El padrón, la
cartelera y las entradas son compartidos por el equipo a propósito — de eso vive
la app.

Lo que sí existe, y es el equivalente correcto, ya está puesto: **permisos por
rol** en las reglas.

| | Peleadores / cartelera | Entradas | Fechas, marca, respaldos |
|---|---|---|---|
| **Dueño** (tu correo) | lee y escribe | lee y escribe | lee y escribe |
| **Staff de registro** | lee y escribe | lee y vende | solo lee |
| **Staff de puerta** | **sin acceso** | solo marcar ingreso | sin acceso |

La cuenta de puerta es el mejor ejemplo de por qué esto está bien hecho: el
teléfono de la entrada **no puede leer el padrón** (con datos de menores) ni
cambiar el precio de una boleta; lo único que puede hacer es pasar una entrada
de "activo" a "ingresado".

Lo que queda abierto por diseño: cualquier cuenta de staff de registro ve el
padrón completo. Si eso te incomoda, la salida no es técnica sino de manejo:
pocas cuentas y cambiar la contraseña después de cada velada.

### "Que no me copien la app"

El código de cualquier app web se puede leer y copiar; no hay forma de impedirlo
(minificarlo solo lo hace incómodo). Pero copiar el código **no da acceso a
nada**: una copia se queda sin tus datos, porque el login y las reglas viven en
tu proyecto de Firebase. Con App Check (punto C), además, esa copia **ni siquiera
puede hablar con tu base**.

Lo que sí conviene cuidar, y es más probable que un hackeo: **las contraseñas
que le pasas al staff**. Cámbialas después de cada evento.

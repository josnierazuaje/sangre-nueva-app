# Permisos de la base de datos — quién puede hacer qué

Sangre Nueva no tiene servidor propio: la app corre entera en el teléfono. Eso
significa que **las reglas de `database.rules.json` son la única barrera real**.
Lo que la app esconde en pantalla no protege nada — quien tenga la clave puede
hablar con la base directamente desde el navegador de un computador.

Por eso hay tres roles.

## Los tres roles

| | Dueño | Staff | Puerta |
|---|---|---|---|
| Peleadores, cartelera, Super 4 | leer y escribir | leer y escribir | **nada** |
| Vender entradas | sí | sí | **no** |
| Borrar una entrada | sí | sí | **no** |
| Ver las entradas | sí | sí | sí |
| Marcar un ingreso (check-in) | sí | sí | sí |
| Vaciar el padrón de un golpe | sí | **no** | **no** |
| Editar quién es staff | sí | no | no |
| Respaldos | sí | no | no |

**Dueño**: se reconoce por el correo (`josnier.azuaje@gmail.com`), no por UID.

**Staff**: personas de confianza con cuenta propia. Venden y organizan.

**Puerta**: la cuenta compartida del escáner. Solo puede leer las entradas y
cambiar una boleta de «activo» a «ingresado». No puede crear entradas (gratis),
ni borrarlas, ni devolver una usada a «activo» para revalidar su QR, ni tocar
el precio, el nombre, la cantidad ni el token. Tampoco ve el padrón de
peleadores, que incluye datos de menores.

## Cómo se marca a alguien como «puerta»

En la consola de Firebase → **Realtime Database** → pestaña **Datos**, dentro
del nodo `staff`:

- `staff/<UID> = true` (o cualquier valor) → **staff pleno**
- `staff/<UID> = "puerta"` → **solo puerta**

Es decir: **el valor `puerta` es lo único que restringe**. Cualquier otro valor
deja la cuenta como staff pleno, que es lo que había antes de esta separación.
Por eso publicar las reglas no rompe nada por sí solo: aprieta recién cuando se
marca a alguien.

Para quitarle el acceso a una persona, se borra su UID de `staff`.

## Cómo se publican las reglas

Consola de Firebase → **Realtime Database** → pestaña **Reglas** → pegar el
contenido de `database.rules.json` → **Publicar**.

Antes de publicar conviene probarlas ahí mismo con **«Simulador de reglas»**
(el botón está en esa misma pestaña).

## Por qué la app tuvo que cambiar a la vez

Hasta ahora el teléfono de la puerta se suscribía igual a peleadores, cartelera
y Super 4 aunque su pantalla no mostrara nada de eso. Si se le quita la lectura
sin cambiar la app, esas suscripciones fallan. Por eso el modo escáner ahora
abre solo la conexión y las boletas (`startFirebaseSync(..., { soloConexion: true })`).

## Pruebas

`src/lib/__tests__/reglas.test.js` evalúa el **texto real** de
`database.rules.json` contra la tabla de arriba. Si alguien cambia una regla y
rompe uno de esos límites, las pruebas fallan (`npm test`).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================
// REGLAS DE LA BASE — lo que NO se puede aflojar sin darse cuenta
// ============================================
// `database.rules.json` es el único backend que tiene esta app: no hay servidor
// propio, así que ahí se decide quién ve los datos de los menores y quién puede
// borrar la recaudación. Y es un archivo que se edita a mano, se pega en una
// consola web y no lo compila nadie: un permiso de más no falla, simplemente
// deja pasar.
//
// QUÉ PRUEBA ESTO Y QUÉ NO. Esto NO evalúa las reglas —no hay intérprete de la
// gramática de RTDB aquí, ni emulador (necesita Java, que no está instalado)—.
// Lo que fija son las propiedades ESTRUCTURALES cuyo incumplimiento es el error
// que de verdad se comete al editar este archivo: conceder de más por descuido,
// olvidar excluir a la cuenta de puerta, o dejar suelto un `true`.
//
// La evaluación real se sigue comprobando en el Simulador de la consola de
// Firebase antes de publicar (ver README). Esto es la red que avisa antes.

const AQUI = dirname(fileURLToPath(import.meta.url));
const reglas = JSON.parse(readFileSync(resolve(AQUI, "../../../database.rules.json"), "utf8")).rules;

const DUENO_APP = "josnier.azuaje@gmail.com";
const evento = reglas.eventos.$eid;

// Recorre el árbol y devuelve [ruta, expresión] de cada .read/.write/.validate.
function recorrer(nodo, ruta = "") {
  const salida = [];
  for (const [clave, valor] of Object.entries(nodo || {})) {
    const aqui = ruta ? ruta + "/" + clave : clave;
    if (typeof valor === "string") salida.push([aqui, valor]);
    else if (valor && typeof valor === "object") salida.push(...recorrer(valor, aqui));
  }
  return salida;
}

describe("las reglas de la velada de Chile no se tocan", () => {
  it("el árbol viejo sigue existiendo con sus nodos", () => {
    // Si alguien 'limpia' esto, la velada ya disputada —con sus 42 boletas y su
    // padrón— se queda sin permisos y la app deja de leerla.
    expect(reglas.sangre_nueva).toBeTruthy();
    expect(reglas.sangre_nueva_backups).toBeTruthy();
    expect(reglas.staff).toBeTruthy();
    for (const clave of ["bm_fighters_v4", "bm_matchups_v3", "bm_super4_v1", "tickets", "counters"]) {
      expect(reglas.sangre_nueva[clave], clave).toBeTruthy();
    }
  });
  it("la raíz sigue denegando por defecto", () => {
    expect(reglas[".read"]).toBe(false);
    expect(reglas[".write"]).toBe(false);
  });
});

describe("un evento nuevo no concede permisos heredados", () => {
  it("el .read del evento es SOLO del dueño, nunca del staff", () => {
    // En RTDB el permiso del padre SE HEREDA y GANA sobre cualquier regla más
    // estricta del hijo. Un .read para el staff aquí le daría a la cuenta de
    // puerta el padrón completo (con menores) y los respaldos. Se concede solo
    // por propiedad — el dueño ya podía leerlo todo nodo a nodo, y lo necesita
    // para el respaldo que se descarga antes de borrar la velada.
    expect(evento[".read"]).toContain("ownerUid");
    expect(evento[".read"]).not.toContain("staff");
  });
  it("el .write del evento solo sirve para CREARLO o para BORRARLO entero", () => {
    const w = evento[".write"];
    expect(w).toContain("!data.exists()");                       // crear: solo si no existía
    expect(w).toContain("newData.child('meta/ownerUid').val() === auth.uid");
    expect(w).toContain("!newData.exists()");                    // borrar: solo si no queda nada
    expect(w).toContain("auth != null");
    // Las dos ramas son excluyentes, así que no hay forma de MODIFICAR el
    // evento por esta puerta: cada hijo mantiene su propia regla.
  });
  it("solo el dueño puede borrar su velada", () => {
    const borrado = evento[".write"].split("!newData.exists()")[1] || "";
    expect(borrado).toContain("ownerUid");
    expect(borrado).not.toContain("staff");
  });
  it("el staff sigue sin poder vaciar el padrón, la cartelera ni el Super 4", () => {
    // newData.exists() limita SOLO al staff: el dueño sí puede usar "Limpiar" y
    // "Reiniciar evento" en su propia velada, igual que en el árbol viejo.
    for (const clave of ["bm_fighters_v4", "bm_matchups_v3", "bm_super4_v1"]) {
      const w = evento[clave][".write"];
      // El límite tiene que ir PEGADO a la condición de staff. Si estuviera
      // suelto al principio de la expresión, aplicaría también al dueño y este
      // no podría usar "Limpiar" ni "Reiniciar evento" en su propia velada.
      expect(w, clave).toContain("!== 'puerta' && newData.exists()");
      expect(w.indexOf("newData.exists()"), clave).toBeGreaterThan(w.indexOf("ownerUid"));
    }
  });
});

describe("quién ve los datos de los atletas", () => {
  const CON_MENORES = ["bm_fighters_v4", "bm_matchups_v3", "bm_super4_v1"];
  it("la cuenta de puerta NO puede leer el padrón, la cartelera ni el Super 4", () => {
    for (const clave of CON_MENORES) {
      expect(evento[clave][".read"], clave).toContain("!== 'puerta'");
    }
  });
  it("la cuenta de puerta SÍ puede leer las boletas (las tiene que validar)", () => {
    expect(evento.tickets[".read"]).not.toContain("!== 'puerta'");
  });
  it("los respaldos son solo del dueño: traen el padrón entero y los compradores", () => {
    for (const permiso of [".read", ".write"]) {
      expect(evento.backups[permiso]).not.toContain("staff");
    }
  });
  it("un nodo no previsto queda reservado al dueño para escribir", () => {
    expect(evento.$other[".write"]).toContain("ownerUid");
    expect(evento.$other[".write"]).not.toContain("staff");
  });
});

describe("la propiedad de una velada no se puede robar", () => {
  it("ownerUid solo se escribe una vez", () => {
    // Cambiarlo es regalar (o quedarse con) la velada entera: su padrón, su
    // boletería y su recaudación.
    const v = evento.meta.ownerUid[".validate"];
    expect(v).toContain("!data.exists() || newData.val() === data.val()");
  });
  it("solo el dueño edita la ficha, las fechas y los organizadores", () => {
    for (const clave of ["meta", "bm_event_dates", "bm_event_org"]) {
      expect(evento[clave][".write"], clave).toContain("ownerUid");
      expect(evento[clave][".write"], clave).not.toContain("staff");
    }
  });
  it("cada usuario solo ve y escribe su propia lista de eventos", () => {
    const u = reglas.usuarios.$uid;
    expect(u[".read"]).toBe("auth != null && auth.uid === $uid");
    expect(u[".write"]).toBe("auth != null && auth.uid === $uid");
  });
});

describe("higiene general del archivo", () => {
  const todas = recorrer(reglas);

  it("ninguna regla concede acceso incondicional", () => {
    const sueltas = todas.filter(([, exp]) => exp.trim() === "true");
    expect(sueltas.map(([r]) => r)).toEqual([]);
  });

  it("ninguna regla de lectura o escritura olvida exigir sesión", () => {
    const sinAuth = todas
      .filter(([ruta]) => ruta.endsWith(".read") || ruta.endsWith(".write"))
      .filter(([, exp]) => exp !== "false" && !exp.includes("auth"));
    expect(sinAuth.map(([r]) => r)).toEqual([]);
  });

  it("las reglas del árbol de eventos se atan al $eid, nunca a un id fijo", () => {
    // Una expresión que nombrara un evento concreto le daría a ESE evento los
    // permisos de todos los demás.
    const malas = recorrer(reglas.eventos)
      .filter(([, exp]) => exp.includes("root.child('eventos')"))
      .filter(([, exp]) => !exp.includes("child($eid)"));
    expect(malas.map(([r]) => r)).toEqual([]);
  });

  it("el correo del creador de la app aparece como superusuario, no como único dueño", () => {
    // Debe seguir existiendo (es quien puede socorrer un evento ajeno), pero
    // siempre acompañado de la comprobación de ownerUid — si no, volveríamos a
    // una app de un solo organizador.
    const conCorreo = recorrer(evento).filter(([, exp]) => exp.includes(DUENO_APP));
    expect(conCorreo.length).toBeGreaterThan(0);
    const sinOwner = conCorreo.filter(([ruta, exp]) => !exp.includes("ownerUid") && !ruta.includes("validate"));
    expect(sinOwner.map(([r]) => r)).toEqual([]);
  });

  it("las validaciones de contenido del árbol nuevo son las del viejo, ya probadas contra la base real", () => {
    for (const clave of ["bm_fighters_v4", "bm_matchups_v3", "bm_super4_v1"]) {
      expect(evento[clave][".validate"], clave).toBe(reglas.sangre_nueva[clave][".validate"]);
      expect(evento[clave].$i[".validate"], clave).toBe(reglas.sangre_nueva[clave].$i[".validate"]);
    }
  });

  it("el aforo y los precios no aceptan valores que romperían la app", () => {
    // Un aforo 0 dejaría la barra de la pestaña Entradas dividiendo entre cero.
    expect(evento.meta.aforo[".validate"]).toContain(">= 1");
    expect(evento.meta.precios.$tipo[".validate"]).toContain(">= 0");
  });
});

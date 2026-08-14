// ============================================
// LIMPIAR — vaciar de un botón todo lo que se armó con los atletas
// ============================================
// Para montar la próxima velada hay que dejar la app en blanco, y hasta ahora
// eso eran dos caminos malos: borrar peleador por peleador desde la lista (una
// papelera y su confirmación por cada uno, setenta veces), o buscar "Reiniciar
// evento" en el menú ⋮ — que además borra las ENTRADAS vendidas y exige
// escribir la palabra BORRAR, así que no sirve cuando lo que sobra es el padrón
// y la boletería hay que conservarla.
//
// Este módulo NO borra nada: solo cuenta lo que va a desaparecer y arma el
// texto de la advertencia. Vive aparte, puro y con pruebas, porque ese aviso es
// lo ÚNICO que separa un clic de perder el padrón completo del evento: si
// alguna cifra o alguna frase miente (por ejemplo, callar que también se van
// las peleas y las llaves, o insinuar que borra solo lo que se ve filtrado en
// pantalla), el organizador acepta un borrado que no era el que creía. El
// borrado en sí, con su respaldo previo, lo hace App.jsx.

// Cuenta lo que el botón se va a llevar. Las tres cosas caen juntas a
// propósito: las peleas y las llaves del Super 4 son referencias a peleadores
// (guardan sus ids), así que borrar el padrón y dejarlas vivas llenaría la
// Cartelera y el Super 4 de huecos "peleador eliminado". Las boletas NO entran
// acá: son dinero cobrado, no datos de atletas.
export function resumenLimpiar({ fighters, matchups, super4 } = {}) {
  const peleadores = (fighters || []).length;
  const peleas = (matchups || []).length;
  const llaves = (super4 || []).length;
  return { peleadores, peleas, llaves, vacio: !(peleadores || peleas || llaves) };
}

// Plural de verdad ("1 peleador" / "70 peleadores"), no el "peleador(es)" de
// formulario: este texto es una advertencia grave y se lee mejor escrita como
// se habla.
function contar(cant, singular, plural) {
  return cant + " " + (cant === 1 ? singular : plural);
}

// El texto EXACTO del aviso que se acepta antes de borrar. Reglas que fijan las
// pruebas:
//  - dice sin rodeos que se borran TODOS los atletas registrados;
//  - enumera solo lo que existe (una línea con "0 peleas" distrae del número
//    que importa), pero nunca omite algo que sí se va a borrar;
//  - aclara que alcanza a TODO el equipo (se sincroniza), no solo a este
//    aparato: es el error de modelo mental más caro que puede cometer alguien
//    que cree estar limpiando "su" teléfono;
//  - promete que las entradas vendidas quedan intactas, porque el botón vive en
//    la pestaña de Peleadores y hay que despejar esa duda antes de aceptar;
//  - recuerda el Cierre del evento, que son los números de la velada anterior
//    (recaudación, asistencia, campeones) y desaparecen de la vista al borrar.
export function textoLimpiar(r) {
  const lineas = ["• " + contar(r.peleadores, "peleador registrado", "peleadores registrados")];
  if (r.peleas) lineas.push("• " + contar(r.peleas, "pelea de la cartelera", "peleas de la cartelera"));
  if (r.llaves) lineas.push("• " + contar(r.llaves, "llave del Super 4", "llaves del Super 4"));
  return [
    "⚠️ LIMPIAR TODA LA CARTELERA",
    "",
    "Al aceptar se BORRARÁN TODOS los datos de los atletas registrados:",
    "",
    lineas.join("\n"),
    "",
    "Se borra para TODO el equipo (se sincroniza a la nube), no solo en este dispositivo.",
    "",
    "NO se tocan las entradas vendidas ni la recaudación.",
    "",
    "Antes de borrar se descarga un respaldo y se guarda otra copia en la nube, así que esto se puede recuperar desde el menú ⋮ → \"Restaurar respaldo de la nube\".",
    "",
    "Si todavía no imprimiste el CIERRE DEL EVENTO (recaudación, asistencia y campeones en una hoja, en el mismo menú ⋮), cancela y hazlo primero.",
    "",
    "¿Borrar todos los atletas registrados?",
  ].join("\n");
}

// Lo que se avisa DESPUÉS de borrar. Repite dónde quedó el respaldo: es el
// momento en que alguien se da cuenta de que borró de más, y el camino de
// vuelta tiene que estar a la vista, no en la memoria de quien leyó el aviso
// anterior.
export function textoLimpiado(r, { enLaNube }) {
  const partes = [contar(r.peleadores, "peleador", "peleadores")];
  if (r.peleas) partes.push(contar(r.peleas, "pelea", "peleas"));
  if (r.llaves) partes.push(contar(r.llaves, "llave del Super 4", "llaves del Super 4"));
  const lista = partes.length > 1 ? partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1] : partes[0];
  return "Listo: se borraron " + lista + ".\n\n" + (enLaNube
    ? "El respaldo se descargó a este dispositivo y también quedó guardado en la nube.\n\nSi hace falta recuperarlo: menú ⋮ → \"Restaurar respaldo de la nube\"."
    : "El respaldo se descargó a este dispositivo (no hay conexión con la nube, así que esa copia no se pudo guardar allá).\n\nGuarda bien ese archivo: es la única copia.");
}

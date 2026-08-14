// ============================================
// CIERRE DEL EVENTO — la hoja que queda cuando la velada terminó
// ============================================
// Pasada la velada, el organizador tiene los datos repartidos: la recaudación
// en la pestaña Entradas, los campeones en el Super 4, las peleas en la
// Cartelera y los atletas en Peleadores. Para rendir cuentas con los socios
// (los clubes que organizan la edición) y para decidir la próxima fecha hay que juntarlo
// todo a mano, y a los pocos días el evento se reinicia y esos números se van.
//
// Esto arma UNA hoja con el cierre completo: boletería, asistencia real,
// resultados deportivos y participación por escuela. Se imprime o se guarda en
// PDF antes de reiniciar el evento, y es el documento que queda de esa velada.
//
// El módulo es puro y testeable: `cierreResumen` calcula, `buildCierreHtml`
// dibuja. Ninguna de las dos lee el reloj ni el almacenamiento — la fecha de
// generación entra como parámetro.

import { TICKET_TYPES_V2, fmt$, ticketQty, getAgeCategory } from "../constants.js";
import { escapeHtml } from "./html.js";
import { bracketPrintTitle } from "./super4.js";
import { carteleraGroups, AGE_GROUP_ORDER } from "./printCartelera.js";

// Una boleta anulada no vendió nada: no suma dinero ni personas esperadas. Hoy
// la app no anula (borra), pero el estado existe en las reglas de la base y un
// respaldo viejo puede traerlo — mejor contarlas aparte que inflar la
// recaudación del cierre.
const esAnulada = t => t && t.status === "anulado";

// ---------- Boletería y asistencia ----------
export function boleteriaResumen(tickets) {
  const list = (tickets || []).filter(t => t && !esAnulada(t));
  const anuladas = (tickets || []).filter(esAnulada).length;
  const porTipo = {}, porPago = {};
  let personas = 0, ingresos = 0, personasDentro = 0, boletasDentro = 0;

  list.forEach(t => {
    const q = ticketQty(t);
    const monto = t.price || 0;
    personas += q;
    ingresos += monto;
    const tipo = t.ticketType || "—";
    const acc = porTipo[tipo] || (porTipo[tipo] = { boletas: 0, personas: 0, ingresos: 0, dentro: 0 });
    acc.boletas += 1; acc.personas += q; acc.ingresos += monto;
    const pago = t.paymentMethod || "—";
    porPago[pago] = (porPago[pago] || 0) + monto;
    if (t.status === "ingresado") { personasDentro += q; boletasDentro += 1; acc.dentro += q; }
  });

  return {
    boletas: list.length, personas, ingresos, porTipo, porPago,
    personasDentro, boletasDentro, anuladas,
    ausentes: personas - personasDentro,
    // Porcentaje de asistencia sobre lo vendido. Sin ventas es null (y no 0):
    // "no se presentó nadie" y "no se vendió nada" no son lo mismo.
    asistencia: personas ? personasDentro / personas : null,
  };
}

// ---------- Deportivo ----------
export function deportivoResumen({ fighters, matchups, super4 }) {
  const list = fighters || [];
  const porEdad = {}, porSexo = { M: 0, F: 0 };
  list.forEach(f => {
    const cat = getAgeCategory(f.age);
    porEdad[cat.key] = porEdad[cat.key] || { label: cat.label, n: 0 };
    porEdad[cat.key].n += 1;
    porSexo[f.sexo === "F" ? "F" : "M"] += 1;
  });
  // Las peleas que REALMENTE salieron en la cartelera (las que tienen un rival
  // eliminado no se imprimen, así que matchups.length mentiría en el cierre).
  const grupos = carteleraGroups(matchups || [], list);
  const peleas = grupos.reduce((s, g) => s + g.list.length, 0);

  const byId = {};
  list.forEach(f => { byId[f.id] = f; });
  const cinturones = (super4 || []).map(b => ({
    titulo: bracketPrintTitle(b) || b.catLabel || "",
    campeon: b.finalWinner ? (byId[b.finalWinner]?.fullName || "—") : null,
    escuela: b.finalWinner ? (byId[b.finalWinner]?.gym || "") : "",
  }));

  return {
    peleadores: list.length,
    porEdad: AGE_GROUP_ORDER.filter(k => porEdad[k]).map(k => ({ key: k, ...porEdad[k] })),
    porSexo,
    peleas,
    cinturones,
    cinturonesDecididos: cinturones.filter(c => c.campeon).length,
  };
}

// ---------- Escuelas ----------
// Cuántos atletas trajo cada escuela, de mayor a menor. Es el dato que el
// organizador usa para saber a quién invitar a la próxima y a quién agradecer.
export function escuelasResumen(fighters) {
  const cuenta = new Map();
  (fighters || []).forEach(f => {
    const nombre = (f.gym || "").trim() || "Sin escuela";
    cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
  });
  return [...cuenta.entries()]
    .map(([escuela, atletas]) => ({ escuela, atletas }))
    .sort((a, b) => b.atletas - a.atletas || a.escuela.localeCompare(b.escuela, "es"));
}

// ---------- Todo junto ----------
export function cierreResumen({ fighters, matchups, super4, tickets }) {
  return {
    boleteria: boleteriaResumen(tickets),
    deportivo: deportivoResumen({ fighters, matchups, super4 }),
    escuelas: escuelasResumen(fighters),
  };
}

// ============================================
// HOJA IMPRIMIBLE
// ============================================
// Mismo criterio que las otras hojas del proyecto: papel blanco, colores
// forzados para que el PDF no salga en gris, y todo en una carilla si se puede.
// `titulo` es el nombre del evento; `fechaEvento`, la frase de las fechas
// reales; `generadoEl`, la fecha de impresión (entra como parámetro para que la
// función siga siendo pura).
export function buildCierreHtml(resumen, { titulo = "", fechaEvento = "", generadoEl = "", organizadores = "" } = {}) {
  const { boleteria: b, deportivo: d, escuelas } = resumen;
  const pct = b.asistencia == null ? "—" : Math.round(b.asistencia * 100) + "%";

  const filaTipo = ([key, v]) => {
    const t = TICKET_TYPES_V2.find(x => x.key === key);
    return `<tr>
      <td class="izq">${escapeHtml(t ? t.label : key)}</td>
      <td>${v.boletas}</td>
      <td>${v.personas}</td>
      <td>${v.dentro}</td>
      <td class="der">${escapeHtml(fmt$(v.ingresos))}</td>
    </tr>`;
  };
  const tipos = Object.entries(b.porTipo).sort((x, y) => y[1].ingresos - x[1].ingresos).map(filaTipo).join("")
    || `<tr><td class="izq vacio" colspan="5">No se registraron entradas.</td></tr>`;

  const pagos = Object.entries(b.porPago).filter(([, v]) => v > 0)
    .map(([m, v]) => `<span class="pago"><b>${escapeHtml(m)}</b> ${escapeHtml(fmt$(v))}</span>`).join("") || "—";

  const cinturones = d.cinturones.length
    ? d.cinturones.map(c => `<tr>
        <td class="izq">${escapeHtml(c.titulo)}</td>
        <td class="izq">${c.campeon ? `<b>${escapeHtml(c.campeon)}</b>${c.escuela ? ` <span class="tenue">${escapeHtml(c.escuela.toUpperCase())}</span>` : ""}` : `<span class="vacio">Sin definir</span>`}</td>
      </tr>`).join("")
    : `<tr><td class="izq vacio" colspan="2">No se armaron llaves del Super 4.</td></tr>`;

  const edades = d.porEdad.length
    ? d.porEdad.map(e => `<span class="chip">${escapeHtml(e.label)} <b>${e.n}</b></span>`).join("")
    : `<span class="vacio">Sin peleadores registrados</span>`;

  const filasEscuelas = escuelas.length
    ? escuelas.map((e, i) => `<tr><td>${i + 1}</td><td class="izq">${escapeHtml(e.escuela)}</td><td>${e.atletas}</td></tr>`).join("")
    : `<tr><td class="izq vacio" colspan="3">Sin escuelas registradas.</td></tr>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cierre del evento — Sangre Nueva</title>
<meta name="color-scheme" content="light">
<style>
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;box-sizing:border-box;}
  /* Fondo blanco declarado: la hoja se mira en pantalla antes de imprimir, y
     con el navegador en modo oscuro un fondo sin declarar sale negro y deja
     los títulos de sección ilegibles. Esto es papel, siempre. */
  body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#111;background:#fff;}
  .header{background:#000;color:#E5C76B;text-align:center;padding:16px 10px;}
  .header h1{margin:0;font-size:21px;letter-spacing:2px;}
  .header p{margin:4px 0 0;font-size:12px;color:#E8DDD0;}
  .header .fecha{color:#fff;font-weight:bold;font-size:13px;margin-top:6px;}
  .wrap{padding:14px 16px;}
  h2{font-size:13px;letter-spacing:1.5px;text-transform:uppercase;border-bottom:2px solid #000;padding-bottom:4px;margin:16px 0 8px;}
  .cifras{display:flex;gap:8px;margin-bottom:8px;}
  .cifra{flex:1;border:1px solid #000;padding:8px 6px;text-align:center;}
  .cifra .n{font-size:19px;font-weight:bold;display:block;}
  .cifra .t{font-size:9.5px;text-transform:uppercase;letter-spacing:1px;color:#444;}
  .cifra.oro{background:#FBF3DF;border-color:#C8A04A;}
  table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:6px;}
  th,td{border:1px solid #444;padding:4px 7px;text-align:center;}
  thead th{background:#E5E7EB;font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;}
  td.izq{text-align:left;}
  td.der{text-align:right;}
  tfoot td{font-weight:bold;background:#F3F4F6;}
  .tenue{color:#666;font-size:10px;}
  .vacio{color:#888;font-style:italic;}
  .chip{display:inline-block;border:1px solid #444;padding:2px 8px;margin:0 4px 4px 0;font-size:11px;}
  .pago{display:inline-block;border:1px solid #444;background:#F3F4F6;padding:2px 8px;margin:0 4px 4px 0;font-size:11px;}
  .cols{display:flex;gap:14px;align-items:flex-start;}
  .cols>div{flex:1;}
  .pie{margin-top:14px;border-top:1px solid #999;padding-top:6px;font-size:9.5px;color:#666;display:flex;justify-content:space-between;}
  @page{size:portrait;margin:12mm;}
</style></head>
<body>
<div class="header">
  <h1>CIERRE DEL EVENTO</h1>
  <p>Sangre Nueva — La Velada${organizadores ? " · " + escapeHtml(organizadores) : ""}</p>
  ${titulo ? `<p>${escapeHtml(titulo)}</p>` : ""}
  ${fechaEvento ? `<p class="fecha">${escapeHtml(fechaEvento)}</p>` : ""}
</div>
<div class="wrap">

  <h2>Boletería</h2>
  <div class="cifras">
    <div class="cifra oro"><span class="n">${escapeHtml(fmt$(b.ingresos))}</span><span class="t">Recaudación</span></div>
    <div class="cifra"><span class="n">${b.personas}</span><span class="t">Entradas vendidas</span></div>
    <div class="cifra"><span class="n">${b.boletas}</span><span class="t">Boletas emitidas</span></div>
  </div>
  <table>
    <thead><tr><th>Tipo</th><th>Boletas</th><th>Personas</th><th>Entraron</th><th>Recaudación</th></tr></thead>
    <tbody>${tipos}</tbody>
    <tfoot><tr><td class="izq">TOTAL</td><td>${b.boletas}</td><td>${b.personas}</td><td>${b.personasDentro}</td><td class="der">${escapeHtml(fmt$(b.ingresos))}</td></tr></tfoot>
  </table>
  <div>${pagos}</div>
  ${b.anuladas ? `<p class="vacio">${b.anuladas} boleta(s) anulada(s), no incluidas en los totales.</p>` : ""}

  <h2>Asistencia real</h2>
  <div class="cifras">
    <div class="cifra"><span class="n">${b.personasDentro}</span><span class="t">Personas dentro</span></div>
    <div class="cifra"><span class="n">${b.ausentes}</span><span class="t">No se presentaron</span></div>
    <div class="cifra"><span class="n">${pct}</span><span class="t">De lo vendido</span></div>
  </div>

  <h2>Deportivo</h2>
  <div class="cifras">
    <div class="cifra"><span class="n">${d.peleadores}</span><span class="t">Peleadores</span></div>
    <div class="cifra"><span class="n">${d.peleas}</span><span class="t">Peleas en cartelera</span></div>
    <div class="cifra"><span class="n">${d.cinturonesDecididos}/${d.cinturones.length}</span><span class="t">Cinturones definidos</span></div>
  </div>
  <div style="margin-bottom:8px">${edades}<span class="chip">Masculino <b>${d.porSexo.M}</b></span><span class="chip">Femenino <b>${d.porSexo.F}</b></span></div>
  <table>
    <thead><tr><th>Cinturón</th><th>Campeón</th></tr></thead>
    <tbody>${cinturones}</tbody>
  </table>

  <h2>Escuelas participantes</h2>
  <table>
    <thead><tr><th>N°</th><th>Escuela</th><th>Atletas</th></tr></thead>
    <tbody>${filasEscuelas}</tbody>
  </table>

  <div class="pie">
    <span>Cierre generado desde la app Sangre Nueva.</span>
    <span>${generadoEl ? "Generado el " + escapeHtml(generadoEl) : ""}</span>
  </div>
</div>
</body></html>`;
}

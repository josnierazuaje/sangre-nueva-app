// ============================================
// CONSTANTES
// ============================================
// Categorías de peso oficiales World Boxing (competiciones generales,
// vigentes 2026): 10 divisiones por género, distintas entre hombres y
// mujeres. Todo atleta cae dentro de una división de su género: por debajo
// del mínimo oficial se le asigna la más liviana, y las últimas son
// abiertas hacia arriba (+90 kg hombres, +80 kg mujeres).
export const WEIGHT_CATEGORIES_M = [
  { key: "m_mosca", label: "Mosca", minWeight: 47, maxWeight: 50, tolerance: 2, color: "#10B981", genero: "M" },
  { key: "m_gallo", label: "Gallo", minWeight: 50, maxWeight: 55, tolerance: 2, color: "#14B8A6", genero: "M" },
  { key: "m_ligero", label: "Ligero", minWeight: 55, maxWeight: 60, tolerance: 3, color: "#06B6D4", genero: "M" },
  { key: "m_welter", label: "Wélter", minWeight: 60, maxWeight: 65, tolerance: 3, color: "#3B82F6", genero: "M" },
  { key: "m_superwelter", label: "Superwélter", minWeight: 65, maxWeight: 70, tolerance: 3, color: "#6366F1", genero: "M" },
  { key: "m_mediano", label: "Mediano", minWeight: 70, maxWeight: 75, tolerance: 3, color: "#8B5CF6", genero: "M" },
  { key: "m_mediopesado", label: "Mediopesado", minWeight: 75, maxWeight: 80, tolerance: 3.5, color: "#A855F7", genero: "M" },
  { key: "m_crucero", label: "Crucero", minWeight: 80, maxWeight: 85, tolerance: 4, color: "#EC4899", genero: "M" },
  { key: "m_pesado", label: "Pesado", minWeight: 85, maxWeight: 90, tolerance: 4, color: "#F97316", genero: "M" },
  { key: "m_superpesado", label: "Superpesado", minWeight: 90, maxWeight: Infinity, tolerance: 5, color: "#EF4444", genero: "M" },
];
export const WEIGHT_CATEGORIES_F = [
  { key: "f_minimosca", label: "Minimosca", minWeight: 45, maxWeight: 48, tolerance: 2, color: "#10B981", genero: "F" },
  { key: "f_mosca", label: "Mosca", minWeight: 48, maxWeight: 51, tolerance: 2, color: "#14B8A6", genero: "F" },
  { key: "f_gallo", label: "Gallo", minWeight: 51, maxWeight: 54, tolerance: 2, color: "#06B6D4", genero: "F" },
  { key: "f_pluma", label: "Pluma", minWeight: 54, maxWeight: 57, tolerance: 2.5, color: "#22D3EE", genero: "F" },
  { key: "f_ligero", label: "Ligero", minWeight: 57, maxWeight: 60, tolerance: 3, color: "#3B82F6", genero: "F" },
  { key: "f_welter", label: "Wélter", minWeight: 60, maxWeight: 65, tolerance: 3, color: "#6366F1", genero: "F" },
  { key: "f_superwelter", label: "Superwélter", minWeight: 65, maxWeight: 70, tolerance: 3, color: "#8B5CF6", genero: "F" },
  { key: "f_mediano", label: "Mediano", minWeight: 70, maxWeight: 75, tolerance: 3, color: "#A855F7", genero: "F" },
  { key: "f_mediopesado", label: "Mediopesado", minWeight: 75, maxWeight: 80, tolerance: 3.5, color: "#EC4899", genero: "F" },
  { key: "f_pesado", label: "Pesado", minWeight: 80, maxWeight: Infinity, tolerance: 5, color: "#EF4444", genero: "F" },
];
export const WEIGHT_CATEGORIES = [...WEIGHT_CATEGORIES_M, ...WEIGHT_CATEGORIES_F];
// Rango legible de una división, ej. "60-65kg" o "+90kg".
export function weightRangeLabel(c) {
  return c.maxWeight === Infinity ? `+${c.minWeight}kg` : `${c.minWeight}-${c.maxWeight}kg`;
}
// Rangos de edad oficiales World Boxing (worldboxing.org, Reglamento de
// Competición, sección 2.1): las categorías NO se pueden mezclar en
// competencia. La edad se determina por el año calendario de nacimiento; la
// app usa la edad registrada del atleta como aproximación (no guarda fecha
// de nacimiento). Las claves internas se conservan (escolar/cadete/… ) por
// compatibilidad; solo cambian las etiquetas visibles a las de World Boxing.
export const AGE_CATEGORIES = [
  { key: "escolar", label: "U15", minAge: 13, maxAge: 14, formato: "3R × 1,5min", color: "#3B82F6" },
  { key: "cadete", label: "U17", minAge: 15, maxAge: 16, formato: "3R × 2min", color: "#EAB308" },
  { key: "juvenil", label: "U19", minAge: 17, maxAge: 18, formato: "3R × 3min", color: "#EF4444" },
  { key: "adulto", label: "Elite", minAge: 19, maxAge: 40, formato: "3R × 3min", color: "#9CA3AF" },
];
export function getAgeCategory(age) {
  const c = AGE_CATEGORIES.find(c => age >= c.minAge && age <= c.maxAge);
  if (c) return c;
  // Fuera del rango oficial World Boxing (U15 a Elite): se agrupan aparte
  // para que nunca se emparejen con las categorías oficiales.
  if (age < 13) return { key: "infantil", label: "Sub-13 (fuera de rango oficial)", formato: "—", color: "#6B7280" };
  return { key: "veterano", label: "+40 (fuera de rango oficial)", formato: "—", color: "#6B7280" };
}

export const EXPERIENCE_LEVELS = [
  { key: "debutante", label: "Debutante", minFights: 0, maxFights: 0, color: "#22C55E" },
  { key: "principiante", label: "Principiante", minFights: 1, maxFights: 3, color: "#3B82F6" },
  { key: "amateur", label: "Amateur Avanzado", minFights: 4, maxFights: 10, color: "#F59E0B" },
  { key: "profesional", label: "Clasif. / Pro", minFights: 11, maxFights: null, color: "#DC2626" },
];
export const COUNTRY_CODES = [
  { code: "+56", flag: "\u{1F1E8}\u{1F1F1}" }, { code: "+58", flag: "\u{1F1FB}\u{1F1EA}" }, { code: "+54", flag: "\u{1F1E6}\u{1F1F7}" },
  { code: "+52", flag: "\u{1F1F2}\u{1F1FD}" }, { code: "+57", flag: "\u{1F1E8}\u{1F1F4}" }, { code: "+51", flag: "\u{1F1F5}\u{1F1EA}" },
  { code: "+1", flag: "\u{1F1FA}\u{1F1F8}" }, { code: "+34", flag: "\u{1F1EA}\u{1F1F8}" },
];
// Claves sincronizadas entre localStorage y Firebase como un solo "blob"
// (con su valor por defecto cuando no existe aún ni local ni remotamente).
// Las boletas (bm_tickets_v4/bm_tc_v4) ya NO están acá: desde la Fase 3
// viven en nodos individuales (sangre_nueva/tickets/{id} y
// sangre_nueva/counters/{tipo}, ver src/lib/storage.js) para que varios
// dispositivos puedan vender al mismo tiempo sin pisarse entre sí.
export const SYNC_KEYS = {
  "bm_fighters_v4": [],
  "bm_matchups_v3": [],
  "bm_super4_v1": [],
  "bm_event_label": "La Velada — próxima fecha por definir",
};

export const TICKET_TYPES_V2 = [
  { key: "inscripcion", label: "Inscripción", price: 5000, color: "#3B82F6", icon: "🥊", capacity: 50 },
  { key: "preventa", label: "Preventa", price: 7000, color: "#A855F7", icon: "🎟️", capacity: 150 },
  { key: "puerta", label: "Puerta", price: 10000, color: "#F97316", icon: "🎫", capacity: 120 },
];
export const PAYMENT_METHODS_V2 = ["Efectivo", "Transferencia", "Otro"];
export const MAX_CAP = 320;

// Helpers
export function getWeightCategory(kg, sexo) {
  const list = (sexo || "M") === "F" ? WEIGHT_CATEGORIES_F : WEIGHT_CATEGORIES_M;
  for (const c of list) { if (kg <= c.maxWeight) return c.key; }
  return list[list.length - 1].key;
}
// Recalcula la división oficial de cada peleador a partir de su peso y
// género. Se aplica al cargar/sincronizar porque los peleadores guardados
// antes del cambio a las categorías World Boxing traen claves antiguas
// (ej. "superligero") que ya no existen.
export function normalizeFighters(arr) {
  return (arr || []).map(f => ({ ...f, weightCategory: getWeightCategory(f.weightKg, f.sexo) }));
}
// Adivina el sexo probable a partir del primer nombre para advertir errores
// de transcripción (ej. seleccionar Masculino en un nombre femenino).
// Devuelve "M", "F" o null (desconocido/ambiguo → no se advierte). Es una
// heurística: listas de excepciones frecuentes en Chile/Latinoamérica + la
// regla general de terminación (-a femenino, -o masculino).
const NAME_F = new Set([
  // Terminan en consonante/e/i/y pero son femeninos (no los pilla la regla -a)
  "isabel", "raquel", "beatriz", "carmen", "mercedes", "dolores", "soledad",
  "rocio", "pilar", "ruth", "nieves", "ester", "esther", "nicol", "nicole",
  "michelle", "michel", "jazmin", "jasmin", "yazmin", "karen", "karin",
  "ninoska", "abigail", "genesis", "britany", "britney", "estefany", "estefani",
  "jocelyn", "jaqueline", "jacqueline", "evelyn", "katherine", "kathy", "ashley",
  "scarlett", "thais", "lilibeth", "elizabeth", "maribel", "marisol", "yolanda",
  "noemi", "yamilet", "yamileth", "belen", "maylin", "ivon", "yvonne", "leidy",
  // Terminan en -o pero son femeninos
  "consuelo", "rosario", "amparo", "socorro",
]);
const NAME_M = new Set([
  // Terminan en -a pero son masculinos (excepciones a la regla)
  "jhosua", "josua", "joshua", "iosua", "bautista", "luca", "nicola", "elia",
  "kenia", "aldair", "adonai",
  // (nombres masculinos frecuentes que igual la regla general no clasifica bien)
]);
export function guessGenderFromName(fullName) {
  const first = (fullName || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)[0];
  if (!first || first.length < 2) return null;
  if (NAME_F.has(first)) return "F";
  if (NAME_M.has(first)) return "M";
  const last = first.slice(-1);
  if (last === "a") return "F";
  if (last === "o") return "M";
  return null;
}
export function getExperienceLevel(f) { if (f === 0) return "debutante"; if (f <= 3) return "principiante"; if (f <= 10) return "amateur"; return "profesional"; }
export function getCategoryInfo(k) { return WEIGHT_CATEGORIES.find(c => c.key === k); }
export function getExperienceInfo(k) { return EXPERIENCE_LEVELS.find(e => e.key === k); }
export function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }
export function getInitials(name) { return (name || "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase(); }
export function extractTicketCode(text) {
  try { const u = new URL(text); const t = u.searchParams.get("ticket"); if (t) return t; } catch (e) {}
  try { const p = JSON.parse(text); if (p && p.id) return p.id; } catch (e) {}
  return text;
}
export function fmt$(n) { return "$" + n.toLocaleString("es-CL"); }

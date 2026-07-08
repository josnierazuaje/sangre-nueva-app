// ============================================
// CONSTANTES
// ============================================
export const WEIGHT_CATEGORIES = [
  { key: "mosca", label: "Mosca", maxWeight: 50.8, tolerance: 2, color: "#10B981" },
  { key: "gallo", label: "Gallo", maxWeight: 53.5, tolerance: 2, color: "#14B8A6" },
  { key: "pluma", label: "Pluma", maxWeight: 57.2, tolerance: 2.5, color: "#06B6D4" },
  { key: "ligero", label: "Ligero", maxWeight: 61.2, tolerance: 3, color: "#3B82F6" },
  { key: "superligero", label: "Superligero", maxWeight: 63.5, tolerance: 3, color: "#6366F1" },
  { key: "welter", label: "Wélter", maxWeight: 66.7, tolerance: 3, color: "#8B5CF6" },
  { key: "supermediano", label: "Supermediano", maxWeight: 72.6, tolerance: 3, color: "#A855F7" },
  { key: "mediano", label: "Mediano", maxWeight: 76.2, tolerance: 3, color: "#EC4899" },
  { key: "semipesado", label: "Semipesado", maxWeight: 79.4, tolerance: 3.5, color: "#F97316" },
  { key: "pesado", label: "Pesado", maxWeight: Infinity, tolerance: 5, color: "#EF4444" },
];
// Rangos de edad oficiales FECHIBOX (Federación Chilena de Boxeo): las
// categorías NO se pueden mezclar en competencia. La normativa define la
// categoría por la edad que se cumple al 31 de diciembre del año en curso;
// la app usa la edad registrada del atleta como aproximación (no guarda
// fecha de nacimiento).
export const AGE_CATEGORIES = [
  { key: "escolar", label: "Escolar", minAge: 13, maxAge: 14, formato: "3R × 1,5min", color: "#3B82F6" },
  { key: "cadete", label: "Cadete", minAge: 15, maxAge: 16, formato: "3R × 2min", color: "#EAB308" },
  { key: "juvenil", label: "Juvenil", minAge: 17, maxAge: 18, formato: "3R × 3min", color: "#EF4444" },
  { key: "adulto", label: "Adulto/Elite", minAge: 19, maxAge: 40, formato: "3R × 3min", color: "#9CA3AF" },
];
export function getAgeCategory(age) {
  const c = AGE_CATEGORIES.find(c => age >= c.minAge && age <= c.maxAge);
  if (c) return c;
  // Fuera del rango oficial FECHIBOX: se agrupan aparte para que nunca
  // se emparejen con las categorías oficiales.
  if (age < 13) return { key: "infantil", label: "Infantil (fuera de rango oficial)", formato: "—", color: "#6B7280" };
  return { key: "veterano", label: "Veterano (fuera de rango oficial)", formato: "—", color: "#6B7280" };
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
export function getWeightCategory(kg) { for (const c of WEIGHT_CATEGORIES) { if (kg <= c.maxWeight) return c.key; } return "pesado"; }
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

// Nombres de las claves de localStorage que comparten storage.js y tickets.js.
//
// Viven aparte por una razón concreta: al cerrar sesión (o al "Recargar desde
// la nube") hay que borrar TODOS los pendientes de este dispositivo —los de
// peleadores y los de ventas e ingresos— y esa limpieza vive en storage.js,
// mientras que las claves de boletas las usa tickets.js. Si cada módulo
// importara al otro para leerlas quedaría un ciclo; con las claves acá, la
// dependencia va en una sola dirección (tickets.js → storage.js) y la limpieza
// no puede olvidarse de una cola por descuido.
export const OUTBOX_KEY = "bm_fighters_outbox";
export const TICKETS_OUTBOX_KEY = "bm_tickets_outbox";
export const CHECKIN_OUTBOX_KEY = "bm_checkin_outbox";
// Espejo local de las boletas (la nube es la fuente de verdad; esto es caché).
export const TICKETS_CACHE_KEY = "bm_tickets_v4";

// Escritor de archivos ZIP mínimo, sin dependencias externas. Un .xlsx no es
// más que un ZIP con varios XML adentro, así que esto es la mitad del trabajo
// para generar planillas de Excel desde el navegador sin instalar librerías
// (SheetJS/ExcelJS pesan cientos de KB y esta app se usa en el celular con
// datos móviles en la puerta del evento).
//
// Guarda SIN comprimir (método "store", 0). Ocupa un poco más que un ZIP
// comprimido, pero las planillas son de decenas de KB y así no hace falta
// implementar deflate: el formato ZIP acepta "store" en cualquier lector
// (Excel, Numbers, Google Sheets, LibreOffice, Finder).

// Tabla CRC-32 (polinomio estándar 0xEDB88320). El ZIP exige el CRC de cada
// archivo en su cabecera; si no cuadra, Excel declara el libro dañado.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Fecha/hora fija en formato DOS (1 de enero de 1980, el mínimo que admite el
// formato). Deliberadamente constante: así el mismo contenido produce siempre
// el mismo archivo byte a byte, lo que hace los tests reproducibles. Excel no
// muestra esta fecha en ninguna parte — la que ve el usuario es la del archivo
// en el disco, que la pone macOS al descargarlo.
const DOS_TIME = 0;
const DOS_DATE = 33; // (1980-1980)<<9 | 1<<5 | 1

const enc = new TextEncoder();

// Escritor de bytes que va creciendo solo: evita calcular por adelantado el
// tamaño total del ZIP (cabeceras + datos + directorio central).
class ByteWriter {
  constructor() { this.buf = new Uint8Array(1024); this.len = 0; }
  _ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  u16(v) { this._ensure(2); this.buf[this.len++] = v & 0xFF; this.buf[this.len++] = (v >>> 8) & 0xFF; }
  u32(v) { this._ensure(4); this.buf[this.len++] = v & 0xFF; this.buf[this.len++] = (v >>> 8) & 0xFF; this.buf[this.len++] = (v >>> 16) & 0xFF; this.buf[this.len++] = (v >>> 24) & 0xFF; }
  bytes(b) { this._ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }
  done() { return this.buf.slice(0, this.len); }
}

// Arma el ZIP. `files` es [{ name, data }] donde `name` es la ruta interna
// ("xl/workbook.xml") y `data` un string (se codifica a UTF-8) o un
// Uint8Array. Devuelve un Uint8Array con el ZIP completo.
export function zipSync(files) {
  const entries = files.map(f => ({
    nameBytes: enc.encode(f.name),
    data: typeof f.data === "string" ? enc.encode(f.data) : f.data,
  }));
  const w = new ByteWriter();
  const offsets = [];
  // 1) Cabecera local + contenido de cada archivo.
  for (const e of entries) {
    offsets.push(w.len);
    e.crc = crc32(e.data);
    w.u32(0x04034B50);       // firma de cabecera local
    w.u16(20);               // versión necesaria para extraer (2.0)
    w.u16(0x0800);           // bit 11: los nombres van en UTF-8
    w.u16(0);                // método 0 = sin comprimir
    w.u16(DOS_TIME); w.u16(DOS_DATE);
    w.u32(e.crc);
    w.u32(e.data.length);    // tamaño comprimido  = tamaño real (sin comprimir)
    w.u32(e.data.length);    // tamaño sin comprimir
    w.u16(e.nameBytes.length);
    w.u16(0);                // sin campo "extra"
    w.bytes(e.nameBytes);
    w.bytes(e.data);
  }
  // 2) Directorio central: repite los datos de cada archivo y apunta al offset
  //    de su cabecera local. Es lo que lee Excel para saber qué hay dentro.
  const cdStart = w.len;
  entries.forEach((e, i) => {
    w.u32(0x02014B50);       // firma de entrada del directorio central
    w.u16(20);               // versión que lo creó
    w.u16(20);               // versión necesaria para extraer
    w.u16(0x0800);
    w.u16(0);
    w.u16(DOS_TIME); w.u16(DOS_DATE);
    w.u32(e.crc);
    w.u32(e.data.length);
    w.u32(e.data.length);
    w.u16(e.nameBytes.length);
    w.u16(0);                // extra
    w.u16(0);                // comentario
    w.u16(0);                // número de disco
    w.u16(0);                // atributos internos
    w.u32(0);                // atributos externos
    w.u32(offsets[i]);       // dónde empieza su cabecera local
    w.bytes(e.nameBytes);
  });
  // 3) Cierre (End Of Central Directory).
  const cdSize = w.len - cdStart;
  w.u32(0x06054B50);
  w.u16(0); w.u16(0);                          // disco actual / disco del directorio
  w.u16(entries.length); w.u16(entries.length); // entradas en este disco / en total
  w.u32(cdSize);
  w.u32(cdStart);
  w.u16(0);                                     // sin comentario final
  return w.done();
}

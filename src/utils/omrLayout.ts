/* ============================================================================
 * omrLayout.ts  —  GEOMETRÍA ÚNICA DEL FORMULARIO OMR
 * ----------------------------------------------------------------------------
 * Este archivo lo importan TANTO el generador del PDF como el lector del escaneo.
 * Así nunca pueden desincronizarse: si cambias un margen aquí, cambian los dos.
 *
 * Todas las medidas están en MILÍMETROS sobre la hoja carta (215.9 x 279.4).
 * El lector convierte mm -> píxeles usando los centros de las 4 marcas de esquina.
 *
 * La hoja es AUTODESCRIPTIVA: lleva impreso un "código de hoja" (48 bits, círculos
 * rellenos/vacíos) con: versión, nº de preguntas, nº de alternativas, nº de formas
 * e ID de la prueba. El lector lo decodifica, de modo que ya no depende de que la
 * app le pase bien la configuración.
 * ========================================================================== */

export const LAYOUT_VERSION = 5;

export const PAGE = { W: 215.9, H: 279.4, margin: 10, fid: 10 } as const;

/** Centro de cada marca de esquina medido desde el borde de la hoja (mm). */
export const FID_C = PAGE.margin + PAGE.fid / 2; // 15 mm

/** Rectángulo definido por los CENTROS de las 4 marcas (mm). */
export const AREA_MM = { w: PAGE.W - 2 * FID_C, h: PAGE.H - 2 * FID_C }; // 185.9 x 249.4

/** Resolución a la que el lector endereza la hoja. */
export const PX_POR_MM = 4;
export const AREA_PX = { w: Math.round(AREA_MM.w * PX_POR_MM), h: Math.round(AREA_MM.h * PX_POR_MM) }; // 744 x 998

/* ---------- Medidas de burbujas ---------- */
export const R_BURBUJA = 1.8; // radio impreso de las burbujas (mm)
export const R_LECTURA = 1.0; // radio del disco interior que se mide (queda dentro del borde)

/* ---------- Bloque de identificación ---------- */
export const ID = { y: 34, h: 76, rutX: 20, rutW: 100, datosX: 125, datosW: PAGE.W - 10 - 125 };

export const RUT = {
  x0: 25,          // x del primer recuadro de escritura
  pitchX: 9,       // separación entre columnas
  boxY: 44, boxW: 7, boxH: 8,
  circlesY0: 59,   // y de la fila "0"
  pitchY: 4.6,     // separación entre filas
};
/** x (mm) de las 8 columnas de dígitos + la del dígito verificador. */
export const RUT_XS: number[] = [
  ...Array.from({ length: 8 }, (_, c) => RUT.x0 + c * RUT.pitchX + 3.5),
  RUT.x0 + 8 * RUT.pitchX + 4 + 3.5,
];

/* ---------- Código de hoja (48 bits) ---------- */
export const META = { x0: 128, y0: 17, pitch: 4.2, r: 1.4, cols: 16, filas: 3 };
export const META_BITS = META.cols * META.filas; // 48
export const metaPos = (i: number) => ({
  x: META.x0 + (i % META.cols) * META.pitch,
  y: META.y0 + Math.floor(i / META.cols) * META.pitch,
});

/* ---------- Zona de respuestas ---------- */
export const ANS = {
  titleY: 118, instrY: 122.5,
  firstY: 130, lastYMax: 252,
  left: 22, width: 172,
  circleDx: 12,                    // distancia número -> burbuja A
  minPitchY: 5.5, maxPitchY: 7.5,
  minPitchX: 6.2, maxPitchX: 9,
};

/* ============================================================================
 * Código de hoja
 * ========================================================================== */
export interface ConfigHoja {
  preguntas: number;    // 1..255
  alternativas: number; // 2..5
  formas: number;       // 1..7
  idPrueba: number;     // 0..65535
}

function pushBits(bits: boolean[], valor: number, n: number) {
  for (let i = n - 1; i >= 0; i--) bits.push(((valor >> i) & 1) === 1);
}
function leerBits(bits: boolean[], desde: number, n: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) v = (v << 1) | (bits[desde + i] ? 1 : 0);
  return v;
}
function crc8(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}
function crcDeBits(bits40: boolean[]): number {
  const bytes: number[] = [];
  for (let i = 0; i < 40; i += 8) bytes.push(leerBits(bits40, i, 8));
  return crc8(bytes);
}

/** Campos: versión(4) preguntas(8) alternativas(3) formas(3) idPrueba(16) reservado(6) crc8(8) = 48 */
export function codificarMeta(cfg: ConfigHoja): boolean[] {
  const bits: boolean[] = [];
  pushBits(bits, LAYOUT_VERSION, 4);
  pushBits(bits, cfg.preguntas, 8);
  pushBits(bits, cfg.alternativas, 3);
  pushBits(bits, cfg.formas, 3);
  pushBits(bits, cfg.idPrueba, 16);
  pushBits(bits, 0, 6);
  pushBits(bits, crcDeBits(bits), 8);
  return bits;
}

/** Devuelve null si el CRC o la versión no calzan (lectura dudosa). */
export function decodificarMeta(bits: boolean[]): ConfigHoja | null {
  if (bits.length !== META_BITS) return null;
  if (crcDeBits(bits.slice(0, 40)) !== leerBits(bits, 40, 8)) return null;
  if (leerBits(bits, 0, 4) !== LAYOUT_VERSION) return null;
  const cfg: ConfigHoja = {
    preguntas: leerBits(bits, 4, 8),
    alternativas: leerBits(bits, 12, 3),
    formas: leerBits(bits, 15, 3),
    idPrueba: leerBits(bits, 18, 16),
  };
  if (cfg.preguntas < 1 || cfg.alternativas < 2 || cfg.alternativas > 5 || cfg.formas < 1) return null;
  return cfg;
}

/** ID de 16 bits estable a partir de texto (por si la pauta no trae un id propio). */
export function hashId16(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) & 0xffff;
}

/* ============================================================================
 * Geometría de preguntas (depende de cuántas preguntas / alternativas haya)
 * ========================================================================== */
export interface PreguntaLayout {
  numero: number;   // 1..N
  col: number;
  fila: number;
  xNum: number;     // x del número impreso
  y: number;        // y de la fila (mm)
  xs: number[];     // x de cada alternativa (mm)
}

export interface Layout {
  cfg: ConfigHoja;
  numCols: number;
  filasPorColumna: number;
  pitchY: number;
  pitchX: number;
  preguntas: PreguntaLayout[];
  forma: { y: number; xs: number[] } | null;
}

/** Intenta distribuir las preguntas; devuelve null si no caben (sin lanzar error). */
function distribuir(preguntas: number, alternativas: number) {
  for (const nc of [2, 3, 4]) {
    const filas = Math.ceil(preguntas / nc);
    const pY = filas > 1 ? Math.min(ANS.maxPitchY, (ANS.lastYMax - ANS.firstY) / (filas - 1)) : ANS.maxPitchY;
    const colW = ANS.width / nc;
    const pX = Math.min(ANS.maxPitchX, (colW - ANS.circleDx - 3) / (alternativas - 1));
    if (pY >= ANS.minPitchY && pX >= ANS.minPitchX) return { nc, filas, pY, pX };
  }
  return null;
}

export function capacidadMaxima(alternativas: number): number {
  for (let n = 255; n >= 1; n--) if (distribuir(n, alternativas)) return n;
  return 0;
}

export function calcularLayout(cfg: ConfigHoja): Layout {
  const { preguntas, alternativas, formas } = cfg;
  if (!Number.isInteger(preguntas) || preguntas < 1 || preguntas > 255) throw new Error('Cantidad de preguntas inválida (1-255).');
  if (!Number.isInteger(alternativas) || alternativas < 2 || alternativas > 5) throw new Error('Las alternativas deben ser entre 2 y 5.');
  if (!Number.isInteger(formas) || formas < 1 || formas > 7) throw new Error('Las formas deben ser entre 1 y 7.');

  const elegido = distribuir(preguntas, alternativas);
  if (!elegido) throw new Error(`No caben ${preguntas} preguntas con ${alternativas} alternativas en una hoja (máximo ${capacidadMaxima(alternativas)}).`);

  const { nc, filas, pY, pX } = elegido;
  const colW = ANS.width / nc;
  const lista: PreguntaLayout[] = [];
  for (let q = 0; q < preguntas; q++) {
    const col = Math.floor(q / filas);
    const fila = q % filas;
    const xNum = ANS.left + col * colW;
    lista.push({
      numero: q + 1, col, fila, xNum,
      y: ANS.firstY + fila * pY,
      xs: Array.from({ length: alternativas }, (_, a) => xNum + ANS.circleDx + a * pX),
    });
  }
  const forma = formas > 1 ? { y: 95, xs: Array.from({ length: formas }, (_, f) => 150 + f * 14) } : null;
  return { cfg, numCols: nc, filasPorColumna: filas, pitchY: pY, pitchX: pX, preguntas: lista, forma };
}

/* ============================================================================
 * RUT
 * ========================================================================== */
/** Módulo 11 chileno. */
export function dvEsperado(cuerpo: string): string {
  let suma = 0, f = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * f;
    f = f === 7 ? 2 : f + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

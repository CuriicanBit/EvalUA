/* ============================================================================
 * omrLectura.ts — lectura de la hoja YA ENDEREZADA (sin dependencias de OpenCV)
 * ----------------------------------------------------------------------------
 * Entrada: imagen en gris normalizada (papel ≈ 255, tinta oscura) de AREA_PX
 * (744 x 998) cuyo (0,0) y (w,h) son los CENTROS de las marcas de esquina.
 * Al ser una función pura se puede probar con Node sin navegador.
 * ========================================================================== */
import {
  AREA_MM, FID_C, R_BURBUJA, R_LECTURA, RUT, RUT_XS, META_BITS, metaPos,
  calcularLayout, decodificarMeta, dvEsperado,
  type ConfigHoja, type Layout,
} from './omrLayout';

export interface ImagenGris { data: Uint8Array | Uint8ClampedArray; w: number; h: number }

export type Resultado = 'A' | 'B' | 'C' | 'D' | 'E' | '-' | '*';
// '-' = en blanco, '*' = marca múltiple

export const UMBRAL_MARCA = 0.10;   // oscuridad (0..1) para considerar marcada una burbuja
export const RATIO_DOMINANTE = 1.5; // con 2 marcadas, si una es 1.5x más oscura se asume borrón
const UMBRAL_BIT = 0.5;             // los bits del código de hoja son círculos negros macizos

export interface MarcaOverlay { x: number; y: number; r: number; tipo: 'ref' | 'ok' | 'multiple' | 'rut' }

export interface Lectura {
  config: ConfigHoja;
  rut: string;           // "12345678-9" ('X' = columna sin marcar, '?' = marca múltiple)
  rutValido: boolean;
  forma: string | null;  // 'A','B'... o null si no hay formas / no se marcó
  respuestas: Resultado[];
  blancas: number;
  multiples: number;
  marcas: MarcaOverlay[];
}

/* ---------- utilidades de medición ---------- */
const sx = (img: ImagenGris) => img.w / AREA_MM.w;
const sy = (img: ImagenGris) => img.h / AREA_MM.h;
const pxX = (img: ImagenGris, mm: number) => (mm - FID_C) * sx(img);
const pxY = (img: ImagenGris, mm: number) => (mm - FID_C) * sy(img);

/** Oscuridad media (0 = papel, 1 = negro) dentro de un disco (coordenadas en px). */
export function scoreDisco(img: ImagenGris, cx: number, cy: number, r: number): number {
  let suma = 0, n = 0;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(img.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(img.h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) { suma += img.data[y * img.w + x]; n++; }
    }
  }
  return n === 0 ? NaN : 1 - suma / n / 255;
}

function scoreMm(img: ImagenGris, xmm: number, ymm: number, rmm: number): number {
  return scoreDisco(img, pxX(img, xmm), pxY(img, ymm), rmm * sx(img));
}

export function decidir(scores: number[], umbral = UMBRAL_MARCA): { idx: number; estado: 'ok' | 'blanco' | 'multiple' } {
  const orden = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
  const mejor = orden[0], segundo = orden[1];
  if (!(mejor.s >= umbral)) return { idx: -1, estado: 'blanco' };
  if (segundo && segundo.s >= umbral && mejor.s < segundo.s * RATIO_DOMINANTE) return { idx: -1, estado: 'multiple' };
  return { idx: mejor.i, estado: 'ok' };
}

/* ---------- 1. Código de hoja ---------- */
export function leerConfigHoja(img: ImagenGris): ConfigHoja | null {
  const bits: boolean[] = [];
  for (let i = 0; i < META_BITS; i++) {
    const { x, y } = metaPos(i);
    bits.push(scoreMm(img, x, y, 0.8) >= UMBRAL_BIT);
  }
  return decodificarMeta(bits);
}

/* ---------- 2. Lectura completa ---------- */
export function leerHoja(img: ImagenGris, config: ConfigHoja): Lectura {
  const layout: Layout = calcularLayout(config);
  const marcas: MarcaOverlay[] = [];
  const rPx = R_BURBUJA * sx(img);

  /* RUT */
  let cuerpo = '', dv = '';
  for (let c = 0; c < RUT_XS.length; c++) {
    const n = c === 8 ? 11 : 10;
    const scores: number[] = [];
    for (let r = 0; r < n; r++) scores.push(scoreMm(img, RUT_XS[c], RUT.circlesY0 + r * RUT.pitchY, R_LECTURA * 0.8));
    const d = decidir(scores);
    const ch = d.estado === 'blanco' ? 'X' : d.estado === 'multiple' ? '?' : (c === 8 && d.idx === 10 ? 'K' : String(d.idx));
    if (c < 8) cuerpo += ch; else dv = ch;
    for (let r = 0; r < n; r++) {
      marcas.push({
        x: pxX(img, RUT_XS[c]), y: pxY(img, RUT.circlesY0 + r * RUT.pitchY), r: rPx,
        tipo: r === d.idx ? 'rut' : d.estado === 'multiple' && scores[r] >= UMBRAL_MARCA ? 'multiple' : 'ref',
      });
    }
  }
  // RUT de 7 dígitos: la primera columna queda en blanco
  const cuerpoLimpio = cuerpo.replace(/^X+/, '');
  const rutValido = /^\d{7,8}$/.test(cuerpoLimpio) && dv === dvEsperado(cuerpoLimpio);
  const rut = `${cuerpoLimpio}-${dv}`;

  /* Forma */
  let forma: string | null = null;
  if (layout.forma) {
    const sc = layout.forma.xs.map(x => scoreMm(img, x, layout.forma!.y, R_LECTURA));
    const d = decidir(sc);
    forma = d.estado === 'ok' ? String.fromCharCode(65 + d.idx) : d.estado === 'multiple' ? '?' : null;
    layout.forma.xs.forEach((x, i) => marcas.push({
      x: pxX(img, x), y: pxY(img, layout.forma!.y), r: rPx, tipo: i === d.idx ? 'ok' : 'ref',
    }));
  }

  /* Respuestas */
  const respuestas: Resultado[] = [];
  let blancas = 0, multiples = 0;
  for (const p of layout.preguntas) {
    const sc = p.xs.map(x => scoreMm(img, x, p.y, R_LECTURA));
    const d = decidir(sc);
    const res: Resultado = d.estado === 'blanco' ? '-' : d.estado === 'multiple' ? '*' : (String.fromCharCode(65 + d.idx) as Resultado);
    if (res === '-') blancas++;
    if (res === '*') multiples++;
    respuestas.push(res);
    p.xs.forEach((x, a) => marcas.push({
      x: pxX(img, x), y: pxY(img, p.y), r: rPx,
      tipo: d.estado === 'ok' && a === d.idx ? 'ok' : d.estado === 'multiple' && sc[a] >= UMBRAL_MARCA ? 'multiple' : 'ref',
    }));
  }

  return { config, rut, rutValido, forma, respuestas, blancas, multiples, marcas };
}

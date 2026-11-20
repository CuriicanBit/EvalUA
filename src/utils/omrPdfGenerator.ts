import { jsPDF } from 'jspdf';
import {
  PAGE, ID, RUT, RUT_XS, R_BURBUJA, META, META_BITS, metaPos, ANS,
  calcularLayout, codificarMeta, hashId16, type ConfigHoja,
} from './omrLayout';

export const VERSION_FORMULARIO = 'v5.0 - Autodescriptivo';

export interface PautaData {
  carrera: string;
  asignatura: string;
  seccion: string;
  cantidadPreguntas: number;
  cantidadAlternativas: number;
  cantidadFormas: number;
  claveRespuestas: Record<number, string>;
  fecha?: string;
  /** Identificador de la prueba (0-65535) que la app usará para buscar la pauta al leer.
   *  Si no se entrega, se calcula a partir de carrera|asignatura|seccion|fecha. */
  idPrueba?: number;
}

/** ID efectivo de la prueba (el mismo que queda impreso en el código de hoja). */
export function idPruebaDe(data: PautaData): number {
  if (data.idPrueba !== undefined) return data.idPrueba & 0xffff;
  return hashId16(`${data.carrera}|${data.asignatura}|${data.seccion}|${data.fecha ?? ''}`);
}

export function generarFormularioOmrPdf(data: PautaData): jsPDF {
  const cfg: ConfigHoja = {
    preguntas: data.cantidadPreguntas,
    alternativas: data.cantidadAlternativas,
    formas: data.cantidadFormas,
    idPrueba: idPruebaDe(data),
  };
  const layout = calcularLayout(cfg); // lanza error si no caben las preguntas

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const { W, H, margin } = PAGE;

  /* ---------- 1. MARCAS DE ESQUINA (únicas marcas necesarias para leer) ---------- */
  doc.setFillColor(0, 0, 0);
  doc.rect(margin, margin, 10, 10, 'F');
  doc.rect(W - margin - 10, margin, 10, 10, 'F');
  doc.rect(margin, H - margin - 10, 10, 10, 'F');
  doc.rect(W - margin - 10, H - margin - 10, 10, 10, 'F');

  /* ---------- 2. ENCABEZADO ---------- */
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('UNIVERSIDAD AUTÓNOMA DE CHILE', 25, 21);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const sub = doc.splitTextToSize(`${data.asignatura} | ${data.carrera}` + (data.seccion ? ` | Sección ${data.seccion}` : ''), 98);
  doc.text(sub[0], 25, 27);

  // Código de hoja: 48 círculos (relleno = 1). Lo lee el escáner; el texto de abajo es para humanos.
  const bits = codificarMeta(cfg);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);
  doc.setLineWidth(0.25);
  for (let i = 0; i < META_BITS; i++) {
    const { x, y } = metaPos(i);
    doc.circle(x, y, META.r, bits[i] ? 'F' : 'D');
  }
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text(
    `PRUEBA N° ${String(cfg.idPrueba).padStart(5, '0')}  ·  ${cfg.preguntas} preg.  ·  ${cfg.alternativas} alt.  ·  OMR ${VERSION_FORMULARIO}`,
    192, 31.5, { align: 'right' },
  );

  /* ---------- 3. IDENTIFICACIÓN ---------- */
  doc.setLineWidth(0.4);
  doc.setDrawColor(150, 150, 150);
  doc.roundedRect(ID.rutX, ID.y, ID.rutW, ID.h, 2, 2, 'D');

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('RUT', ID.rutX + 5, ID.y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('Escriba su RUT y rellene un círculo por columna. Si tiene 7 dígitos, deje vacía la primera columna.', ID.rutX + 17, ID.y + 4.8, { maxWidth: 78 });

  // Recuadros para escribir a mano (8 dígitos + guion + DV)
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.setFontSize(8);
  for (let i = 0; i < 8; i++) doc.rect(RUT.x0 + i * RUT.pitchX, RUT.boxY, RUT.boxW, RUT.boxH);
  doc.text('-', RUT.x0 + 8 * RUT.pitchX + 1, RUT.boxY + 6);
  doc.rect(RUT.x0 + 8 * RUT.pitchX + 4, RUT.boxY, RUT.boxW, RUT.boxH);

  // Matriz de burbujas
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.setLineWidth(0.3);
  for (let row = 0; row < 10; row++) {
    doc.text(String(row), RUT.x0 - 4, RUT.circlesY0 + row * RUT.pitchY + 0.8);
  }
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 10; row++) {
      doc.circle(RUT_XS[col], RUT.circlesY0 + row * RUT.pitchY, R_BURBUJA, 'D');
    }
  }
  for (let row = 0; row <= 10; row++) {
    const y = RUT.circlesY0 + row * RUT.pitchY;
    doc.circle(RUT_XS[8], y, R_BURBUJA, 'D');
    doc.text(row === 10 ? 'K' : String(row), RUT_XS[8] + 4, y + 0.8);
  }

  // Datos personales a mano (por si hay que corregir la identificación en la app)
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.4);
  doc.roundedRect(ID.datosX, ID.y, ID.datosW, ID.h, 2, 2, 'D');

  const campo = (label: string, y: number, xLinea: number, xFin: number, xLabel = ID.datosX + 5) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text(label, xLabel, y);
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.3);
    doc.line(xLinea, y + 0.8, xFin, y + 0.8);
    doc.setLineDashPattern([], 0);
  };
  const xFin = ID.datosX + ID.datosW - 5;
  campo('NOMBRE COMPLETO:', ID.y + 11, ID.datosX + 5, xFin);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(ID.datosX + 5, ID.y + 21, xFin, ID.y + 21);   // segunda línea para el nombre
  doc.setLineDashPattern([], 0);
  campo('CARRERA:', ID.y + 31, ID.datosX + 26, xFin);
  campo('ASIGNATURA:', ID.y + 41, ID.datosX + 32, xFin);
  campo('SECCIÓN:', ID.y + 51, ID.datosX + 26, ID.datosX + 48);
  campo('FECHA:', ID.y + 51, ID.datosX + 64, xFin, ID.datosX + 52);

  if (layout.forma) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text('FORMA:', ID.datosX + 5, layout.forma.y + 0.8);
    doc.setLineWidth(0.3);
    doc.setDrawColor(100, 100, 100);
    layout.forma.xs.forEach((x, f) => {
      doc.circle(x, layout.forma!.y, R_BURBUJA, 'D');
      doc.setFontSize(7);
      doc.text(String.fromCharCode(65 + f), x + 3.5, layout.forma!.y + 0.9);
    });
  }

  /* ---------- 4. RESPUESTAS ---------- */
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`HOJA DE RESPUESTAS (${cfg.preguntas} ÍTEMS)`, W / 2, ANS.titleY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text('Rellene completamente un solo círculo por pregunta, con lápiz grafito o lápiz pasta oscuro. No use corrector.', W / 2, ANS.instrY, { align: 'center' });

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  for (const p of layout.preguntas) {
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(String(p.numero).padStart(2, '0'), p.xNum, p.y + 1);

    if (p.fila === 0) {
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      p.xs.forEach((x, a) => doc.text(String.fromCharCode(65 + a), x, p.y - 4.5, { align: 'center' }));
    }
    p.xs.forEach(x => doc.circle(x, p.y, R_BURBUJA, 'D'));
  }

  return doc;
}

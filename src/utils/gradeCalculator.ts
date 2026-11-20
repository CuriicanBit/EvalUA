/**
 * Utilidad de cálculo de notas para pruebas OMR (escala chilena 1.0 a 7.0).
 */

/**
 * Calcula la calificación según la escala chilena por tramos:
 * - Si puntaje < puntajeExigencia:  1.0 + 3.0 * (puntaje / puntajeExigencia)
 * - Si puntaje >= puntajeExigencia: 4.0 + 3.0 * ((puntaje - puntajeExigencia) / (total - puntajeExigencia))
 *
 * - Redondeo a 1 decimal.
 * - Limita el resultado estrictamente entre 1.0 y 7.0.
 *
 * @param puntajeObtenido Puntaje obtenido por el estudiante (ej: 3)
 * @param puntajeTotal Puntaje máximo posible de la prueba (ej: 10)
 * @param nivelExigencia Nivel de exigencia (ej: 0.6 para 60%, o 60 si viene en porcentaje)
 * @returns Calificación redondeada a 1 decimal en el rango [1.0, 7.0]
 */
export function calcularNota(
  puntajeObtenido: number,
  puntajeTotal: number,
  nivelExigencia: number
): number {
  if (puntajeTotal <= 0 || isNaN(puntajeObtenido) || isNaN(puntajeTotal) || isNaN(nivelExigencia)) {
    return 1.0;
  }

  const exigencia = nivelExigencia > 1 ? nivelExigencia / 100 : nivelExigencia;
  const puntajeClamped = Math.max(0, Math.min(puntajeTotal, puntajeObtenido));

  if (exigencia <= 0) {
    return Math.round((4.0 + 3.0 * (puntajeClamped / puntajeTotal)) * 10) / 10;
  }
  if (exigencia >= 1) {
    return puntajeClamped >= puntajeTotal ? 7.0 : 1.0;
  }

  const puntajeAprobacion = puntajeTotal * exigencia;
  let notaCalculada: number;

  if (puntajeClamped < puntajeAprobacion) {
    notaCalculada = 1.0 + 3.0 * (puntajeClamped / puntajeAprobacion);
  } else {
    notaCalculada = 4.0 + 3.0 * ((puntajeClamped - puntajeAprobacion) / (puntajeTotal - puntajeAprobacion));
  }

  const notaLimitada = Math.max(1.0, Math.min(7.0, notaCalculada));
  return Math.round(notaLimitada * 10) / 10;
}

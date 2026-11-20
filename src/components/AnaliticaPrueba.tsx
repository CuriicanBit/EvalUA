import React, { useState, useEffect, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { authFetch } from '../utils/authFetch';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  BarChart3,
  FileSpreadsheet,
  RefreshCw,
  Table2,
  Activity,
  ArrowUpDown,
  AlertCircle,
  AlertTriangle,
  PenTool,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { evaluarEstadoPauta } from '../utils/pautaStatus';

export interface AnaliticaPruebaProps {
  pruebaId: string;
  pruebaData?: any;
  refreshTrigger?: number;
  onIrAPauta?: () => void;
}

type SubTab = 'resumen' | 'psicometrico' | 'desarrollo' | 'sabana';
type SortField = 'numero' | 'indice_dificultad' | 'indice_discriminacion';

interface PruebaAnalyticsResponse {
  prueba: {
    id: string;
    nombre: string;
    asignatura_nombre: string;
    nombre_docente: string;
    cantidad_preguntas: number;
    puntaje_total?: number;
    cantidad_alternativas: number;
    cantidad_formas?: number;
    nivel_exigencia: number;
    pauta_respuestas?: any;
  };
  kpis: {
    total_evaluados: number;
    promedio: number;
    nota_maxima: number;
    nota_minima: number;
    aprobados: number;
    reprobados: number;
    tasa_aprobacion: number;
    nivel_exigencia: number;
  };
  histograma: Array<{
    rango: string;
    estado: 'reprobado' | 'aprobado';
    cantidad: number;
  }>;
  preguntas: Array<{
    numero: number;
    respuesta_correcta: string;
    puntos: number;
    tipo?: 'seleccion' | 'desarrollo';
    anulada?: boolean;
    total_correctas: number;
    indice_dificultad: number;
    indice_discriminacion: number;
    distribucion: Record<string, { count: number; pct: number }>;
  }>;
  matriz: Array<{
    id: string;
    alumno_rut: string;
    nombre_alumno: string;
    forma: string;
    puntaje_obtenido: number;
    puntaje_total?: number;
    nota: number;
    fecha_escaneo: string;
    celdas: Array<{
      pregunta: number;
      marcada: string;
      correcta: string | null;
      estado: 'correcta' | 'incorrecta' | 'omitida' | 'multiple' | 'anulada' | 'desarrollo';
      puntos?: number;
      puntaje_manual?: number | null;
    }>;
  }>;
}

interface ManualScoreInputProps {
  initialValue: number | null | undefined;
  maxPuntos: number;
  onSave: (valStr: string) => Promise<void>;
  scopeId?: string;
  rowIndex?: number;
  colPregunta?: number;
}

const ManualScoreInput: React.FC<ManualScoreInputProps> = ({
  initialValue,
  maxPuntos,
  onSave,
  scopeId,
  rowIndex,
  colPregunta,
}) => {
  const formatVal = (v: number | null | undefined) =>
    v !== null && v !== undefined && Number.isFinite(Number(v)) ? String(v) : '';

  const [value, setValue] = useState<string>(() => formatVal(initialValue));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(formatVal(initialValue));
  }, [initialValue]);

  const commitSave = async () => {
    const trimmed = value.trim();
    const serverStr = formatVal(initialValue);

    if (trimmed === '') {
      if (serverStr === '') return;
      setSaving(true);
      await onSave('');
      setSaving(false);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setValue(serverStr);
      return;
    }

    const clamped = Math.min(maxPuntos, Math.max(0, Number(parsed.toFixed(2))));
    const clampedStr = String(clamped);
    setValue(clampedStr);

    if (clampedStr === serverStr) return;

    setSaving(true);
    await onSave(clampedStr);
    setSaving(false);
  };

  const focusNextRow = (delta: number) => {
    if (!scopeId || rowIndex === undefined || colPregunta === undefined) return;
    const nextSelector = `input[data-score-scope="${scopeId}"][data-score-row="${rowIndex + delta}"][data-score-col="${colPregunta}"]`;
    const nextEl = document.querySelector<HTMLInputElement>(nextSelector);
    if (nextEl) {
      nextEl.focus();
      nextEl.select();
    }
  };

  return (
    <div className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
      <input
        type="number"
        min={0}
        max={maxPuntos}
        step="any"
        value={value}
        disabled={saving}
        placeholder="-"
        title={`Ingresa puntaje de 0 a ${maxPuntos}`}
        data-score-scope={scopeId}
        data-score-row={rowIndex}
        data-score-col={colPregunta}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (scopeId && rowIndex !== undefined && colPregunta !== undefined) {
              const nextExists = document.querySelector<HTMLInputElement>(
                `input[data-score-scope="${scopeId}"][data-score-row="${rowIndex + 1}"][data-score-col="${colPregunta}"]`
              );
              if (nextExists) {
                nextExists.focus();
                nextExists.select();
              } else {
                (e.target as HTMLInputElement).blur();
              }
            } else {
              (e.target as HTMLInputElement).blur();
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusNextRow(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusNextRow(-1);
          }
        }}
        className="w-14 text-center font-mono text-xs bg-white border border-purple-300 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
      />
      <span className="text-[11px] font-semibold text-purple-800/80 font-mono">
        / {maxPuntos}
      </span>
    </div>
  );
};

export const AnaliticaPrueba: React.FC<AnaliticaPruebaProps> = ({
  pruebaId,
  pruebaData,
  refreshTrigger = 0,
  onIrAPauta,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('resumen');
  const [data, setData] = useState<PruebaAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [sortField, setSortField] = useState<SortField>('numero');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [soloPendientesDesarrollo, setSoloPendientesDesarrollo] = useState<boolean>(false);
  const [sabanaSoloDesarrollo, setSabanaSoloDesarrollo] = useState<boolean>(false);

  // Función para extraer la letra correcta, ya sea que venga como string o como objeto
  const obtenerLetraCorrecta = (respuesta: any) => {
    if (!respuesta) return '-';
    if (typeof respuesta === 'string') return respuesta;
    if (typeof respuesta === 'object' && respuesta.correcta) return respuesta.correcta;
    return '-';
  };

  const fetchAnalytics = async () => {
    if (!pruebaId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/estadisticas/prueba/${encodeURIComponent(pruebaId)}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Error HTTP ${res.status}`);
      }
      const json: PruebaAnalyticsResponse = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Error cargando analítica de prueba:', err);
      setError(err?.message || 'No se pudieron cargar las estadísticas de la evaluación.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [pruebaId, refreshTrigger]);

  const sortedPreguntas = useMemo(() => {
    if (!data?.preguntas) return [];
    const list = [...data.preguntas];
    list.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      return sortAsc ? valA - valB : valB - valA;
    });
    return list;
  }, [data?.preguntas, sortField, sortAsc]);

  const desarrolloResumen = useMemo(() => {
    if (!data) {
      return {
        preguntasDesarrollo: [] as PruebaAnalyticsResponse['preguntas'],
        tieneDesarrollo: false,
        totalSlots: 0,
        calificadasCount: 0,
        pendientesCount: 0,
        alumnosPendientesCount: 0,
      };
    }

    const numsEnMatriz = new Set<number>();
    data.matriz.forEach((row) => {
      row.celdas.forEach((c) => {
        if (c.estado === 'desarrollo') numsEnMatriz.add(c.pregunta);
      });
    });

    const preguntasDesarrollo = data.preguntas.filter(
      (p) => !p.anulada && (p.tipo === 'desarrollo' || numsEnMatriz.has(p.numero))
    );

    let totalSlots = 0;
    let calificadasCount = 0;
    let alumnosPendientesCount = 0;

    data.matriz.forEach((row) => {
      const celdasDes = row.celdas.filter((c) => c.estado === 'desarrollo');
      if (celdasDes.length === 0) return;
      let alumnoTienePendiente = false;
      celdasDes.forEach((c) => {
        totalSlots++;
        if (c.puntaje_manual !== null && c.puntaje_manual !== undefined) {
          calificadasCount++;
        } else {
          alumnoTienePendiente = true;
        }
      });
      if (alumnoTienePendiente) alumnosPendientesCount++;
    });

    return {
      preguntasDesarrollo,
      tieneDesarrollo: preguntasDesarrollo.length > 0 || totalSlots > 0,
      totalSlots,
      calificadasCount,
      pendientesCount: totalSlots - calificadasCount,
      alumnosPendientesCount,
    };
  }, [data]);

  useEffect(() => {
    if (data && subTab === 'desarrollo' && !desarrolloResumen.tieneDesarrollo) {
      setSubTab('resumen');
    }
  }, [data, subTab, desarrolloResumen.tieneDesarrollo]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'numero');
    }
  };

  const getDificultadLabel = (p: number) => {
    if (p >= 0.85) return { text: 'Muy fácil', cls: 'text-sky-700' };
    if (p >= 0.30) return { text: 'Óptima', cls: 'text-emerald-700' };
    if (p >= 0.15) return { text: 'Difícil', cls: 'text-amber-700' };
    return { text: 'Muy difícil', cls: 'text-rose-700' };
  };

  const getDiscriminacionLabel = (d: number) => {
    if (d >= 0.40) return { text: 'Excelente', cls: 'text-emerald-700' };
    if (d >= 0.30) return { text: 'Buena', cls: 'text-teal-700' };
    if (d >= 0.20) return { text: 'Regular', cls: 'text-amber-700' };
    return { text: 'Revisar', cls: 'text-rose-700' };
  };

  const handleExportarExcel = async () => {
    if (!data || data.matriz.length === 0) return;
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'EvalUA — Universidad Autónoma de Chile';
      workbook.created = new Date();

      const sheetMatriz = workbook.addWorksheet('Sábana de Resultados', {
        views: [{ state: 'frozen', xSplit: 5, ySplit: 4 }],
      });

      const numPreguntas = data.prueba.cantidad_preguntas;
      const totalCols = 5 + numPreguntas;

      // Título e información de cabecera
      sheetMatriz.mergeCells(1, 1, 1, totalCols);
      const titleCell = sheetMatriz.getCell(1, 1);
      titleCell.value = `Sábana de Resultados — ${data.prueba.nombre}`;
      titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF3D3935' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
      sheetMatriz.getRow(1).height = 26;

      sheetMatriz.mergeCells(2, 1, 2, totalCols);
      const metaCell = sheetMatriz.getCell(2, 1);
      metaCell.value = `Asignatura: ${data.prueba.asignatura_nombre || '-'} | Exigencia: ${data.kpis.nivel_exigencia}% | Evaluados: ${data.kpis.total_evaluados} | Promedio: ${data.kpis.promedio.toFixed(2)} | Aprobación: ${data.kpis.tasa_aprobacion}%`;
      metaCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF6E6A66' } };
      sheetMatriz.getRow(2).height = 20;

      // Encabezados de tabla en fila 4
      const headers = [
        'RUT',
        'Alumno',
        'Forma',
        'Puntaje',
        'Nota',
        ...Array.from({ length: numPreguntas }, (_, i) => `P${i + 1}`),
      ];
      const headerRow = sheetMatriz.getRow(4);
      headerRow.values = headers;
      headerRow.height = 24;
      headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF3D3935' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber <= 2 ? 'left' : 'center',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF524D47' } },
          left: { style: 'thin', color: { argb: 'FF524D47' } },
          bottom: { style: 'thin', color: { argb: 'FF524D47' } },
          right: { style: 'thin', color: { argb: 'FF524D47' } },
        };
      });

      // Fila 5: Pauta de referencia (Forma A)
      const puntajeTotalRef = data.prueba.puntaje_total ?? numPreguntas;
      const pautaValues = [
        'PAUTA',
        'Clave de Respuestas (Base)',
        '-',
        puntajeTotalRef,
        '7.0',
        ...data.preguntas.map((p) =>
          p.anulada ? 'ANUL' : p.tipo === 'desarrollo' ? `DES(${p.puntos})` : obtenerLetraCorrecta(p.respuesta_correcta)
        ),
      ];
      const pautaRow = sheetMatriz.getRow(5);
      pautaRow.values = pautaValues;
      pautaRow.height = 20;
      pautaRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF3D3935' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEA' } };
        cell.alignment = { vertical: 'middle', horizontal: colNumber <= 2 ? 'left' : 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFDADADA' } },
          left: { style: 'thin', color: { argb: 'FFDADADA' } },
          bottom: { style: 'medium', color: { argb: 'FFA6A09A' } },
          right: { style: 'thin', color: { argb: 'FFDADADA' } },
        };
      });

      // Filas de alumnos
      const estadoEstilos: Record<string, { bg: string; fg: string }> = {
        correcta: { bg: 'FFDCFCE7', fg: 'FF166534' },
        incorrecta: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
        omitida: { bg: 'FFF1F5F9', fg: 'FF475569' },
        multiple: { bg: 'FFFEF3C7', fg: 'FF92400E' },
        anulada: { bg: 'FFE2E8F0', fg: 'FF64748B' },
        desarrollo: { bg: 'FFF3E8FF', fg: 'FF6B21A8' },
      };

      data.matriz.forEach((rowItem, idx) => {
        const excelRowIdx = 6 + idx;
        const row = sheetMatriz.getRow(excelRowIdx);
        row.values = [
          rowItem.alumno_rut,
          rowItem.nombre_alumno,
          rowItem.forma,
          rowItem.puntaje_obtenido,
          Number(rowItem.nota.toFixed(1)),
          ...rowItem.celdas.map((c) => {
            if (c.estado === 'desarrollo') {
              return c.puntaje_manual !== null && c.puntaje_manual !== undefined
                ? `${c.puntaje_manual}/${c.puntos ?? ''}`
                : '-';
            }
            if (c.estado === 'anulada') return 'ANUL';
            return c.marcada;
          }),
        ];
        row.height = 20;

        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFDADADA' } },
            left: { style: 'thin', color: { argb: 'FFDADADA' } },
            bottom: { style: 'thin', color: { argb: 'FFDADADA' } },
            right: { style: 'thin', color: { argb: 'FFDADADA' } },
          };

          if (colNumber <= 5) {
            cell.alignment = {
              vertical: 'middle',
              horizontal: colNumber <= 2 ? 'left' : 'center',
            };
            cell.font = {
              name: 'Calibri',
              size: 10,
              bold: colNumber === 5,
              color: {
                argb:
                  colNumber === 5
                    ? rowItem.nota >= 4.0
                      ? 'FF15803D'
                      : 'FFB91C1C'
                    : 'FF3D3935',
              },
            };
            if (colNumber === 5) {
              cell.numFmt = '0.0';
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: rowItem.nota >= 4.0 ? 'FFDCFCE7' : 'FFFEE2E2' },
              };
            }
          } else {
            const celda = rowItem.celdas[colNumber - 6];
            const estilo = estadoEstilos[celda?.estado || 'omitida'];
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: estilo.fg } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estilo.bg } };
          }
        });
      });

      // Anchos de columna
      sheetMatriz.getColumn(1).width = 15;
      sheetMatriz.getColumn(2).width = 28;
      sheetMatriz.getColumn(3).width = 8;
      sheetMatriz.getColumn(4).width = 10;
      sheetMatriz.getColumn(5).width = 9;
      for (let c = 6; c <= totalCols; c++) {
        sheetMatriz.getColumn(c).width = 5.5;
      }

      // Hoja 2: Análisis Psicométrico
      const sheetPsico = workbook.addWorksheet('Análisis Psicométrico', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      const letras = ['A', 'B', 'C', 'D', 'E'].slice(0, data.prueba.cantidad_alternativas);
      const psicoHeaders = [
        'Pregunta',
        'Correcta',
        ...letras.map((l) => `% ${l}`),
        '% Omitida (-)',
        '% Doble (*)',
        'Dificultad (P)',
        'Discriminación (D)',
      ];
      const psicoHeaderRow = sheetPsico.getRow(1);
      psicoHeaderRow.values = psicoHeaders;
      psicoHeaderRow.height = 24;
      psicoHeaderRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D3935' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      data.preguntas.forEach((p, idx) => {
        const r = sheetPsico.getRow(2 + idx);
        r.values = [
          p.numero,
          p.respuesta_correcta,
          ...letras.map((l) => p.distribucion[l]?.pct ?? 0),
          p.distribucion['-']?.pct ?? 0,
          p.distribucion['*']?.pct ?? 0,
          p.indice_dificultad,
          p.indice_discriminacion,
        ];
        r.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFDADADA' } },
            left: { style: 'thin', color: { argb: 'FFDADADA' } },
            bottom: { style: 'thin', color: { argb: 'FFDADADA' } },
            right: { style: 'thin', color: { argb: 'FFDADADA' } },
          };
        });
      });
      sheetPsico.columns.forEach((col) => {
        col.width = 14;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = (data.prueba.nombre || 'evaluacion').replace(/[^a-zA-Z0-9_-]+/g, '_');
      link.href = url;
      link.download = `Matriz_${safeName}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exportando Excel:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleGuardarPuntajeManual = async (resultadoId: string, preguntaNum: number, puntosStr: string) => {
    const esVacio = puntosStr.trim() === '';
    const puntosVal = esVacio ? null : Number(puntosStr);
    if (!esVacio && (!Number.isFinite(puntosVal) || (puntosVal as number) < 0)) return;

    try {
      const res = await authFetch(`/api/resultados/${resultadoId}/puntaje-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta_num: preguntaNum, puntos: puntosVal }),
      });
      if (res.ok) {
        await fetchAnalytics();
      }
    } catch (error) {
      console.error('Error guardando puntaje manual', error);
    }
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-[#DADADA] p-6 max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-[#F5F5F5] animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-[#F5F5F5] animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-[#DA291C]/30 p-8 max-w-4xl mx-auto text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-[#DA291C] mx-auto" />
        <h3 className="text-base font-bold text-[#3D3935]">Error cargando analítica de evaluación</h3>
        <p className="text-sm text-[#6E6A66]">{error}</p>
        <button
          type="button"
          onClick={fetchAnalytics}
          className="px-4 py-2 text-xs font-semibold bg-[#3D3935] text-white rounded-xl hover:bg-[#2E2B28] transition-colors cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const pautaStatus = evaluarEstadoPauta(data?.prueba || pruebaData);

  const alertaPautaBanner = !pautaStatus.completa ? (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 max-w-6xl mx-auto"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm space-y-0.5">
          <p className="font-bold text-amber-950">
            {pautaStatus.estado === 'vacia'
              ? 'Advertencia: Pauta de evaluación no creada'
              : 'Advertencia: Pauta de evaluación incompleta'}
          </p>
          <p className="text-amber-800">
            {pautaStatus.mensaje} Sin una pauta docente completa y guardada, los resultados, puntajes y notas no reflejarán la corrección real.
          </p>
        </div>
      </div>
      {onIrAPauta && (
        <button
          type="button"
          onClick={onIrAPauta}
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Ir a Pauta de Evaluación
        </button>
      )}
    </div>
  ) : null;

  if (!data || data.kpis.total_evaluados === 0) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        {alertaPautaBanner}
        <div className="bg-white rounded-2xl border border-[#DADADA] p-12 max-w-5xl mx-auto text-center space-y-3">
          <BarChart3 className="w-10 h-10 text-[#DADADA] mx-auto" />
          <h3 className="text-base font-bold text-[#3D3935]">Sin resultados procesados aún</h3>
          <p className="text-sm text-[#6E6A66] max-w-md mx-auto">
            Escanea y guarda al menos un lote de hojas OMR en la pestaña Lectura de Respuestas para habilitar los gráficos, el análisis psicométrico y la matriz Excel.
          </p>
          <button
            type="button"
            onClick={fetchAnalytics}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#3D3935] bg-[#F5F5F5] hover:bg-[#EAEAEA] border border-[#DADADA] rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>
    );
  }

  const letras = ['A', 'B', 'C', 'D', 'E'].slice(0, data.prueba.cantidad_alternativas);

  const alertaDesarrolloBanner =
    desarrolloResumen.tieneDesarrollo &&
    desarrolloResumen.pendientesCount > 0 &&
    subTab !== 'desarrollo' ? (
      <div
        role="status"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-purple-50 border border-purple-200 text-purple-950 max-w-6xl mx-auto"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
            <PenTool className="w-4 h-4" />
          </div>
          <div className="text-xs sm:text-sm space-y-0.5">
            <p className="font-bold text-purple-950">
              Corrección manual pendiente: {desarrolloResumen.pendientesCount}{' '}
              {desarrolloResumen.pendientesCount === 1 ? 'respuesta de desarrollo' : 'respuestas de desarrollo'} sin puntaje
            </p>
            <p className="text-purple-800">
              Faltan notas en {desarrolloResumen.alumnosPendientesCount}{' '}
              {desarrolloResumen.alumnosPendientesCount === 1 ? 'alumno' : 'alumnos'} para{' '}
              {desarrolloResumen.preguntasDesarrollo
                .map((p) => `P${p.numero} (Máx ${p.puntos} pts)`)
                .join(', ')}
              . Ingresa los puntajes para actualizar las notas definitivas.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSubTab('desarrollo')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Ir a corregir desarrollo</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    ) : null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {alertaPautaBanner}
      {alertaDesarrolloBanner}
      {/* Barra superior de sub-navegación y acciones */}
      <div className="bg-white rounded-2xl border border-[#DADADA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#F5F5F5] border border-[#DADADA]/60 rounded-xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('resumen')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'resumen'
                ? 'bg-white text-[#DA291C] shadow-xs border border-[#DADADA]/70'
                : 'text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Resumen y Gráficas</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('psicometrico')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'psicometrico'
                ? 'bg-white text-[#DA291C] shadow-xs border border-[#DADADA]/70'
                : 'text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Análisis Psicométrico</span>
          </button>

          {desarrolloResumen.tieneDesarrollo && (
            <button
              type="button"
              onClick={() => setSubTab('desarrollo')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'desarrollo'
                  ? 'bg-white text-purple-900 shadow-xs border border-purple-200'
                  : 'text-[#6E6A66] hover:text-[#3D3935]'
              }`}
            >
              <PenTool className={`w-3.5 h-3.5 ${subTab === 'desarrollo' ? 'text-purple-700' : 'text-purple-600'}`} />
              <span>Corrección Desarrollo</span>
              {desarrolloResumen.pendientesCount > 0 ? (
                <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                  {desarrolloResumen.pendientesCount} pend.
                </span>
              ) : (
                <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200">
                  Listo
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setSubTab('sabana')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'sabana'
                ? 'bg-white text-[#DA291C] shadow-xs border border-[#DADADA]/70'
                : 'text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>Sábana de Resultados</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchAnalytics}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#3D3935] bg-[#F5F5F5] hover:bg-[#EAEAEA] border border-[#DADADA] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportarExcel}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exportando...' : 'Exportar Matriz a Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SUB-TAB 1: RESUMEN Y GRÁFICAS                                    */}
      {/* ================================================================ */}
      {subTab === 'resumen' && (
        <div className="space-y-6">
          {/* 5 KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border border-[#DADADA] p-4">
              <p className="text-xs font-medium text-[#6E6A66]">Promedio del Curso</p>
              <p className={`text-2xl font-bold mt-1 font-mono tabular-nums ${data.kpis.promedio >= 4.0 ? 'text-[#3D3935]' : 'text-[#DA291C]'}`}>
                {data.kpis.promedio.toFixed(2)}
              </p>
              <p className="text-xs text-[#6E6A66]/80 mt-1">Exigencia {data.kpis.nivel_exigencia}%</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#DADADA] p-4">
              <p className="text-xs font-medium text-[#6E6A66]">Nota Máxima</p>
              <p className="text-2xl font-bold mt-1 font-mono tabular-nums text-emerald-700">
                {data.kpis.nota_maxima.toFixed(1)}
              </p>
              <p className="text-xs text-[#6E6A66]/80 mt-1">Escala 1.0 a 7.0</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#DADADA] p-4">
              <p className="text-xs font-medium text-[#6E6A66]">Nota Mínima</p>
              <p className="text-2xl font-bold mt-1 font-mono tabular-nums text-rose-700">
                {data.kpis.nota_minima.toFixed(1)}
              </p>
              <p className="text-xs text-[#6E6A66]/80 mt-1">Escala 1.0 a 7.0</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#DADADA] p-4">
              <p className="text-xs font-medium text-[#6E6A66]">% de Aprobación</p>
              <p className="text-2xl font-bold mt-1 font-mono tabular-nums text-[#3D3935]">
                {data.kpis.tasa_aprobacion.toFixed(1)}%
              </p>
              <p className="text-xs text-[#6E6A66] mt-1 tabular-nums">
                {data.kpis.aprobados} aprob. · {data.kpis.reprobados} reprob.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-[#DADADA] p-4 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-[#6E6A66]">Total Evaluados</p>
              <p className="text-2xl font-bold mt-1 font-mono tabular-nums text-[#DA291C]">
                {data.kpis.total_evaluados}
              </p>
              <p className="text-xs text-[#6E6A66]/80 mt-1">Hojas procesadas</p>
            </div>
          </div>

          {/* Histograma de Distribución de Notas */}
          <div className="bg-white rounded-2xl border border-[#DADADA] p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <h3 className="text-base font-bold text-[#3D3935]">Histograma de Distribución de Notas</h3>
                <p className="text-xs text-[#6E6A66] mt-0.5">
                  Agrupación por tramos en escala chilena (aprobación desde nota 4.0)
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#6E6A66]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-rose-600 inline-block" />
                  Reprobados (&lt; 4.0)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                  Aprobados (&ge; 4.0)
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.histograma} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#DADADA" vertical={false} />
                  <XAxis
                    dataKey="rango"
                    tick={{ fill: '#3D3935', fontSize: 12 }}
                    axisLine={{ stroke: '#DADADA' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#3D3935', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#F5F5F5' }}
                    contentStyle={{
                      borderRadius: '10px',
                      border: '1px solid #DADADA',
                      boxShadow: '0 4px 12px rgba(61, 57, 53, 0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: any) => [`${value} alumnos`, 'Cantidad']}
                  />
                  <Bar dataKey="cantidad" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {data.histograma.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.estado === 'aprobado' ? '#16A34A' : '#DC2626'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Nómina de Resultados */}
          <div className="bg-white rounded-2xl border border-[#DADADA] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DADADA] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#3D3935]">Nómina de Alumnos Evaluados</h3>
                <p className="text-xs text-[#6E6A66] mt-0.5">
                  Calificaciones ordenadas de mayor a menor rendimiento
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F5F5] border-b border-[#DADADA] text-xs font-semibold text-[#3D3935]">
                    <th className="py-3 px-6">RUT</th>
                    <th className="py-3 px-6">Alumno</th>
                    <th className="py-3 px-4 text-center">Forma</th>
                    <th className="py-3 px-4 text-right">Puntaje</th>
                    <th className="py-3 px-4 text-right">Nota Final</th>
                    <th className="py-3 px-6 text-right">Situación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA] text-sm">
                  {data.matriz.map((row) => {
                    const aprobado = row.nota >= 4.0;
                    return (
                      <tr key={row.id || row.alumno_rut} className="hover:bg-[#F5F5F5]/70 transition-colors">
                        <td className="py-3 px-6 font-mono text-xs text-[#3D3935] tabular-nums">{row.alumno_rut}</td>
                        <td className="py-3 px-6 text-[#3D3935] font-medium">{row.nombre_alumno}</td>
                        <td className="py-3 px-4 text-center text-xs text-[#6E6A66]">{row.forma}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#3D3935]">
                          {row.puntaje_obtenido} / {row.puntaje_total ?? data.prueba.puntaje_total ?? data.prueba.cantidad_preguntas}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${aprobado ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {row.nota.toFixed(1)}
                        </td>
                        <td className={`py-3 px-6 text-right text-xs font-semibold ${aprobado ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {aprobado ? 'Aprobado' : 'Reprobado'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SUB-TAB 2: ANÁLISIS PSICOMÉTRICO POR PREGUNTA                    */}
      {/* ================================================================ */}
      {subTab === 'psicometrico' && (
        <div className="space-y-6">
          {/* Gráfico rápido de Dificultad P por Pregunta */}
          <div className="bg-white rounded-2xl border border-[#DADADA] p-6">
            <div className="mb-4">
              <h3 className="text-base font-bold text-[#3D3935]">Índice de Dificultad (P) por Ítem</h3>
              <p className="text-xs text-[#6E6A66] mt-0.5">
                Proporción de respuestas correctas por pregunta (rango óptimo recomendado: 0.30 a 0.85)
              </p>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.preguntas.map((p) => ({ name: `P${p.numero}`, P: p.indice_dificultad }))}
                  margin={{ top: 10, right: 16, left: -12, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#DADADA" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#3D3935', fontSize: 11 }} axisLine={{ stroke: '#DADADA' }} tickLine={false} />
                  <YAxis domain={[0, 1]} tick={{ fill: '#3D3935', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={0.3} stroke="#D97706" strokeDasharray="4 4" />
                  <ReferenceLine y={0.85} stroke="#0284C7" strokeDasharray="4 4" />
                  <Tooltip
                    cursor={{ fill: '#F5F5F5' }}
                    contentStyle={{ borderRadius: '10px', border: '1px solid #DADADA', fontSize: '12px' }}
                    formatter={(val: any) => [Number(val).toFixed(2), 'Índice P']}
                  />
                  <Bar dataKey="P" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {data.preguntas.map((p, idx) => (
                      <Cell
                        key={`p-${idx}`}
                        fill={
                          p.indice_dificultad < 0.3
                            ? '#DA291C'
                            : p.indice_dificultad >= 0.85
                            ? '#0284C7'
                            : '#3D3935'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla Psicométrica Detallada */}
          <div className="bg-white rounded-2xl border border-[#DADADA] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DADADA] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#3D3935]">Análisis de Distractores y Discriminación</h3>
                <p className="text-xs text-[#6E6A66] mt-0.5">
                  D = % acierto del 27% superior menos % acierto del 27% inferior
                </p>
              </div>
              <div className="text-xs text-[#6E6A66]">
                Haz clic en las cabeceras para ordenar
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F5F5] border-b border-[#DADADA] text-xs font-semibold text-[#3D3935]">
                    <th className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleSort('numero')}
                        className="inline-flex items-center gap-1 hover:text-[#DA291C] cursor-pointer"
                      >
                        <span>Pregunta</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-3 text-center">Correcta</th>
                    {letras.map((l) => (
                      <th key={l} className="py-3 px-3 text-right font-mono">{l}</th>
                    ))}
                    <th className="py-3 px-3 text-right">Omitida (-)</th>
                    <th className="py-3 px-3 text-right">Doble (*)</th>
                    <th className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('indice_dificultad')}
                        className="inline-flex items-center gap-1 hover:text-[#DA291C] cursor-pointer"
                      >
                        <span>Dificultad (P)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('indice_discriminacion')}
                        className="inline-flex items-center gap-1 hover:text-[#DA291C] cursor-pointer"
                      >
                        <span>Discriminación (D)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA] text-xs sm:text-sm">
                  {sortedPreguntas.map((q) => {
                    const dif = getDificultadLabel(q.indice_dificultad);
                    const disc = getDiscriminacionLabel(q.indice_discriminacion);
                    return (
                      <tr key={q.numero} className="hover:bg-[#F5F5F5]/70 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-bold text-[#3D3935] tabular-nums">
                          #{String(q.numero).padStart(2, '0')}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/50">
                          {q.anulada ? (
                            <span className="text-[10px] font-sans font-bold text-[#6E6A66] bg-[#EAEAEA] px-1.5 py-0.5 rounded">
                              ANULADA
                            </span>
                          ) : q.tipo === 'desarrollo' ? (
                            <span className="text-[10px] font-sans font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                              Des. (Máx {q.puntos})
                            </span>
                          ) : (
                            obtenerLetraCorrecta(q.respuesta_correcta)
                          )}
                        </td>
                        {letras.map((l) => {
                          const isKey = !q.anulada && q.tipo !== 'desarrollo' && q.respuesta_correcta === l;
                          const pct = q.distribucion[l]?.pct ?? 0;
                          return (
                            <td
                              key={l}
                              className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                                isKey
                                  ? 'font-bold text-emerald-800 bg-emerald-50/70'
                                  : pct >= 25
                                  ? 'text-amber-700 font-medium'
                                  : 'text-[#6E6A66]'
                              }`}
                            >
                              {pct.toFixed(1)}%
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#6E6A66]">
                          {(q.distribucion['-']?.pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                          {(q.distribucion['*']?.pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {q.anulada ? (
                            <span className="text-[#6E6A66]/70 font-sans">Anulada</span>
                          ) : (
                            <>
                              <span className="font-bold text-[#3D3935]">{q.indice_dificultad.toFixed(2)}</span>
                              <span className={`ml-2 text-xs font-sans font-semibold ${dif.cls}`}>
                                {q.tipo === 'desarrollo' ? `${Math.round(q.indice_dificultad * 100)}% logro` : dif.text}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {q.anulada ? (
                            <span className="text-[#6E6A66]/70 font-sans">-</span>
                          ) : (
                            <>
                              <span className="font-bold text-[#3D3935]">{q.indice_discriminacion.toFixed(2)}</span>
                              <span className={`ml-2 text-xs font-sans font-semibold ${disc.cls}`}>
                                {disc.text}
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SUB-TAB 3: CORRECCIÓN DEDICADA DE PREGUNTAS DE DESARROLLO        */}
      {/* ================================================================ */}
      {subTab === 'desarrollo' && desarrolloResumen.tieneDesarrollo && (() => {
        const filasVisibles = soloPendientesDesarrollo
          ? data.matriz.filter((row) =>
              row.celdas.some(
                (c) => c.estado === 'desarrollo' && (c.puntaje_manual === null || c.puntaje_manual === undefined)
              )
            )
          : data.matriz;

        const pctAvance =
          desarrolloResumen.totalSlots > 0
            ? Math.round((desarrolloResumen.calificadasCount / desarrolloResumen.totalSlots) * 100)
            : 100;

        return (
          <div className="bg-white rounded-2xl border border-[#DADADA] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DADADA] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-base font-bold text-[#3D3935]">
                    Corrección de Preguntas de Desarrollo
                  </h3>
                  {desarrolloResumen.pendientesCount === 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Todas calificadas ({desarrolloResumen.calificadasCount}/{desarrolloResumen.totalSlots})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      {desarrolloResumen.calificadasCount}/{desarrolloResumen.totalSlots} calificadas ({pctAvance}%)
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6E6A66]">
                  Ingresa el puntaje manual de cada pregunta de desarrollo. Presiona <kbd className="px-1.5 py-0.5 bg-[#F5F5F5] border border-[#DADADA] rounded text-[10px] font-mono">Enter</kbd> para pasar al siguiente alumno y recalcular notas al instante.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#3D3935] cursor-pointer select-none bg-[#F5F5F5] px-3 py-2 rounded-xl border border-[#DADADA]">
                  <input
                    type="checkbox"
                    checked={soloPendientesDesarrollo}
                    onChange={(e) => setSoloPendientesDesarrollo(e.target.checked)}
                    className="accent-purple-600 rounded"
                  />
                  <span>Solo alumnos pendientes ({desarrolloResumen.alumnosPendientesCount})</span>
                </label>

                <button
                  type="button"
                  onClick={() => setSubTab('sabana')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#3D3935] bg-white hover:bg-[#F5F5F5] border border-[#DADADA] rounded-xl transition-colors cursor-pointer"
                >
                  <Table2 className="w-3.5 h-3.5 text-[#6E6A66]" />
                  <span>Ver Sábana Completa</span>
                </button>
              </div>
            </div>

            {filasVisibles.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
                <p className="text-sm font-bold text-[#3D3935]">¡No quedan alumnos pendientes!</p>
                <p className="text-xs text-[#6E6A66]">
                  Todas las respuestas de desarrollo ya tienen puntaje asignado. Desmarca el filtro para editar calificaciones existentes.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#3D3935] text-white text-xs font-semibold">
                      <th className="py-3 px-4 sticky left-0 z-10 bg-[#3D3935] border-r border-[#524D47] min-w-[120px]">
                        RUT
                      </th>
                      <th className="py-3 px-4 border-r border-[#524D47] min-w-[200px]">
                        Alumno
                      </th>
                      <th className="py-3 px-3 text-center border-r border-[#524D47]">
                        Forma
                      </th>
                      {desarrolloResumen.preguntasDesarrollo.map((p) => (
                        <th
                          key={p.numero}
                          className="py-2.5 px-4 text-center border-r border-[#524D47] bg-purple-950/60 min-w-[150px]"
                        >
                          <div className="font-mono font-bold text-purple-100">Pregunta {p.numero}</div>
                          <div className="text-[10px] font-normal text-purple-200 mt-0.5">
                            Puntaje máximo: {p.puntos} pts
                          </div>
                        </th>
                      ))}
                      <th className="py-3 px-4 text-center border-r border-[#524D47] min-w-[110px]">
                        Puntaje Total
                      </th>
                      <th className="py-3 px-4 text-center min-w-[80px]">
                        Nota
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DADADA] text-xs sm:text-sm">
                    {filasVisibles.map((row, rowIdx) => (
                      <tr key={row.id || row.alumno_rut} className="hover:bg-[#F5F5F5]/70 transition-colors">
                        <td className="py-2.5 px-4 sticky left-0 z-10 bg-white border-r border-[#DADADA] font-mono text-xs text-[#3D3935] tabular-nums">
                          {row.alumno_rut}
                        </td>
                        <td className="py-2.5 px-4 border-r border-[#DADADA] text-[#3D3935] font-medium truncate max-w-[240px]">
                          {row.nombre_alumno}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-xs text-[#6E6A66] border-r border-[#DADADA]">
                          {row.forma}
                        </td>
                        {desarrolloResumen.preguntasDesarrollo.map((p) => {
                          const celda = row.celdas.find((c) => c.pregunta === p.numero);
                          if (!celda || celda.estado !== 'desarrollo') {
                            return (
                              <td
                                key={p.numero}
                                className="py-2.5 px-4 text-center text-[#6E6A66]/60 border-r border-[#DADADA] bg-[#F5F5F5]"
                              >
                                {celda?.estado === 'anulada' ? 'Anulada' : '-'}
                              </td>
                            );
                          }
                          const maxPuntos = celda.puntos ?? p.puntos ?? 1;
                          const pendiente = celda.puntaje_manual === null || celda.puntaje_manual === undefined;
                          return (
                            <td
                              key={p.numero}
                              className={`py-2 px-4 text-center border-r border-[#DADADA] ${
                                pendiente ? 'bg-amber-50/70' : 'bg-purple-50/50'
                              }`}
                            >
                              <ManualScoreInput
                                initialValue={celda.puntaje_manual}
                                maxPuntos={maxPuntos}
                                scopeId="dev"
                                rowIndex={rowIdx}
                                colPregunta={p.numero}
                                onSave={(valStr) => handleGuardarPuntajeManual(row.id, p.numero, valStr)}
                              />
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-4 text-center font-mono tabular-nums text-xs font-semibold text-[#3D3935] border-r border-[#DADADA]">
                          {row.puntaje_obtenido} / {row.puntaje_total ?? data.prueba.puntaje_total ?? data.prueba.cantidad_preguntas}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-center font-mono tabular-nums font-bold ${
                            row.nota >= 4.0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {row.nota.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ================================================================ */}
      {/* SUB-TAB 4: SÁBANA DE RESULTADOS (MATRIZ)                         */}
      {/* ================================================================ */}
      {subTab === 'sabana' && (() => {
        const columnasSabana =
          sabanaSoloDesarrollo && desarrolloResumen.tieneDesarrollo
            ? desarrolloResumen.preguntasDesarrollo
            : data.preguntas;

        return (
          <div className="bg-white rounded-2xl border border-[#DADADA] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DADADA] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#3D3935]">Sábana de Respuestas por Alumno</h3>
                <p className="text-xs text-[#6E6A66] mt-0.5">
                  Matriz completa de respuestas marcadas frente a la pauta oficial
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-[#3D3935]">
                {desarrolloResumen.tieneDesarrollo && (
                  <button
                    type="button"
                    onClick={() => setSabanaSoloDesarrollo((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer ${
                      sabanaSoloDesarrollo
                        ? 'bg-purple-700 text-white border-purple-700'
                        : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>{sabanaSoloDesarrollo ? 'Mostrando solo desarrollo' : 'Filtrar solo desarrollo'}</span>
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-xs border border-emerald-200 inline-block" style={{ backgroundColor: '#DCFCE7' }} />
                  Correcta
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-xs border border-rose-200 inline-block" style={{ backgroundColor: '#FEE2E2' }} />
                  Incorrecta
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-xs border border-[#DADADA] inline-block" style={{ backgroundColor: '#F5F5F5' }} />
                  Omitida (-)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-xs border border-amber-200 inline-block" style={{ backgroundColor: '#FEF3C7' }} />
                  Doble marca (*)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-xs border border-purple-200 inline-block" style={{ backgroundColor: '#F3E8FF' }} />
                  Desarrollo (manual)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-xs border border-[#DADADA] inline-block" style={{ backgroundColor: '#E5E5E5' }} />
                  Anulada
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#3D3935] text-white text-xs font-semibold">
                    <th className="py-2.5 px-4 sticky left-0 z-10 bg-[#3D3935] border-r border-[#524D47] min-w-[120px]">
                      RUT
                    </th>
                    <th className="py-2.5 px-4 border-r border-[#524D47] min-w-[190px]">
                      Alumno
                    </th>
                    <th className="py-2.5 px-3 text-center border-r border-[#524D47]">
                      Puntaje
                    </th>
                    <th className="py-2.5 px-3 text-center border-r border-[#524D47]">
                      Nota
                    </th>
                    {columnasSabana.map((p) => (
                      <th key={p.numero} className="py-2.5 px-2 text-center font-mono min-w-[38px] border-r border-[#524D47]/70">
                        P{p.numero}
                      </th>
                    ))}
                  </tr>
                  {/* Fila de pauta base */}
                  <tr className="bg-[#F5F5F5] text-[#3D3935] text-xs font-bold border-b border-[#DADADA]">
                    <td className="py-2 px-4 sticky left-0 z-10 bg-[#F5F5F5] border-r border-[#DADADA] font-mono">
                      PAUTA
                    </td>
                    <td className="py-2 px-4 border-r border-[#DADADA]">
                      Clave Oficial (Forma Base)
                    </td>
                    <td className="py-2 px-3 text-center font-mono border-r border-[#DADADA]">
                      {data.prueba.puntaje_total ?? data.prueba.cantidad_preguntas} pts
                    </td>
                    <td className="py-2 px-3 text-center font-mono border-r border-[#DADADA]">
                      7.0
                    </td>
                    {columnasSabana.map((p) => (
                      <td key={p.numero} className="py-2 px-2 text-center font-mono border-r border-[#DADADA] whitespace-nowrap">
                        {p.anulada ? (
                          <span className="text-[10px] text-[#6E6A66]">ANUL</span>
                        ) : p.tipo === 'desarrollo' ? (
                          <span className="text-[10px] text-purple-700 font-bold">Máx {p.puntos}</span>
                        ) : (
                          obtenerLetraCorrecta(p.respuesta_correcta)
                        )}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DADADA] text-xs">
                  {data.matriz.map((row, rowIdx) => (
                    <tr key={row.id || row.alumno_rut} className="hover:bg-[#F5F5F5]/50">
                      <td className="py-2 px-4 sticky left-0 z-10 bg-white border-r border-[#DADADA] font-mono text-[#3D3935] tabular-nums">
                        {row.alumno_rut}
                      </td>
                      <td className="py-2 px-4 border-r border-[#DADADA] text-[#3D3935] truncate max-w-[220px]">
                        {row.nombre_alumno}
                      </td>
                      <td className="py-2 px-3 text-center font-mono tabular-nums font-semibold text-[#3D3935] border-r border-[#DADADA]">
                        {row.puntaje_obtenido}
                      </td>
                      <td
                        className={`py-2 px-3 text-center font-mono tabular-nums font-bold border-r border-[#DADADA] ${
                          row.nota >= 4.0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {row.nota.toFixed(1)}
                      </td>
                      {columnasSabana.map((colP) => {
                        const celda = row.celdas.find((c) => c.pregunta === colP.numero);
                        if (!celda) {
                          return (
                            <td key={colP.numero} className="py-2 px-2 text-center font-mono border-r border-[#DADADA] text-[#6E6A66]/60">
                              -
                            </td>
                          );
                        }
                        const styleMap: Record<string, { bg: string; text: string }> = {
                          correcta: { bg: '#DCFCE7', text: '#166534' },
                          incorrecta: { bg: '#FEE2E2', text: '#991B1B' },
                          omitida: { bg: '#F5F5F5', text: '#3D3935' },
                          multiple: { bg: '#FEF3C7', text: '#92400E' },
                          anulada: { bg: '#E5E5E5', text: '#6E6A66' },
                          desarrollo: { bg: '#F3E8FF', text: '#6B21A8' },
                        };
                        const st = styleMap[celda.estado] || { bg: '#FFFFFF', text: '#000000' };

                        const maxPuntos = celda.puntos ?? colP.puntos ?? 1;

                        return (
                          <td
                            key={celda.pregunta}
                            title={
                              celda.estado === 'desarrollo'
                                ? `P${celda.pregunta} (Desarrollo): Puntaje máximo ${maxPuntos} pts`
                                : `P${celda.pregunta}: Marcó ${celda.marcada}${celda.correcta ? ` · Correcta: ${celda.correcta}` : ''}`
                            }
                            className="py-2 px-2 text-center font-mono font-bold border-r border-[#DADADA]"
                            style={{ backgroundColor: st.bg, color: st.text }}
                          >
                            {celda.estado === 'desarrollo' ? (
                              <ManualScoreInput
                                initialValue={celda.puntaje_manual}
                                maxPuntos={maxPuntos}
                                scopeId="sabana"
                                rowIndex={rowIdx}
                                colPregunta={celda.pregunta}
                                onSave={(valStr) => handleGuardarPuntajeManual(row.id, celda.pregunta, valStr)}
                              />
                            ) : celda.estado === 'anulada' ? (
                              <span className="text-[#6E6A66]/70">-</span>
                            ) : (
                              celda.marcada
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

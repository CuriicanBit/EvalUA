import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  Filter,
  RefreshCw,
  TrendingUp,
  Award,
  AlertTriangle,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import type { UsuarioSesion } from '../App';

interface AnaliticaDocenteProps {
  docenteIdDefault?: string;
  usuario?: UsuarioSesion;
}

interface DocenteAnalyticsResponse {
  metricas_gestion: {
    total_pruebas: number;
    total_hojas: number;
    promedio_general: number;
    tasa_aprobacion_general: number;
  };
  ranking_cursos: Array<{
    curso_id: string;
    curso_nombre: string;
    anio_academico: string;
    total_pruebas: number;
    total_hojas: number;
    total_alumnos: number;
    promedio_notas: number;
    tasa_aprobacion: number;
  }>;
  evolucion_temporal: Array<{
    prueba_id: string;
    prueba_nombre: string;
    asignatura_nombre: string;
    fecha: string;
    total_hojas: number;
    promedio_notas: number;
    tasa_aprobacion: number;
  }>;
  alumnos_destacados: Array<{
    rut: string;
    nombre_completo: string;
    curso_nombre: string;
    evaluaciones_rendidas: number;
    promedio_nota: number;
    nota_minima: number;
    nota_maxima: number;
  }>;
  alumnos_en_riesgo: Array<{
    rut: string;
    nombre_completo: string;
    curso_nombre: string;
    evaluaciones_rendidas: number;
    promedio_nota: number;
    nota_minima: number;
    nota_maxima: number;
  }>;
  filtros_disponibles: {
    docentes: Array<{ id: string; nombre: string }>;
    asignaturas: Array<{ id: string; nombre: string }>;
    cursos: Array<{ id: string; nombre: string; anio_academico: number }>;
  };
}

export const AnaliticaDocente: React.FC<AnaliticaDocenteProps> = ({ docenteIdDefault = 'all', usuario }) => {
  const isDocenteRole = usuario?.rol === 'docente';
  const [docenteId, setDocenteId] = useState<string>(docenteIdDefault);
  const [asignaturaId, setAsignaturaId] = useState<string>('all');
  const [cursoId, setCursoId] = useState<string>('all');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');

  const [data, setData] = useState<DocenteAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEstadisticas = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (!isDocenteRole && docenteId && docenteId !== 'all') params.set('docente_id', docenteId);
      if (asignaturaId && asignaturaId !== 'all') params.set('asignatura_id', asignaturaId);
      if (cursoId && cursoId !== 'all') params.set('curso_id', cursoId);
      if (fechaInicio) params.set('fecha_inicio', fechaInicio);
      if (fechaFin) params.set('fecha_fin', fechaFin);

      const res = await authFetch(`/api/estadisticas/docente?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Error HTTP ${res.status}`);
      }
      const json: DocenteAnalyticsResponse = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Error cargando analítica docente:', err);
      setError(err?.message || 'No se pudieron cargar las métricas longitudinales.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEstadisticas();
  }, [docenteId, asignaturaId, cursoId, fechaInicio, fechaFin]);

  const handleResetFiltros = () => {
    setDocenteId('all');
    setAsignaturaId('all');
    setCursoId('all');
    setFechaInicio('');
    setFechaFin('');
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#DADADA]">
        <div>
          <h1 className="text-2xl font-bold text-[#3D3935] tracking-tight">
            Analítica Global del Docente
          </h1>
          <p className="text-xs sm:text-sm text-[#6E6A66] mt-0.5">
            Seguimiento longitudinal de cursos, evolución de evaluaciones y detección temprana de estudiantes en riesgo
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetFiltros}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#3D3935] bg-white hover:bg-[#F5F5F5] border border-[#DADADA] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpiar Filtros</span>
          </button>
          <button
            type="button"
            onClick={fetchEstadisticas}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#DA291C] hover:bg-[#B82116] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros Globales */}
      <div className="bg-white rounded-2xl border border-[#DADADA] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#3D3935] mb-3">
          <Filter className="w-3.5 h-3.5 text-[#DA291C]" />
          <span>Filtros Globales</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6E6A66] mb-1">Docente</label>
            {isDocenteRole ? (
              <input
                type="text"
                disabled
                value={usuario?.nombre || 'Mis evaluaciones'}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl text-[#6E6A66] font-medium"
              />
            ) : (
              <select
                value={docenteId}
                onChange={(e) => setDocenteId(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl text-[#3D3935] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C]"
              >
                <option value="all">Todos los docentes</option>
                {(data?.filtros_disponibles?.docentes || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6E6A66] mb-1">Asignatura</label>
            <select
              value={asignaturaId}
              onChange={(e) => setAsignaturaId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl text-[#3D3935] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C]"
            >
              <option value="all">Todas las asignaturas</option>
              {(data?.filtros_disponibles?.asignaturas || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6E6A66] mb-1">Curso</label>
            <select
              value={cursoId}
              onChange={(e) => setCursoId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl text-[#3D3935] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C]"
            >
              <option value="all">Todos los cursos</option>
              {(data?.filtros_disponibles?.cursos || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.anio_academico})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6E6A66] mb-1">Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl text-[#3D3935] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6E6A66] mb-1">Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl text-[#3D3935] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C]"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-white rounded-2xl border border-[#DA291C]/30 p-6 text-center space-y-2">
          <AlertCircle className="w-7 h-7 text-[#DA291C] mx-auto" />
          <p className="text-sm font-semibold text-[#3D3935]">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-[#DADADA]/60 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-80 rounded-2xl bg-[#DADADA]/60 animate-pulse" />
            <div className="h-80 rounded-2xl bg-[#DADADA]/60 animate-pulse" />
          </div>
        </div>
      ) : data && (
        <>
          {/* 1. Métricas de Gestión */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#DADADA] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#6E6A66]">Pruebas Aplicadas</p>
                <ClipboardCheck className="w-4 h-4 text-[#6E6A66]" />
              </div>
              <p className="text-2xl font-bold text-[#3D3935] mt-2 font-mono tabular-nums">
                {data.metricas_gestion.total_pruebas}
              </p>
              <p className="text-xs text-[#6E6A66]/80 mt-1">Evaluaciones en el periodo</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#DADADA] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#6E6A66]">Hojas Procesadas</p>
                <FileCheck2 className="w-4 h-4 text-[#DA291C]" />
              </div>
              <p className="text-2xl font-bold text-[#DA291C] mt-2 font-mono tabular-nums">
                {data.metricas_gestion.total_hojas}
              </p>
              <p className="text-xs text-[#6E6A66]/80 mt-1">Lecturas OMR registradas</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#DADADA] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#6E6A66]">Promedio General</p>
                <GraduationCap className="w-4 h-4 text-[#6E6A66]" />
              </div>
              <p className={`text-2xl font-bold mt-2 font-mono tabular-nums ${data.metricas_gestion.promedio_general >= 4.0 ? 'text-[#3D3935]' : 'text-[#DA291C]'}`}>
                {data.metricas_gestion.promedio_general.toFixed(2)}
              </p>
              <p className="text-xs text-[#6E6A66]/80 mt-1">Escala chilena 1.0 - 7.0</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#DADADA] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#6E6A66]">Tasa de Aprobación</p>
                <TrendingUp className="w-4 h-4 text-[#6E6A66]" />
              </div>
              <p className="text-2xl font-bold text-emerald-700 mt-2 font-mono tabular-nums">
                {data.metricas_gestion.tasa_aprobacion_general.toFixed(1)}%
              </p>
              <p className="text-xs text-[#6E6A66]/80 mt-1">Calificaciones &ge; 4.0</p>
            </div>
          </div>

          {/* 2. Evolución Temporal y Ranking de Cursos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de Líneas: Evolución Temporal */}
            <div className="bg-white rounded-2xl border border-[#DADADA] p-6 flex flex-col">
              <div className="mb-4">
                <h3 className="text-base font-bold text-[#3D3935]">Evolución Temporal de Notas</h3>
                <p className="text-xs text-[#6E6A66] mt-0.5">
                  Tendencia del promedio obtenido en cada evaluación aplicada
                </p>
              </div>

              {data.evolucion_temporal.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-14 text-sm text-[#6E6A66]/70">
                  No hay evaluaciones con resultados en el rango seleccionado.
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.evolucion_temporal} margin={{ top: 10, right: 20, left: -12, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#DADADA" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fill: '#3D3935', fontSize: 11 }}
                        axisLine={{ stroke: '#DADADA' }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[1, 7]}
                        ticks={[1, 2, 3, 4, 5, 6, 7]}
                        tick={{ fill: '#3D3935', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <ReferenceLine y={4.0} stroke="#3D3935" strokeDasharray="4 4" label={{ value: '4.0', position: 'right', fill: '#3D3935', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '10px', border: '1px solid #DADADA', fontSize: '12px' }}
                        formatter={(val: any, _name: any, props: any) => [
                          `${Number(val).toFixed(2)} (${props.payload.tasa_aprobacion}% aprob.)`,
                          props.payload.prueba_nombre,
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="promedio_notas"
                        stroke="#DA291C"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#DA291C', strokeWidth: 2, stroke: '#FFFFFF' }}
                        activeDot={{ r: 6, fill: '#3D3935' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Gráfico Comparativo: Ranking de Cursos */}
            <div className="bg-white rounded-2xl border border-[#DADADA] p-6 flex flex-col">
              <div className="mb-4">
                <h3 className="text-base font-bold text-[#3D3935]">Ranking de Cursos</h3>
                <p className="text-xs text-[#6E6A66] mt-0.5">
                  Comparativa de promedio de notas y tasa de aprobación por curso o asignatura
                </p>
              </div>

              {data.ranking_cursos.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-14 text-sm text-[#6E6A66]/70">
                  No hay cursos con resultados registrados para los filtros actuales.
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.ranking_cursos} margin={{ top: 10, right: 20, left: -12, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#DADADA" vertical={false} />
                      <XAxis
                        dataKey="curso_nombre"
                        tick={{ fill: '#3D3935', fontSize: 11 }}
                        axisLine={{ stroke: '#DADADA' }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[1, 7]}
                        ticks={[1, 2, 3, 4, 5, 6, 7]}
                        tick={{ fill: '#3D3935', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <ReferenceLine y={4.0} stroke="#DC2626" strokeDasharray="4 4" />
                      <Tooltip
                        cursor={{ fill: '#F5F5F5' }}
                        contentStyle={{ borderRadius: '10px', border: '1px solid #DADADA', fontSize: '12px' }}
                        formatter={(val: any, _name: any, props: any) => [
                          `${Number(val).toFixed(2)} · Aprobación ${props.payload.tasa_aprobacion}%`,
                          'Promedio',
                        ]}
                      />
                      <Bar dataKey="promedio_notas" radius={[6, 6, 0, 0]} maxBarSize={52}>
                        {data.ranking_cursos.map((c, idx) => (
                          <Cell key={`rc-${idx}`} fill={c.promedio_notas >= 4.0 ? '#16A34A' : '#DC2626'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Tabla detallada de Ranking de Cursos */}
          {data.ranking_cursos.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#DADADA] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#DADADA]">
                <h3 className="text-base font-bold text-[#3D3935]">Detalle Comparativo por Curso</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F5F5] border-b border-[#DADADA] text-xs font-semibold text-[#3D3935]">
                      <th className="py-3 px-6">Posición</th>
                      <th className="py-3 px-6">Curso / Asignatura</th>
                      <th className="py-3 px-4 text-center">Año</th>
                      <th className="py-3 px-4 text-right">Pruebas</th>
                      <th className="py-3 px-4 text-right">Hojas</th>
                      <th className="py-3 px-4 text-right">Promedio</th>
                      <th className="py-3 px-6 text-right">% Aprobación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAEAEA] text-sm">
                    {data.ranking_cursos.map((curso, idx) => (
                      <tr key={curso.curso_id} className="hover:bg-[#F5F5F5]/70 transition-colors">
                        <td className="py-3 px-6 font-mono text-xs text-[#6E6A66] tabular-nums">#{idx + 1}</td>
                        <td className="py-3 px-6 font-semibold text-[#3D3935]">{curso.curso_nombre}</td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-[#6E6A66]">{curso.anio_academico}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#3D3935]">{curso.total_pruebas}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#3D3935]">{curso.total_hojas}</td>
                        <td className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${curso.promedio_notas >= 4.0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {curso.promedio_notas.toFixed(2)}
                        </td>
                        <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-[#3D3935]">
                          {curso.tasa_aprobacion.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Alumnos Destacados (Top 10) y En Riesgo (< 4.0) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top 10 Mejores Promedios */}
            <div className="bg-white rounded-2xl border border-[#DADADA] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#DADADA] flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#3D3935]">Top 10 Mejores Promedios</h3>
                  <p className="text-xs text-[#6E6A66] mt-0.5">Estudiantes con mayor rendimiento acumulado</p>
                </div>
                <Award className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F5F5] border-b border-[#DADADA] text-xs font-semibold text-[#3D3935]">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">RUT</th>
                      <th className="py-3 px-4">Estudiante</th>
                      <th className="py-3 px-4 text-right">Pruebas</th>
                      <th className="py-3 px-4 text-right">Promedio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAEAEA] text-xs sm:text-sm">
                    {data.alumnos_destacados.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#6E6A66]/70">
                          Sin registros suficientes en este filtro.
                        </td>
                      </tr>
                    ) : (
                      data.alumnos_destacados.map((al, idx) => (
                        <tr key={al.rut} className="hover:bg-[#F5F5F5]/70">
                          <td className="py-2.5 px-4 font-mono text-xs text-[#6E6A66] tabular-nums">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-mono text-xs text-[#3D3935] tabular-nums">{al.rut}</td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-[#3D3935]">{al.nombre_completo}</div>
                            <div className="text-xs text-[#6E6A66]/80">{al.curso_nombre}</div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#6E6A66]">
                            {al.evaluaciones_rendidas}
                          </td>
                          <td className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${al.promedio_nota >= 4.0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {al.promedio_nota.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Alumnos en Riesgo (< 4.0) */}
            <div className="bg-white rounded-2xl border border-[#DADADA] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#DADADA] flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#3D3935]">Alumnos en Riesgo Académico</h3>
                  <p className="text-xs text-[#6E6A66] mt-0.5">Estudiantes con promedio inferior a 4.0</p>
                </div>
                <AlertTriangle className="w-5 h-5 text-[#DA291C]" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F5F5] border-b border-[#DADADA] text-xs font-semibold text-[#3D3935]">
                      <th className="py-3 px-4">RUT</th>
                      <th className="py-3 px-4">Estudiante</th>
                      <th className="py-3 px-4 text-right">Pruebas</th>
                      <th className="py-3 px-4 text-right">Mín.</th>
                      <th className="py-3 px-4 text-right">Promedio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAEAEA] text-xs sm:text-sm">
                    {data.alumnos_en_riesgo.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-emerald-700 font-medium">
                          No hay estudiantes con promedio bajo 4.0 en los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      data.alumnos_en_riesgo.map((al) => (
                        <tr key={al.rut} className="hover:bg-rose-50/40">
                          <td className="py-2.5 px-4 font-mono text-xs text-[#3D3935] tabular-nums">{al.rut}</td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-[#3D3935]">{al.nombre_completo}</div>
                            <div className="text-xs text-[#6E6A66]/80">{al.curso_nombre}</div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#6E6A66]">
                            {al.evaluaciones_rendidas}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#6E6A66]">
                            {al.nota_minima.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-rose-700">
                            {al.promedio_nota.toFixed(2)} · En riesgo
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

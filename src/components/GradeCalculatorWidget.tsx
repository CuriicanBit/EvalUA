import React, { useState } from 'react';
import { Calculator, CheckCircle2, AlertCircle, Info, Sparkles } from 'lucide-react';
import { calcularNota } from '../utils/gradeCalculator';

export const GradeCalculatorWidget: React.FC = () => {
  const [puntajeObtenido, setPuntajeObtenido] = useState<number>(38);
  const [puntajeTotal, setPuntajeTotal] = useState<number>(50);
  const [nivelExigencia, setNivelExigencia] = useState<number>(0.6); // 60%

  const notaCalculada = calcularNota(puntajeObtenido, puntajeTotal, nivelExigencia);

  const porcentajeLogrado = puntajeTotal > 0 ? Math.round((puntajeObtenido / puntajeTotal) * 100) : 0;
  const esAprobado = notaCalculada >= 4.0;

  return (
    <div className="bg-white rounded-2xl border border-[#DADADA] shadow-sm p-6 mb-8 overflow-hidden relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DADADA]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#DA291C]/10 flex items-center justify-center text-[#DA291C]">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#3D3935] flex items-center gap-2">
              Calculadora de Calificación OMR
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#DA291C]/10 text-[#DA291C] font-medium">
                Fórmula Activa
              </span>
            </h3>
            <p className="text-xs text-[#3D3935]/70">
              Prueba en tiempo real de la función <code className="bg-[#F5F5F5] px-1 py-0.5 rounded text-[#DA291C] font-mono text-[11px]">calcularNota()</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#3D3935]/70 font-medium">Exigencia rápida:</span>
          {[0.5, 0.6, 0.7].map((exig) => (
            <button
              key={exig}
              type="button"
              onClick={() => setNivelExigencia(exig)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                nivelExigencia === exig
                  ? 'bg-[#DA291C] text-white shadow-xs'
                  : 'bg-[#F5F5F5] text-[#3D3935] hover:bg-[#EAEAEA]'
              }`}
            >
              {Math.round(exig * 100)}%
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-5 items-center">
        {/* Input Puntaje Obtenido */}
        <div>
          <label className="block text-xs font-semibold text-[#3D3935] mb-1.5">
            Puntaje Obtenido
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={puntajeTotal}
              step={0.5}
              value={puntajeObtenido}
              onChange={(e) => setPuntajeObtenido(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] transition-all font-medium text-[#3D3935]"
            />
            <span className="absolute right-3 top-2 text-xs text-[#3D3935]/50">pts</span>
          </div>
          <p className="text-[11px] text-[#3D3935]/70 mt-1">
            Logro: <span className="font-semibold text-[#3D3935]">{porcentajeLogrado}%</span> del total
          </p>
        </div>

        {/* Input Puntaje Total */}
        <div>
          <label className="block text-xs font-semibold text-[#3D3935] mb-1.5">
            Puntaje Total Máximo
          </label>
          <div className="relative">
            <input
              type="number"
              min={1}
              step={1}
              value={puntajeTotal}
              onChange={(e) => setPuntajeTotal(Math.max(1, parseFloat(e.target.value) || 1))}
              className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] transition-all font-medium text-[#3D3935]"
            />
            <span className="absolute right-3 top-2 text-xs text-[#3D3935]/50">pts</span>
          </div>
          <p className="text-[11px] text-[#3D3935]/70 mt-1">Escala total de la evaluación</p>
        </div>

        {/* Input Nivel de Exigencia */}
        <div>
          <label className="block text-xs font-semibold text-[#3D3935] mb-1.5">
            Nivel de Exigencia (0.0 - 0.99)
          </label>
          <div className="relative">
            <input
              type="number"
              min={0.1}
              max={0.99}
              step={0.05}
              value={nivelExigencia}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0.6;
                setNivelExigencia(Math.min(0.99, Math.max(0.1, val)));
              }}
              className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] transition-all font-medium text-[#3D3935]"
            />
            <span className="absolute right-3 top-2 text-xs font-medium text-[#DA291C]">
              {Math.round(nivelExigencia * 100)}%
            </span>
          </div>
          <p className="text-[11px] text-[#3D3935]/70 mt-1">Corte mínimo de exigencia</p>
        </div>

        {/* Resultado de la Nota */}
        <div className="bg-[#F5F5F5] border border-[#DADADA] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-[#3D3935]/60 block">
              Nota Calculada
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`text-3xl font-extrabold tracking-tight ${
                  esAprobado ? 'text-emerald-700' : 'text-[#DA291C]'
                }`}
              >
                {notaCalculada.toFixed(1)}
              </span>
              <span className="text-xs text-[#3D3935]/50 font-medium">/ 7.0</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {esAprobado ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Aprobado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#DA291C]">
                  <AlertCircle className="w-3.5 h-3.5 text-[#DA291C]" /> Reprobado
                </span>
              )}
            </div>
          </div>

          <div className="w-12 h-12 rounded-full border-4 border-[#DADADA] flex items-center justify-center bg-white shadow-inner">
            <Sparkles className={`w-5 h-5 ${esAprobado ? 'text-amber-500' : 'text-[#3D3935]/40'}`} />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[#DADADA] flex items-center gap-2 text-[11px] text-[#3D3935]/70">
        <Info className="w-3.5 h-3.5 text-[#3D3935]/50 shrink-0" />
        <span>
          Fórmula aplicada: <code className="text-[#DA291C] font-mono">1 + 6 * ((PuntajeObtenido / PuntajeTotal) - NivelExigencia) / (1 - NivelExigencia)</code> con límite [1.0 - 7.0].
        </span>
      </div>
    </div>
  );
};

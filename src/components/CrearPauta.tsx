import React, { useState } from 'react';
import { GraduationCap, CheckCircle2, Sparkles, RotateCcw, Layers, Sliders, PenTool, AlertCircle } from 'lucide-react';
import { authFetch } from '../utils/authFetch';

// Nueva estructura de datos para la pauta
export interface PreguntaConfig {
  correcta?: string;
  puntos: number;
  anulada: boolean;
  tipo: 'seleccion' | 'desarrollo';
}

interface CrearPautaProps {
  pruebaData: any;
  onPautaGuardada?: (updatedData: any) => void;
}

export const CrearPauta: React.FC<CrearPautaProps> = ({ pruebaData, onPautaGuardada }) => {
  const cantidadPreguntas = pruebaData?.cantidad_preguntas || 10;
  const cantidadAlternativas = pruebaData?.cantidad_alternativas || 4;
  const cantidadFormas = pruebaData?.cantidad_formas || 1;
  const alternativas = ['A', 'B', 'C', 'D', 'E'].slice(0, cantidadAlternativas);
  
  const formasDisponibles = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].slice(0, cantidadFormas);
  const [formaActiva, setFormaActiva] = useState<string>('A');
  const rawEx = Number(pruebaData?.nivel_exigencia ?? 0.6);
  const initialExigencia = Number.isFinite(rawEx) ? (rawEx > 1 ? rawEx : Math.round(rawEx * 100)) : 60;
  const [nivelExigencia, setNivelExigencia] = useState<number>(initialExigencia);

  // ESTADO LOCAL: Migramos la estructura antigua a la nueva
  const [pautaLocal, setPautaLocal] = useState<Record<string, Record<number, PreguntaConfig>>>(() => {
    const pautaGuardada = pruebaData?.pauta_respuestas || {};
    const pautaMigrada: Record<string, Record<number, PreguntaConfig>> = {};
    
    Object.keys(pautaGuardada).forEach(forma => {
      pautaMigrada[forma] = {};
      const preguntasForma = pautaGuardada[forma];
      Object.keys(preguntasForma).forEach((num) => {
        const valor = preguntasForma[Number(num)];
        // Si el valor es un string (formato antiguo), lo convertimos a objeto
        if (typeof valor === 'string') {
          pautaMigrada[forma][Number(num)] = { correcta: valor, puntos: 1, anulada: false, tipo: 'seleccion' };
        } else {
          // Si ya es objeto, lo dejamos igual (o le ponemos valores por defecto)
          pautaMigrada[forma][Number(num)] = { puntos: 1, anulada: false, tipo: 'seleccion', ...valor };
        }
      });
    });
    return pautaMigrada;
  });

  const claveRespuestas = pautaLocal[formaActiva] || {};
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const puntajeTotalForma = Array.from({ length: cantidadPreguntas }, (_, idx) => {
    const cfg = claveRespuestas[idx + 1];
    if (cfg?.anulada) return 0;
    const pts = Number(cfg?.puntos);
    return Number.isFinite(pts) && pts > 0 ? pts : 1;
  }).reduce((acc, n) => acc + n, 0);

  const updatePregunta = (preguntaNum: number, cambios: Partial<PreguntaConfig>) => {
    const preguntaActual = claveRespuestas[preguntaNum] || { puntos: 1, anulada: false, tipo: 'seleccion' };
    const nuevaClaveForma = {
      ...claveRespuestas,
      [preguntaNum]: { ...preguntaActual, ...cambios }
    };
    
    setPautaLocal({
      ...pautaLocal,
      [formaActiva]: nuevaClaveForma
    });
  };

  const handleSelectAlternative = (preguntaNum: number, alt: string) => {
    if (claveRespuestas[preguntaNum]?.anulada || claveRespuestas[preguntaNum]?.tipo === 'desarrollo') return;
    const actual = claveRespuestas[preguntaNum]?.correcta;
    updatePregunta(preguntaNum, { correcta: actual === alt ? undefined : alt });
  };

  const handleLlenarDemo = () => {
    const nuevaClave: Record<number, PreguntaConfig> = {};
    for (let i = 1; i <= cantidadPreguntas; i++) {
      nuevaClave[i] = { 
        correcta: alternativas[Math.floor(Math.random() * alternativas.length)], 
        puntos: 1, 
        anulada: false, 
        tipo: 'seleccion' 
      };
    }
    setPautaLocal({ ...pautaLocal, [formaActiva]: nuevaClave });
  };

  const handleLimpiarForma = () => {
    setPautaLocal({ ...pautaLocal, [formaActiva]: {} });
  };

  const handleGuardarTodo = async () => {
    setIsSaving(true);
    setSaveError(null);

    // Normalizamos puntajes inválidos o vacíos antes de persistir
    const pautaNormalizada: Record<string, Record<number, PreguntaConfig>> = {};
    Object.keys(pautaLocal).forEach((forma) => {
      pautaNormalizada[forma] = {};
      const preguntasForma = pautaLocal[forma] || {};
      Object.keys(preguntasForma).forEach((k) => {
        const num = Number(k);
        const item = preguntasForma[num];
        const ptsNum = Number(item?.puntos);
        pautaNormalizada[forma][num] = {
          ...item,
          puntos: Number.isFinite(ptsNum) && ptsNum > 0 ? ptsNum : 1,
        };
      });
    });

    try {
      const res = await authFetch(`/api/pruebas/${pruebaData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pauta_respuestas: pautaNormalizada,
          nivel_exigencia: nivelExigencia / 100
        })
      });

      if (res.ok) {
        setPautaLocal(pautaNormalizada);
        setSavedSuccess(true);
        if (onPautaGuardada) {
          onPautaGuardada({ pauta_respuestas: pautaNormalizada, nivel_exigencia: nivelExigencia / 100 });
        }
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        const errData = await res.json().catch(() => null);
        setSaveError(errData?.error || 'Error al guardar la pauta en la base de datos.');
      }
    } catch (error) {
      console.error(error);
      setSaveError('Error de conexión al guardar la pauta.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#DADADA]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#DA291C]/10 flex items-center justify-center text-[#DA291C]">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#3D3935]">Pauta y Configuración</h3>
            <p className="text-xs text-[#3D3935]/70">
              {pruebaData?.nombre} · {cantidadPreguntas} preguntas · Puntaje total Forma {formaActiva}: <span className="font-bold text-[#3D3935]">{puntajeTotalForma} pts</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleLlenarDemo} className="text-xs px-3 py-1.5 bg-[#3D3935]/8 text-[#3D3935] rounded-lg font-medium flex items-center gap-1 hover:bg-[#3D3935]/15 transition-colors cursor-pointer">
            <Sparkles className="w-3.5 h-3.5 text-[#DA291C]" /> Rellenar Demo
          </button>
          <button onClick={handleLimpiarForma} className="text-xs px-3 py-1.5 bg-[#F5F5F5] text-[#3D3935]/80 border border-[#DADADA] rounded-lg font-medium flex items-center gap-1 hover:bg-[#EAEAEA] transition-colors cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" /> Limpiar Forma
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cantidadFormas > 1 && (
          <div className="bg-[#F5F5F5] p-4 rounded-xl border border-[#DADADA]">
            <label className="block text-xs font-bold text-[#3D3935] mb-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#3D3935]/60" /> Editando Pauta para Forma:
            </label>
            <div className="flex gap-2">
              {formasDisponibles.map((forma) => (
                <button
                  key={forma}
                  onClick={() => setFormaActiva(forma)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border cursor-pointer ${
                    formaActiva === forma ? 'bg-[#DA291C] text-white border-[#DA291C]' : 'bg-white text-[#3D3935] border-[#DADADA] hover:bg-[#EAEAEA]'
                  }`}
                >
                  Forma {forma}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#F5F5F5] p-4 rounded-xl border border-[#DADADA]">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-[#3D3935] flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-[#3D3935]/60" /> Nivel de Exigencia
            </label>
            <span className="text-xs font-mono font-bold text-[#DA291C] bg-white px-2 py-0.5 rounded border border-[#DADADA]">
              {nivelExigencia}%
            </span>
          </div>
          <input
            type="range" min={10} max={90} step={5} value={nivelExigencia}
            onChange={(e) => setNivelExigencia(parseInt(e.target.value))}
            className="w-full accent-[#DA291C] cursor-pointer h-2 bg-[#DADADA] rounded-lg"
          />
        </div>
      </div>

      {/* NUEVA GRILLA DE PREGUNTAS MEJORADA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Array.from({ length: cantidadPreguntas }, (_, idx) => {
          const preguntaNum = idx + 1;
          const config = claveRespuestas[preguntaNum] || { puntos: 1, anulada: false, tipo: 'seleccion' };
          const respuestaSeleccionada = config.correcta;
          
          return (
            <div key={preguntaNum} className={`p-3 rounded-xl border flex flex-col gap-3 ${
              config.anulada ? 'bg-[#EAEAEA] border-[#DADADA] opacity-75' :
              config.tipo === 'desarrollo' ? 'bg-purple-50 border-purple-200' :
              respuestaSeleccionada ? 'bg-[#DA291C]/5 border-[#DA291C]/35' : 'bg-white border-[#DADADA]'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                    config.tipo === 'desarrollo'
                      ? 'bg-purple-700 text-white'
                      : respuestaSeleccionada
                      ? 'bg-[#DA291C] text-white'
                      : 'bg-[#F5F5F5] text-[#3D3935] border border-[#DADADA]'
                  }`}>
                    {preguntaNum < 10 ? `0${preguntaNum}` : preguntaNum}
                  </span>
                  {config.anulada && <span className="text-[10px] font-bold text-[#3D3935]/70 bg-[#DADADA] px-2 py-0.5 rounded">ANULADA</span>}
                </div>
                
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="flex items-center gap-1 cursor-pointer text-xs text-[#3D3935]/80" title="Anular Pregunta">
                    <input type="checkbox" checked={config.anulada} onChange={(e) => updatePregunta(preguntaNum, { anulada: e.target.checked })} className="accent-[#DA291C]" />
                    Anular
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-xs text-[#3D3935]/80" title="Pregunta de Desarrollo">
                    <input type="checkbox" checked={config.tipo === 'desarrollo'} onChange={(e) => updatePregunta(preguntaNum, { tipo: e.target.checked ? 'desarrollo' : 'seleccion' })} className="accent-purple-600" />
                    Desarrollo
                  </label>
                  <div className="flex items-center gap-1.5 border-l pl-2.5 border-[#DADADA]" title="Puntaje máximo asignado a esta pregunta">
                    <span className={`text-xs font-medium ${config.tipo === 'desarrollo' ? 'text-purple-700' : 'text-[#3D3935]/80'}`}>
                      Puntaje máximo:
                    </span>
                    <input 
                      type="number"
                      min={1}
                      step="any"
                      disabled={config.anulada}
                      value={config.puntos as any} 
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updatePregunta(preguntaNum, {
                          puntos: raw === '' ? ('' as any) : Math.max(0, Number(raw)),
                        });
                      }}
                      onBlur={(e) => {
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed) || parsed <= 0) {
                          updatePregunta(preguntaNum, { puntos: 1 });
                        }
                      }}
                      className="w-16 text-center text-xs font-bold border border-[#DADADA] rounded px-1.5 py-0.5 bg-white text-[#3D3935] focus:outline-none focus:border-[#DA291C] disabled:bg-[#EAEAEA] disabled:text-[#3D3935]/40"
                    />
                  </div>
                </div>
              </div>

              {/* Alternativas (solo si no es desarrollo ni anulada) */}
              {config.tipo === 'seleccion' && !config.anulada ? (
                <div className="flex items-center gap-1.5 justify-center">
                  {alternativas.map((alt) => (
                    <button
                      key={alt}
                      onClick={() => handleSelectAlternative(preguntaNum, alt)}
                      className={`w-8 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                        respuestaSeleccionada === alt
                          ? 'bg-[#DA291C] text-white shadow-md ring-2 ring-[#DA291C]/30 scale-105'
                          : 'bg-[#F5F5F5] text-[#3D3935] hover:bg-[#EAEAEA] border border-[#DADADA]'
                      }`}
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              ) : config.tipo === 'desarrollo' ? (
                <div className="text-center text-xs text-purple-600 font-medium py-1">
                  <PenTool className="w-4 h-4 inline mr-1" /> Corrección Manual
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {saveError && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-xl bg-[#DA291C]/10 border border-[#DA291C]/30 text-[#DA291C] text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 text-[#DA291C]" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="pt-4 flex justify-end">
        <button
          onClick={handleGuardarTodo}
          disabled={isSaving}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all inline-flex items-center gap-2 cursor-pointer ${
            savedSuccess ? 'bg-emerald-600' : 'bg-[#DA291C] hover:bg-[#B82116]'
          }`}
        >
          {isSaving ? 'Guardando...' : savedSuccess ? <><CheckCircle2 className="w-4 h-4"/> ¡Guardado!</> : <><CheckCircle2 className="w-4 h-4"/> Guardar Pauta y Configuración</>}
        </button>
      </div>
    </div>
  );
};
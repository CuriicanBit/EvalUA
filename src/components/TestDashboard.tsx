import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, ClipboardCheck, Printer, ScanLine, BarChart3, AlertTriangle
} from 'lucide-react';
import { EscanearPrueba } from './EscanearPrueba';
import { CrearPauta } from './CrearPauta';
import { ModuloImpresionFormularios } from './ModuloImpresionFormularios';
import { AnaliticaPrueba } from './AnaliticaPrueba';
import { evaluarEstadoPauta } from '../utils/pautaStatus';

export type TestDashboardTab = 'imprimir' | 'pauta' | 'escanear' | 'resultados';

interface TestDashboardProps {
  pruebaData: any; 
  onBack: () => void;
  onPruebaActualizada?: (updatedData?: any) => void; 
}

export const TestDashboard: React.FC<TestDashboardProps> = ({ pruebaData, onBack, onPruebaActualizada }) => {
  // Estado local para reflejar cambios sin recargar toda la app
  const [pruebaLocal, setPruebaLocal] = useState<any>(pruebaData);
  
  // Pestaña por defecto: Impresión
  const [activeTab, setActiveTab] = useState<TestDashboardTab>('imprimir');
  
  const [resultadosRefreshTrigger, setResultadosRefreshTrigger] = useState(0);
  const [mensajeEscaneo, setMensajeEscaneo] = useState('');

  useEffect(() => {
    setPruebaLocal(pruebaData);
  }, [pruebaData]);

  const pautaStatus = evaluarEstadoPauta(pruebaLocal);

  const handleProcesarLoteExitoso = async (lote: any[]) => {
    setMensajeEscaneo(`✅ Se guardaron ${lote.length} hojas correctamente.`);
    setResultadosRefreshTrigger((prev) => prev + 1);
    setActiveTab('resultados');
    setTimeout(() => setMensajeEscaneo(''), 4000);
  };

  // Callback para cuando se imprime: marcamos como impresa y avisamos al padre
  const handleImpresionExitosa = () => {
    const actualizada = { ...pruebaLocal, hojas_impresas: true };
    setPruebaLocal(actualizada);
    if (onPruebaActualizada) onPruebaActualizada(actualizada);
  };

  // Callback para cuando se guarda la pauta: actualizamos estado local y avisamos al padre
  const handlePautaGuardada = (updatedData?: { pauta_respuestas: Record<string, any>; nivel_exigencia: number }) => {
    const actualizada = updatedData ? { ...pruebaLocal, ...updatedData } : pruebaLocal;
    if (updatedData) {
      setPruebaLocal(actualizada);
      setResultadosRefreshTrigger((prev) => prev + 1);
    }
    if (onPruebaActualizada) onPruebaActualizada(actualizada);
  };

  // Nombres y orden solicitado
  const TABS = [
    { id: 'imprimir' as const, label: 'Impresión de Formulario', icon: Printer },
    { id: 'pauta' as const, label: 'Pauta de Evaluación', icon: ClipboardCheck },
    { id: 'escanear' as const, label: 'Lectura de Respuestas', icon: ScanLine },
    { id: 'resultados' as const, label: 'Resultados', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* HEADER */}
      <div className="bg-white rounded-2xl border border-[#DADADA] shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button onClick={onBack} className="p-2.5 text-[#3D3935]/70 hover:text-[#3D3935] hover:bg-[#F5F5F5] rounded-xl transition-colors cursor-pointer border border-[#DADADA]">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#DA291C] bg-[#DA291C]/10 px-2 py-0.5 rounded-md border border-[#DA291C]/20">
                {pruebaLocal.asignatura_nombre || 'Asignatura'}
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-[#3D3935] tracking-tight mt-1">
                {pruebaLocal.nombre}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F5F5F5] text-[#3D3935] border border-[#DADADA]">
              {pruebaLocal.cantidad_preguntas} Preguntas · {pruebaLocal.cantidad_alternativas} Alternativas
            </span>
          </div>
        </div>

        <div className="border-t border-[#DADADA]/70 pt-4 -mb-2 overflow-x-auto">
          <nav className="flex space-x-2 min-w-max">
            {TABS.map((tab) => {
              const mostrarAlertaPauta = tab.id === 'pauta' && !pautaStatus.completa;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={mostrarAlertaPauta ? pautaStatus.mensaje : undefined}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-[#DA291C] text-white shadow-md shadow-[#DA291C]/20'
                      : 'text-[#3D3935]/80 hover:text-[#3D3935] hover:bg-[#F5F5F5]'
                  }`}
                >
                  <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : 'text-[#3D3935]/50'}`} />
                  <span>{tab.label}</span>
                  {mostrarAlertaPauta && (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-amber-400/25 text-amber-100 border border-amber-300/40'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeTab === tab.id ? 'text-amber-200' : 'text-amber-500'
                        }`}
                      />
                      <span>{pautaStatus.estado === 'vacia' ? 'Sin pauta' : 'Incompleta'}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="w-full">
        {activeTab === 'imprimir' && (
          <div className="bg-white rounded-2xl border border-[#DADADA] shadow-xs p-6 max-w-6xl mx-auto">
            <ModuloImpresionFormularios 
              pruebaData={pruebaLocal} 
              onImpresionExitosa={handleImpresionExitosa} 
            />
          </div>
        )}

        {activeTab === 'pauta' && (
          <div className="bg-white rounded-2xl border border-[#DADADA] shadow-xs p-6 max-w-5xl mx-auto">
            <CrearPauta 
              pruebaData={pruebaLocal} 
              onPautaGuardada={handlePautaGuardada} 
            />
          </div>
        )}

        {activeTab === 'escanear' && (
          <div className="bg-white rounded-2xl border border-[#DADADA] shadow-xs p-6 max-w-4xl mx-auto space-y-4">
            {!pautaStatus.completa && (
              <div
                role="alert"
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm space-y-0.5">
                    <p className="font-bold text-amber-950">
                      {pautaStatus.estado === 'vacia'
                        ? 'Pauta de evaluación no configurada'
                        : 'Pauta de evaluación incompleta'}
                    </p>
                    <p className="text-amber-800">
                      {pautaStatus.mensaje} Configura y guarda la pauta docente antes de procesar hojas para calcular correctamente los puntajes y notas.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('pauta')}
                  className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Configurar Pauta
                </button>
              </div>
            )}
            <EscanearPrueba
              pruebaId={pruebaLocal.id}
              onProcesarLoteExitoso={handleProcesarLoteExitoso}
            />
            {mensajeEscaneo && (
              <div className="mt-4 p-3 bg-emerald-50 text-emerald-800 rounded-lg text-center text-sm font-medium border border-emerald-200">
                {mensajeEscaneo}
              </div>
            )}
          </div>
        )}

        {activeTab === 'resultados' && (
          <AnaliticaPrueba
            pruebaId={pruebaLocal.id}
            pruebaData={pruebaLocal}
            refreshTrigger={resultadosRefreshTrigger}
            onIrAPauta={() => setActiveTab('pauta')}
          />
        )}
      </div>
    </div>
  );
};
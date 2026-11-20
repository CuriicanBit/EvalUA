import React, { useState } from 'react';
import { Printer, ShieldAlert, CheckCircle2, Info, X } from 'lucide-react';
import { generarFormularioOmrPdf } from '../utils/omrPdfGenerator';
import { hashId16 } from '../utils/omrLayout';
import { authFetch } from '../utils/authFetch';

interface ModuloImpresionFormulariosProps {
  pruebaData: any;
  onImpresionExitosa?: () => void;
}

export const ModuloImpresionFormularios: React.FC<ModuloImpresionFormulariosProps> = ({ pruebaData, onImpresionExitosa }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false); // Nuevo estado para el modal
  const yaFueImpresa = pruebaData?.hojas_impresas === true;

  // 1. Función que se ejecuta al hacer clic en el botón principal
  const handleGenerarPDF = () => {
    if (!yaFueImpresa) {
      setShowConfirmModal(true); // Mostramos nuestro propio modal
    } else {
      ejecutarGeneracionPDF(); // Si ya fue impresa, generamos directo
    }
  };

  // 2. Función que hace el trabajo real (genera el PDF y actualiza la BD)
  const ejecutarGeneracionPDF = async () => {
    setShowConfirmModal(false); // Cerramos el modal
    setIsGenerating(true);

    try {
      const idSeguro = pruebaData?.idPrueba || hashId16(`${pruebaData?.carrera}|${pruebaData?.asignatura_nombre}|${pruebaData?.nombre}`);

      const pautaData = {
        carrera: pruebaData.carrera || 'No especificada',
        asignatura: pruebaData.asignatura_nombre || 'General',
        seccion: pruebaData.seccion || 'Única',
        cantidadPreguntas: pruebaData.cantidad_preguntas,
        cantidadAlternativas: pruebaData.cantidad_alternativas,
        cantidadFormas: pruebaData.cantidad_formas || 1,
        claveRespuestas: pruebaData.pauta_respuestas || {},
        fecha: new Date().toLocaleDateString('es-CL'),
        idPrueba: idSeguro
      };

      const doc = generarFormularioOmrPdf(pautaData);
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank'); 

      if (!yaFueImpresa) {
        const res = await authFetch(`/api/pruebas/${pruebaData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hojas_impresas: true })
        });
        
        if (res.ok) {
          if (onImpresionExitosa) onImpresionExitosa(); 
        }
      }
      
    } catch (error) {
      console.error("Error generando PDF:", error);
      alert("Hubo un error al generar el PDF."); // Este alert aún podría ser bloqueado, luego lo cambiaremos si molesta
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#DADADA]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#DA291C] bg-[#DA291C]/10 px-2.5 py-0.5 rounded-md border border-[#DA291C]/20">
              Impresión de Formulario
            </span>
          </div>
          <h2 className="text-xl font-bold text-[#3D3935] tracking-tight mt-1">
            Generar Hojas de Respuesta
          </h2>
          <p className="text-sm text-[#3D3935]/70 mt-0.5">
            Descarga el PDF e imprímelo en tamaño real.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-[#DADADA] shadow-sm p-6 space-y-4">
            
            <div className="p-4 bg-[#F5F5F5] rounded-xl border border-[#DADADA] space-y-2 text-sm text-[#3D3935]">
              <div className="flex justify-between">
                <span className="font-semibold text-[#3D3935]/70">Asignatura:</span>
                <span className="font-medium text-right">{pruebaData?.asignatura_nombre || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[#3D3935]/70">Prueba:</span>
                <span className="font-medium text-right">{pruebaData?.nombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[#3D3935]/70">Total Preguntas:</span>
                <span className="font-medium">{pruebaData?.cantidad_preguntas}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[#3D3935]/70">Alternativas:</span>
                <span className="font-medium">{pruebaData?.cantidad_alternativas}</span>
              </div>
            </div>

            {yaFueImpresa && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-emerald-800">Hojas ya generadas</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">La estructura de esta prueba está bloqueada para proteger las lecturas. Puedes reimprimir si necesitas más copias.</p>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={handleGenerarPDF}
                disabled={isGenerating}
                className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white shadow-lg transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer ${
                  yaFueImpresa ? 'bg-[#3D3935] hover:bg-[#2E2B28]' : 'bg-[#DA291C] hover:bg-[#B82116]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Generando PDF...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-5 h-5" />
                    <span>{yaFueImpresa ? 'Reimprimir Hojas' : 'Generar e Imprimir PDF'}</span>
                  </>
                )}
              </button>
            </div>
            
            <div className="flex items-start gap-2 pt-2 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                <strong>Regla de Oro:</strong> Una vez impresa la prueba, no se podrá modificar la cantidad de preguntas ni de alternativas. Si necesitas hacer cambios estructurales, deberás crear una prueba nueva.
              </p>
            </div>
          </div>
        </div>

        {/* VISTA PREVIA */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full flex items-center justify-between pb-2 px-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Vista Previa de la Hoja (v5.0)
            </span>
          </div>

          <div className="w-full max-w-[620px] aspect-[8.5/11] bg-white rounded-sm shadow-xl border border-slate-300 relative p-8 flex flex-col justify-between overflow-hidden">
            <div className="absolute top-4 left-4 w-5 h-5 bg-black" />
            <div className="absolute top-4 right-4 w-5 h-5 bg-black" />
            <div className="absolute bottom-4 left-4 w-5 h-5 bg-black" />
            <div className="absolute bottom-4 right-4 w-5 h-5 bg-black" />

            <div className="absolute top-4 right-14 flex gap-1">
               <div className="grid grid-cols-8 gap-1">
                  {[...Array(24)].map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i % 3 === 0 ? 'bg-black' : 'border border-black'}`} />
                  ))}
               </div>
            </div>

            <div className="space-y-4 pt-4">
              <div className="border-b pb-2">
                <h4 className="text-[13px] font-black text-slate-900 tracking-tight">UNIVERSIDAD AUTÓNOMA DE CHILE</h4>
                <p className="text-[9px] font-semibold text-slate-500 uppercase">{pruebaData?.asignatura_nombre} | {pruebaData?.carrera}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-300 rounded-sm p-2">
                  <span className="text-[8px] font-bold text-slate-500 block mb-1">RUT</span>
                  <div className="flex gap-1 mb-2">
                    {[...Array(8)].map((_, i) => <div key={i} className="w-3 h-4 border border-slate-400 rounded-sm"></div>)}
                    <div className="w-1"></div>
                    <div className="w-3 h-4 border border-slate-400 rounded-sm"></div>
                  </div>
                  <div className="flex gap-1">
                     {[...Array(6)].map((_, i) => (
                       <div key={i} className="flex flex-col gap-1">
                         {[...Array(5)].map((_, j) => <div key={j} className="w-2 h-2 rounded-full border border-slate-300"></div>)}
                       </div>
                     ))}
                  </div>
                </div>
                
                <div className="border border-slate-300 rounded-sm p-2 space-y-2">
                  <div>
                    <span className="text-[8px] font-bold text-slate-500 block">NOMBRE:</span>
                    <div className="border-b border-dashed border-slate-300 h-3"></div>
                    <div className="border-b border-dashed border-slate-300 h-3 mt-1"></div>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-slate-500 block">CARRERA:</span>
                    <div className="border-b border-dashed border-slate-300 h-3"></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <div>
                        <span className="text-[8px] font-bold text-slate-500 block">SECCIÓN:</span>
                        <div className="border-b border-dashed border-slate-300 h-3"></div>
                     </div>
                     <div>
                        <span className="text-[8px] font-bold text-slate-500 block">FECHA:</span>
                        <div className="border-b border-dashed border-slate-300 h-3"></div>
                     </div>
                  </div>
                </div>
              </div>

              <div className="border border-slate-300 rounded-sm p-4 flex-1">
                <div className="text-center text-[9px] font-bold text-slate-800 mb-2">HOJA DE RESPUESTAS</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[8px] text-slate-400 w-3">{i+1}</span>
                        <div className="flex gap-1.5">
                          {[...Array(pruebaData?.cantidad_alternativas || 4)].map((_, j) => (
                            <div key={j} className="w-2.5 h-2.5 rounded-full border border-slate-400"></div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[8px] text-slate-400 w-3">{i+6}</span>
                        <div className="flex gap-1.5">
                          {[...Array(pruebaData?.cantidad_alternativas || 4)].map((_, j) => (
                            <div key={j} className="w-2.5 h-2.5 rounded-full border border-slate-400"></div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN (Reemplaza al window.confirm) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-amber-50 p-6 flex flex-col items-center text-center border-b border-amber-100">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <ShieldAlert className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Atención: Acción Irreversible</h3>
              <p className="text-sm text-slate-600 mt-2">
                Al generar estas hojas, la estructura de la prueba (cantidad de preguntas y alternativas) <strong>quedará bloqueada permanentemente</strong>.
              </p>
            </div>
            <div className="p-6 bg-white">
              <p className="text-xs text-slate-500 text-center mb-6">
                Si cometes un error en la cantidad de preguntas, deberás crear una NUEVA prueba. ¿Deseas continuar y generar el PDF?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-2.5 px-4 bg-[#F5F5F5] hover:bg-[#EAEAEA] text-[#3D3935] border border-[#DADADA] font-bold text-sm rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={ejecutarGeneracionPDF}
                  className="flex-1 py-2.5 px-4 bg-[#DA291C] hover:bg-[#B82116] text-white font-bold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Sí, generar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
import React, { useState, useRef, useEffect } from 'react';
import { X, ScanLine, CheckCircle2, Files, AlertTriangle, Layers, Loader2 } from 'lucide-react';
import JSZip from 'jszip';
import { AREA_PX } from '../utils/omrLayout';
import { leerConfigHoja, leerHoja, type Lectura, type Resultado } from '../utils/omrLectura';
import { authFetch } from '../utils/authFetch';

declare global { interface Window { cv: any; } }

interface HojaProcesada {
  file: File;
  lectura: Lectura;
  previewUrl: string;
  rutCorregido?: string;
  alumnoExiste?: boolean; 
}

export const EscanearPrueba: React.FC<{
  onClose?: () => void;
  onProcesarLoteExitoso?: (lote: HojaProcesada[]) => void;
  pruebaId?: string | number;
}> = ({ onClose, onProcesarLoteExitoso, pruebaId }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUnzipping, setIsUnzipping] = useState(false);
  const [cvLoaded, setCvLoaded] = useState(false);
  const [debugMsg, setDebugMsg] = useState('');
  const [modoLote, setModoLote] = useState(false);
  const [loteProcesado, setLoteProcesado] = useState<HojaProcesada[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Estados para Zoom y Búsqueda
  const [hojaParaZoom, setHojaParaZoom] = useState<HojaProcesada | null>(null);
  const [busquedaAlumno, setBusquedaAlumno] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const listo = () => !!(window.cv && window.cv.Mat);
    if (listo()) { setCvLoaded(true); return; }
    if (!document.querySelector('script[data-opencv]')) {
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
      script.async = true;
      script.setAttribute('data-opencv', '1');
      document.body.appendChild(script);
    }
    const t = setInterval(() => { if (listo()) { setCvLoaded(true); clearInterval(t); } }, 200);
    return () => clearInterval(t);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsUnzipping(true);
    setDebugMsg('Cargando archivos...');
    const selectedFiles = Array.from(e.target.files);
    let archivosParaProcesar: File[] = [];

    try {
      for (const file of selectedFiles) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const zip = await JSZip.loadAsync(file);
          const imageEntries = Object.keys(zip.files).filter(name => /\.(jpg|jpeg|png)$/i.test(name));
          
          for (const entry of imageEntries) {
            const blob = await zip.files[entry].async('blob');
            archivosParaProcesar.push(new File([blob], entry, { type: 'image/jpeg' }));
          }
        } else if (file.type.startsWith('image/')) {
          archivosParaProcesar.push(file);
        }
      }

      archivosParaProcesar.sort((a, b) => a.name.localeCompare(b.name));

      setFiles(archivosParaProcesar);
      setCurrentIndex(0);
      setLoteProcesado([]); 
      if (archivosParaProcesar.length > 0) {
        setPreviewUrl(URL.createObjectURL(archivosParaProcesar[0]));
      }
      setDebugMsg(`Se cargaron ${archivosParaProcesar.length} imágenes.`);
    } catch (error) {
      console.error("Error al descomprimir:", error);
      setDebugMsg('Error al leer el archivo ZIP.');
    } finally {
      setIsUnzipping(false);
    }
  };

  const procesarImagen = (): Promise<{ lectura: Lectura, previewUrl: string } | null> => {
    return new Promise((resolve) => {
      if (!cvLoaded || !imgRef.current || !canvasRef.current) return resolve(null);
      if (!imgRef.current.complete || imgRef.current.naturalWidth === 0) return resolve(null);

      setTimeout(() => {
        const cv = window.cv;
        const mats: any[] = [];
        const t = <T extends { delete: () => void }>(m: T): T => { mats.push(m); return m; };

        try {
          const img = imgRef.current!;
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext('2d')!;

          const MAX_WIDTH = 1200;
          const scale = img.naturalWidth > MAX_WIDTH ? MAX_WIDTH / img.naturalWidth : 1;
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const src = t(cv.imread(canvas));
          const gray = t(new cv.Mat());
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
          const IW = gray.cols, IH = gray.rows;

          const blur = t(new cv.Mat());
          cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
          const bin = t(new cv.Mat());
          cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

          const contours = t(new cv.MatVector());
          const hierarchy = t(new cv.Mat());
          cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

          const areaImg = IW * IH;
          const candidatos: { x: number; y: number }[] = [];
          for (let i = 0; i < contours.size(); i++) {
            const c = contours.get(i);
            const rect = cv.boundingRect(c);
            const area = cv.contourArea(c);
            c.delete();
            const ar = rect.width / rect.height;
            const extent = area / (rect.width * rect.height);
            if (area > areaImg * 0.0003 && area < areaImg * 0.006 && ar > 0.7 && ar < 1.4 && extent > 0.75) {
              candidatos.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
            }
          }

          const esquinas = [[0, 0], [IW, 0], [IW, IH], [0, IH]];
          const maxDist = 0.2 * Math.hypot(IW, IH);
          const fid = esquinas.map(([ex, ey]) => {
            let mejor: { x: number; y: number } | null = null, d = Infinity;
            for (const c of candidatos) {
              const dd = Math.hypot(c.x - ex, c.y - ey);
              if (dd < d) { d = dd; mejor = c; }
            }
            return d <= maxDist ? mejor : null;
          });

          if (fid.some(f => f === null)) { resolve(null); return; }
          const [tl, tr, br, bl] = fid as { x: number; y: number }[];

          const srcTri = t(cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]));
          const dstTri = t(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, AREA_PX.w, 0, AREA_PX.w, AREA_PX.h, 0, AREA_PX.h]));
          const M = t(cv.getPerspectiveTransform(srcTri, dstTri));
          const warped = t(new cv.Mat());
          cv.warpPerspective(gray, warped, M, new cv.Size(AREA_PX.w, AREA_PX.h), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());

          const kernel = t(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(31, 31)));
          const fondo = t(new cv.Mat());
          cv.morphologyEx(warped, fondo, cv.MORPH_CLOSE, kernel);
          const flat = t(new cv.Mat());
          cv.divide(warped, fondo, flat, 255);

          const imgGris = { data: flat.data, w: flat.cols, h: flat.rows };
          const config = leerConfigHoja(imgGris);
          if (!config) { resolve(null); return; }

          const lectura = leerHoja(imgGris, config);
          resolve({ lectura, previewUrl: canvas.toDataURL() });

        } catch (error) {
          console.error(error);
          resolve(null);
        } finally {
          mats.forEach(m => { try { m.delete(); } catch {} });
        }
      }, 50);
    });
  };

  const procesarLoteCompleto = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setModoLote(true);
    const resultados: HojaProcesada[] = [];
    
    for (let i = 0; i < files.length; i++) {
      setCurrentIndex(i);
      const url = URL.createObjectURL(files[i]);
      setPreviewUrl(url);
      
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (imgRef.current?.complete && imgRef.current?.naturalWidth! > 0) {
            clearInterval(check);
            resolve(null);
          }
        }, 50);
      });

      const res = await procesarImagen();
      
      if (res) {
        let alumnoExiste = false;
        try {
          const response = await authFetch(`/api/alumnos/validar/${res.lectura.rut}`);
          const data = await response.json();
          alumnoExiste = data.existe;
        } catch (err) {
          console.error("Error consultando alumno:", err);
        }

        resultados.push({ 
          file: files[i], 
          lectura: res.lectura, 
          previewUrl: res.previewUrl,
          alumnoExiste
        });
      }
      
      setDebugMsg(`Procesando hoja ${i + 1} de ${files.length}...`);
    }
    
    setLoteProcesado(resultados);
    setIsProcessing(false);
    setDebugMsg(`Lote procesado. ${resultados.length} hojas leídas.`);
  };

  const buscarAlumnos = async (query: string) => {
    if (query.length < 3) { 
      setResultadosBusqueda([]); 
      return; 
    }
    setBuscando(true);
    try {
      const res = await authFetch(`/api/alumnos/buscar?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResultadosBusqueda(data);
      } else {
        console.warn("Endpoint no encontrado. Usando mock.");
        setResultadosBusqueda([
          { rut: '12345678-9', nombre: 'Juan', apellido: 'Pérez', carrera: 'Ingeniería Civil' },
          { rut: '98765432-1', nombre: 'María', apellido: 'Gómez', carrera: 'Medicina' }
        ]);
      }
    } catch (error) {
      console.error("Error buscando alumnos", error);
    } finally {
      setBuscando(false);
    }
  };

  const handleCorregirRut = (index: number, nuevoRut: string) => {
    const nuevoLote = [...loteProcesado];
    nuevoLote[index].rutCorregido = nuevoRut;
    setLoteProcesado(nuevoLote);
  };

  const handleResolverMultiples = (hojaIndex: number, preguntaIndex: number, nuevaRespuesta: Resultado) => {
    const nuevoLote = [...loteProcesado];
    const hoja = nuevoLote[hojaIndex];
    
    // Creamos una copia de las respuestas para modificarlas
    const nuevasRespuestas = [...hoja.lectura.respuestas];
    
    // Asignamos la respuesta elegida por el profesor
    nuevasRespuestas[preguntaIndex] = nuevaRespuesta;

    // Contamos cuántas dobles marcas quedan en esta hoja
    const doblesRestantes = nuevasRespuestas.filter(r => r === '*').length;

    // Actualizamos la lectura
    nuevoLote[hojaIndex] = {
      ...hoja,
      lectura: {
        ...hoja.lectura,
        respuestas: nuevasRespuestas,
        multiples: doblesRestantes // Si llega a 0, la hoja desaparece de los errores
      }
    };
    
    setLoteProcesado(nuevoLote);
  };

  const handleGuardarLote = async () => {
    if (!pruebaId) {
      alert("No se encontró el identificador de la prueba para guardar el lote.");
      return;
    }

    setIsSaving(true);
    
    // Nos aseguramos de construir el objeto con el estado ACTUALIZADO
    const loteParaGuardar = loteProcesado.map(h => {
      const respuestasFinales = [...h.lectura.respuestas]; 
      
      return {
        rut: h.rutCorregido || h.lectura.rut,
        forma: h.lectura.forma || 'A',
        respuestas: respuestasFinales
      };
    });

    try {
      const response = await authFetch('/api/resultados/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prueba_id: pruebaId,
          resultados: loteParaGuardar
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Error al guardar el lote en el servidor');
      }

      const data = await response.json();
      console.log("Guardado exitoso:", data);
      
      if (onProcesarLoteExitoso) {
        onProcesarLoteExitoso(loteProcesado);
      }
      
    } catch (error: any) {
      console.error("Error guardando:", error);
      alert(error?.message || "Hubo un error al guardar en la base de datos. Revisa la consola.");
    } finally {
      setIsSaving(false);
    }
  };

  // Filtrar solo las hojas que requieren revisión manual
  const hojasConErrores = loteProcesado.filter(hoja => {
    const tieneErrorRut = !hoja.lectura.rutValido && !hoja.rutCorregido;
    const rutNoRegistrado = hoja.lectura.rutValido && !hoja.alumnoExiste && !hoja.rutCorregido;
    const tieneMultiples = hoja.lectura.multiples > 0;
    return tieneErrorRut || rutNoRegistrado || tieneMultiples;
  });

  return (
    <div className="bg-white rounded-2xl max-w-7xl w-full shadow-2xl border border-[#DADADA] flex flex-col h-[90vh] overflow-hidden">
      <div className="bg-[#3D3935] text-white px-6 py-4 flex items-center justify-between shrink-0 border-b-2 border-[#DA291C]">
        <div className="flex items-center gap-3">
          <ScanLine className="w-5 h-5 text-[#DA291C]" />
          <h2 className="font-bold text-lg">Procesamiento por Lotes</h2>
        </div>
        {onClose && <button onClick={onClose} className="text-white/70 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>}
      </div>

      {modoLote && loteProcesado.length > 0 ? (
        <div className="flex-1 overflow-hidden flex flex-col p-6 bg-[#F3F3F3]">
          <div className="flex items-center justify-between pb-4 border-b border-[#DADADA]">
            <div>
              <h3 className="text-lg font-bold text-[#3D3935]">Resumen del Lote</h3>
              <p className="text-sm text-[#3D3935]/70">
                Se procesaron {loteProcesado.length} hojas. <span className="font-bold text-emerald-600">{loteProcesado.length - hojasConErrores.length} están perfectas</span> y {hojasConErrores.length} requieren revisión manual.
              </p>
            </div>
            <button onClick={() => setModoLote(false)} className="text-sm font-semibold text-[#DA291C] hover:text-[#B82116] cursor-pointer">
              Volver a Cargar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-2">
            {hojasConErrores.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-emerald-600">
                <CheckCircle2 className="w-16 h-16 mb-4" />
                <h3 className="text-xl font-bold">¡Todo perfecto!</h3>
                <p className="text-[#3D3935]/70 mt-2">Todas las hojas se leyeron correctamente y los RUT están registrados.</p>
              </div>
            ) : (
              hojasConErrores.map((hoja, idx) => {
                const originalIndex = loteProcesado.findIndex(h => h.file === hoja.file);
                const dvValido = hoja.lectura.rutValido;
                const existeEnBD = hoja.alumnoExiste;
                
                const tieneErrorRut = !dvValido && !hoja.rutCorregido;
                const rutNoRegistrado = dvValido && !existeEnBD && !hoja.rutCorregido;
                const tieneMultiples = hoja.lectura.multiples > 0;

                return (
                  <div key={idx} className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${
                    tieneErrorRut ? 'bg-rose-50 border-rose-300' : 
                    rutNoRegistrado ? 'bg-amber-50 border-amber-300' : 
                    'bg-white border-[#DADADA]'
                  }`}>
                    <div 
                      className="w-32 h-40 shrink-0 border border-[#DADADA] rounded bg-[#F5F5F5] overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#DA291C] transition-all"
                      onClick={() => setHojaParaZoom(hoja)}
                      title="Click para ampliar imagen"
                    >
                      <img src={hoja.previewUrl} alt="Preview" className="w-full h-full object-contain" />
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">Hoja (Archivo: {hoja.file.name})</span>
                        
                        {tieneErrorRut ? (
                          <span className="text-xs font-bold text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> RUT Inválido (DV)</span>
                        ) : rutNoRegistrado ? (
                          <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> RUT No Registrado</span>
                        ) : tieneMultiples ? (
                          <span className="text-xs font-bold text-orange-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Doble Marca</span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="text-xs font-semibold text-slate-700">RUT:</label>
                        <input 
                          type="text" 
                          value={hoja.rutCorregido || hoja.lectura.rut}
                          onChange={(e) => handleCorregirRut(originalIndex, e.target.value)}
                          className={`px-3 py-1 text-sm border rounded-lg font-mono ${
                            tieneErrorRut ? 'border-rose-400 bg-white' : 
                            rutNoRegistrado ? 'border-amber-400 bg-white' : 
                            'border-slate-300 bg-slate-50'
                          }`}
                        />
                        {hoja.lectura.forma && <span className="text-xs bg-slate-100 px-2 py-1 rounded">Forma: {hoja.lectura.forma}</span>}
                      </div>

                      {(tieneErrorRut || rutNoRegistrado) && (
                        <div className="mt-2 bg-white p-2 border border-[#DADADA] rounded-lg shadow-sm w-full max-w-md">
                          <label className="text-[11px] font-semibold text-[#3D3935]/80 block mb-1">Asignación Manual: Buscar alumno por nombre</label>
                          <input
                            type="text"
                            placeholder="Escribe al menos 3 letras del nombre o apellido..."
                            className="w-full px-2 py-1 text-sm border border-[#DADADA] rounded mb-2 focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                            value={busquedaAlumno}
                            onChange={(e) => {
                              setBusquedaAlumno(e.target.value);
                              buscarAlumnos(e.target.value);
                            }}
                          />
                          {buscando && <p className="text-xs text-[#DA291C] animate-pulse">Buscando...</p>}
                          
                          {resultadosBusqueda.length > 0 && (
                            <ul className="max-h-32 overflow-y-auto text-xs divide-y divide-[#DADADA]/60 border border-[#DADADA] rounded">
                              {resultadosBusqueda.map((alumno) => (
                                <li
                                  key={alumno.rut}
                                  className="py-1.5 px-2 hover:bg-[#DA291C]/8 cursor-pointer flex justify-between items-center transition-colors"
                                  onClick={() => {
                                    handleCorregirRut(originalIndex, alumno.rut);
                                    setBusquedaAlumno('');
                                    setResultadosBusqueda([]);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-[#3D3935]">{alumno.nombre} {alumno.apellido}</span>
                                    <span className="text-[10px] text-[#3D3935]/60">{alumno.carrera}</span>
                                  </div>
                                  <span className="text-[#3D3935] font-mono bg-[#F5F5F5] px-1.5 py-0.5 rounded">{alumno.rut}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {tieneMultiples && (
                        <div className="text-xs text-amber-700 bg-amber-100 p-3 rounded-lg border border-amber-300">
                          <p className="font-bold mb-2 flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" /> Revisión de Doble Marca
                          </p>
                          <div className="space-y-2">
                            {hoja.lectura.respuestas.map((resp, pIdx) => {
                              if (resp !== '*') return null; // Solo mostramos las preguntas con asterisco
                              return (
                                <div key={pIdx} className="flex items-center justify-between bg-white/60 p-2 rounded border border-amber-200">
                                  <span className="font-semibold text-slate-700">Pregunta {pIdx + 1}</span>
                                  <select 
                                    className="text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-amber-400 outline-none cursor-pointer"
                                    defaultValue=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleResolverMultiples(originalIndex, pIdx, e.target.value as Resultado);
                                      }
                                    }}
                                  >
                                    <option value="" disabled>Seleccionar...</option>
                                    <option value="A">Marcar A</option>
                                    <option value="B">Marcar B</option>
                                    <option value="C">Marcar C</option>
                                    <option value="D">Marcar D</option>
                                    <option value="E">Marcar E</option>
                                    <option value="-">Anular (Mala)</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-10 gap-1 mt-2">
                        {hoja.lectura.respuestas.slice(0, 20).map((r, i) => (
                          <div key={i} className={`border text-center text-[10px] rounded ${r === '*' ? 'bg-rose-100 border-rose-300 text-rose-700' : r === '-' ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}>
                            {r}
                          </div>
                        ))}
                        {hoja.lectura.respuestas.length > 20 && <div className="text-[10px] text-slate-400 col-span-10">... y {hoja.lectura.respuestas.length - 20} más</div>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
            <div className="text-sm text-slate-500">
              {hojasConErrores.length > 0 ? 'Corrige los errores para continuar.' : 'Listo para guardar.'}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModoLote(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-100">
                Cancelar
              </button>
              <button 
                onClick={handleGuardarLote} 
                disabled={isSaving}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-lg flex items-center gap-2 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando en la nube...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar y Guardar Todo ({loteProcesado.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row p-4 gap-4">
          <div className="w-full md:w-1/3 flex flex-col gap-4 shrink-0 overflow-y-auto">
            
            <div className="border-2 border-dashed border-[#DADADA] hover:border-[#DA291C]/60 rounded-xl p-6 text-center bg-[#F5F5F5] relative flex flex-col items-center justify-center transition-colors">
              <input 
                type="file" 
                accept="image/*,.zip" 
                multiple 
                onChange={handleFileChange} 
                className="absolute inset-0 opacity-0 cursor-pointer" 
              />
              <Layers className="w-10 h-10 text-[#DA291C] mb-2" />
              <p className="font-bold text-[#3D3935] text-sm">Subir imágenes o un ZIP</p>
              <p className="text-[11px] text-[#3D3935]/70 mt-1">Puedes seleccionar varias fotos o un archivo .zip con todas.</p>
            </div>

            {isUnzipping && (
              <div className="text-center text-sm text-[#DA291C] font-medium animate-pulse">
                Descomprimiendo archivos...
              </div>
            )}

            {files.length > 0 && (
              <div className="bg-white p-3 rounded-xl border border-[#DADADA] flex items-center justify-between">
                <span className="text-xs font-bold text-[#3D3935]">
                  {files.length} hojas cargadas
                </span>
                <button onClick={() => { setFiles([]); setPreviewUrl(null); setLoteProcesado([]); }} className="text-xs text-[#DA291C] hover:text-[#B82116] font-semibold cursor-pointer">
                  Limpiar
                </button>
              </div>
            )}

            {previewUrl && (
              <div className="border border-[#DADADA] rounded-xl overflow-hidden bg-[#F5F5F5] h-48 shrink-0 relative">
                <img ref={imgRef} src={previewUrl} alt="Escaneo" className="w-full h-full object-contain" crossOrigin="anonymous" />
              </div>
            )}

            <button onClick={procesarLoteCompleto} disabled={files.length === 0 || isProcessing || !cvLoaded} className="w-full bg-[#DA291C] hover:bg-[#B82116] text-white py-3 rounded-lg font-bold disabled:opacity-50 cursor-pointer transition-colors">
              {!cvLoaded ? 'Cargando OpenCV...' : isProcessing ? 'Procesando lote...' : 'Procesar Lote Completo'}
            </button>

            {debugMsg && <div className="bg-[#F5F5F5] text-[#3D3935] p-2 text-xs rounded border border-[#DADADA] font-mono">{debugMsg}</div>}

          </div>

          <div className="w-full md:w-2/3 border border-[#DADADA] rounded-xl bg-[#3D3935] relative overflow-auto flex justify-center items-start">
            <canvas ref={canvasRef} className="max-w-full" style={{ maxHeight: '80vh' }} />
            {isProcessing && <div className="absolute inset-0 bg-black/60 text-white flex items-center justify-center font-bold">Procesando {currentIndex + 1} de {files.length}...</div>}
          </div>
        </div>
      )}

      {/* MODAL DE ZOOM */}
      {hojaParaZoom && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setHojaParaZoom(null)}
        >
          <div 
            className="relative max-w-5xl w-full max-h-[90vh] bg-[#3D3935] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-[#3D3935] border-b border-white/15 text-white shrink-0">
              <div>
                <h3 className="font-bold text-sm">Revisión de Imagen</h3>
                <p className="text-xs text-white/65">Archivo: {hojaParaZoom.file.name}</p>
              </div>
              <button 
                onClick={() => setHojaParaZoom(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="Cerrar zoom"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4 bg-slate-950 text-center">
              <img 
                src={hojaParaZoom.previewUrl} 
                alt="Zoom de hoja" 
                className="inline-block max-w-full h-auto"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
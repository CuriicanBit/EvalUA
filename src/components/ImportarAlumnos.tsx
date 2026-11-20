import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2, AlertTriangle, Users, X, Loader2 } from 'lucide-react';
import { authFetch } from '../utils/authFetch';

interface ImportarAlumnosProps {
  onClose: () => void;
}

export const ImportarAlumnos: React.FC<ImportarAlumnosProps> = ({ onClose }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [resultado, setResultado] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setResultado(null);
    setStatusMsg('Leyendo archivo Excel localmente...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet) as any[];

        setStatusMsg(`Procesando ${rawRows.length} filas...`);

        const alumnosParaImportar = rawRows.map(row => {
          let rutRaw = String(row['ID BANNER'] || '').trim();
          if (!rutRaw.includes('-') && rutRaw.length > 1) {
            rutRaw = rutRaw.slice(0, -1) + '-' + rutRaw.slice(-1);
          }
          const nombres = row['NOMBRES'] || '';
          const apellidos = row['APELLIDOS'] || '';
          return {
            rut: rutRaw,
            nombre_completo: `${nombres} ${apellidos}`.trim()
          };
        }).filter(a => a.rut !== '' && a.nombre_completo !== '');

        setStatusMsg('Guardando en la base de datos (esto puede tardar unos segundos)...');

        const res = await authFetch('/api/alumnos/importar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alumnos: alumnosParaImportar })
        });

        let json;
        try {
          json = await res.json();
        } catch (e) {
          throw new Error(`Error del servidor (código ${res.status}).`);
        }
        
        if (res.ok) {
          setResultado(`✅ ${json.message}`);
        } else {
          setResultado(`❌ Error: ${json.error || 'Error desconocido'}`);
        }
      } catch (error: any) {
        console.error(error);
        setResultado(`❌ ${error.message || 'Error al procesar el archivo.'}`);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#3D3935]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-[#DADADA] overflow-hidden">
        
        <div className="bg-[#3D3935] text-white px-6 py-4 flex items-center justify-between border-b-2 border-[#DA291C]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#DA291C]" />
            <h3 className="font-bold text-base">Importar Alumnos</h3>
          </div>
          <button onClick={onClose} disabled={isImporting} className="text-white/70 hover:text-white disabled:opacity-50 cursor-pointer">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!isImporting && !resultado && (
            <>
              <p className="text-sm text-[#3D3935]/80">
                Sube el archivo oficial de matrícula (ej. "Reporte MatriculaTotal.xlsx"). El sistema leerá automáticamente las columnas <strong>ID BANNER</strong> y <strong>NOMBRES + APELLIDOS</strong>.
              </p>
              <div className="border-2 border-dashed border-[#DA291C]/50 bg-[#DA291C]/5 rounded-xl p-8 text-center relative hover:bg-[#DA291C]/10 transition-colors">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileUpload} 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                />
                <UploadCloud className="w-10 h-10 text-[#DA291C] mx-auto mb-2" />
                <p className="font-bold text-[#3D3935] text-sm">Haz clic o arrastra el Excel aquí</p>
              </div>
            </>
          )}

          {isImporting && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-12 h-12 text-[#DA291C] animate-spin" />
              <div className="text-center">
                <p className="font-bold text-[#3D3935] text-lg">Procesando datos</p>
                <p className="text-sm text-[#3D3935]/70 mt-1">{statusMsg}</p>
              </div>
            </div>
          )}

          {resultado && (
            <div className={`p-4 rounded-xl text-sm font-medium flex items-start gap-2 ${
              resultado.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {resultado.startsWith('✅') ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />}
              <span>{resultado}</span>
            </div>
          )}

          {resultado && (
            <div className="flex justify-end pt-2">
              <button onClick={onClose} className="px-4 py-2 bg-[#3D3935] hover:bg-[#2E2B28] text-white rounded-xl text-sm font-bold transition-all cursor-pointer">
                Cerrar
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Users,
  FileText,
  ArrowLeft,
  Plus,
  ChevronRight,
  GraduationCap,
  Calendar,
  Layers,
  Sparkles,
  ClipboardList,
  CheckCircle2,
  Clock,
  Search,
  Bell,
  X,
  Database,
  Pencil,
  Trash2,
  BarChart3,
  AlertTriangle,
  LogOut,
} from 'lucide-react';
import { TestDashboard } from './TestDashboard';
import { AdminPanel } from './AdminPanel';
import { AnaliticaDocente } from './AnaliticaDocente';
import { evaluarEstadoPauta } from '../utils/pautaStatus';
import { authFetch } from '../utils/authFetch';
import type { UsuarioSesion } from '../App';

// Tipos para la jerarquía de navegación
export type DashboardView = 'asignaturas' | 'pruebas' | 'test-panel' | 'analitica-global';

export interface PruebaItem {
  id: string;
  nombre: string;
  asignaturaNombre: string;
  carrera?: string;
  seccion?: string;
  fecha: string;
  preguntasCount: number;
  alternativas: number;
  formas: number;
  nivelExigencia?: number;
  estado: 'Pendiente' | 'Pauta Lista' | 'Corregida';
  alumnosEvaluados?: number;
  pautaRespuestas?: Record<number, string>;
}

// Bandas superiores institucionales para tarjetas de asignaturas
const ASIGNATURA_GRADIENTS = [
  'from-[#DA291C] to-[#B82116]',
  'from-[#3D3935] to-[#524D47]',
];

const ROLE_DISPLAY: Record<string, string> = {
  admin: 'Administrador',
  decano: 'Decano',
  jefe_carrera: 'Jefe de Carrera',
  director: 'Director de Carrera',
  docente: 'Docente',
};

interface TeacherDashboardProps {
  usuario?: UsuarioSesion;
  onLogout?: () => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ usuario, onLogout }) => {
  const isAdmin = usuario?.rol === 'admin';
  const isSupervisor = usuario?.rol !== 'docente';
  const cacheKey = `pruebasDB_cache_${usuario?.id || 'anon'}`;

  // ========================================================
  // 1. ESTADOS DE NAVEGACIÓN JERÁRQUICA
  // ========================================================
  const [view, setView] = useState<DashboardView>('asignaturas');
  const [selectedAsignatura, setSelectedAsignatura] = useState<string | null>(null);
  const [selectedPrueba, setSelectedPrueba] = useState<any | null>(null);

  const [pruebasDB, setPruebasDB] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoadingPruebas, setIsLoadingPruebas] = useState<boolean>(true);
  const [asignaturasCatalog, setAsignaturasCatalog] = useState<any[]>([]);
  const [usuariosCatalog, setUsuariosCatalog] = useState<any[]>([]);
  const [docenteFiltro, setDocenteFiltro] = useState<string>('all');

  // Estado para modal "Nueva Prueba"
  const [isNuevaPruebaModalOpen, setIsNuevaPruebaModalOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nombrePruebaNueva, setNombrePruebaNueva] = useState('');
  const [asignaturaNuevaId, setAsignaturaNuevaId] = useState<string>('');
  const [asignaturaNueva, setAsignaturaNueva] = useState('');
  const [docenteNuevoId, setDocenteNuevoId] = useState<string>(usuario?.id || '');
  const [preguntasNueva, setPreguntasNueva] = useState<string>('30');
  const [alternativasNueva, setAlternativasNueva] = useState<4 | 5>(4);
  const [formasNueva, setFormasNueva] = useState<1 | 2 | 3 | 4>(1);

  // Estado para modal "Editar Prueba"
  const [editingPrueba, setEditingPrueba] = useState<any | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editPreguntas, setEditPreguntas] = useState<string>('30');
  const [editAlternativas, setEditAlternativas] = useState<4 | 5>(5);
  const [editFormas, setEditFormas] = useState<1 | 2 | 3 | 4>(1);
  const [isUpdatingPrueba, setIsUpdatingPrueba] = useState(false);

  // Estado para modal "Confirmar Eliminación de Prueba" y avisos sin window.confirm/alert
  const [pruebaAEliminar, setPruebaAEliminar] = useState<{ id: string | number; nombre: string } | null>(null);
  const [isDeletingPrueba, setIsDeletingPrueba] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Filtro de búsqueda local
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCatalogos = async () => {
    try {
      const [resAsig, resUsers] = await Promise.all([
        authFetch('/api/asignaturas'),
        isSupervisor ? authFetch('/api/usuarios') : Promise.resolve(null),
      ]);
      if (resAsig.ok) {
        const asigData = await resAsig.json();
        if (Array.isArray(asigData)) setAsignaturasCatalog(asigData);
      }
      if (resUsers && resUsers.ok) {
        const userData = await resUsers.json();
        if (Array.isArray(userData)) setUsuariosCatalog(userData);
      }
    } catch {}
  };

  // 2. Función fetchPruebas con token JWT
  const fetchPruebas = async () => {
    setIsLoadingPruebas(true);
    try {
      const res = await authFetch('/api/pruebas');
      if (!res.ok) {
        throw new Error(`Error en servidor: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();

      if (Array.isArray(data)) {
        const mapaUnico = new Map<string, any>();
        data.forEach((p: any) => {
          if (p && p.id) {
            mapaUnico.set(String(p.id), p);
          }
        });
        const listaDeduplicada = Array.from(mapaUnico.values());
        setPruebasDB(listaDeduplicada);

        try {
          localStorage.setItem(cacheKey, JSON.stringify(listaDeduplicada));
        } catch {}

        setSelectedPrueba((curr: any) => {
          if (!curr) return curr;
          const actualizada = listaDeduplicada.find((p) => String(p.id) === String(curr.id));
          return actualizada ? { ...curr, ...actualizada } : curr;
        });
      }
    } catch (err) {
      console.error('Error al conectar con /api/pruebas:', err);
    } finally {
      setIsLoadingPruebas(false);
    }
  };

  useEffect(() => {
    fetchPruebas();
    fetchCatalogos();
  }, [usuario?.id]);

  // Lista de docentes visibles en las pruebas actuales (para filtros de Decano / Jefe de Carrera / Admin)
  const docentesDisponibles = useMemo(() => {
    const map = new Map<string, string>();
    pruebasDB.forEach((p) => {
      const nombre = (p.docente_nombre_display || p.nombre_docente || '').trim();
      if (nombre) {
        map.set(nombre.toLowerCase(), nombre);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [pruebasDB]);

  const pruebasFiltradasPorDocente = useMemo(() => {
    if (!isSupervisor || docenteFiltro === 'all') return pruebasDB;
    return pruebasDB.filter((p) => {
      const nombre = (p.docente_nombre_display || p.nombre_docente || '').trim().toLowerCase();
      return nombre === docenteFiltro.toLowerCase();
    });
  }, [pruebasDB, docenteFiltro, isSupervisor]);

  // Agrupar pruebas por asignatura_nombre
  const asignaturasAgrupadas = React.useMemo(() => {
    const mapa: Record<string, any[]> = {};
    pruebasFiltradasPorDocente.forEach((p) => {
      const asigRaw = p.asignatura_nombre || p.asignatura || 'General';
      const asig = typeof asigRaw === 'string' ? asigRaw.trim() : 'General';
      if (!mapa[asig]) {
        mapa[asig] = [];
      }
      mapa[asig].push(p);
    });
    return mapa;
  }, [pruebasFiltradasPorDocente]);

  const listaAsignaturas = React.useMemo(() => {
    return Object.keys(asignaturasAgrupadas);
  }, [asignaturasAgrupadas]);

  const pruebasActuales: any[] = React.useMemo(() => {
    if (!selectedAsignatura) return [];
    return asignaturasAgrupadas[selectedAsignatura] || [];
  }, [selectedAsignatura, asignaturasAgrupadas]);

  // ========================================================
  // NAVEGACIÓN Y HANDLERS
  // ========================================================
  const handleSelectAsignatura = (nombreAsignatura: string) => {
    setSelectedAsignatura(nombreAsignatura);
    setSelectedPrueba(null);
    setSearchTerm('');
    setView('pruebas');
  };

  const handleSelectPrueba = (pru: any) => {
    setSelectedPrueba(pru);
    setView('test-panel');
  };

  const handleVolverAAsignaturas = () => {
    setSelectedAsignatura(null);
    setSelectedPrueba(null);
    setSearchTerm('');
    setView('asignaturas');
  };

  const handleVolverAPruebas = () => {
    setSelectedPrueba(null);
    setView('pruebas');
  };

  const handleUpdatePrueba = (updated: any) => {
    setSelectedPrueba(updated);
    setPruebasDB((prev) =>
      prev.map((p) => (String(p.id) === String(updated.id) ? { ...p, ...updated } : p))
    );
  };

  const handleCrearNuevaPrueba = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const selectedCatalogAsig = asignaturasCatalog.find((a) => String(a.id) === asignaturaNuevaId);
    const asigDestino = (
      selectedAsignatura ||
      selectedCatalogAsig?.nombre ||
      asignaturaNueva ||
      'General'
    ).trim();
    const nombreTrimmed = nombrePruebaNueva.trim();
    if (!asigDestino || !nombreTrimmed) return;

    const parsedPreguntas = Math.max(1, Math.min(255, Number.parseInt(String(preguntasNueva), 10) || 30));
    setIsSaving(true);
    try {
      const matchedCatalog = selectedCatalogAsig || asignaturasCatalog.find(
        (a) => String(a.nombre || '').trim().toLowerCase() === asigDestino.toLowerCase()
      );
      const selectedTargetUser = isAdmin && docenteNuevoId
        ? usuariosCatalog.find((u) => String(u.id) === docenteNuevoId)
        : null;

      const payload: any = {
        nombre_docente: selectedTargetUser?.nombre_completo || usuario?.nombre || 'Docente',
        docente_id: isAdmin && docenteNuevoId ? docenteNuevoId : usuario?.id,
        asignatura_id: matchedCatalog?.id || null,
        asignatura: asigDestino,
        nombre_prueba: nombreTrimmed,
        cantidad_preguntas: parsedPreguntas,
        cantidad_alternativas: alternativasNueva,
        cantidad_formas: formasNueva,
        pauta_respuestas: {},
      };

      const response = await authFetch('/api/pruebas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status} al crear prueba`);
      }

      const resData = await response.json();
      const nuevoId = resData?.id || `PRU-${Date.now()}`;
      const nuevaPruebaObj: any = resData?.prueba || {
        id: nuevoId,
        nombre_docente: payload.nombre_docente,
        asignatura_nombre: payload.asignatura,
        nombre: payload.nombre_prueba,
        cantidad_preguntas: parsedPreguntas,
        cantidad_alternativas: payload.cantidad_alternativas,
        cantidad_formas: payload.cantidad_formas,
        pauta_respuestas: payload.pauta_respuestas,
        nivel_exigencia: 0.6,
        creado_en: new Date().toISOString(),
      };

      setPruebasDB((prev) => {
        const sinDuplicados = prev.filter((p) => String(p.id) !== String(nuevoId));
        const actualizado = [nuevaPruebaObj, ...sinDuplicados];
        try {
          localStorage.setItem(cacheKey, JSON.stringify(actualizado));
        } catch {}
        return actualizado;
      });

      setNombrePruebaNueva('');
      setAsignaturaNueva('');
      setAsignaturaNuevaId('');
      setDocenteNuevoId(usuario?.id || '');
      setPreguntasNueva('30');
      setAlternativasNueva(4);
      setFormasNueva(1);
      setIsNuevaPruebaModalOpen(false);

      await fetchPruebas();
    } catch (err) {
      console.error('Error creando prueba en /api/pruebas:', err);
      await fetchPruebas();
    } finally {
      setIsSaving(false);
    }
  };

  const handleEliminarPrueba = async (pruebaId: string | number) => {
    if (isDeletingPrueba) return;
    setIsDeletingPrueba(true);
    setDeleteError(null);

    try {
      const res = await authFetch(`/api/pruebas/${encodeURIComponent(String(pruebaId))}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status} al eliminar la prueba`);
      }

      setPruebasDB((prev) => {
        const actualizado = prev.filter((item) => String(item.id) !== String(pruebaId));
        try {
          localStorage.setItem(cacheKey, JSON.stringify(actualizado));
        } catch {}
        return actualizado;
      });

      if (selectedPrueba && String(selectedPrueba.id) === String(pruebaId)) {
        setSelectedPrueba(null);
      }
      setPruebaAEliminar(null);
    } catch (err: any) {
      console.error('Error al eliminar prueba:', err);
      setDeleteError(err?.message || 'No se pudo eliminar la prueba en el servidor.');
    } finally {
      setIsDeletingPrueba(false);
    }
  };

  const handleOpenEditPrueba = (e: React.MouseEvent, pru: any) => {
    e.stopPropagation();
    setEditingPrueba(pru);
    setEditNombre(pru.nombre || pru.nombre_prueba || '');
    setEditPreguntas(String(Number(pru.cantidad_preguntas || pru.preguntasCount || 30)));
    setEditAlternativas((Number(pru.cantidad_alternativas || pru.alternativas || 5) === 4 ? 4 : 5));
    const formasVal = Number(pru.cantidad_formas || pru.formas || 1);
    setEditFormas(([1, 2, 3, 4].includes(formasVal) ? formasVal : 1) as 1 | 2 | 3 | 4);
  };

  const handleGuardarEdicionPrueba = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrueba || isUpdatingPrueba) return;

    const nombreTrimmed = editNombre.trim();
    if (!nombreTrimmed) return;

    const parsedEditPreguntas = Math.max(1, Math.min(255, Number.parseInt(String(editPreguntas), 10) || 30));

    setIsUpdatingPrueba(true);
    try {
      const payload = {
        nombre: nombreTrimmed,
        cantidad_preguntas: parsedEditPreguntas,
        cantidad_alternativas: editAlternativas,
        cantidad_formas: editFormas,
        nivel_exigencia: editingPrueba.nivel_exigencia ?? 0.6,
      };

      const res = await authFetch(`/api/pruebas/${editingPrueba.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status} al actualizar la prueba`);
      }

      const resData = await res.json();
      const updatedFromServer = resData?.prueba || resData;

      setPruebasDB((prev) => {
        const actualizado = prev.map((p) =>
          String(p.id) === String(editingPrueba.id)
            ? {
                ...p,
                ...payload,
                ...(updatedFromServer && updatedFromServer.id ? updatedFromServer : {}),
              }
            : p
        );
        try {
          localStorage.setItem(cacheKey, JSON.stringify(actualizado));
        } catch {}
        return actualizado;
      });

      setEditingPrueba(null);
    } catch (err) {
      console.error('Error al actualizar prueba:', err);
    } finally {
      setIsUpdatingPrueba(false);
    }
  };

  // Helper para estado visual de la prueba
  const getEstadoBadge = (estado: 'Corregida' | 'Pauta Lista' | 'Pendiente' | 'Pauta Incompleta') => {
    switch (estado) {
      case 'Corregida':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Corregida
          </span>
        );
      case 'Pauta Lista':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#3D3935]/8 text-[#3D3935] border border-[#DADADA] whitespace-nowrap">
            <Sparkles className="w-3 h-3 text-[#DA291C]" /> Pauta Lista
          </span>
        );
      case 'Pauta Incompleta':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
            <AlertTriangle className="w-3 h-3 text-amber-500" /> Pauta Incompleta
          </span>
        );
      case 'Pendiente':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
            <AlertTriangle className="w-3 h-3 text-amber-500" /> Sin Pauta
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F3F3] flex flex-col font-sans text-[#3D3935]">
      {/* ======================================================== */}
      {/* HEADER SUPERIOR INSTITUCIONAL */}
      {/* ======================================================== */}
      <header className="bg-white border-t-4 border-t-[#DA291C] border-b border-[#DADADA] sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_xa17yzxa17yzxa17_168ff4f6.jpeg"
              alt="Logo Universidad Autónoma de Chile"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-xl object-cover border border-[#DADADA] shadow-xs shrink-0"
            />
            <div>
              <span className="font-extrabold text-[#3D3935] tracking-tight text-lg leading-tight block">
                Eval<span className="text-[#DA291C]">UA</span>
              </span>
              <span className="text-[11px] text-[#3D3935]/70 font-medium block leading-tight">
                Evaluación y lectura automática.
              </span>
            </div>
          </div>

          {/* Breadcrumb / Indicador de Nivel */}
          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-[#3D3935]/70">
            <button
              type="button"
              onClick={handleVolverAAsignaturas}
              className={`hover:text-[#DA291C] transition-colors cursor-pointer ${
                view === 'asignaturas' ? 'text-[#DA291C] font-bold' : ''
              }`}
            >
              Asignaturas
            </button>
            {view === 'analitica-global' && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[#3D3935]/40" />
                <span className="text-[#DA291C] font-bold">Analítica Global</span>
              </>
            )}
            {selectedAsignatura && view !== 'analitica-global' && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[#3D3935]/40" />
                <button
                  type="button"
                  onClick={handleVolverAPruebas}
                  className={`hover:text-[#DA291C] transition-colors cursor-pointer ${
                    view === 'pruebas' ? 'text-[#DA291C] font-bold' : ''
                  }`}
                >
                  {selectedAsignatura}
                </button>
              </>
            )}
            {selectedPrueba && view === 'test-panel' && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[#3D3935]/40" />
                <span className="text-[#3D3935] font-bold truncate max-w-[200px]">
                  {selectedPrueba.nombre}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (view === 'analitica-global') {
                  handleVolverAAsignaturas();
                } else {
                  setView('analitica-global');
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all border cursor-pointer whitespace-nowrap shrink-0 ${
                view === 'analitica-global'
                  ? 'bg-[#DA291C] text-white border-[#DA291C] shadow-xs'
                  : 'text-[#3D3935] bg-white hover:bg-[#F5F5F5] border-[#DADADA]'
              }`}
              title="Ver Analítica Longitudinal del Docente"
            >
              <BarChart3 className={`w-3.5 h-3.5 ${view === 'analitica-global' ? 'text-white' : 'text-[#DA291C]'}`} />
              <span>Analítica Global</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsAdminOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#3D3935] bg-[#F5F5F5] hover:bg-[#EAEAEA] rounded-xl transition-all border border-[#DADADA] cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                title="Administrar Usuarios, Roles y Entidades Académicas"
              >
                <Database className="w-3.5 h-3.5 text-[#DA291C]" />
                <span>Administración</span>
              </button>
            )}

            <div className="flex items-center gap-2.5 pl-3 border-l border-[#DADADA]">
              <div className="w-8 h-8 rounded-full bg-[#3D3935] text-white flex items-center justify-center font-bold text-xs uppercase">
                {(usuario?.nombre || 'US')
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p: string) => p[0])
                  .join('')}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-900 leading-tight">
                  {usuario?.nombre || 'Usuario'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {ROLE_DISPLAY[usuario?.rol || 'docente'] || usuario?.rol}
                  {usuario?.carrera_nombre
                    ? ` • ${usuario.carrera_nombre}`
                    : usuario?.facultad_nombre
                    ? ` • ${usuario.facultad_nombre}`
                    : ''}
                </p>
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  title="Cerrar sesión"
                  className="ml-1 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* CUERPO PRINCIPAL SEGÚN ESTADO DE NAVEGACIÓN */}
      {/* ======================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* ======================================================== */}
        {/* CASO 1: view === 'asignaturas' */}
        {/* ======================================================== */}
        {view === 'asignaturas' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Header de la sección */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#DADADA]">
              <div>
                <h1 className="text-2xl font-bold text-[#3D3935] tracking-tight">
                  {isAdmin
                    ? 'Todas las Asignaturas'
                    : usuario?.rol === 'decano'
                    ? `Asignaturas — ${usuario.facultad_nombre || 'Mi Facultad'}`
                    : usuario?.rol === 'jefe_carrera' || usuario?.rol === 'director'
                    ? `Asignaturas — ${usuario.carrera_nombre || 'Mi Carrera'}`
                    : 'Mis Asignaturas'}
                </h1>
                <p className="text-xs sm:text-sm text-[#3D3935]/70 mt-0.5">
                  {isSupervisor
                    ? 'Supervisa evaluaciones y hojas OMR de los docentes bajo tu ámbito académico'
                    : 'Selecciona una asignatura para revisar tus evaluaciones y hojas OMR'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {isSupervisor && docentesDisponibles.length > 0 && (
                  <select
                    value={docenteFiltro}
                    onChange={(e) => setDocenteFiltro(e.target.value)}
                    className="px-3 py-1.5 text-xs sm:text-sm bg-white border border-[#DADADA] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] text-[#3D3935]"
                    title="Filtrar por docente"
                  >
                    <option value="all">Todos los docentes ({docentesDisponibles.length})</option>
                    {docentesDisponibles.map((doc) => (
                      <option key={doc} value={doc}>
                        {doc}
                      </option>
                    ))}
                  </select>
                )}

                {/* Buscador */}
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-4 h-4 text-[#3D3935]/45 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar asignatura..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-1.5 text-xs sm:text-sm bg-white border border-[#DADADA] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] transition-all text-[#3D3935]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAsignaturaNueva('');
                    setAsignaturaNuevaId('');
                    setDocenteNuevoId(usuario?.id || '');
                    setAlternativasNueva(4);
                    setIsNuevaPruebaModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all active:scale-[0.98] cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Prueba</span>
                </button>
              </div>
            </div>

            {/* Si está cargando y no hay datos previos */}
            {isLoadingPruebas && pruebasDB.length === 0 ? (
              <div className="bg-white rounded-3xl border border-[#DADADA] shadow-sm p-12 text-center max-w-lg mx-auto space-y-4 my-8">
                <div className="w-8 h-8 border-3 border-[#DA291C] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-semibold text-[#3D3935]">Cargando evaluaciones...</p>
              </div>
            ) : pruebasFiltradasPorDocente.length === 0 ? (
              <div className="bg-white rounded-3xl border border-[#DADADA] shadow-sm p-12 text-center max-w-lg mx-auto space-y-5 my-8">
                <div className="w-16 h-16 rounded-2xl bg-[#DA291C]/10 border border-[#DA291C]/20 text-[#DA291C] flex items-center justify-center mx-auto shadow-sm">
                  <GraduationCap className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xl font-bold text-[#3D3935]">No hay evaluaciones visibles aún</h3>
                  <p className="text-xs sm:text-sm text-[#3D3935]/70 leading-relaxed">
                    {usuario?.rol === 'decano' && !usuario.facultad_id
                      ? 'Tu cuenta de Decano aún no tiene una Facultad asignada. Solicita al Administrador asignarte una facultad.'
                      : (usuario?.rol === 'jefe_carrera' || usuario?.rol === 'director') && !usuario.carrera_id
                      ? 'Tu cuenta aún no tiene una Carrera asignada. Solicita al Administrador asignarte una carrera.'
                      : 'Comienza creando una evaluación para generar hojas de respuesta OMR y corregirlas automáticamente.'}
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAsignaturaNueva('');
                      setAsignaturaNuevaId('');
                      setDocenteNuevoId(usuario?.id || '');
                      setAlternativasNueva(4);
                      setIsNuevaPruebaModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-2xl font-bold text-base shadow-lg shadow-[#DA291C]/25 transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Crear evaluación</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Grid de Tarjetas de Asignaturas agrupadas por asignatura_nombre */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listaAsignaturas
                  .filter((asigNombre) =>
                    asigNombre.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((asigNombre, idx) => {
                    const pruebas = asignaturasAgrupadas[asigNombre] || [];
                    const colorGradient = ASIGNATURA_GRADIENTS[idx % ASIGNATURA_GRADIENTS.length];

                    return (
                      <div
                        key={asigNombre}
                        onClick={() => handleSelectAsignatura(asigNombre)}
                        className="bg-white rounded-2xl border border-[#DADADA] hover:border-[#DA291C] shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between overflow-hidden relative"
                      >
                        {/* Franja de acento superior */}
                        <div className={`h-2 w-full bg-gradient-to-r ${colorGradient}`} />

                        <div className="p-6 space-y-4">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#F5F5F5] text-[#3D3935] border border-[#DADADA]">
                              {pruebas.length} {pruebas.length === 1 ? 'Evaluación' : 'Evaluaciones'}
                            </span>
                            <span className="text-xs text-[#3D3935]/55 group-hover:text-[#DA291C] transition-colors flex items-center font-medium">
                              Ver Pruebas <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                            </span>
                          </div>

                          <div>
                            <h3 className="text-lg font-bold text-[#3D3935] group-hover:text-[#DA291C] transition-colors tracking-tight">
                              {asigNombre}
                            </h3>
                            <p className="text-xs text-[#3D3935]/65 mt-1">
                              Universidad Autónoma de Chile
                            </p>
                          </div>

                          {/* Métricas rápidas de la asignatura */}
                          <div className="pt-3 border-t border-[#DADADA]/60 grid grid-cols-2 gap-3 text-xs">
                            <div className="flex items-center gap-2 text-[#3D3935]/75">
                              <ClipboardList className="w-4 h-4 text-[#3D3935]/45" />
                              <span>
                                <strong className="text-[#3D3935] font-semibold">{pruebas.length}</strong> {pruebas.length === 1 ? 'prueba' : 'pruebas'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[#3D3935]/75">
                              <FileText className="w-4 h-4 text-[#3D3935]/45" />
                              <span>Formato OMR</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer de tarjeta */}
                        <div className="px-6 py-3 bg-[#F5F5F5] border-t border-[#DADADA]/70 flex items-center justify-between text-xs text-[#3D3935]/70">
                          <span>Gestión de Evaluaciones</span>
                          <span className="font-semibold text-[#DA291C] text-[11px]">Acceder</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* CASO 2: view === 'pruebas' */}
        {/* ======================================================== */}
        {view === 'pruebas' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Barra superior con botón volver y acción de Nueva Prueba */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DADADA]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleVolverAAsignaturas}
                  className="p-2 text-[#3D3935]/75 hover:text-[#3D3935] hover:bg-[#EAEAEA] rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                  title="Volver al listado de asignaturas"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Volver a Asignaturas</span>
                </button>

                <div className="h-6 w-px bg-[#DADADA] hidden sm:block" />

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#DA291C]">
                      Asignatura
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[#3D3935] tracking-tight">
                    {selectedAsignatura}
                  </h1>
                </div>
              </div>

              {/* Botón: Nueva Prueba */}
              <button
                type="button"
                onClick={() => {
                  setAsignaturaNueva(selectedAsignatura || '');
                  setAlternativasNueva(4);
                  setIsNuevaPruebaModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Prueba</span>
              </button>
            </div>

            {/* Listado de Pruebas de la Asignatura */}
            <div className="space-y-3">
              {actionNotice && (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-medium">{actionNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActionNotice(null)}
                    className="p-1 text-amber-700 hover:text-amber-950 rounded-lg cursor-pointer"
                    aria-label="Cerrar aviso"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#3D3935]/70">
                  Evaluaciones Programadas ({pruebasActuales.length})
                </h3>
                <span className="text-xs text-[#3D3935]/55">
                  Haz clic en una prueba para abrir su panel de control
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {pruebasActuales.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-2xl border border-[#DADADA] text-[#3D3935]/55 text-xs">
                    No hay pruebas creadas para esta asignatura.
                  </div>
                ) : (
                  pruebasActuales.map((pru) => {
                    const nombrePrueba = pru.nombre || pru.nombre_prueba || 'Evaluación';
                    const numPreguntas = pru.cantidad_preguntas || pru.preguntasCount || 30;
                    const numAlternativas = pru.cantidad_alternativas || pru.alternativas || 5;
                    const numFormas = pru.cantidad_formas || pru.formas || 1;
                    const fechaTexto = pru.creado_en
                      ? new Date(pru.creado_en).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
                      : pru.fecha || 'Reciente';
                    const pautaStatus = evaluarEstadoPauta(pru);
                    const estadoPrueba: 'Corregida' | 'Pauta Lista' | 'Pendiente' | 'Pauta Incompleta' =
                      pru.estado === 'Corregida'
                        ? 'Corregida'
                        : pautaStatus.completa
                        ? 'Pauta Lista'
                        : pautaStatus.estado === 'incompleta'
                        ? 'Pauta Incompleta'
                        : 'Pendiente';

                    return (
                      <div
                        key={pru.id}
                        onClick={() => handleSelectPrueba(pru)}
                        className="bg-white rounded-2xl border border-[#DADADA] hover:border-[#DA291C] shadow-xs hover:shadow-md transition-all p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-[#DA291C]/10 border border-[#DA291C]/20 text-[#DA291C] flex items-center justify-center shrink-0 group-hover:bg-[#DA291C] group-hover:text-white transition-colors">
                            <ClipboardList className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#3D3935]/70">
                              <span className="font-mono text-[11px] text-[#3D3935]/50">{String(pru.id).slice(0, 12)}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> {fechaTexto}
                              </span>
                              {(pru.docente_nombre_display || pru.nombre_docente) && (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F5F5F5] text-[#3D3935] border border-[#DADADA] font-medium text-[11px]">
                                    <Users className="w-3 h-3 text-[#3D3935]/60" />
                                    {pru.docente_nombre_display || pru.nombre_docente}
                                  </span>
                                </>
                              )}
                              {pru.carrera_nombre && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#DA291C]/10 text-[#DA291C] font-medium text-[11px]">
                                  {pru.carrera_nombre}
                                </span>
                              )}
                            </div>
                            <h4 className="text-base font-bold text-[#3D3935] group-hover:text-[#DA291C] transition-colors mt-0.5">
                              {nombrePrueba}
                            </h4>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-[#3D3935]/70">
                              <span>{numPreguntas} Preguntas</span>
                              <span>•</span>
                              <span>{numAlternativas} Alternativas (A - {numAlternativas === 5 ? 'E' : 'D'})</span>
                              <span>•</span>
                              <span>{numFormas} {numFormas === 1 ? 'Forma' : 'Formas'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-3 sm:pt-0 border-[#DADADA]/60">
                          {getEstadoBadge(estadoPrueba)}
                          <span className="text-xs text-[#3D3935]/55 group-hover:text-[#DA291C] font-semibold flex items-center gap-1 transition-colors">
                            Gestionar <ChevronRight className="w-4 h-4" />
                          </span>
                          <div
                            className="flex items-center gap-1 pl-2 border-l border-[#DADADA]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                if (pru.hojas_impresas) {
                                  e.stopPropagation();
                                  setActionNotice('No puedes editar la estructura de una prueba que ya fue impresa. Si necesitas cambiar la cantidad de preguntas o alternativas, crea una nueva prueba.');
                                } else {
                                  setActionNotice(null);
                                  handleOpenEditPrueba(e, pru);
                                }
                              }}
                              title={pru.hojas_impresas ? "Prueba impresa (Edición bloqueada)" : "Editar prueba"}
                              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                pru.hojas_impresas 
                                  ? 'text-[#3D3935]/25 hover:bg-[#F5F5F5] cursor-not-allowed' 
                                  : 'text-[#3D3935]/55 hover:text-[#3D3935] hover:bg-[#F5F5F5]'
                              }`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteError(null);
                                setPruebaAEliminar({ id: pru.id, nombre: nombrePrueba });
                              }}
                              title="Eliminar prueba"
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* CASO 3: view === 'test-panel' */}
        {/* ======================================================== */}
        {view === 'test-panel' && selectedPrueba && (
          <div className="animate-in fade-in duration-150">
            <TestDashboard
              pruebaData={selectedPrueba}
              onBack={handleVolverAPruebas}
              onPruebaActualizada={(updatedData) => {
                if (updatedData) {
                  handleUpdatePrueba(updatedData);
                }
                fetchPruebas();
              }}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* CASO 4: view === 'analitica-global'                      */}
        {/* ======================================================== */}
        {view === 'analitica-global' && (
          <div className="animate-in fade-in duration-150">
            <AnaliticaDocente usuario={usuario} />
          </div>
        )}

      </main>

      {/* ======================================================== */}
      {/* MODAL: NUEVA PRUEBA */}
      {/* ======================================================== */}
      {isNuevaPruebaModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#3D3935]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-[#DADADA] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#3D3935] text-white flex items-center justify-between border-b-2 border-[#DA291C]">
              <div>
                <h3 className="font-bold text-base">Crear Nueva Evaluación</h3>
                <p className="text-xs text-white/70 mt-0.5">
                  {selectedAsignatura || asignaturaNueva || 'Formato OMR'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNuevaPruebaModalOpen(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCrearNuevaPrueba} className="p-6 space-y-4">
              {isAdmin && usuariosCatalog.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                    Docente Responsable
                  </label>
                  <select
                    value={docenteNuevoId}
                    onChange={(e) => setDocenteNuevoId(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935]"
                  >
                    {usuariosCatalog.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre_completo} ({ROLE_DISPLAY[u.rol] || u.rol})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                  Asignatura
                </label>
                {selectedAsignatura ? (
                  <input
                    type="text"
                    disabled
                    value={selectedAsignatura}
                    className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl font-medium text-[#3D3935]/70"
                  />
                ) : (
                  <div className="space-y-2">
                    {asignaturasCatalog.length > 0 && (
                      <select
                        value={asignaturaNuevaId}
                        onChange={(e) => {
                          setAsignaturaNuevaId(e.target.value);
                          const found = asignaturasCatalog.find((a) => String(a.id) === e.target.value);
                          if (found) setAsignaturaNueva(found.nombre);
                        }}
                        className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935]"
                      >
                        <option value="">-- Escribir manualmente o elegir asignatura del catálogo --</option>
                        {asignaturasCatalog.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre} {a.carrera_nombre ? `(${a.carrera_nombre})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {!asignaturaNuevaId && (
                      <input
                        type="text"
                        required={!asignaturaNuevaId}
                        placeholder="Ej: Cálculo Multivariable"
                        value={asignaturaNueva}
                        onChange={(e) => setAsignaturaNueva(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935]"
                      />
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                  Nombre de la Prueba / Evaluación
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Solemne I - Integrales Dobles"
                  value={nombrePruebaNueva}
                  onChange={(e) => setNombrePruebaNueva(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                  Cantidad de Preguntas
                </label>
                <input
                  type="number"
                  min={1}
                  max={255}
                  required
                  value={preguntasNueva}
                  onChange={(e) => setPreguntasNueva(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                    Alternativas
                  </label>
                  <select
                    value={alternativasNueva}
                    onChange={(e) => setAlternativasNueva((parseInt(e.target.value) as 4 | 5) || 4)}
                    className="w-full px-3 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935]"
                  >
                    <option value={4}>4 (A - D)</option>
                    <option value={5}>5 (A - E)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                    Formas / Versiones
                  </label>
                  <select
                    value={formasNueva}
                    onChange={(e) => setFormasNueva((parseInt(e.target.value) as 1 | 2 | 3 | 4) || 1)}
                    className="w-full px-3 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935]"
                  >
                    <option value={1}>1 Forma</option>
                    <option value={2}>2 Formas</option>
                    <option value={3}>3 Formas</option>
                    <option value={4}>4 Formas</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[#DADADA]/60 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsNuevaPruebaModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#3D3935]/75 hover:bg-[#F5F5F5] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all inline-flex items-center gap-2 ${
                    isSaving
                      ? 'bg-[#DA291C]/60 text-white cursor-not-allowed opacity-80'
                      : 'bg-[#DA291C] hover:bg-[#B82116] text-white cursor-pointer active:scale-[0.98]'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Evaluación</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDITAR PRUEBA */}
      {/* ======================================================== */}
      {editingPrueba && (
        <div className="fixed inset-0 z-50 bg-[#3D3935]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-[#DADADA] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#3D3935] text-white flex items-center justify-between border-b-2 border-[#DA291C]">
              <div>
                <h3 className="font-bold text-base">Editar Evaluación</h3>
                <p className="text-xs text-white/70 mt-0.5">
                  {editingPrueba.asignatura_nombre || selectedAsignatura || 'Formato OMR'}
                </p>
              </div>
              <button
                type="button"
                disabled={isUpdatingPrueba}
                onClick={() => setEditingPrueba(null)}
                className="text-white/70 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarEdicionPrueba} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                  Nombre de la Prueba / Evaluación
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Solemne I - Integrales Dobles"
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                  Cantidad de Preguntas
                </label>
                <input
                  type="number"
                  min={1}
                  max={255}
                  required
                  value={editPreguntas}
                  onChange={(e) => setEditPreguntas(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F5F5F5] border border-[#DADADA] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] font-medium text-[#3D3935]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                    Alternativas
                  </label>
                  <select
                    value={editAlternativas}
                    onChange={(e) => setEditAlternativas((parseInt(e.target.value) as 4 | 5) || 5)}
                    disabled={editingPrueba?.hojas_impresas}
                    className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none font-medium transition-colors ${
                      editingPrueba?.hojas_impresas
                        ? 'bg-[#DADADA]/60 border-[#DADADA] text-[#3D3935]/50 cursor-not-allowed'
                        : 'bg-[#F5F5F5] border-[#DADADA] focus:bg-white focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] text-[#3D3935]'
                    }`}
                  >
                    <option value={4}>4 (A - D)</option>
                    <option value={5}>5 (A - E)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#3D3935] mb-1">
                    Formas / Versiones
                  </label>
                  <select
                    value={editFormas}
                    onChange={(e) => setEditFormas((parseInt(e.target.value) as 1 | 2 | 3 | 4) || 1)}
                    disabled={editingPrueba?.hojas_impresas}
                    className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none font-medium transition-colors ${
                      editingPrueba?.hojas_impresas
                        ? 'bg-[#DADADA]/60 border-[#DADADA] text-[#3D3935]/50 cursor-not-allowed'
                        : 'bg-[#F5F5F5] border-[#DADADA] focus:bg-white focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] text-[#3D3935]'
                    }`}
                  >
                    <option value={1}>1 Forma</option>
                    <option value={2}>2 Formas</option>
                    <option value={3}>3 Formas</option>
                    <option value={4}>4 Formas</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[#DADADA]/60 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isUpdatingPrueba}
                  onClick={() => setEditingPrueba(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#3D3935]/75 hover:bg-[#F5F5F5] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPrueba || editingPrueba?.hojas_impresas}
                  className={`px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all inline-flex items-center gap-2 ${
                    (isUpdatingPrueba || editingPrueba?.hojas_impresas)
                      ? 'bg-[#DADADA] text-[#3D3935]/50 cursor-not-allowed'
                      : 'bg-[#DA291C] hover:bg-[#B82116] text-white cursor-pointer active:scale-[0.98]'
                  }`}
                >
                  {isUpdatingPrueba ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Cambios</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CONFIRMAR ELIMINACIÓN DE PRUEBA */}
      {/* ======================================================== */}
      {pruebaAEliminar && (
        <div className="fixed inset-0 z-50 bg-[#3D3935]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-[#DADADA] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-[#DA291C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-white/90 shrink-0" />
                <h3 className="font-bold text-base">Eliminar Evaluación</h3>
              </div>
              <button
                type="button"
                disabled={isDeletingPrueba}
                onClick={() => {
                  setPruebaAEliminar(null);
                  setDeleteError(null);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3D3935]/85 leading-relaxed">
                ¿Estás seguro de que deseas eliminar{' '}
                <strong className="text-[#3D3935]">&ldquo;{pruebaAEliminar.nombre}&rdquo;</strong>?
                Esta acción también eliminará sus resultados asociados y no se puede deshacer.
              </p>

              {deleteError && (
                <div className="p-3 rounded-xl bg-[#DA291C]/10 border border-[#DA291C]/30 text-xs font-medium text-[#DA291C]">
                  {deleteError}
                </div>
              )}

              <div className="pt-2 border-t border-[#DADADA]/60 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeletingPrueba}
                  onClick={() => {
                    setPruebaAEliminar(null);
                    setDeleteError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-[#3D3935]/75 hover:bg-[#F5F5F5] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeletingPrueba}
                  onClick={() => handleEliminarPrueba(pruebaAEliminar.id)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#DA291C] hover:bg-[#B82116] text-white shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isDeletingPrueba ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar Definitivamente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CRÉDITOS INSTITUCIONALES Y VERSIÓN (SUTIL)               */}
      {/* ======================================================== */}
      <footer className="mt-auto border-t border-[#DADADA]/70 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[11px] text-[#3D3935]/55">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#3D3935]/75">EvalUA</span>
            <span className="text-[#3D3935]/30">·</span>
            <span>Evaluación y lectura automática.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-center sm:text-right">
            <span>
              Desarrollado por <span className="font-medium text-[#3D3935]/75">Departamento TIC, Sede Talca</span> · Universidad Autónoma de Chile
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[#DADADA] bg-white text-[#3D3935]/65">
              v1.0.0
            </span>
          </div>
        </div>
      </footer>

      {/* ======================================================== */}
      {/* MODAL: PANEL DE ADMINISTRACIÓN DE ENTIDADES ACADÉMICAS */}
      {/* ======================================================== */}
      {isAdminOpen && (
        <AdminPanel
          onClose={() => setIsAdminOpen(false)}
          onDataChanged={() => {
            fetchPruebas();
          }}
        />
      )}
    </div>
  );
};

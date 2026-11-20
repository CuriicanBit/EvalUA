import React, { useState, useEffect } from 'react';
import { ImportarAlumnos } from './ImportarAlumnos';
import { authFetch } from '../utils/authFetch';
import {
  X,
  Plus,
  Building,
  Landmark,
  GraduationCap,
  BookOpen,
  Users,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Database,
  Pencil,
  Trash2,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

export type AdminTab = 'usuarios' | 'sedes' | 'campus' | 'facultades' | 'carreras' | 'asignaturas' | 'docentes' | 'alumnos';

interface AdminPanelProps {
  onClose: () => void;
  onDataChanged?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  decano: 'Decano',
  jefe_carrera: 'Jefe de Carrera',
  director: 'Director de Carrera',
  docente: 'Docente',
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: 'bg-purple-50 text-purple-700 border-purple-200',
  decano: 'bg-amber-50 text-amber-800 border-amber-200',
  jefe_carrera: 'bg-[#DA291C]/10 text-[#DA291C] border-[#DA291C]/25',
  director: 'bg-sky-50 text-sky-700 border-sky-200',
  docente: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, onDataChanged }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('usuarios');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [isImportarAlumnosOpen, setIsImportarAlumnosOpen] = useState(false);

  // Estados de datos
  const [usuariosList, setUsuariosList] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [campusList, setCampusList] = useState<any[]>([]);
  const [facultades, setFacultades] = useState<any[]>([]);
  const [carreras, setCarreras] = useState<any[]>([]);
  const [asignaturas, setAsignaturas] = useState<any[]>([]);
  const [docentes, setDocentes] = useState<any[]>([]);

  // Estados de formularios para cada entidad
  const [formUsuario, setFormUsuario] = useState({
    nombre_completo: '',
    rut: '',
    email: '',
    password: '',
    rol: 'docente',
    facultad_id: '',
    carrera_id: '',
  });
  const [formSede, setFormSede] = useState({ nombre: '', ciudad: '' });
  const [formCampus, setFormCampus] = useState({ nombre: '', sede_id: '', direccion: '' });
  const [formFacultad, setFormFacultad] = useState({ nombre: '', campus_id: '' });
  const [formCarrera, setFormCarrera] = useState({ nombre: '', facultad_id: '', codigo: '' });
  const [formAsignatura, setFormAsignatura] = useState({ nombre: '', carrera_id: '', codigo: '', semestre: '1' });
  const [formDocente, setFormDocente] = useState({ docente_id: '', docente_nombre: '', asignatura_id: '', seccion: 'Sección 1' });

  // Cargar todas las entidades
  const fetchAllData = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [resUsers, resSedes, resCampus, resFac, resCar, resAsig, resDoc] = await Promise.all([
        authFetch('/api/usuarios'),
        authFetch('/api/sedes'),
        authFetch('/api/campus'),
        authFetch('/api/facultades'),
        authFetch('/api/carreras'),
        authFetch('/api/asignaturas'),
        authFetch('/api/docente_asignatura'),
      ]);

      if (resUsers.ok) setUsuariosList(await resUsers.json());
      if (resSedes.ok) setSedes(await resSedes.json());
      if (resCampus.ok) setCampusList(await resCampus.json());
      if (resFac.ok) setFacultades(await resFac.json());
      if (resCar.ok) setCarreras(await resCar.json());
      if (resAsig.ok) setAsignaturas(await resAsig.json());
      if (resDoc.ok) setDocentes(await resDoc.json());
    } catch (err: any) {
      console.error('Error cargando datos académicos:', err);
      setErrorMsg('No se pudieron cargar todos los registros. Verifique la conexión.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  // Estado para Edición
  const [editingItem, setEditingItem] = useState<{
    tabla: 'usuarios' | 'sedes' | 'campus' | 'facultades' | 'carreras' | 'asignaturas';
    item: any;
  } | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Estado para Confirmación de Eliminación (sin window.confirm)
  const [itemAEliminar, setItemAEliminar] = useState<{
    tabla: 'usuarios' | 'sedes' | 'campus' | 'facultades' | 'carreras' | 'asignaturas' | 'docente_asignatura';
    id: string | number;
    nombre: string;
  } | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState<boolean>(false);

  // Iniciar edición
  const handleStartEdit = (tabla: 'usuarios' | 'sedes' | 'campus' | 'facultades' | 'carreras' | 'asignaturas', item: any) => {
    setEditingItem({ tabla, item });
    if (tabla === 'usuarios') {
      setEditFormData({
        nombre_completo: item.nombre_completo || '',
        rut: item.rut || '',
        email: item.email || '',
        password: '',
        rol: item.rol || 'docente',
        facultad_id: item.facultad_id || '',
        carrera_id: item.carrera_id || '',
      });
    } else if (tabla === 'sedes') {
      setEditFormData({ nombre: item.nombre || '', ciudad: item.ciudad || '' });
    } else if (tabla === 'campus') {
      setEditFormData({ nombre: item.nombre || '', sede_id: item.sede_id || '', direccion: item.direccion || '' });
    } else if (tabla === 'facultades') {
      setEditFormData({ nombre: item.nombre || '', campus_id: item.campus_id || '' });
    } else if (tabla === 'carreras') {
      setEditFormData({ nombre: item.nombre || '', facultad_id: item.facultad_id || '', codigo: item.codigo || '' });
    } else if (tabla === 'asignaturas') {
      setEditFormData({ nombre: item.nombre || '', carrera_id: item.carrera_id || '', codigo: item.codigo || '', semestre: item.semestre || '1' });
    }
  };

  // Guardar cambios de edición (PUT)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || isUpdating) return;
    const { tabla, item } = editingItem;

    if (tabla === 'usuarios') {
      if (!editFormData.nombre_completo?.trim() || !editFormData.email?.trim()) {
        showNotification('Nombre completo y correo son obligatorios', true);
        return;
      }
    } else if (!editFormData.nombre || !String(editFormData.nombre).trim()) {
      showNotification('El campo nombre es obligatorio', true);
      return;
    }

    setIsUpdating(true);
    try {
      const res = await authFetch(`/api/${tabla}/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error ${res.status} al actualizar`);
      }

      const updatedRecord = await res.json();

      if (tabla === 'usuarios') {
        setUsuariosList(prev => prev.map(u => String(u.id) === String(item.id) ? { ...u, ...updatedRecord } : u));
      } else if (tabla === 'sedes') {
        setSedes(prev => prev.map(s => String(s.id) === String(item.id) ? { ...s, ...updatedRecord } : s));
      } else if (tabla === 'campus') {
        const sedeObj = sedes.find(s => String(s.id) === String(editFormData.sede_id));
        setCampusList(prev => prev.map(c => String(c.id) === String(item.id) ? {
          ...c,
          ...updatedRecord,
          sede_nombre: sedeObj ? sedeObj.nombre : c.sede_nombre
        } : c));
      } else if (tabla === 'facultades') {
        const campusObj = campusList.find(c => String(c.id) === String(editFormData.campus_id));
        setFacultades(prev => prev.map(f => String(f.id) === String(item.id) ? {
          ...f,
          ...updatedRecord,
          campus_nombre: campusObj ? campusObj.nombre : f.campus_nombre
        } : f));
      } else if (tabla === 'carreras') {
        const facObj = facultades.find(f => String(f.id) === String(editFormData.facultad_id));
        setCarreras(prev => prev.map(cr => String(cr.id) === String(item.id) ? {
          ...cr,
          ...updatedRecord,
          facultad_nombre: facObj ? facObj.nombre : cr.facultad_nombre
        } : cr));
      } else if (tabla === 'asignaturas') {
        const carObj = carreras.find(cr => String(cr.id) === String(editFormData.carrera_id));
        setAsignaturas(prev => prev.map(a => String(a.id) === String(item.id) ? {
          ...a,
          ...updatedRecord,
          carrera_nombre: carObj ? carObj.nombre : a.carrera_nombre
        } : a));
      }

      showNotification('Registro actualizado exitosamente');
      setEditingItem(null);
      onDataChanged?.();
    } catch (err: any) {
      console.error('Error al actualizar:', err);
      showNotification(err.message || 'Error al actualizar registro', true);
    } finally {
      setIsUpdating(false);
    }
  };

  // Solicitar confirmación in-app para eliminar
  const handleDelete = (
    tabla: 'usuarios' | 'sedes' | 'campus' | 'facultades' | 'carreras' | 'asignaturas' | 'docente_asignatura',
    id: string | number,
    nombre: string
  ) => {
    setItemAEliminar({ tabla, id, nombre });
  };

  // Ejecutar eliminación confirmada
  const confirmDeleteItem = async () => {
    if (!itemAEliminar || isDeletingItem) return;
    const { tabla, id } = itemAEliminar;
    setIsDeletingItem(true);

    try {
      const res = await authFetch(`/api/${tabla}/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error ${res.status} al eliminar`);
      }

      if (tabla === 'usuarios') setUsuariosList(prev => prev.filter(u => String(u.id) !== String(id)));
      if (tabla === 'sedes') setSedes(prev => prev.filter(s => String(s.id) !== String(id)));
      if (tabla === 'campus') setCampusList(prev => prev.filter(c => String(c.id) !== String(id)));
      if (tabla === 'facultades') setFacultades(prev => prev.filter(f => String(f.id) !== String(id)));
      if (tabla === 'carreras') setCarreras(prev => prev.filter(cr => String(cr.id) !== String(id)));
      if (tabla === 'asignaturas') setAsignaturas(prev => prev.filter(a => String(a.id) !== String(id)));
      if (tabla === 'docente_asignatura') setDocentes(prev => prev.filter(d => String(d.id) !== String(id)));

      setItemAEliminar(null);
      showNotification('Registro eliminado exitosamente');
      onDataChanged?.();
    } catch (err: any) {
      console.error('Error al eliminar:', err);
      setItemAEliminar(null);
      showNotification(err.message || 'Error al eliminar registro', true);
    } finally {
      setIsDeletingItem(false);
    }
  };

  // Creación de Usuario
  const handleCreateUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !formUsuario.nombre_completo.trim() || !formUsuario.email.trim() || !formUsuario.password.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await authFetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_completo: formUsuario.nombre_completo.trim(),
          rut: formUsuario.rut.trim() || null,
          email: formUsuario.email.trim(),
          password: formUsuario.password,
          rol: formUsuario.rol,
          facultad_id: formUsuario.facultad_id || null,
          carrera_id: formUsuario.carrera_id || null,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor: ${res.status}`);
      }

      const nuevoUsuario = await res.json();
      setUsuariosList((prev) => [nuevoUsuario, ...prev.filter(u => String(u.id) !== String(nuevoUsuario.id))]);
      setFormUsuario({
        nombre_completo: '',
        rut: '',
        email: '',
        password: '',
        rol: 'docente',
        facultad_id: '',
        carrera_id: '',
      });
      showNotification('Usuario creado exitosamente');
      onDataChanged?.();
    } catch (err: any) {
      showNotification(err.message || 'Error al crear usuario', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Creación de Sede
  const handleCreateSede = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreTrimmed = formSede.nombre.trim();
    const ciudadTrimmed = formSede.ciudad.trim();
    if (isSaving || !nombreTrimmed) return;

    setIsSaving(true);
    try {
      const res = await authFetch('/api/sedes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombreTrimmed,
          ciudad: ciudadTrimmed,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor: ${res.status}`);
      }

      const nuevaSede = await res.json();
      setSedes((prev) => {
        const filtrado = prev.filter(s => String(s.id) !== String(nuevaSede.id));
        return [...filtrado, nuevaSede];
      });

      setFormSede({ nombre: '', ciudad: '' });
      showNotification('Sede guardada exitosamente en la base de datos');
      onDataChanged?.();
    } catch (err: any) {
      showNotification(err.message || 'Error al guardar sede', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Creación de Campus
  const handleCreateCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreTrimmed = formCampus.nombre.trim();
    if (isSaving || !nombreTrimmed || !formCampus.sede_id) return;

    setIsSaving(true);
    try {
      const res = await authFetch('/api/campus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombreTrimmed,
          sede_id: formCampus.sede_id,
          direccion: formCampus.direccion.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor: ${res.status}`);
      }

      const nuevoCampus = await res.json();
      const sedeRel = sedes.find(s => String(s.id) === String(nuevoCampus.sede_id));
      const campusConRel = {
        ...nuevoCampus,
        sede_nombre: nuevoCampus.sede_nombre || sedeRel?.nombre || `Sede #${nuevoCampus.sede_id}`,
      };

      setCampusList((prev) => {
        const filtrado = prev.filter(c => String(c.id) !== String(campusConRel.id));
        return [...filtrado, campusConRel];
      });

      setFormCampus({ nombre: '', sede_id: '', direccion: '' });
      showNotification('Campus guardado exitosamente en la base de datos');
      onDataChanged?.();
    } catch (err: any) {
      showNotification(err.message || 'Error al guardar campus', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Creación de Facultad
  const handleCreateFacultad = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreTrimmed = formFacultad.nombre.trim();
    if (isSaving || !nombreTrimmed || !formFacultad.campus_id) return;

    setIsSaving(true);
    try {
      const res = await authFetch('/api/facultades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombreTrimmed,
          campus_id: formFacultad.campus_id,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor: ${res.status}`);
      }

      const nuevaFacultad = await res.json();
      const campusRel = campusList.find(c => String(c.id) === String(nuevaFacultad.campus_id));
      const facConRel = {
        ...nuevaFacultad,
        campus_nombre: nuevaFacultad.campus_nombre || campusRel?.nombre || `Campus #${nuevaFacultad.campus_id}`,
      };

      setFacultades((prev) => {
        const filtrado = prev.filter(f => String(f.id) !== String(facConRel.id));
        return [...filtrado, facConRel];
      });

      setFormFacultad({ nombre: '', campus_id: '' });
      showNotification('Facultad guardada exitosamente en la base de datos');
      onDataChanged?.();
    } catch (err: any) {
      showNotification(err.message || 'Error al guardar facultad', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Creación de Carrera
  const handleCreateCarrera = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreTrimmed = formCarrera.nombre.trim();
    if (isSaving || !nombreTrimmed || !formCarrera.facultad_id) return;

    setIsSaving(true);
    try {
      const res = await authFetch('/api/carreras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombreTrimmed,
          facultad_id: formCarrera.facultad_id,
          codigo: formCarrera.codigo.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor: ${res.status}`);
      }

      const nuevaCarrera = await res.json();
      const facRel = facultades.find(f => String(f.id) === String(nuevaCarrera.facultad_id));
      const carConRel = {
        ...nuevaCarrera,
        facultad_nombre: nuevaCarrera.facultad_nombre || facRel?.nombre || `Facultad #${nuevaCarrera.facultad_id}`,
      };

      setCarreras((prev) => {
        const filtrado = prev.filter(c => String(c.id) !== String(carConRel.id));
        return [...filtrado, carConRel];
      });

      setFormCarrera({ nombre: '', facultad_id: '', codigo: '' });
      showNotification('Carrera guardada exitosamente en la base de datos');
      onDataChanged?.();
    } catch (err: any) {
      showNotification(err.message || 'Error al guardar carrera', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Creación de Asignatura
  const handleCreateAsignatura = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreTrimmed = formAsignatura.nombre.trim();
    if (isSaving || !nombreTrimmed || !formAsignatura.carrera_id) return;

    setIsSaving(true);
    try {
      const res = await authFetch('/api/asignaturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombreTrimmed,
          carrera_id: formAsignatura.carrera_id,
          codigo: formAsignatura.codigo.trim(),
          semestre: Number(formAsignatura.semestre) || 1,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor: ${res.status}`);
      }

      const nuevaAsignatura = await res.json();
      const carRel = carreras.find(c => String(c.id) === String(nuevaAsignatura.carrera_id));
      const asigConRel = {
        ...nuevaAsignatura,
        carrera_nombre: nuevaAsignatura.carrera_nombre || carRel?.nombre || `Carrera #${nuevaAsignatura.carrera_id}`,
      };

      setAsignaturas((prev) => {
        const filtrado = prev.filter(a => String(a.id) !== String(asigConRel.id));
        return [...filtrado, asigConRel];
      });

      setFormAsignatura({ nombre: '', carrera_id: '', codigo: '', semestre: '1' });
      showNotification('Asignatura guardada exitosamente en la base de datos');
      onDataChanged?.();
    } catch (err: any) {
      showNotification(err.message || 'Error al guardar asignatura', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Creación de Docente / Asignatura
  const handleCreateDocente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || (!formDocente.docente_nombre.trim() && !formDocente.docente_id) || !formDocente.asignatura_id) return;

    setIsSaving(true);
    try {
      const res = await authFetch('/api/docente_asignatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formDocente),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error al asignar docente');
      }
      showNotification('Docente asignado exitosamente');
      setFormDocente({ docente_id: '', docente_nombre: '', asignatura_id: '', seccion: 'Sección 1' });
      await fetchAllData();
      onDataChanged?.();
    } catch (err: any) {
      showNotification(err.message || 'Error al asignar docente', true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#3D3935]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-[#DADADA] overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* HEADER DEL PANEL */}
        <div className="px-6 py-4 bg-[#3D3935] text-white border-b-2 border-[#DA291C] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#DA291C] flex items-center justify-center text-white shadow-md shadow-[#DA291C]/25">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Administración Académica</h2>
              <p className="text-xs text-[#DADADA]">
                Gestión de Sedes, Campus, Facultades, Carreras y Asignaturas
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchAllData}
              disabled={isLoading}
              title="Refrescar datos"
              className="p-2 text-[#DADADA] hover:text-white hover:bg-[#524D47] rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-[#DADADA] hover:text-white p-2 hover:bg-[#524D47] rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NOTIFICACIONES */}
        {successMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center gap-2 text-xs font-semibold text-emerald-800 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-2.5 flex items-center gap-2 text-xs font-semibold text-red-800 shrink-0">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* NAVEGACIÓN POR PESTAÑAS */}
        <div className="bg-[#F5F5F5] border-b border-[#DADADA] px-6 pt-3 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => { setActiveTab('usuarios'); setSearchTerm(''); }}
            className={`pb-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'usuarios'
                ? 'border-[#DA291C] text-[#DA291C]'
                : 'border-transparent text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Usuarios y Roles</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#EAEAEA] text-[#3D3935]">
              {usuariosList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('sedes'); setSearchTerm(''); }}
            className={`pb-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'sedes'
                ? 'border-[#DA291C] text-[#DA291C]'
                : 'border-transparent text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Sedes</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#EAEAEA] text-[#3D3935]">
              {sedes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('campus'); setSearchTerm(''); }}
            className={`pb-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'campus'
                ? 'border-[#DA291C] text-[#DA291C]'
                : 'border-transparent text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Campus</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#EAEAEA] text-[#3D3935]">
              {campusList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('facultades'); setSearchTerm(''); }}
            className={`pb-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'facultades'
                ? 'border-[#DA291C] text-[#DA291C]'
                : 'border-transparent text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>Facultades</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#EAEAEA] text-[#3D3935]">
              {facultades.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('carreras'); setSearchTerm(''); }}
            className={`pb-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'carreras'
                ? 'border-[#DA291C] text-[#DA291C]'
                : 'border-transparent text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Carreras</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#EAEAEA] text-[#3D3935]">
              {carreras.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('asignaturas'); setSearchTerm(''); }}
            className={`pb-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'asignaturas'
                ? 'border-[#DA291C] text-[#DA291C]'
                : 'border-transparent text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Asignaturas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#EAEAEA] text-[#3D3935]">
              {asignaturas.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('docentes'); setSearchTerm(''); }}
            className={`pb-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'docentes'
                ? 'border-[#DA291C] text-[#DA291C]'
                : 'border-transparent text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Docentes / Asignaciones</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#EAEAEA] text-[#3D3935]">
              {docentes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('alumnos'); setSearchTerm(''); }}
            className={`pb-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'alumnos'
                ? 'border-[#DA291C] text-[#DA291C]'
                : 'border-transparent text-[#6E6A66] hover:text-[#3D3935]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Alumnos</span>
          </button>

        </div>

        {/* CONTENIDO PRINCIPAL SEGÚN PESTAÑA */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* 0. TAB: USUARIOS Y ROLES */}
          {activeTab === 'usuarios' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario Nuevo Usuario */}
              <div className="bg-[#F5F5F5] border border-[#DADADA] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#DA291C]" />
                  <h3 className="font-bold text-sm text-slate-900">Crear Usuario</h3>
                </div>
                <form onSubmit={handleCreateUsuario} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Dra. Carolina Méndez"
                      value={formUsuario.nombre_completo}
                      onChange={(e) => setFormUsuario({ ...formUsuario, nombre_completo: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">RUT</label>
                      <input
                        type="text"
                        placeholder="12345678-9"
                        value={formUsuario.rut}
                        onChange={(e) => setFormUsuario({ ...formUsuario, rut: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Rol *</label>
                      <select
                        value={formUsuario.rol}
                        onChange={(e) => setFormUsuario({ ...formUsuario, rol: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      >
                        <option value="docente">Docente</option>
                        <option value="jefe_carrera">Jefe de Carrera</option>
                        <option value="director">Director de Carrera</option>
                        <option value="decano">Decano</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Correo Institucional *</label>
                    <input
                      type="email"
                      required
                      placeholder="nombre@uautonoma.cl"
                      value={formUsuario.email}
                      onChange={(e) => setFormUsuario({ ...formUsuario, email: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña Inicial *</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Mínimo 6 caracteres"
                      value={formUsuario.password}
                      onChange={(e) => setFormUsuario({ ...formUsuario, password: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Facultad {formUsuario.rol === 'decano' ? '*' : '(opcional)'}
                    </label>
                    <select
                      required={formUsuario.rol === 'decano'}
                      value={formUsuario.facultad_id}
                      onChange={(e) => setFormUsuario({ ...formUsuario, facultad_id: e.target.value, carrera_id: '' })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    >
                      <option value="">-- Sin facultad asignada --</option>
                      {facultades.map((f) => (
                        <option key={f.id} value={f.id}>{f.nombre}</option>
                      ))}
                    </select>
                  </div>
                  {formUsuario.rol !== 'decano' && formUsuario.rol !== 'admin' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Carrera {(formUsuario.rol === 'jefe_carrera' || formUsuario.rol === 'director') ? '*' : '(recomendado)'}
                      </label>
                      <select
                        required={formUsuario.rol === 'jefe_carrera' || formUsuario.rol === 'director'}
                        value={formUsuario.carrera_id}
                        onChange={(e) => setFormUsuario({ ...formUsuario, carrera_id: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      >
                        <option value="">-- Sin carrera asignada --</option>
                        {carreras
                          .filter(cr => !formUsuario.facultad_id || String(cr.facultad_id) === String(formUsuario.facultad_id))
                          .map((cr) => (
                            <option key={cr.id} value={cr.id}>{cr.nombre}</option>
                          ))}
                      </select>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full py-2 px-4 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : 'Crear Usuario'}
                  </button>
                </form>
              </div>

              {/* Tabla Usuarios */}
              <div className="lg:col-span-2 bg-white border border-[#DADADA] rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[#DADADA] flex items-center justify-between gap-3">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Usuarios Registrados ({usuariosList.length})
                  </h3>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#F5F5F5] border border-[#DADADA] rounded-lg text-[#3D3935] outline-none focus:border-[#DA291C]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F5F5] text-[#3D3935] border-b border-[#DADADA]">
                        <th className="py-2.5 px-4 font-semibold">Nombre / Correo</th>
                        <th className="py-2.5 px-4 font-semibold">Rol</th>
                        <th className="py-2.5 px-4 font-semibold">Facultad / Carrera</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAEAEA]">
                      {usuariosList
                        .filter(u =>
                          u.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.rol?.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map((u) => (
                          <tr key={u.id} className="hover:bg-[#F5F5F5]/80 transition-colors">
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-slate-900">{u.nombre_completo}</div>
                              <div className="text-[11px] text-slate-500">{u.email}</div>
                            </td>
                            <td className="py-2.5 px-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] border ${ROLE_BADGE_CLASSES[u.rol] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                {ROLE_LABELS[u.rol] || u.rol}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-slate-600">
                              <div className="text-[11px] font-medium text-slate-800">{u.facultad_nombre || '-'}</div>
                              {u.carrera_nombre && (
                                <div className="text-[11px] text-slate-500">{u.carrera_nombre}</div>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Editar usuario"
                                  onClick={() => handleStartEdit('usuarios', u)}
                                  className="p-1.5 text-[#3D3935] hover:text-[#DA291C] hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer border border-[#DADADA]"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar usuario"
                                  onClick={() => handleDelete('usuarios', u.id, u.nombre_completo)}
                                  className="p-1.5 text-[#DA291C] hover:text-[#B82116] hover:bg-[#DA291C]/10 rounded-lg transition-colors cursor-pointer border border-[#DA291C]/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {usuariosList.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">No hay usuarios registrados aún.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 1. TAB: SEDES */}
          {activeTab === 'sedes' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario Nueva Sede */}
              <div className="bg-[#F5F5F5] border border-[#DADADA] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#DA291C]" />
                  <h3 className="font-bold text-sm text-slate-900">Agregar Nueva Sede</h3>
                </div>
                <form onSubmit={handleCreateSede} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre de la Sede *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Sede Santiago"
                      value={formSede.nombre}
                      onChange={(e) => setFormSede({ ...formSede, nombre: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ciudad / Región</label>
                    <input
                      type="text"
                      placeholder="Ej: Santiago"
                      value={formSede.ciudad}
                      onChange={(e) => setFormSede({ ...formSede, ciudad: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full py-2 px-4 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : 'Crear Sede'}
                  </button>
                </form>
              </div>

              {/* Tabla Sedes */}
              <div className="lg:col-span-2 bg-white border border-[#DADADA] rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[#DADADA] flex items-center justify-between gap-3">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Sedes Registradas ({sedes.length})
                  </h3>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#F5F5F5] border border-[#DADADA] rounded-lg text-[#3D3935] outline-none focus:border-[#DA291C]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F5F5] text-[#3D3935] border-b border-[#DADADA]">
                        <th className="py-2.5 px-4 font-semibold">ID</th>
                        <th className="py-2.5 px-4 font-semibold">Nombre</th>
                        <th className="py-2.5 px-4 font-semibold">Ciudad</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAEAEA]">
                      {sedes
                        .filter(s => s.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || s.ciudad?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((s) => (
                          <tr key={s.id} className="hover:bg-[#F5F5F5]/80 transition-colors">
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-400 text-[11px]" title={String(s.id)}>
                              {String(s.id).length > 8 ? `${String(s.id).substring(0, 8)}...` : s.id}
                            </td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{s.nombre}</td>
                            <td className="py-2.5 px-4 text-slate-600">{s.ciudad || '-'}</td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Editar sede"
                                  onClick={() => handleStartEdit('sedes', s)}
                                  className="p-1.5 text-[#3D3935] hover:text-[#DA291C] hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer border border-[#DADADA]"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar sede"
                                  onClick={() => handleDelete('sedes', s.id, s.nombre)}
                                  className="p-1.5 text-[#DA291C] hover:text-[#B82116] hover:bg-[#DA291C]/10 rounded-lg transition-colors cursor-pointer border border-[#DA291C]/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {sedes.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">No hay sedes registradas aún.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. TAB: CAMPUS (FK: sede_id) */}
          {activeTab === 'campus' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario Nuevo Campus */}
              <div className="bg-[#F5F5F5] border border-[#DADADA] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#DA291C]" />
                  <h3 className="font-bold text-sm text-slate-900">Agregar Nuevo Campus</h3>
                </div>
                <form onSubmit={handleCreateCampus} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del Campus *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Campus Providencia"
                      value={formCampus.nombre}
                      onChange={(e) => setFormCampus({ ...formCampus, nombre: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Sede Perteneciente (FK) *</label>
                    <select
                      required
                      value={formCampus.sede_id}
                      onChange={(e) => setFormCampus({ ...formCampus, sede_id: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    >
                      <option value="">-- Seleccionar Sede --</option>
                      {sedes.map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Dirección</label>
                    <input
                      type="text"
                      placeholder="Ej: Av. Pedro de Valdivia 425"
                      value={formCampus.direccion}
                      onChange={(e) => setFormCampus({ ...formCampus, direccion: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full py-2 px-4 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : 'Crear Campus'}
                  </button>
                </form>
              </div>

              {/* Tabla Campus */}
              <div className="lg:col-span-2 bg-white border border-[#DADADA] rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[#DADADA] flex items-center justify-between gap-3">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Campus Registrados ({campusList.length})
                  </h3>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#F5F5F5] border border-[#DADADA] rounded-lg text-[#3D3935] outline-none focus:border-[#DA291C]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F5F5] text-[#3D3935] border-b border-[#DADADA]">
                        <th className="py-2.5 px-4 font-semibold">ID</th>
                        <th className="py-2.5 px-4 font-semibold">Campus</th>
                        <th className="py-2.5 px-4 font-semibold">Sede (FK)</th>
                        <th className="py-2.5 px-4 font-semibold">Dirección</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAEAEA]">
                      {campusList
                        .filter(c => c.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || c.sede_nombre?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((c) => (
                          <tr key={c.id} className="hover:bg-[#F5F5F5]/80 transition-colors">
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-400 text-[11px]" title={String(c.id)}>
                              {String(c.id).length > 8 ? `${String(c.id).substring(0, 8)}...` : c.id}
                            </td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{c.nombre}</td>
                            <td className="py-2.5 px-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F5F5F5] text-[#3D3935] font-semibold text-[11px] border border-[#DADADA]">
                                <MapPin className="w-3 h-3 text-[#DA291C]" />
                                {c.sede_nombre || `Sede #${c.sede_id}`}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-slate-500">{c.direccion || '-'}</td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Editar campus"
                                  onClick={() => handleStartEdit('campus', c)}
                                  className="p-1.5 text-[#3D3935] hover:text-[#DA291C] hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer border border-[#DADADA]"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar campus"
                                  onClick={() => handleDelete('campus', c.id, c.nombre)}
                                  className="p-1.5 text-[#DA291C] hover:text-[#B82116] hover:bg-[#DA291C]/10 rounded-lg transition-colors cursor-pointer border border-[#DA291C]/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {campusList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">No hay campus registrados aún.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. TAB: FACULTADES (FK: campus_id) */}
          {activeTab === 'facultades' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario Nueva Facultad */}
              <div className="bg-[#F5F5F5] border border-[#DADADA] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#DA291C]" />
                  <h3 className="font-bold text-sm text-slate-900">Agregar Nueva Facultad</h3>
                </div>
                <form onSubmit={handleCreateFacultad} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre de la Facultad *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Facultad de Ingeniería"
                      value={formFacultad.nombre}
                      onChange={(e) => setFormFacultad({ ...formFacultad, nombre: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Campus Perteneciente (FK) *</label>
                    <select
                      required
                      value={formFacultad.campus_id}
                      onChange={(e) => setFormFacultad({ ...formFacultad, campus_id: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    >
                      <option value="">-- Seleccionar Campus --</option>
                      {campusList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} {c.sede_nombre ? `(${c.sede_nombre})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full py-2 px-4 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : 'Crear Facultad'}
                  </button>
                </form>
              </div>

              {/* Tabla Facultades */}
              <div className="lg:col-span-2 bg-white border border-[#DADADA] rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[#DADADA] flex items-center justify-between gap-3">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Facultades Registradas ({facultades.length})
                  </h3>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#F5F5F5] border border-[#DADADA] rounded-lg text-[#3D3935] outline-none focus:border-[#DA291C]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F5F5] text-[#3D3935] border-b border-[#DADADA]">
                        <th className="py-2.5 px-4 font-semibold">ID</th>
                        <th className="py-2.5 px-4 font-semibold">Facultad</th>
                        <th className="py-2.5 px-4 font-semibold">Campus (FK)</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAEAEA]">
                      {facultades
                        .filter(f => f.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || f.campus_nombre?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((f) => (
                          <tr key={f.id} className="hover:bg-[#F5F5F5]/80 transition-colors">
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-400 text-[11px]" title={String(f.id)}>
                              {String(f.id).length > 8 ? `${String(f.id).substring(0, 8)}...` : f.id}
                            </td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{f.nombre}</td>
                            <td className="py-2.5 px-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-[11px] border border-purple-100">
                                <Building className="w-3 h-3 text-purple-500" />
                                {f.campus_nombre || `Campus #${f.campus_id}`}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Editar facultad"
                                  onClick={() => handleStartEdit('facultades', f)}
                                  className="p-1.5 text-[#3D3935] hover:text-[#DA291C] hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer border border-[#DADADA]"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar facultad"
                                  onClick={() => handleDelete('facultades', f.id, f.nombre)}
                                  className="p-1.5 text-[#DA291C] hover:text-[#B82116] hover:bg-[#DA291C]/10 rounded-lg transition-colors cursor-pointer border border-[#DA291C]/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {facultades.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">No hay facultades registradas aún.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. TAB: CARRERAS (FK: facultad_id) */}
          {activeTab === 'carreras' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario Nueva Carrera */}
              <div className="bg-[#F5F5F5] border border-[#DADADA] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#DA291C]" />
                  <h3 className="font-bold text-sm text-slate-900">Agregar Nueva Carrera</h3>
                </div>
                <form onSubmit={handleCreateCarrera} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre de la Carrera *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Ingeniería Civil en Informática"
                      value={formCarrera.nombre}
                      onChange={(e) => setFormCarrera({ ...formCarrera, nombre: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Facultad Perteneciente (FK) *</label>
                    <select
                      required
                      value={formCarrera.facultad_id}
                      onChange={(e) => setFormCarrera({ ...formCarrera, facultad_id: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    >
                      <option value="">-- Seleccionar Facultad --</option>
                      {facultades.map((f) => (
                        <option key={f.id} value={f.id}>{f.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Código de Carrera</label>
                    <input
                      type="text"
                      placeholder="Ej: ICI-01"
                      value={formCarrera.codigo}
                      onChange={(e) => setFormCarrera({ ...formCarrera, codigo: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none uppercase"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full py-2 px-4 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : 'Crear Carrera'}
                  </button>
                </form>
              </div>

              {/* Tabla Carreras */}
              <div className="lg:col-span-2 bg-white border border-[#DADADA] rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[#DADADA] flex items-center justify-between gap-3">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Carreras Registradas ({carreras.length})
                  </h3>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#F5F5F5] border border-[#DADADA] rounded-lg text-[#3D3935] outline-none focus:border-[#DA291C]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F5F5] text-[#3D3935] border-b border-[#DADADA]">
                        <th className="py-2.5 px-4 font-semibold">Código</th>
                        <th className="py-2.5 px-4 font-semibold">Carrera</th>
                        <th className="py-2.5 px-4 font-semibold">Facultad (FK)</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAEAEA]">
                      {carreras
                        .filter(c => c.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || c.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) || c.facultad_nombre?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((c) => (
                          <tr key={c.id} className="hover:bg-[#F5F5F5]/80 transition-colors">
                            <td className="py-2.5 px-4 font-mono font-bold text-[#DA291C]">{c.codigo || `#${String(c.id).substring(0, 6)}`}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{c.nombre}</td>
                            <td className="py-2.5 px-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F5F5F5] text-[#3D3935] font-semibold text-[11px] border border-[#DADADA]">
                                <Landmark className="w-3 h-3 text-[#DA291C]" />
                                {c.facultad_nombre || `Facultad #${c.facultad_id}`}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Editar carrera"
                                  onClick={() => handleStartEdit('carreras', c)}
                                  className="p-1.5 text-[#3D3935] hover:text-[#DA291C] hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer border border-[#DADADA]"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar carrera"
                                  onClick={() => handleDelete('carreras', c.id, c.nombre)}
                                  className="p-1.5 text-[#DA291C] hover:text-[#B82116] hover:bg-[#DA291C]/10 rounded-lg transition-colors cursor-pointer border border-[#DA291C]/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {carreras.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">No hay carreras registradas aún.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5. TAB: ASIGNATURAS (FK: carrera_id) */}
          {activeTab === 'asignaturas' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario Nueva Asignatura */}
              <div className="bg-[#F5F5F5] border border-[#DADADA] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#DA291C]" />
                  <h3 className="font-bold text-sm text-slate-900">Agregar Nueva Asignatura</h3>
                </div>
                <form onSubmit={handleCreateAsignatura} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre de la Asignatura *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Cálculo Multivariable"
                      value={formAsignatura.nombre}
                      onChange={(e) => setFormAsignatura({ ...formAsignatura, nombre: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Carrera Perteneciente (FK) *</label>
                    <select
                      required
                      value={formAsignatura.carrera_id}
                      onChange={(e) => setFormAsignatura({ ...formAsignatura, carrera_id: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    >
                      <option value="">-- Seleccionar Carrera --</option>
                      {carreras.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Código</label>
                      <input
                        type="text"
                        placeholder="Ej: MAT-201"
                        value={formAsignatura.codigo}
                        onChange={(e) => setFormAsignatura({ ...formAsignatura, codigo: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Semestre</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={formAsignatura.semestre}
                        onChange={(e) => setFormAsignatura({ ...formAsignatura, semestre: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full py-2 px-4 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : 'Crear Asignatura'}
                  </button>
                </form>
              </div>

              {/* Tabla Asignaturas */}
              <div className="lg:col-span-2 bg-white border border-[#DADADA] rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[#DADADA] flex items-center justify-between gap-3">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Asignaturas Registradas ({asignaturas.length})
                  </h3>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#F5F5F5] border border-[#DADADA] rounded-lg text-[#3D3935] outline-none focus:border-[#DA291C]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F5F5] text-[#3D3935] border-b border-[#DADADA]">
                        <th className="py-2.5 px-4 font-semibold">Código</th>
                        <th className="py-2.5 px-4 font-semibold">Asignatura</th>
                        <th className="py-2.5 px-4 font-semibold">Carrera (FK)</th>
                        <th className="py-2.5 px-4 font-semibold">Sem.</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAEAEA]">
                      {asignaturas
                        .filter(a => a.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || a.codigo?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((a) => (
                          <tr key={a.id} className="hover:bg-[#F5F5F5]/80 transition-colors">
                            <td className="py-2.5 px-4 font-mono font-bold text-[#DA291C]">{a.codigo || `#${String(a.id).substring(0, 6)}`}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{a.nombre}</td>
                            <td className="py-2.5 px-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold text-[11px] border border-emerald-100">
                                <GraduationCap className="w-3 h-3 text-emerald-500" />
                                {a.carrera_nombre || `Carrera #${a.carrera_id}`}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-slate-500">Sem. {a.semestre || 1}</td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Editar asignatura"
                                  onClick={() => handleStartEdit('asignaturas', a)}
                                  className="p-1.5 text-[#3D3935] hover:text-[#DA291C] hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer border border-[#DADADA]"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar asignatura"
                                  onClick={() => handleDelete('asignaturas', a.id, a.nombre)}
                                  className="p-1.5 text-[#DA291C] hover:text-[#B82116] hover:bg-[#DA291C]/10 rounded-lg transition-colors cursor-pointer border border-[#DA291C]/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {asignaturas.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">No hay asignaturas registradas aún.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 6. TAB: DOCENTES / ASIGNACIONES (FK: asignatura_id) */}
          {activeTab === 'docentes' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario Asignación de Docente */}
              <div className="bg-[#F5F5F5] border border-[#DADADA] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#DA291C]" />
                  <h3 className="font-bold text-sm text-slate-900">Asignar Docente a Asignatura</h3>
                </div>
                <form onSubmit={handleCreateDocente} className="space-y-3">
                  {usuariosList.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Seleccionar Usuario Docente</label>
                      <select
                        value={formDocente.docente_id}
                        onChange={(e) => {
                          const u = usuariosList.find(item => String(item.id) === e.target.value);
                          setFormDocente({
                            ...formDocente,
                            docente_id: e.target.value,
                            docente_nombre: u ? u.nombre_completo : formDocente.docente_nombre,
                          });
                        }}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      >
                        <option value="">-- Escribir manualmente o elegir usuario --</option>
                        {usuariosList.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nombre_completo} ({ROLE_LABELS[u.rol] || u.rol})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del Docente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Prof. Andrés Valenzuela"
                      value={formDocente.docente_nombre}
                      onChange={(e) => setFormDocente({ ...formDocente, docente_nombre: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Asignatura (FK) *</label>
                    <select
                      required
                      value={formDocente.asignatura_id}
                      onChange={(e) => setFormDocente({ ...formDocente, asignatura_id: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    >
                      <option value="">-- Seleccionar Asignatura --</option>
                      {asignaturas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.codigo ? `[${a.codigo}] ` : ''}{a.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Sección</label>
                    <input
                      type="text"
                      placeholder="Ej: Sección 1"
                      value={formDocente.seccion}
                      onChange={(e) => setFormDocente({ ...formDocente, seccion: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full py-2 px-4 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : 'Asignar Docente'}
                  </button>
                </form>
              </div>

              {/* Tabla Docentes Asignados */}
              <div className="lg:col-span-2 bg-white border border-[#DADADA] rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[#DADADA] flex items-center justify-between gap-3">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Cátedras Asignadas ({docentes.length})
                  </h3>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-[#F5F5F5] border border-[#DADADA] rounded-lg text-[#3D3935] outline-none focus:border-[#DA291C]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F5F5] text-[#3D3935] border-b border-[#DADADA]">
                        <th className="py-2.5 px-4 font-semibold">ID</th>
                        <th className="py-2.5 px-4 font-semibold">Docente</th>
                        <th className="py-2.5 px-4 font-semibold">Asignatura (FK)</th>
                        <th className="py-2.5 px-4 font-semibold">Sección</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAEAEA]">
                      {docentes
                        .filter(d => d.docente_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || d.asignatura_nombre?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((d) => (
                          <tr key={d.id} className="hover:bg-[#F5F5F5]/80 transition-colors">
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-400 text-[11px]" title={String(d.id)}>
                              {String(d.id).length > 8 ? `${String(d.id).substring(0, 8)}...` : d.id}
                            </td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{d.docente_nombre}</td>
                            <td className="py-2.5 px-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold text-[11px] border border-amber-200">
                                <BookOpen className="w-3 h-3 text-amber-600" />
                                {d.asignatura_nombre || `Asignatura #${d.asignatura_id}`}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 font-medium">{d.seccion || 'Sección 1'}</td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Eliminar asignación"
                                  onClick={() => handleDelete('docente_asignatura', d.id, `${d.docente_nombre} (${d.asignatura_nombre || d.seccion})`)}
                                  className="p-1.5 text-[#DA291C] hover:text-[#B82116] hover:bg-[#DA291C]/10 rounded-lg transition-colors cursor-pointer border border-[#DA291C]/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {docentes.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">No hay docentes asignados aún.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'alumnos' && (
            <div className="p-8 text-center space-y-4 animate-in fade-in duration-150 bg-white rounded-2xl border border-[#DADADA] shadow-sm max-w-2xl mx-auto mt-6">
              <div className="w-16 h-16 rounded-2xl bg-[#DA291C]/10 text-[#DA291C] flex items-center justify-center mx-auto">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-[#3D3935]">Gestión de Alumnos</h3>
              <p className="text-sm text-[#6E6A66] max-w-md mx-auto">
                Importa el archivo Excel con la matrícula oficial de la universidad. El sistema actualizará los alumnos existentes y agregará los nuevos.
              </p>
              <button
                onClick={() => setIsImportarAlumnosOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#DA291C] hover:bg-[#B82116] text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                Importar Alumnos desde Excel
              </button>
            </div>
          )}

        </div>

        {/* FOOTER DEL PANEL */}
        <div className="px-6 py-3.5 bg-[#F5F5F5] border-t border-[#DADADA] flex items-center justify-between text-xs text-[#6E6A66] shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Módulo de Configuración Académica Institucional</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#EAEAEA] hover:bg-[#DADADA] text-[#3D3935] rounded-xl font-bold transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>

        {/* MODAL DE EDICIÓN */}
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3D3935]/55 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl border border-[#DADADA] w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-[#DADADA] flex items-center justify-between bg-[#F5F5F5]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#DA291C]/10 text-[#DA291C]">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#3D3935]">
                      Editar {editingItem.tabla === 'usuarios' ? 'Usuario' : editingItem.tabla === 'sedes' ? 'Sede' : editingItem.tabla === 'campus' ? 'Campus' : editingItem.tabla === 'facultades' ? 'Facultad' : editingItem.tabla === 'carreras' ? 'Carrera' : 'Asignatura'}
                    </h3>
                    <p className="text-[11px] text-[#6E6A66] font-mono">ID: {editingItem.item.id}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="text-[#6E6A66] hover:text-[#3D3935] p-1.5 rounded-lg hover:bg-[#EAEAEA] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                {editingItem.tabla === 'usuarios' ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                      <input
                        type="text"
                        required
                        value={editFormData.nombre_completo || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, nombre_completo: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">RUT</label>
                        <input
                          type="text"
                          value={editFormData.rut || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, rut: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Rol *</label>
                        <select
                          value={editFormData.rol || 'docente'}
                          onChange={(e) => setEditFormData({ ...editFormData, rol: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                        >
                          <option value="docente">Docente</option>
                          <option value="jefe_carrera">Jefe de Carrera</option>
                          <option value="director">Director de Carrera</option>
                          <option value="decano">Decano</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Correo Institucional *</label>
                      <input
                        type="email"
                        required
                        value={editFormData.email || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nueva Contraseña (opcional)</label>
                      <input
                        type="password"
                        minLength={6}
                        placeholder="Dejar en blanco para mantener la actual"
                        value={editFormData.password || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Facultad</label>
                      <select
                        value={editFormData.facultad_id || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, facultad_id: e.target.value, carrera_id: '' })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      >
                        <option value="">-- Sin facultad asignada --</option>
                        {facultades.map((f) => (
                          <option key={f.id} value={f.id}>{f.nombre}</option>
                        ))}
                      </select>
                    </div>
                    {editFormData.rol !== 'decano' && editFormData.rol !== 'admin' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Carrera</label>
                        <select
                          value={editFormData.carrera_id || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, carrera_id: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                        >
                          <option value="">-- Sin carrera asignada --</option>
                          {carreras
                            .filter(cr => !editFormData.facultad_id || String(cr.facultad_id) === String(editFormData.facultad_id))
                            .map((cr) => (
                              <option key={cr.id} value={cr.id}>{cr.nombre}</option>
                            ))}
                        </select>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={editFormData.nombre || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, nombre: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                )}

                {editingItem.tabla === 'sedes' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ciudad</label>
                    <input
                      type="text"
                      placeholder="Ej: Santiago"
                      value={editFormData.ciudad || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, ciudad: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    />
                  </div>
                )}

                {editingItem.tabla === 'campus' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Sede Perteneciente (FK) *</label>
                      <select
                        required
                        value={editFormData.sede_id || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, sede_id: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      >
                        <option value="">-- Seleccionar Sede --</option>
                        {sedes.map((s) => (
                          <option key={s.id} value={s.id}>{s.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Dirección</label>
                      <input
                        type="text"
                        placeholder="Ej: Av. Providencia 123"
                        value={editFormData.direccion || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, direccion: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      />
                    </div>
                  </>
                )}

                {editingItem.tabla === 'facultades' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Campus Perteneciente (FK) *</label>
                    <select
                      required
                      value={editFormData.campus_id || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, campus_id: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                    >
                      <option value="">-- Seleccionar Campus --</option>
                      {campusList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} {c.sede_nombre ? `(${c.sede_nombre})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {editingItem.tabla === 'carreras' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Facultad Perteneciente (FK) *</label>
                      <select
                        required
                        value={editFormData.facultad_id || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, facultad_id: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      >
                        <option value="">-- Seleccionar Facultad --</option>
                        {facultades.map((f) => (
                          <option key={f.id} value={f.id}>{f.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Código de Carrera</label>
                      <input
                        type="text"
                        placeholder="Ej: ICI-01"
                        value={editFormData.codigo || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, codigo: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none uppercase"
                      />
                    </div>
                  </>
                )}

                {editingItem.tabla === 'asignaturas' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Carrera Perteneciente (FK) *</label>
                      <select
                        required
                        value={editFormData.carrera_id || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, carrera_id: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                      >
                        <option value="">-- Seleccionar Carrera --</option>
                        {carreras.map((cr) => (
                          <option key={cr.id} value={cr.id}>{cr.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Código</label>
                        <input
                          type="text"
                          placeholder="Ej: MAT-201"
                          value={editFormData.codigo || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, codigo: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Semestre</label>
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={editFormData.semestre || '1'}
                          onChange={(e) => setEditFormData({ ...editFormData, semestre: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-white border border-[#DADADA] rounded-xl text-[#3D3935] focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#DADADA]">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 text-xs font-semibold text-[#6E6A66] hover:text-[#3D3935] hover:bg-[#F5F5F5] rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-4 py-2 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isUpdating ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
        {itemAEliminar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3D3935]/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl border border-[#DADADA] w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 bg-[#DA291C] text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-white/90 shrink-0" />
                  <h3 className="font-bold text-sm">Confirmar Eliminación</h3>
                </div>
                <button
                  type="button"
                  disabled={isDeletingItem}
                  onClick={() => setItemAEliminar(null)}
                  className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-[#3D3935] leading-relaxed">
                  ¿Estás seguro de que deseas eliminar{' '}
                  <strong className="text-[#3D3935]">&ldquo;{itemAEliminar.nombre}&rdquo;</strong>? Esta acción no se puede deshacer.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DADADA]">
                  <button
                    type="button"
                    disabled={isDeletingItem}
                    onClick={() => setItemAEliminar(null)}
                    className="px-4 py-2 text-xs font-semibold text-[#6E6A66] hover:bg-[#F5F5F5] rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingItem}
                    onClick={confirmDeleteItem}
                    className="px-4 py-2 bg-[#DA291C] hover:bg-[#B82116] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isDeletingItem ? 'Eliminando...' : 'Eliminar Definitivamente'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isImportarAlumnosOpen && (
          <ImportarAlumnos onClose={() => setIsImportarAlumnosOpen(false)} />
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { TeacherDashboard } from './components/TeacherDashboard';
import { Login } from './components/Login';
import { authFetch, getAuthToken } from './utils/authFetch';

export interface UsuarioSesion {
  id: string;
  rut?: string | null;
  nombre: string;
  email: string;
  rol: 'admin' | 'decano' | 'jefe_carrera' | 'director' | 'docente';
  facultad_id?: string | null;
  carrera_id?: string | null;
  facultad_nombre?: string | null;
  carrera_nombre?: string | null;
}

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargando, setCargando] = useState(true);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('omr_token');
    localStorage.removeItem('omr_user');
    localStorage.removeItem('pruebasDB_cache');
    setUsuario(null);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      handleLogout();
    };
    window.addEventListener('omr:unauthorized', onUnauthorized);
    return () => window.removeEventListener('omr:unauthorized', onUnauthorized);
  }, [handleLogout]);

  useEffect(() => {
    let active = true;

    const verificarSesion = async () => {
      const token = getAuthToken();
      const userGuardado = localStorage.getItem('omr_user');

      if (!token) {
        localStorage.removeItem('omr_user');
        if (active) setCargando(false);
        return;
      }

      if (userGuardado) {
        try {
          setUsuario(JSON.parse(userGuardado));
        } catch {
          localStorage.removeItem('omr_user');
        }
      }

      try {
        const res = await authFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data?.usuario && active) {
            setUsuario(data.usuario);
            localStorage.setItem('omr_user', JSON.stringify(data.usuario));
          }
        } else if (res.status === 401) {
          if (active) handleLogout();
        }
      } catch {
        // Mantener sesión local si el servidor está reiniciando brevemente
      } finally {
        if (active) setCargando(false);
      }
    };

    verificarSesion();
    return () => {
      active = false;
    };
  }, [handleLogout]);

  const handleLoginSuccess = (user: UsuarioSesion) => {
    localStorage.removeItem('pruebasDB_cache');
    setUsuario(user);
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#F3F3F3] flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 border-4 border-[#DA291C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!usuario) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="relative">
      <TeacherDashboard usuario={usuario} onLogout={handleLogout} />
    </div>
  );
}
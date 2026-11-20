import React, { useState } from 'react';
import { Lock, Mail, Loader2, LogIn } from 'lucide-react';
import LottieRaw from 'lottie-react';
import uaAnimation from '../assets/UA_SCAN.json'; // Importamos la animación

const Lottie = ((LottieRaw as any)?.default ?? LottieRaw) as typeof LottieRaw;

export const Login: React.FC<{ onLoginSuccess: (user: any) => void }> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar sesión');
      }

      localStorage.setItem('omr_token', data.token);
      localStorage.setItem('omr_user', JSON.stringify(data.usuario));
      
      onLoginSuccess(data.usuario);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F3F3F3] p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-[#DADADA] overflow-hidden">
        <div className="h-1.5 w-full bg-[#DA291C]" />
        <div className="p-8">
          {/* Identidad institucional con logo + preservación de animación inicial */}
          <div className="flex items-center justify-center gap-3 mb-4 pb-4 border-b border-[#DADADA]">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_xa17yzxa17yzxa17_168ff4f6.jpeg"
              alt="Logo Universidad Autónoma de Chile"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-xl object-cover border border-[#DADADA] shadow-xs shrink-0"
            />
            <div className="text-left">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#DA291C]">
                Universidad Autónoma de Chile
              </p>
              <h1 className="text-2xl font-extrabold text-[#3D3935] leading-tight tracking-tight">
                Eval<span className="text-[#DA291C]">UA</span>
              </h1>
            </div>
          </div>

          <div className="text-center mb-5">
            {/* Animación inicial Lottie preservada */}
            <div className="w-36 h-36 mx-auto">
              <Lottie animationData={uaAnimation} loop={true} />
            </div>
            <p className="text-[#3D3935]/75 text-xs mt-1 font-medium tracking-wide">
              Evaluación y lectura automática.
            </p>
          </div>

          {error && (
            <div className="bg-[#DA291C]/10 border border-[#DA291C]/30 text-[#DA291C] p-3 rounded-lg text-sm mb-4 text-center font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#3D3935] mb-1">Correo Institucional</label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#3D3935]/45" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-[#DADADA] rounded-lg text-[#3D3935] placeholder:text-[#3D3935]/40 focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none transition-colors"
                  placeholder="admin@uautonoma.cl"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#3D3935] mb-1">Contraseña</label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#3D3935]/45" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-[#DADADA] rounded-lg text-[#3D3935] placeholder:text-[#3D3935]/40 focus:ring-2 focus:ring-[#DA291C]/20 focus:border-[#DA291C] outline-none transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#DA291C] hover:bg-[#B82116] text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-4 cursor-pointer shadow-sm"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {isLoading ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#DADADA] text-xs text-[#3D3935]/75 space-y-1 bg-[#F5F5F5] rounded-xl p-3">
            <p className="font-semibold text-[#3D3935]">Acceso institucional (Base de Datos)</p>
            <p>
              Administrador inicial: <span className="font-mono text-[#3D3935]">admin@uautonoma.cl</span> /{' '}
              <span className="font-mono text-[#3D3935]">Admin123!</span>
            </p>
            <p className="text-[11px] text-[#3D3935]/60">
              Desde Administración &rarr; Usuarios y Roles podrás crear docentes, jefes de carrera y decanos.
            </p>
          </div>
        </div>
      </div>

      <footer className="mt-6 max-w-md w-full text-center text-[11px] text-[#3D3935]/55 leading-relaxed">
        <p className="inline-flex items-center justify-center gap-2">
          <span className="font-semibold text-[#3D3935]/75">EvalUA</span>
          <span className="text-[#3D3935]/30">·</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/70 border border-[#DADADA]/80 text-[#3D3935]/65">
            v1.0.0
          </span>
        </p>
        <p className="mt-1">
          Desarrollado por Departamento TIC, Sede Talca · Universidad Autónoma de Chile
        </p>
      </footer>
    </div>
  );
};
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
dotenv.config();

console.log("🔗 URL DB ACTUAL:", process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@') : "NO HAY URL");

import { isDbConfigured, safeQuery, pool } from './db.ts';
import pg from 'pg';
const { Pool } = pg;

const app = express();
app.use(cors());

// Aumentamos el límite a 50 Megabytes para aceptar la planilla de alumnos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

import fs from 'fs';
import path from 'path';

// Archivo de respaldo para persistencia entre reinicios si Neon no está conectado
const DB_BACKUP_FILE = path.join(process.cwd(), '.pruebas_db.json');

const cargarMemoria = (): Record<string, any> => {
  try {
    if (fs.existsSync(DB_BACKUP_FILE)) {
      const contenido = fs.readFileSync(DB_BACKUP_FILE, 'utf-8');
      return JSON.parse(contenido);
    }
  } catch (e) {
    console.warn('Nota: Creando nuevo almacenamiento local de pruebas');
  }
  return {};
};

const guardarMemoria = (data: Record<string, any>) => {
  try {
    fs.writeFileSync(DB_BACKUP_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Error guardando respaldo de pruebas:', e);
  }
};

const memoriaPruebas: Record<string, any> = cargarMemoria();

const calcularNotaBackend = (aciertos: number, total: number, exigenciaRaw: number): number => {
  if (total <= 0 || Number.isNaN(aciertos) || Number.isNaN(total) || Number.isNaN(exigenciaRaw)) {
    return 1.0;
  }
  const exigencia = exigenciaRaw > 1 ? exigenciaRaw / 100 : exigenciaRaw;
  const aciertosClamped = Math.max(0, Math.min(total, aciertos));

  if (exigencia <= 0) {
    return Math.round((4.0 + 3.0 * (aciertosClamped / total)) * 10) / 10;
  }
  if (exigencia >= 1) {
    return aciertosClamped >= total ? 7.0 : 1.0;
  }

  const puntajeAprobacion = total * exigencia;
  let notaCalculada: number;

  if (aciertosClamped < puntajeAprobacion) {
    notaCalculada = 1.0 + 3.0 * (aciertosClamped / puntajeAprobacion);
  } else {
    notaCalculada = 4.0 + 3.0 * ((aciertosClamped - puntajeAprobacion) / (total - puntajeAprobacion));
  }

  const notaLimitada = Math.max(1.0, Math.min(7.0, notaCalculada));
  return Math.round(notaLimitada * 10) / 10;
};

const LETRAS_FORMAS_SERVER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const obtenerPautaDeForma = (pautaCompleta: any, formaRaw: string): Record<string, any> => {
  if (!pautaCompleta || typeof pautaCompleta !== 'object' || Array.isArray(pautaCompleta)) {
    return {};
  }
  const forma = String(formaRaw || 'A').trim().toUpperCase();
  const keys = Object.keys(pautaCompleta);
  const esPorForma = keys.some((k) => LETRAS_FORMAS_SERVER.includes(k.toUpperCase()) && typeof pautaCompleta[k] === 'object');
  if (esPorForma) {
    return pautaCompleta[forma] || pautaCompleta[forma.toLowerCase()] || pautaCompleta['A'] || pautaCompleta['a'] || {};
  }
  return pautaCompleta;
};

const parsePreguntaConfig = (configRaw: any): {
  correcta: string | null;
  puntos: number;
  anulada: boolean;
  tipo: 'seleccion' | 'desarrollo';
} => {
  if (typeof configRaw === 'string') {
    const clean = configRaw.trim().toUpperCase();
    return { correcta: clean || null, puntos: 1, anulada: false, tipo: 'seleccion' };
  }
  if (configRaw && typeof configRaw === 'object') {
    const puntosNum = Number(configRaw.puntos);
    const puntos = Number.isFinite(puntosNum) && puntosNum > 0 ? puntosNum : 1;
    const tipo = configRaw.tipo === 'desarrollo' ? 'desarrollo' : 'seleccion';
    const anulada = Boolean(configRaw.anulada);
    const correcta = typeof configRaw.correcta === 'string' && configRaw.correcta.trim() !== ''
      ? configRaw.correcta.trim().toUpperCase()
      : null;
    return { correcta, puntos, anulada, tipo };
  }
  return { correcta: null, puntos: 1, anulada: false, tipo: 'seleccion' };
};

const evaluarResultadoFila = (fila: any, pruebaRow: any) => {
  const pautaCompleta = pruebaRow?.pauta_respuestas || {};
  const cantidadPreguntas = Number(pruebaRow?.cantidad_preguntas) || 0;
  const rawExigencia = Number(pruebaRow?.nivel_exigencia ?? 0.6);
  const nivelExigencia = rawExigencia > 1 ? rawExigencia / 100 : rawExigencia;

  const forma = String(fila?.forma || 'A').trim().toUpperCase() || 'A';
  const pauta = obtenerPautaDeForma(pautaCompleta, forma);
  const respArray = Array.isArray(fila?.respuestas_alumno)
    ? fila.respuestas_alumno
    : Array.isArray(fila?.respuestas)
    ? fila.respuestas
    : [];
  const puntajesManuales = (fila?.puntajes_manuales && typeof fila.puntajes_manuales === 'object')
    ? fila.puntajes_manuales
    : {};

  let puntajeObtenido = 0;
  let puntajeTotalPosible = 0;

  const celdas = Array.from({ length: cantidadPreguntas }, (_, idx) => {
    const numPregunta = idx + 1;
    const marcada = String(respArray[idx] || '-').trim().toUpperCase() || '-';
    const cfg = parsePreguntaConfig(pauta[String(numPregunta)] ?? pauta[numPregunta]);

    if (!cfg.anulada) {
      puntajeTotalPosible += cfg.puntos;
    }

    const rawManual = puntajesManuales[String(numPregunta)] ?? puntajesManuales[numPregunta];
    const hasManual = rawManual !== undefined && rawManual !== null && String(rawManual).trim() !== '';
    const manualParsed = hasManual ? Number(rawManual) : NaN;
    const puntajeManual = Number.isFinite(manualParsed)
      ? Math.max(0, Math.min(cfg.puntos, manualParsed))
      : null;

    let estado: 'correcta' | 'incorrecta' | 'omitida' | 'multiple' | 'anulada' | 'desarrollo';
    if (cfg.anulada) {
      estado = 'anulada';
    } else if (cfg.tipo === 'desarrollo') {
      estado = 'desarrollo';
      if (puntajeManual !== null) {
        puntajeObtenido += puntajeManual;
      }
    } else if (marcada === '*') {
      estado = 'multiple';
    } else if (marcada === '-' || marcada === '') {
      estado = 'omitida';
    } else if (cfg.correcta && marcada === cfg.correcta) {
      estado = 'correcta';
      puntajeObtenido += cfg.puntos;
    } else {
      estado = 'incorrecta';
    }

    return {
      pregunta: numPregunta,
      marcada,
      correcta: cfg.correcta,
      estado,
      puntos: cfg.puntos,
      puntaje_manual: puntajeManual,
    };
  });

  const puntajeObtenidoRedondeado = Number(puntajeObtenido.toFixed(2));
  const puntajeTotalRedondeado = Number(puntajeTotalPosible.toFixed(2));
  const tienePauta = Object.keys(pauta).length > 0;
  const notaFinal = tienePauta && puntajeTotalRedondeado > 0
    ? calcularNotaBackend(puntajeObtenidoRedondeado, puntajeTotalRedondeado, nivelExigencia)
    : 1.0;

  return {
    forma,
    puntajeObtenido: puntajeObtenidoRedondeado,
    puntajeTotalPosible: puntajeTotalRedondeado,
    notaFinal,
    celdas,
  };
};

const recalcularResultadosPrueba = async (pruebaRow: any) => {
  if (!isDbConfigured || !pruebaRow?.id) return;

  const resRows = await pool.query(
    'SELECT id, forma, respuestas_alumno, puntajes_manuales FROM resultados WHERE prueba_id = $1',
    [pruebaRow.id]
  );

  for (const row of resRows.rows) {
    const evalRow = evaluarResultadoFila(row, pruebaRow);
    await pool.query(
      'UPDATE resultados SET puntaje_obtenido = $1, nota = $2 WHERE id = $3',
      [evalRow.puntajeObtenido, evalRow.notaFinal, row.id]
    );
  }
};

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_temporal_omr_2026';

type UserRole = 'admin' | 'decano' | 'jefe_carrera' | 'director' | 'docente';
const VALID_ROLES: UserRole[] = ['admin', 'decano', 'jefe_carrera', 'director', 'docente'];

interface AuthUser {
  id: string;
  rut?: string | null;
  nombre: string;
  email: string;
  rol: UserRole;
  facultad_id: string | null;
  carrera_id: string | null;
  facultad_nombre?: string | null;
  carrera_nombre?: string | null;
}

interface AuthRequest extends express.Request {
  user?: AuthUser;
}

const isUuidString = (val: unknown): val is string =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

const parseForeignId = (val: unknown): string | number | null => {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;
  return /^\d+$/.test(str) ? Number(str) : str;
};

const cargarUsuarioPorId = async (userId: string): Promise<AuthUser | null> => {
  if (!isDbConfigured) return null;
  const res = await pool.query(
    `SELECT u.id::text AS id, u.rut, u.nombre_completo, u.email, u.rol::text AS rol,
            u.facultad_id::text AS facultad_id, u.carrera_id::text AS carrera_id,
            f.nombre AS facultad_nombre, c.nombre AS carrera_nombre
     FROM usuarios u
     LEFT JOIN facultades f ON f.id = u.facultad_id
     LEFT JOIN carreras c ON c.id = u.carrera_id
     WHERE u.id = $1::uuid
     LIMIT 1`,
    [userId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    rut: row.rut,
    nombre: row.nombre_completo,
    email: row.email,
    rol: (VALID_ROLES.includes(row.rol) ? row.rol : 'docente') as UserRole,
    facultad_id: row.facultad_id || null,
    carrera_id: row.carrera_id || null,
    facultad_nombre: row.facultad_nombre || null,
    carrera_nombre: row.carrera_nombre || null,
  };
};

const authenticateToken = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Sesión no iniciada o token requerido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (isDbConfigured && decoded?.id && isUuidString(String(decoded.id))) {
      const dbUser = await cargarUsuarioPorId(String(decoded.id));
      if (!dbUser) {
        return res.status(401).json({ error: 'Usuario no válido o eliminado.' });
      }
      req.user = dbUser;
    } else {
      req.user = {
        id: String(decoded.id || ''),
        nombre: String(decoded.nombre || decoded.email || 'Usuario'),
        email: String(decoded.email || ''),
        rol: (VALID_ROLES.includes(decoded.rol) ? decoded.rol : 'docente') as UserRole,
        facultad_id: decoded.facultad_id ? String(decoded.facultad_id) : null,
        carrera_id: decoded.carrera_id ? String(decoded.carrera_id) : null,
      };
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión expirada o token inválido.' });
  }
};

const requireRoles = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
    }
    next();
  };
};

const buildPruebaScopeSql = (user: AuthUser, alias = 'p', startIdx = 1): { sql: string; params: any[] } => {
  if (user.rol === 'admin') {
    return { sql: '1=1', params: [] };
  }

  if (user.rol === 'docente') {
    const p1 = `$${startIdx}`;
    const p2 = `$${startIdx + 1}`;
    return {
      sql: `(
        ${alias}.docente_id = ${p1}::uuid
        OR (${alias}.docente_id IS NULL AND LOWER(TRIM(COALESCE(${alias}.nombre_docente, ''))) = LOWER(TRIM(${p2})))
        OR EXISTS (
          SELECT 1 FROM docente_asignatura da
          WHERE da.asignatura_id = ${alias}.asignatura_id
            AND (da.docente_id = ${p1}::uuid OR LOWER(TRIM(COALESCE(da.docente_nombre, ''))) = LOWER(TRIM(${p2})))
        )
        OR EXISTS (
          SELECT 1 FROM asignaturas asg_c
          JOIN cursos cu ON cu.carrera_id = asg_c.carrera_id
          WHERE asg_c.id = ${alias}.asignatura_id AND cu.docente_id = ${p1}::uuid
        )
      )`,
      params: [user.id, user.nombre],
    };
  }

  if (user.rol === 'jefe_carrera' || user.rol === 'director') {
    if (!user.carrera_id || !isUuidString(user.carrera_id)) {
      return { sql: '1=0', params: [] };
    }
    const p1 = `$${startIdx}`;
    return {
      sql: `(
        EXISTS (SELECT 1 FROM asignaturas a_jc WHERE a_jc.id = ${alias}.asignatura_id AND a_jc.carrera_id = ${p1}::uuid)
        OR EXISTS (SELECT 1 FROM usuarios u_jc WHERE u_jc.id = ${alias}.docente_id AND u_jc.carrera_id = ${p1}::uuid)
        OR EXISTS (
          SELECT 1 FROM usuarios u_jc
          WHERE ${alias}.docente_id IS NULL
            AND LOWER(TRIM(COALESCE(${alias}.nombre_docente, ''))) = LOWER(TRIM(u_jc.nombre_completo))
            AND u_jc.carrera_id = ${p1}::uuid
        )
        OR EXISTS (
          SELECT 1 FROM asignaturas a_jc
          WHERE ${alias}.asignatura_id IS NULL
            AND LOWER(TRIM(COALESCE(${alias}.asignatura_nombre, ''))) = LOWER(TRIM(a_jc.nombre))
            AND a_jc.carrera_id = ${p1}::uuid
        )
      )`,
      params: [user.carrera_id],
    };
  }

  if (user.rol === 'decano') {
    if (!user.facultad_id || !isUuidString(user.facultad_id)) {
      return { sql: '1=0', params: [] };
    }
    const p1 = `$${startIdx}`;
    return {
      sql: `(
        EXISTS (
          SELECT 1 FROM asignaturas a_dec
          JOIN carreras ca_dec ON ca_dec.id = a_dec.carrera_id
          WHERE a_dec.id = ${alias}.asignatura_id AND ca_dec.facultad_id = ${p1}::uuid
        )
        OR EXISTS (
          SELECT 1 FROM usuarios u_dec
          LEFT JOIN carreras ca_dec ON ca_dec.id = u_dec.carrera_id
          WHERE u_dec.id = ${alias}.docente_id
            AND (u_dec.facultad_id = ${p1}::uuid OR ca_dec.facultad_id = ${p1}::uuid)
        )
        OR EXISTS (
          SELECT 1 FROM usuarios u_dec
          LEFT JOIN carreras ca_dec ON ca_dec.id = u_dec.carrera_id
          WHERE ${alias}.docente_id IS NULL
            AND LOWER(TRIM(COALESCE(${alias}.nombre_docente, ''))) = LOWER(TRIM(u_dec.nombre_completo))
            AND (u_dec.facultad_id = ${p1}::uuid OR ca_dec.facultad_id = ${p1}::uuid)
        )
        OR EXISTS (
          SELECT 1 FROM asignaturas a_dec
          JOIN carreras ca_dec ON ca_dec.id = a_dec.carrera_id
          WHERE ${alias}.asignatura_id IS NULL
            AND LOWER(TRIM(COALESCE(${alias}.asignatura_nombre, ''))) = LOWER(TRIM(a_dec.nombre))
            AND ca_dec.facultad_id = ${p1}::uuid
        )
      )`,
      params: [user.facultad_id],
    };
  }

  return { sql: '1=0', params: [] };
};

const canAccessPrueba = async (user: AuthUser, pruebaId: string): Promise<boolean> => {
  if (user.rol === 'admin') return true;
  if (!isDbConfigured) return true;
  if (!isUuidString(pruebaId) && !/^\d+$/.test(pruebaId)) return false;

  const scope = buildPruebaScopeSql(user, 'p', 2);
  const res = await pool.query(
    `SELECT 1 FROM pruebas p WHERE p.id = $1 AND ${scope.sql} LIMIT 1`,
    [/^\d+$/.test(pruebaId) ? Number(pruebaId) : pruebaId, ...scope.params]
  );
  return res.rows.length > 0;
};

// Inicialización segura de esquema y usuario administrador inicial en Neon
const bootstrapDatabase = async () => {
  if (!isDbConfigured) return;
  const ddlStatements = [
    `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'decano'`,
    `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'jefe_carrera'`,
    `ALTER TABLE pruebas ADD COLUMN IF NOT EXISTS nivel_exigencia NUMERIC DEFAULT 0.6`,
    `ALTER TABLE pruebas ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE pruebas ADD COLUMN IF NOT EXISTS docente_id UUID`,
    `ALTER TABLE resultados ADD COLUMN IF NOT EXISTS puntajes_manuales JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE resultados ALTER COLUMN puntaje_obtenido TYPE NUMERIC USING puntaje_obtenido::numeric`,
  ];

  for (const sql of ddlStatements) {
    try {
      await pool.query(sql);
    } catch (err: any) {
      console.warn('Nota DDL bootstrap:', err?.message || err);
    }
  }

  try {
    const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM usuarios');
    const total = countRes.rows[0]?.total ?? 0;
    if (total === 0) {
      const hash = await bcrypt.hash('Admin123!', 10);
      await pool.query(
        `INSERT INTO usuarios (rut, nombre_completo, email, password_hash, rol)
         VALUES ($1, $2, $3, $4, 'admin')
         ON CONFLICT DO NOTHING`,
        ['00000000-0', 'Administrador General', 'admin@uautonoma.cl', hash]
      );
      console.log('👤 Usuario administrador inicial creado: admin@uautonoma.cl');
    }
  } catch (err: any) {
    console.warn('Nota bootstrap usuario admin:', err?.message || err);
  }
};

const bootstrapReady = bootstrapDatabase();

app.post('/api/auth/login', async (req, res) => {
  await bootstrapReady;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos." });
  }

  try {
    const result = await pool.query(
      `SELECT u.*, f.nombre AS facultad_nombre, c.nombre AS carrera_nombre
       FROM usuarios u
       LEFT JOIN facultades f ON f.id = u.facultad_id
       LEFT JOIN carreras c ON c.id = u.carrera_id
       WHERE LOWER(u.email) = LOWER(TRIM($1))
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const usuario = result.rows[0];
    if (!usuario.password_hash) {
      return res.status(401).json({ error: "Esta cuenta aún no tiene contraseña configurada." });
    }

    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        rol: usuario.rol,
        facultad_id: usuario.facultad_id || null,
        carrera_id: usuario.carrera_id || null,
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      usuario: {
        id: usuario.id,
        rut: usuario.rut,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        rol: usuario.rol,
        facultad_id: usuario.facultad_id || null,
        carrera_id: usuario.carrera_id || null,
        facultad_nombre: usuario.facultad_nombre || null,
        carrera_nombre: usuario.carrera_nombre || null,
      }
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.get('/api/auth/me', authenticateToken, async (req: AuthRequest, res) => {
  res.json({ success: true, usuario: req.user });
});

app.post('/api/auth/change-password', authenticateToken, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }
  try {
    const userRes = await pool.query('SELECT id, password_hash FROM usuarios WHERE id = $1::uuid', [req.user!.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const valid = await bcrypt.compare(String(currentPassword || ''), userRes.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    }
    const newHash = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2::uuid', [newHash, req.user!.id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
});

// ========================================================
// GESTIÓN DE USUARIOS Y ROLES (/api/usuarios)
// ========================================================
app.get('/api/usuarios', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let whereSql = '1=1';
    const params: any[] = [];

    if (user.rol === 'decano') {
      if (!user.facultad_id) return res.json([]);
      whereSql = `(u.facultad_id = $1::uuid OR c.facultad_id = $1::uuid)`;
      params.push(user.facultad_id);
    } else if (user.rol === 'jefe_carrera' || user.rol === 'director') {
      if (!user.carrera_id) return res.json([]);
      whereSql = `u.carrera_id = $1::uuid`;
      params.push(user.carrera_id);
    } else if (user.rol === 'docente') {
      whereSql = `u.id = $1::uuid`;
      params.push(user.id);
    }

    const result = await pool.query(
      `SELECT u.id::text AS id, u.rut, u.nombre_completo, u.email, u.rol::text AS rol,
              u.facultad_id::text AS facultad_id, u.carrera_id::text AS carrera_id,
              u.creado_en,
              COALESCE(f.nombre, fc.nombre) AS facultad_nombre,
              c.nombre AS carrera_nombre
       FROM usuarios u
       LEFT JOIN facultades f ON f.id = u.facultad_id
       LEFT JOIN carreras c ON c.id = u.carrera_id
       LEFT JOIN facultades fc ON fc.id = c.facultad_id
       WHERE ${whereSql}
       ORDER BY u.creado_en DESC, u.nombre_completo ASC`,
      params
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error GET /api/usuarios:', error);
    res.status(500).json({ error: 'Error consultando usuarios.' });
  }
});

app.post('/api/usuarios', authenticateToken, requireRoles('admin'), async (req: AuthRequest, res) => {
  const { rut, nombre_completo, email, password, rol, facultad_id, carrera_id } = req.body;

  if (!nombre_completo || !email || !password) {
    return res.status(400).json({ error: 'Nombre completo, correo y contraseña son requeridos.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  const rolVal = VALID_ROLES.includes(rol) ? rol : 'docente';

  try {
    const emailTrimmed = String(email).trim().toLowerCase();
    const dup = await pool.query('SELECT 1 FROM usuarios WHERE LOWER(email) = $1 LIMIT 1', [emailTrimmed]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un usuario registrado con ese correo.' });
    }

    let facId = facultad_id && isUuidString(String(facultad_id)) ? String(facultad_id).trim() : null;
    const carId = carrera_id && isUuidString(String(carrera_id)) ? String(carrera_id).trim() : null;

    if (carId && !facId) {
      const carRes = await pool.query('SELECT facultad_id::text AS facultad_id FROM carreras WHERE id = $1::uuid', [carId]);
      if (carRes.rows.length > 0 && carRes.rows[0].facultad_id) {
        facId = carRes.rows[0].facultad_id;
      }
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const insertRes = await pool.query(
      `INSERT INTO usuarios (rut, nombre_completo, email, password_hash, rol, facultad_id, carrera_id)
       VALUES ($1, $2, $3, $4, $5::user_role, $6::uuid, $7::uuid)
       RETURNING id::text AS id, rut, nombre_completo, email, rol::text AS rol, facultad_id::text AS facultad_id, carrera_id::text AS carrera_id, creado_en`,
      [
        rut ? String(rut).trim() : null,
        String(nombre_completo).trim(),
        emailTrimmed,
        passwordHash,
        rolVal,
        facId,
        carId,
      ]
    );

    const created = insertRes.rows[0];
    const enriched = await cargarUsuarioPorId(created.id);
    res.status(201).json({ ...created, facultad_nombre: enriched?.facultad_nombre || null, carrera_nombre: enriched?.carrera_nombre || null });
  } catch (error: any) {
    console.error('Error POST /api/usuarios:', error);
    res.status(500).json({ error: error.message || 'Error al crear usuario.' });
  }
});

app.put('/api/usuarios/:id', authenticateToken, requireRoles('admin'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!isUuidString(id)) {
    return res.status(400).json({ error: 'ID de usuario inválido.' });
  }

  const { rut, nombre_completo, email, password, rol, facultad_id, carrera_id } = req.body;
  if (!nombre_completo || !email) {
    return res.status(400).json({ error: 'Nombre completo y correo son requeridos.' });
  }
  const rolVal = VALID_ROLES.includes(rol) ? rol : 'docente';

  try {
    const emailTrimmed = String(email).trim().toLowerCase();
    const dup = await pool.query(
      'SELECT 1 FROM usuarios WHERE LOWER(email) = $1 AND id <> $2::uuid LIMIT 1',
      [emailTrimmed, id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Otro usuario ya utiliza ese correo electrónico.' });
    }

    if (req.user!.id === id && rolVal !== 'admin') {
      const adminsRes = await pool.query(`SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'admin'`);
      if ((adminsRes.rows[0]?.total ?? 0) <= 1) {
        return res.status(400).json({ error: 'No puedes quitar el rol administrador al único administrador del sistema.' });
      }
    }

    let facId = facultad_id && isUuidString(String(facultad_id)) ? String(facultad_id).trim() : null;
    const carId = carrera_id && isUuidString(String(carrera_id)) ? String(carrera_id).trim() : null;

    if (carId && !facId) {
      const carRes = await pool.query('SELECT facultad_id::text AS facultad_id FROM carreras WHERE id = $1::uuid', [carId]);
      if (carRes.rows.length > 0 && carRes.rows[0].facultad_id) {
        facId = carRes.rows[0].facultad_id;
      }
    }

    let query: string;
    let values: any[];

    if (password && String(password).trim().length > 0) {
      if (String(password).trim().length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }
      const passwordHash = await bcrypt.hash(String(password).trim(), 10);
      query = `
        UPDATE usuarios
        SET rut = $1, nombre_completo = $2, email = $3, rol = $4::user_role,
            facultad_id = $5::uuid, carrera_id = $6::uuid, password_hash = $7
        WHERE id = $8::uuid
        RETURNING id::text AS id, rut, nombre_completo, email, rol::text AS rol, facultad_id::text AS facultad_id, carrera_id::text AS carrera_id, creado_en`;
      values = [
        rut ? String(rut).trim() : null,
        String(nombre_completo).trim(),
        emailTrimmed,
        rolVal,
        facId,
        carId,
        passwordHash,
        id,
      ];
    } else {
      query = `
        UPDATE usuarios
        SET rut = $1, nombre_completo = $2, email = $3, rol = $4::user_role,
            facultad_id = $5::uuid, carrera_id = $6::uuid
        WHERE id = $7::uuid
        RETURNING id::text AS id, rut, nombre_completo, email, rol::text AS rol, facultad_id::text AS facultad_id, carrera_id::text AS carrera_id, creado_en`;
      values = [
        rut ? String(rut).trim() : null,
        String(nombre_completo).trim(),
        emailTrimmed,
        rolVal,
        facId,
        carId,
        id,
      ];
    }

    const updateRes = await pool.query(query, values);
    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const updated = updateRes.rows[0];
    const enriched = await cargarUsuarioPorId(updated.id);
    res.json({ ...updated, facultad_nombre: enriched?.facultad_nombre || null, carrera_nombre: enriched?.carrera_nombre || null });
  } catch (error: any) {
    console.error('Error PUT /api/usuarios/:id:', error);
    res.status(500).json({ error: error.message || 'Error al actualizar usuario.' });
  }
});

app.delete('/api/usuarios/:id', authenticateToken, requireRoles('admin'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!isUuidString(id)) {
    return res.status(400).json({ error: 'ID de usuario inválido.' });
  }
  if (req.user!.id === id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario mientras tienes la sesión activa.' });
  }

  try {
    await pool.query('UPDATE pruebas SET docente_id = NULL WHERE docente_id = $1::uuid', [id]).catch(() => {});
    await pool.query('UPDATE cursos SET docente_id = NULL WHERE docente_id = $1::uuid', [id]).catch(() => {});
    await pool.query('UPDATE docente_asignatura SET docente_id = NULL WHERE docente_id = $1::uuid', [id]).catch(() => {});

    const delRes = await pool.query('DELETE FROM usuarios WHERE id = $1::uuid RETURNING id::text AS id', [id]);
    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ success: true, id });
  } catch (error: any) {
    console.error('Error DELETE /api/usuarios/:id:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar usuario.' });
  }
});

app.post('/api/pruebas', authenticateToken, async (req: AuthRequest, res) => {
  const {
    nombre_docente,
    docente_id,
    asignatura,
    asignatura_id,
    nombre_prueba,
    cantidad_preguntas,
    cantidad_alternativas,
    cantidad_formas,
    pauta_respuestas
  } = req.body;

  const currentUser = req.user!;
  const parsedPreguntas = Number.parseInt(String(cantidad_preguntas ?? ''), 10);
  const numPreguntas = Number.isFinite(parsedPreguntas) && parsedPreguntas > 0 ? Math.min(255, parsedPreguntas) : 30;
  const parsedAlternativas = Number.parseInt(String(cantidad_alternativas ?? ''), 10);
  const numAlternativas = parsedAlternativas === 4 || parsedAlternativas === 5 ? parsedAlternativas : 5;
  const parsedFormas = Number.parseInt(String(cantidad_formas ?? ''), 10);
  const numFormas = Number.isFinite(parsedFormas) && parsedFormas >= 1 && parsedFormas <= 4 ? parsedFormas : 1;

  let targetDocenteId: string | null = currentUser.id;
  let targetDocenteNombre = currentUser.nombre;

  if (currentUser.rol === 'admin' && docente_id && isUuidString(String(docente_id))) {
    const docUser = await cargarUsuarioPorId(String(docente_id));
    if (docUser) {
      targetDocenteId = docUser.id;
      targetDocenteNombre = docUser.nombre;
    }
  } else if (currentUser.rol === 'admin' && nombre_docente) {
    targetDocenteNombre = String(nombre_docente).trim();
  }

  let resolvedAsigId: string | null = asignatura_id && isUuidString(String(asignatura_id)) ? String(asignatura_id).trim() : null;
  let resolvedAsigNombre = asignatura ? String(asignatura).trim() : '';

  if (isDbConfigured) {
    try {
      if (resolvedAsigId) {
        const asigRow = await pool.query('SELECT id::text AS id, nombre FROM asignaturas WHERE id = $1::uuid LIMIT 1', [resolvedAsigId]);
        if (asigRow.rows.length > 0) {
          resolvedAsigNombre = asigRow.rows[0].nombre;
        }
      } else if (resolvedAsigNombre) {
        const asigByName = await pool.query(
          'SELECT id::text AS id, nombre FROM asignaturas WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1',
          [resolvedAsigNombre]
        );
        if (asigByName.rows.length > 0) {
          resolvedAsigId = asigByName.rows[0].id;
          resolvedAsigNombre = asigByName.rows[0].nombre;
        }
      }
    } catch {}
  }

  if (!resolvedAsigNombre) resolvedAsigNombre = 'General';

  const mockId = `PRU-${Date.now()}`;
  memoriaPruebas[mockId] = {
    id: mockId,
    docente_id: targetDocenteId,
    nombre_docente: targetDocenteNombre,
    asignatura_id: resolvedAsigId,
    asignatura_nombre: resolvedAsigNombre,
    nombre: nombre_prueba,
    cantidad_preguntas: numPreguntas,
    cantidad_alternativas: numAlternativas,
    cantidad_formas: numFormas,
    pauta_respuestas: pauta_respuestas || {},
    nivel_exigencia: 0.6,
    creado_en: new Date().toISOString(),
  };
  guardarMemoria(memoriaPruebas);

  if (isDbConfigured) {
    try {
      const query = `
        INSERT INTO pruebas (
          docente_id, nombre_docente, asignatura_id, asignatura_nombre, nombre,
          cantidad_preguntas, cantidad_alternativas, cantidad_formas, pauta_respuestas
        ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9) RETURNING *;
      `;

      const values = [
        isUuidString(targetDocenteId) ? targetDocenteId : null,
        targetDocenteNombre,
        resolvedAsigId,
        resolvedAsigNombre,
        nombre_prueba,
        numPreguntas,
        numAlternativas,
        numFormas,
        JSON.stringify(pauta_respuestas || {})
      ];

      const result = await safeQuery(query, values);
      if (result.rows.length > 0) {
        const realRow = result.rows[0];
        const realId = String(realRow.id);
        delete memoriaPruebas[mockId];
        memoriaPruebas[realId] = realRow;
        guardarMemoria(memoriaPruebas);
        return res.status(201).json({ success: true, id: realId, prueba: realRow });
      }
    } catch (error) {
      console.warn("DB no disponible en inserción, usando memoria:", error);
    }
  }

  res.status(201).json({ success: true, id: mockId, prueba: memoriaPruebas[mockId] });
});

// 1. GET /api/pruebas: Retorna las pruebas visibles según rol del usuario autenticado
app.get('/api/pruebas', authenticateToken, async (req: AuthRequest, res) => {
  await bootstrapReady;
  const user = req.user!;

  if (isDbConfigured) {
    try {
      const dbPool = pool?.isRealPool ? pool.getRealPool() : pool;
      const scope = buildPruebaScopeSql(user, 'p', 1);
      const result = await dbPool.query(
        `SELECT p.*,
                COALESCE(u_doc.nombre_completo, p.nombre_docente) AS docente_nombre_display,
                ca.id::text AS carrera_id,
                ca.nombre AS carrera_nombre,
                f.id::text AS facultad_id,
                f.nombre AS facultad_nombre
         FROM pruebas p
         LEFT JOIN asignaturas asg ON asg.id = p.asignatura_id
         LEFT JOIN usuarios u_doc ON u_doc.id = p.docente_id
         LEFT JOIN carreras ca ON ca.id = COALESCE(asg.carrera_id, u_doc.carrera_id)
         LEFT JOIN facultades f ON f.id = COALESCE(ca.facultad_id, u_doc.facultad_id)
         WHERE ${scope.sql}
         ORDER BY p.creado_en DESC`,
        scope.params
      );
      return res.json(result.rows);
    } catch (error) {
      console.warn("Error consultando pruebas en base de datos:", error);
    }
  }

  const listaEnMemoria = Object.values(memoriaPruebas);
  res.json(listaEnMemoria);
});

app.get('/api/pruebas/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const user = req.user!;

  if (isDbConfigured) {
    try {
      const isUuid = isUuidString(id);
      const isNum = /^\d+$/.test(id);
      if (isUuid || isNum) {
        const allowed = await canAccessPrueba(user, id);
        if (!allowed) {
          return res.status(403).json({ error: 'No tienes acceso a esta evaluación.' });
        }
        const dbPool = pool?.isRealPool ? pool.getRealPool() : pool;
        const result = await dbPool.query('SELECT * FROM pruebas WHERE id = $1', [isNum ? Number(id) : id]);
        if (result.rows.length > 0) {
          memoriaPruebas[id] = result.rows[0];
          return res.json({ success: true, prueba: result.rows[0] });
        }
      }
    } catch (error) {
      console.warn("Consulta DB /api/pruebas/:id:", error);
    }
  }

  if (memoriaPruebas[id]) {
    return res.json({ success: true, prueba: memoriaPruebas[id] });
  }

  res.status(404).json({ error: 'Prueba no encontrada.' });
});

// 2. PUT /api/pruebas/:id
app.put('/api/pruebas/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const user = req.user!;
  const {
    nombre, cantidad_preguntas, cantidad_alternativas, cantidad_formas,
    nivel_exigencia, pauta_respuestas, hojas_impresas
  } = req.body;

  try {
    const allowed = await canAccessPrueba(user, id);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para modificar esta evaluación.' });
    }

    const current = await pool.query('SELECT hojas_impresas, cantidad_preguntas, cantidad_alternativas FROM pruebas WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: "Prueba no encontrada" });

    const pruebaActual = current.rows[0];

    if (pruebaActual.hojas_impresas) {
      if (
        (cantidad_preguntas !== undefined && cantidad_preguntas !== pruebaActual.cantidad_preguntas) ||
        (cantidad_alternativas !== undefined && cantidad_alternativas !== pruebaActual.cantidad_alternativas)
      ) {
        return res.status(403).json({
          error: "La prueba ya fue impresa. No puedes cambiar la cantidad de preguntas o alternativas. Crea una nueva prueba si necesitas cambios."
        });
      }
    }

    const parsedPreguntas = cantidad_preguntas !== undefined ? Number.parseInt(String(cantidad_preguntas), 10) : undefined;
    const parsedAlternativas = cantidad_alternativas !== undefined ? Number.parseInt(String(cantidad_alternativas), 10) : undefined;
    const parsedFormas = cantidad_formas !== undefined ? Number.parseInt(String(cantidad_formas), 10) : undefined;

    const query = `
      UPDATE pruebas
      SET nombre = COALESCE($1, nombre),
          cantidad_preguntas = COALESCE($2, cantidad_preguntas),
          cantidad_alternativas = COALESCE($3, cantidad_alternativas),
          cantidad_formas = COALESCE($4, cantidad_formas),
          nivel_exigencia = COALESCE($5, nivel_exigencia),
          pauta_respuestas = COALESCE($6, pauta_respuestas),
          hojas_impresas = COALESCE($7, hojas_impresas)
      WHERE id = $8 RETURNING *;
    `;

    const values = [
      nombre,
      parsedPreguntas !== undefined && Number.isFinite(parsedPreguntas) ? parsedPreguntas : null,
      parsedAlternativas !== undefined && Number.isFinite(parsedAlternativas) ? parsedAlternativas : null,
      parsedFormas !== undefined && Number.isFinite(parsedFormas) ? parsedFormas : null,
      nivel_exigencia,
      pauta_respuestas,
      hojas_impresas,
      id
    ];
    const result = await pool.query(query, values);
    if (result.rows.length > 0) {
      memoriaPruebas[id] = result.rows[0];
      guardarMemoria(memoriaPruebas);
      if (pauta_respuestas !== undefined || nivel_exigencia !== undefined) {
        await recalcularResultadosPrueba(result.rows[0]);
      }
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando prueba:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 3. DELETE /api/pruebas/:id
app.delete('/api/pruebas/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const user = req.user!;

  if (isDbConfigured) {
    const isUuid = isUuidString(id);
    const isNum = /^\d+$/.test(id);
    if (isUuid || isNum) {
      const allowed = await canAccessPrueba(user, id);
      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permiso para eliminar esta evaluación.' });
      }

      const dbPool = pool?.isRealPool ? pool.getRealPool() : pool;
      const client = await dbPool.connect();
      try {
        const targetId = isNum ? Number(id) : id;
        await client.query('BEGIN');
        await client.query('DELETE FROM resultados WHERE prueba_id = $1', [targetId]);
        const result = await client.query(
          'DELETE FROM pruebas WHERE id = $1 RETURNING *',
          [targetId]
        );
        await client.query('COMMIT');
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Prueba no encontrada' });
        }
        if (memoriaPruebas[id]) {
          delete memoriaPruebas[id];
          guardarMemoria(memoriaPruebas);
        }
        return res.json({ success: true, deleted: result.rows[0] });
      } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error("Error DELETE /api/pruebas/:id:", error);
        return res.status(500).json({ error: error.message || 'Error al eliminar prueba' });
      } finally {
        client.release();
      }
    }
  }

  if (memoriaPruebas[id]) {
    delete memoriaPruebas[id];
    guardarMemoria(memoriaPruebas);
  }
  return res.json({ success: true, id });
});

// ========================================================
// ENTIDADES ACADÉMICAS (sedes, campus, facultades, carreras, asignaturas)
// ========================================================

const ACADEMIC_BACKUP_FILE = path.join(process.cwd(), '.academic_db.json');

interface AcademicData {
  sedes: any[];
  campus: any[];
  facultades: any[];
  carreras: any[];
  asignaturas: any[];
  docente_asignatura: any[];
}

const DEFAULT_ACADEMIC_DATA: AcademicData = {
  sedes: [
    { id: 1, nombre: 'Sede Santiago' },
    { id: 2, nombre: 'Sede Temuco' },
    { id: 3, nombre: 'Sede Talca' },
  ],
  campus: [
    { id: 1, nombre: 'Campus Providencia', sede_id: 1 },
    { id: 2, nombre: 'Campus El Llano Subercaseaux', sede_id: 1 },
    { id: 3, nombre: 'Campus Alemania', sede_id: 2 },
  ],
  facultades: [
    { id: 1, nombre: 'Facultad de Ingeniería', campus_id: 1 },
    { id: 2, nombre: 'Facultad de Ciencias de la Salud', campus_id: 2 },
    { id: 3, nombre: 'Facultad de Administración y Negocios', campus_id: 1 },
  ],
  carreras: [
    { id: 1, nombre: 'Ingeniería Civil en Informática', facultad_id: 1 },
    { id: 2, nombre: 'Ingeniería Civil Industrial', facultad_id: 1 },
    { id: 3, nombre: 'Medicina', facultad_id: 2 },
  ],
  asignaturas: [
    { id: 1, nombre: 'Cálculo Multivariable', carrera_id: 1 },
    { id: 2, nombre: 'Estructuras de Datos y Algoritmos', carrera_id: 1 },
    { id: 3, nombre: 'Física Clásica', carrera_id: 1 },
  ],
  docente_asignatura: [
    { id: 1, docente_nombre: 'Prof. Andrés Valenzuela', asignatura_id: 1, seccion: 'Sección 1' },
    { id: 2, docente_nombre: 'Prof. Andrés Valenzuela', asignatura_id: 2, seccion: 'Sección 2' },
    { id: 3, docente_nombre: 'Prof. Carlos Soto', asignatura_id: 3, seccion: 'Sección 1' },
  ],
};

const cargarAcademicMemoria = (): AcademicData => {
  try {
    if (fs.existsSync(ACADEMIC_BACKUP_FILE)) {
      const contenido = fs.readFileSync(ACADEMIC_BACKUP_FILE, 'utf-8');
      const parsed = JSON.parse(contenido);
      return {
        sedes: parsed.sedes || DEFAULT_ACADEMIC_DATA.sedes,
        campus: parsed.campus || DEFAULT_ACADEMIC_DATA.campus,
        facultades: parsed.facultades || DEFAULT_ACADEMIC_DATA.facultades,
        carreras: parsed.carreras || DEFAULT_ACADEMIC_DATA.carreras,
        asignaturas: parsed.asignaturas || DEFAULT_ACADEMIC_DATA.asignaturas,
        docente_asignatura: parsed.docente_asignatura || DEFAULT_ACADEMIC_DATA.docente_asignatura,
      };
    }
  } catch (e) {
    console.warn('Nota: Creando almacenamiento local para entidades académicas');
  }
  return { ...DEFAULT_ACADEMIC_DATA };
};

const guardarAcademicMemoria = (data: AcademicData) => {
  try {
    fs.writeFileSync(ACADEMIC_BACKUP_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Error guardando respaldo académico:', e);
  }
};

const memoriaAcademica: AcademicData = cargarAcademicMemoria();

// Pool activo de PostgreSQL (Neon) sólo si DATABASE_URL está configurada
const activePool = isDbConfigured ? (pool?.isRealPool ? pool.getRealPool() : pool) : null;

// 1. RUTAS PARA SEDES
app.get('/api/sedes', authenticateToken, async (_req, res) => {
  try {
    if (activePool) {
      try {
        const { rows } = await activePool.query('SELECT id, nombre, COALESCE(ciudad, \'\') as ciudad FROM sedes ORDER BY id ASC');
        return res.status(200).json(rows);
      } catch {
        const { rows } = await activePool.query('SELECT * FROM sedes ORDER BY id ASC');
        return res.status(200).json(rows);
      }
    }
    const actual = cargarAcademicMemoria();
    return res.status(200).json(actual.sedes);
  } catch (error: any) {
    console.error('Error GET /api/sedes:', error);
    return res.status(200).json(cargarAcademicMemoria().sedes);
  }
});

app.post('/api/sedes', authenticateToken, requireRoles('admin'), async (req, res) => {
  const { nombre, ciudad } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO sedes (nombre, ciudad) VALUES ($1, $2) RETURNING *',
      [nombre, ciudad]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error POST /api/sedes:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. RUTAS PARA CAMPUS
app.get('/api/campus', authenticateToken, async (_req, res) => {
  try {
    if (activePool) {
      try {
        const { rows } = await activePool.query(`
          SELECT c.*, s.nombre AS sede_nombre 
          FROM campus c 
          LEFT JOIN sedes s ON c.sede_id = s.id 
          ORDER BY c.id ASC
        `);
        return res.status(200).json(rows);
      } catch {
        const { rows } = await activePool.query('SELECT * FROM campus ORDER BY id ASC');
        return res.status(200).json(rows);
      }
    }
    const actual = cargarAcademicMemoria();
    const sedeMap = new Map(actual.sedes.map((s: any) => [String(s.id), s.nombre]));
    const enMemoria = actual.campus.map((c: any) => ({
      ...c,
      sede_nombre: sedeMap.get(String(c.sede_id)) || 'Sin sede'
    }));
    return res.status(200).json(enMemoria);
  } catch (error: any) {
    console.error('Error GET /api/campus:', error);
    const actual = cargarAcademicMemoria();
    const sedeMap = new Map(actual.sedes.map((s: any) => [String(s.id), s.nombre]));
    return res.status(200).json(actual.campus.map((c: any) => ({
      ...c,
      sede_nombre: sedeMap.get(String(c.sede_id)) || 'Sin sede'
    })));
  }
});

app.post('/api/campus', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const { nombre, sede_id, direccion } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El campo nombre es requerido' });
    }

    const parsedSedeId = parseForeignId(sede_id);

    if (activePool) {
      const { rows } = await activePool.query(
        'INSERT INTO campus (nombre, sede_id, direccion) VALUES ($1, $2, $3) RETURNING *',
        [String(nombre).trim(), parsedSedeId, direccion ? String(direccion).trim() : null]
      );
      return res.status(201).json(rows[0]);
    }

    const data = cargarAcademicMemoria();
    const newId = data.campus.length > 0
      ? Math.max(...data.campus.map((c: any) => Number(c.id) || 0)) + 1
      : 1;
    const item = { id: newId, nombre: String(nombre).trim(), sede_id: parsedSedeId, direccion: direccion ? String(direccion).trim() : '' };
    data.campus.push(item);
    guardarAcademicMemoria(data);
    return res.status(201).json(item);
  } catch (error: any) {
    console.error('Error POST /api/campus:', error);
    return res.status(500).json({ error: error.message || 'Error al crear campus' });
  }
});

// 3. RUTAS PARA FACULTADES
app.get('/api/facultades', authenticateToken, async (_req, res) => {
  try {
    if (activePool) {
      try {
        const { rows } = await activePool.query(`
          SELECT f.*, c.nombre AS campus_nombre 
          FROM facultades f 
          LEFT JOIN campus c ON f.campus_id = c.id 
          ORDER BY f.id ASC
        `);
        return res.status(200).json(rows);
      } catch {
        const { rows } = await activePool.query('SELECT * FROM facultades ORDER BY id ASC');
        return res.status(200).json(rows);
      }
    }
    const actual = cargarAcademicMemoria();
    const campusMap = new Map(actual.campus.map((c: any) => [String(c.id), c.nombre]));
    const enMemoria = actual.facultades.map((f: any) => ({
      ...f,
      campus_nombre: campusMap.get(String(f.campus_id)) || 'Sin campus'
    }));
    return res.status(200).json(enMemoria);
  } catch (error: any) {
    console.error('Error GET /api/facultades:', error);
    const actual = cargarAcademicMemoria();
    const campusMap = new Map(actual.campus.map((c: any) => [String(c.id), c.nombre]));
    return res.status(200).json(actual.facultades.map((f: any) => ({
      ...f,
      campus_nombre: campusMap.get(String(f.campus_id)) || 'Sin campus'
    })));
  }
});

app.post('/api/facultades', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const { nombre, campus_id } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El campo nombre es requerido' });
    }

    const parsedCampusId = parseForeignId(campus_id);

    if (activePool) {
      const { rows } = await activePool.query(
        'INSERT INTO facultades (nombre, campus_id) VALUES ($1, $2) RETURNING *',
        [String(nombre).trim(), parsedCampusId]
      );
      return res.status(201).json(rows[0]);
    }

    const data = cargarAcademicMemoria();
    const newId = data.facultades.length > 0
      ? Math.max(...data.facultades.map((f: any) => Number(f.id) || 0)) + 1
      : 1;
    const item = { id: newId, nombre: String(nombre).trim(), campus_id: parsedCampusId };
    data.facultades.push(item);
    guardarAcademicMemoria(data);
    return res.status(201).json(item);
  } catch (error: any) {
    console.error('Error POST /api/facultades:', error);
    return res.status(500).json({ error: error.message || 'Error al crear facultad' });
  }
});

// 4. RUTAS PARA CARRERAS
app.get('/api/carreras', authenticateToken, async (_req, res) => {
  try {
    if (activePool) {
      try {
        const { rows } = await activePool.query(`
          SELECT ca.*, f.nombre AS facultad_nombre 
          FROM carreras ca 
          LEFT JOIN facultades f ON ca.facultad_id = f.id 
          ORDER BY ca.id ASC
        `);
        return res.status(200).json(rows);
      } catch {
        const { rows } = await activePool.query('SELECT * FROM carreras ORDER BY id ASC');
        return res.status(200).json(rows);
      }
    }
    const actual = cargarAcademicMemoria();
    const facultadMap = new Map(actual.facultades.map((f: any) => [String(f.id), f.nombre]));
    const enMemoria = actual.carreras.map((c: any) => ({
      ...c,
      facultad_nombre: facultadMap.get(String(c.facultad_id)) || 'Sin facultad'
    }));
    return res.status(200).json(enMemoria);
  } catch (error: any) {
    console.error('Error GET /api/carreras:', error);
    const actual = cargarAcademicMemoria();
    const facultadMap = new Map(actual.facultades.map((f: any) => [String(f.id), f.nombre]));
    return res.status(200).json(actual.carreras.map((c: any) => ({
      ...c,
      facultad_nombre: facultadMap.get(String(c.facultad_id)) || 'Sin facultad'
    })));
  }
});

app.post('/api/carreras', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const { nombre, facultad_id, codigo } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El campo nombre es requerido' });
    }

    const parsedFacultadId = parseForeignId(facultad_id);

    if (activePool) {
      const { rows } = await activePool.query(
        'INSERT INTO carreras (nombre, facultad_id, codigo) VALUES ($1, $2, $3) RETURNING *',
        [String(nombre).trim(), parsedFacultadId, codigo ? String(codigo).trim() : null]
      );
      return res.status(201).json(rows[0]);
    }

    const data = cargarAcademicMemoria();
    const newId = data.carreras.length > 0
      ? Math.max(...data.carreras.map((c: any) => Number(c.id) || 0)) + 1
      : 1;
    const item = { id: newId, nombre: String(nombre).trim(), facultad_id: parsedFacultadId, codigo: codigo ? String(codigo).trim() : '' };
    data.carreras.push(item);
    guardarAcademicMemoria(data);
    return res.status(201).json(item);
  } catch (error: any) {
    console.error('Error POST /api/carreras:', error);
    return res.status(500).json({ error: error.message || 'Error al crear carrera' });
  }
});

// 5. RUTAS PARA ASIGNATURAS
app.get('/api/asignaturas', authenticateToken, async (_req, res) => {
  try {
    if (activePool) {
      try {
        const { rows } = await activePool.query(`
          SELECT a.*, ca.nombre AS carrera_nombre, ca.facultad_id AS facultad_id
          FROM asignaturas a 
          LEFT JOIN carreras ca ON a.carrera_id = ca.id 
          ORDER BY a.nombre ASC
        `);
        return res.status(200).json(rows);
      } catch {
        const { rows } = await activePool.query('SELECT * FROM asignaturas ORDER BY id ASC');
        return res.status(200).json(rows);
      }
    }
    const actual = cargarAcademicMemoria();
    const carreraMap = new Map(actual.carreras.map((c: any) => [String(c.id), c.nombre]));
    const enMemoria = actual.asignaturas.map((a: any) => ({
      ...a,
      carrera_nombre: carreraMap.get(String(a.carrera_id)) || 'Sin carrera'
    }));
    return res.status(200).json(enMemoria);
  } catch (error: any) {
    console.error('Error GET /api/asignaturas:', error);
    const actual = cargarAcademicMemoria();
    const carreraMap = new Map(actual.carreras.map((c: any) => [String(c.id), c.nombre]));
    return res.status(200).json(actual.asignaturas.map((a: any) => ({
      ...a,
      carrera_nombre: carreraMap.get(String(a.carrera_id)) || 'Sin carrera'
    })));
  }
});

app.post('/api/asignaturas', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const { nombre, carrera_id, codigo, semestre } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El campo nombre es requerido' });
    }

    const parsedCarreraId = parseForeignId(carrera_id);

    if (activePool) {
      const { rows } = await activePool.query(
        'INSERT INTO asignaturas (nombre, carrera_id, codigo, semestre) VALUES ($1, $2, $3, $4) RETURNING *',
        [String(nombre).trim(), parsedCarreraId, codigo ? String(codigo).trim() : null, Number(semestre) || 1]
      );
      return res.status(201).json(rows[0]);
    }

    const data = cargarAcademicMemoria();
    const newId = data.asignaturas.length > 0
      ? Math.max(...data.asignaturas.map((a: any) => Number(a.id) || 0)) + 1
      : 1;
    const item = { id: newId, nombre: String(nombre).trim(), carrera_id: parsedCarreraId, codigo: codigo ? String(codigo).trim() : '', semestre: Number(semestre) || 1 };
    data.asignaturas.push(item);
    guardarAcademicMemoria(data);
    return res.status(201).json(item);
  } catch (error: any) {
    console.error('Error POST /api/asignaturas:', error);
    return res.status(500).json({ error: error.message || 'Error al crear asignatura' });
  }
});

// 6. RUTAS PARA DOCENTE_ASIGNATURA
app.get('/api/docente_asignatura', authenticateToken, async (_req, res) => {
  try {
    if (activePool) {
      try {
        const { rows } = await activePool.query(`
          SELECT da.*, a.nombre AS asignatura_nombre 
          FROM docente_asignatura da 
          LEFT JOIN asignaturas a ON da.asignatura_id = a.id 
          ORDER BY da.id ASC
        `);
        return res.status(200).json(rows);
      } catch (poolErr: any) {
        console.warn('Aviso GET /api/docente_asignatura con JOIN:', poolErr?.message || poolErr);
        try {
          const { rows } = await activePool.query('SELECT * FROM docente_asignatura');
          return res.status(200).json(rows);
        } catch (subErr: any) {
          console.warn('Aviso fallback direct query docente_asignatura:', subErr?.message || subErr);
        }
      }
    }
    const actual = cargarAcademicMemoria();
    const asigMap = new Map((actual.asignaturas || []).map((a: any) => [String(a.id), a.nombre]));
    const enMemoria = (actual.docente_asignatura || []).map((da: any) => ({
      ...da,
      asignatura_nombre: asigMap.get(String(da.asignatura_id)) || 'Sin asignatura'
    }));
    return res.status(200).json(enMemoria);
  } catch (error: any) {
    console.error('Error GET /api/docente_asignatura:', error);
    const actual = cargarAcademicMemoria();
    const asigMap = new Map((actual.asignaturas || []).map((a: any) => [String(a.id), a.nombre]));
    return res.status(200).json((actual.docente_asignatura || []).map((da: any) => ({
      ...da,
      asignatura_nombre: asigMap.get(String(da.asignatura_id)) || 'Sin asignatura'
    })));
  }
});

app.post('/api/docente_asignatura', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const { docente_nombre, docente_id, asignatura_id, seccion } = req.body;
    if ((!docente_nombre && !docente_id) || !asignatura_id) {
      return res.status(400).json({ error: 'docente y asignatura_id son requeridos' });
    }

    const asigIdVal = parseForeignId(asignatura_id);
    let docIdVal: string | null = docente_id && isUuidString(String(docente_id)) ? String(docente_id).trim() : null;
    let docNombreVal = docente_nombre ? String(docente_nombre).trim() : '';

    if (activePool && docIdVal && !docNombreVal) {
      const uRes = await activePool.query('SELECT nombre_completo FROM usuarios WHERE id = $1::uuid LIMIT 1', [docIdVal]);
      docNombreVal = uRes.rows[0]?.nombre_completo || '';
    }

    if (activePool) {
      const { rows } = await activePool.query(
        'INSERT INTO docente_asignatura (docente_id, docente_nombre, asignatura_id, seccion) VALUES ($1::uuid, $2, $3, $4) RETURNING *',
        [docIdVal, docNombreVal, asigIdVal, seccion ? String(seccion).trim() : 'Sección 1']
      );
      return res.status(201).json(rows[0]);
    }

    const data = cargarAcademicMemoria();
    const newId = data.docente_asignatura.length > 0
      ? Math.max(...data.docente_asignatura.map((d: any) => Number(d.id) || 0)) + 1
      : 1;
    const item = {
      id: newId,
      docente_id: docIdVal,
      docente_nombre: docNombreVal,
      asignatura_id: asigIdVal,
      seccion: seccion ? String(seccion).trim() : 'Sección 1'
    };
    data.docente_asignatura.push(item);
    guardarAcademicMemoria(data);
    return res.status(201).json(item);
  } catch (error: any) {
    console.error('Error POST /api/docente_asignatura:', error);
    return res.status(500).json({ error: error.message || 'Error al asignar docente' });
  }
});

// ==========================================
// RUTAS CRUD: DELETE Y PUT PARA ENTIDADES ACADÉMICAS
// ==========================================
const ALLOWED_ACADEMIC_TABLES = ['sedes', 'campus', 'facultades', 'carreras', 'asignaturas', 'docente_asignatura'] as const;

// ELIMINAR: DELETE /api/:tabla/:id
app.delete('/api/:tabla/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
  const { tabla, id } = req.params;
  const tablaNormalized = String(tabla).toLowerCase().trim();

  if (!ALLOWED_ACADEMIC_TABLES.includes(tablaNormalized as any)) {
    return res.status(400).json({ error: `Tabla no válida para eliminación: ${tabla}` });
  }

  try {
    if (activePool) {
      const result = await activePool.query(`DELETE FROM ${tablaNormalized} WHERE id = $1 RETURNING *`, [id]);
      if (result.rows.length === 0) {
        return res.status(200).json({ success: true, message: 'Registro no encontrado o ya eliminado', id });
      }
      return res.status(200).json({ success: true, deleted: result.rows[0] });
    }

    // Fallback memoria local
    const data = cargarAcademicMemoria();
    if (Array.isArray((data as any)[tablaNormalized])) {
      (data as any)[tablaNormalized] = (data as any)[tablaNormalized].filter(
        (item: any) => String(item.id) !== String(id)
      );
      guardarAcademicMemoria(data);
    }
    return res.status(200).json({ success: true, id });
  } catch (error: any) {
    console.error(`Error DELETE /api/${tabla}/${id}:`, error);
    if (error?.code === '23503') {
      return res.status(409).json({ 
        error: 'No se puede eliminar este registro porque tiene elementos vinculados (dependencias en cascada).' 
      });
    }
    return res.status(500).json({ error: error.message || 'Error al eliminar registro' });
  }
});

// ACTUALIZAR: PUT /api/:tabla/:id
app.put('/api/:tabla/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
  const { tabla, id } = req.params;
  const tablaNormalized = String(tabla).toLowerCase().trim();

  if (!ALLOWED_ACADEMIC_TABLES.includes(tablaNormalized as any)) {
    return res.status(400).json({ error: `Tabla no válida para actualización: ${tabla}` });
  }

  try {
    if (tablaNormalized === 'sedes') {
      const { nombre, ciudad } = req.body;
      if (!nombre || !String(nombre).trim()) {
        return res.status(400).json({ error: 'El campo nombre es requerido' });
      }
      const nombreStr = String(nombre).trim();
      const ciudadStr = ciudad !== undefined ? String(ciudad).trim() : '';

      if (activePool) {
        const result = await activePool.query(
          'UPDATE sedes SET nombre = $1, ciudad = $2 WHERE id = $3 RETURNING *',
          [nombreStr, ciudadStr, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Sede no encontrada' });
        }
        return res.status(200).json(result.rows[0]);
      }

      const data = cargarAcademicMemoria();
      const idx = data.sedes.findIndex((s: any) => String(s.id) === String(id));
      if (idx !== -1) {
        data.sedes[idx] = { ...data.sedes[idx], nombre: nombreStr, ciudad: ciudadStr };
        guardarAcademicMemoria(data);
        return res.status(200).json(data.sedes[idx]);
      }
      return res.status(404).json({ error: 'Sede no encontrada' });
    }

    if (tablaNormalized === 'campus') {
      const { nombre, sede_id, direccion } = req.body;
      if (!nombre || !String(nombre).trim()) {
        return res.status(400).json({ error: 'El campo nombre es requerido' });
      }
      const nombreStr = String(nombre).trim();
      const sedeIdVal = sede_id || null;
      const dirStr = direccion !== undefined ? String(direccion).trim() : '';

      if (activePool) {
        const result = await activePool.query(
          'UPDATE campus SET nombre = $1, sede_id = $2, direccion = $3 WHERE id = $4 RETURNING *',
          [nombreStr, sedeIdVal, dirStr, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Campus no encontrado' });
        }
        return res.status(200).json(result.rows[0]);
      }

      const data = cargarAcademicMemoria();
      const idx = data.campus.findIndex((c: any) => String(c.id) === String(id));
      if (idx !== -1) {
        data.campus[idx] = { ...data.campus[idx], nombre: nombreStr, sede_id: sedeIdVal, direccion: dirStr };
        guardarAcademicMemoria(data);
        return res.status(200).json(data.campus[idx]);
      }
      return res.status(404).json({ error: 'Campus no encontrado' });
    }

    if (tablaNormalized === 'facultades') {
      const { nombre, campus_id } = req.body;
      if (!nombre || !String(nombre).trim()) {
        return res.status(400).json({ error: 'El campo nombre es requerido' });
      }
      const nombreStr = String(nombre).trim();
      const campusIdVal = campus_id || null;

      if (activePool) {
        const result = await activePool.query(
          'UPDATE facultades SET nombre = $1, campus_id = $2 WHERE id = $3 RETURNING *',
          [nombreStr, campusIdVal, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Facultad no encontrada' });
        }
        return res.status(200).json(result.rows[0]);
      }

      const data = cargarAcademicMemoria();
      const idx = data.facultades.findIndex((f: any) => String(f.id) === String(id));
      if (idx !== -1) {
        data.facultades[idx] = { ...data.facultades[idx], nombre: nombreStr, campus_id: campusIdVal };
        guardarAcademicMemoria(data);
        return res.status(200).json(data.facultades[idx]);
      }
      return res.status(404).json({ error: 'Facultad no encontrada' });
    }

    if (tablaNormalized === 'carreras') {
      const { nombre, facultad_id, codigo } = req.body;
      if (!nombre || !String(nombre).trim()) {
        return res.status(400).json({ error: 'El campo nombre es requerido' });
      }
      const nombreStr = String(nombre).trim();
      const facIdVal = facultad_id || null;
      const codStr = codigo !== undefined ? String(codigo).trim() : '';

      if (activePool) {
        const result = await activePool.query(
          'UPDATE carreras SET nombre = $1, facultad_id = $2, codigo = $3 WHERE id = $4 RETURNING *',
          [nombreStr, facIdVal, codStr, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Carrera no encontrada' });
        }
        return res.status(200).json(result.rows[0]);
      }

      const data = cargarAcademicMemoria();
      const idx = data.carreras.findIndex((c: any) => String(c.id) === String(id));
      if (idx !== -1) {
        data.carreras[idx] = { ...data.carreras[idx], nombre: nombreStr, facultad_id: facIdVal, codigo: codStr };
        guardarAcademicMemoria(data);
        return res.status(200).json(data.carreras[idx]);
      }
      return res.status(404).json({ error: 'Carrera no encontrada' });
    }

    if (tablaNormalized === 'asignaturas') {
      const { nombre, carrera_id, codigo, semestre } = req.body;
      if (!nombre || !String(nombre).trim()) {
        return res.status(400).json({ error: 'El campo nombre es requerido' });
      }
      const nombreStr = String(nombre).trim();
      const carIdVal = carrera_id || null;
      const codStr = codigo !== undefined ? String(codigo).trim() : '';
      const semVal = semestre !== undefined ? Number(semestre) || 1 : 1;

      if (activePool) {
        const result = await activePool.query(
          'UPDATE asignaturas SET nombre = $1, carrera_id = $2, codigo = $3, semestre = $4 WHERE id = $5 RETURNING *',
          [nombreStr, carIdVal, codStr, semVal, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Asignatura no encontrada' });
        }
        return res.status(200).json(result.rows[0]);
      }

      const data = cargarAcademicMemoria();
      const idx = data.asignaturas.findIndex((a: any) => String(a.id) === String(id));
      if (idx !== -1) {
        data.asignaturas[idx] = { ...data.asignaturas[idx], nombre: nombreStr, carrera_id: carIdVal, codigo: codStr, semestre: semVal };
        guardarAcademicMemoria(data);
        return res.status(200).json(data.asignaturas[idx]);
      }
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    if (tablaNormalized === 'docente_asignatura') {
      const { docente_nombre, asignatura_id, seccion } = req.body;
      if (!docente_nombre || !String(docente_nombre).trim()) {
        return res.status(400).json({ error: 'El nombre del docente es requerido' });
      }
      const docStr = String(docente_nombre).trim();
      const asigIdVal = asignatura_id || null;
      const secStr = seccion !== undefined ? String(seccion).trim() : 'Sección 1';

      if (activePool) {
        const result = await activePool.query(
          'UPDATE docente_asignatura SET docente_nombre = $1, asignatura_id = $2, seccion = $3 WHERE id = $4 RETURNING *',
          [docStr, asigIdVal, secStr, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        return res.status(200).json(result.rows[0]);
      }

      const data = cargarAcademicMemoria();
      const idx = data.docente_asignatura.findIndex((d: any) => String(d.id) === String(id));
      if (idx !== -1) {
        data.docente_asignatura[idx] = { ...data.docente_asignatura[idx], docente_nombre: docStr, asignatura_id: asigIdVal, seccion: secStr };
        guardarAcademicMemoria(data);
        return res.status(200).json(data.docente_asignatura[idx]);
      }
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    return res.status(400).json({ error: `Tabla ${tabla} no configurada para actualización` });
  } catch (error: any) {
    console.error(`Error PUT /api/${tabla}/${id}:`, error);
    return res.status(500).json({ error: error.message || 'Error al actualizar registro' });
  }
});

app.post('/api/resultados', authenticateToken, async (req: AuthRequest, res) => {
  const {
    prueba_id,
    alumno_rut,
    puntaje_obtenido,
    nota,
    respuestas_alumno,
    forma
  } = req.body;

  try {
    const allowed = await canAccessPrueba(req.user!, String(prueba_id));
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso sobre esta evaluación.' });
    }

    const query = `
      INSERT INTO resultados (
        prueba_id, alumno_rut, puntaje_obtenido, nota, respuestas_alumno, forma
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const values = [
      prueba_id,
      alumno_rut,
      puntaje_obtenido,
      nota,
      JSON.stringify(respuestas_alumno),
      forma
    ];
    const result = await pool.query(query, values);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error guardando resultado:", error);
    res.status(500).json({ success: false, error: "Error interno" });
  }
});

app.get('/api/resultados', authenticateToken, async (req: AuthRequest, res) => {
  const { prueba_id } = req.query;
  if (!prueba_id || typeof prueba_id !== 'string') {
    return res.status(400).json({ error: 'prueba_id es requerido' });
  }

  try {
    const allowed = await canAccessPrueba(req.user!, prueba_id);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para ver resultados de esta evaluación.' });
    }

    const result = await pool.query(
      'SELECT * FROM resultados WHERE prueba_id = $1 ORDER BY fecha_escaneo DESC, alumno_rut ASC',
      [prueba_id]
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error("Error consultando resultados:", error);
    res.status(500).json({ error: "Error interno al obtener resultados: " + error.message });
  }
});

// Ruta para guardar un LOTE completo de resultados (Reemplaza los anteriores)
app.post('/api/resultados/lote', authenticateToken, async (req: AuthRequest, res) => {
  const { prueba_id, resultados } = req.body;

  if (!prueba_id || !Array.isArray(resultados) || resultados.length === 0) {
    return res.status(400).json({ error: 'Datos de lote inválidos o vacíos.' });
  }

  const allowed = await canAccessPrueba(req.user!, String(prueba_id));
  if (!allowed) {
    return res.status(403).json({ error: 'No tienes permiso para guardar resultados en esta evaluación.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Iniciar transacción

    // Obtener pauta, cantidad de preguntas y nivel de exigencia para calcular puntaje y nota
    const pruebaRes = await client.query(
      'SELECT pauta_respuestas, cantidad_preguntas, nivel_exigencia FROM pruebas WHERE id = $1',
      [prueba_id]
    );
    if (pruebaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Prueba no encontrada para guardar el lote.' });
    }

    const pruebaRow = pruebaRes.rows[0];

    // 1. ELIMINAMOS los resultados anteriores de esta prueba
    await client.query('DELETE FROM resultados WHERE prueba_id = $1', [prueba_id]);

    // 2. Construimos el INSERT masivo ajustado a TU ESQUEMA
    const valuesPlaceholders: string[] = [];
    const valuesParams: any[] = [];
    let paramIndex = 1;

    resultados.forEach((item: any) => {
      const forma = item.forma || 'A';
      const respuestas = Array.isArray(item.respuestas) ? item.respuestas : [];
      const evalRow = evaluarResultadoFila(
        { forma, respuestas_alumno: respuestas, puntajes_manuales: {} },
        pruebaRow
      );

      // Columnas: prueba_id, alumno_rut, respuestas_alumno, forma, puntaje_obtenido, nota
      valuesPlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
      valuesParams.push(
        prueba_id,
        item.rut,
        JSON.stringify(respuestas),
        forma,
        evalRow.puntajeObtenido,
        evalRow.notaFinal
      );
      paramIndex += 6;
    });

    const query = `
      INSERT INTO resultados (
        prueba_id, alumno_rut, respuestas_alumno, forma, puntaje_obtenido, nota
      ) VALUES ${valuesPlaceholders.join(', ')}
    `;

    await client.query(query, valuesParams);
    await client.query('COMMIT'); // Confirmar transacción

    res.status(201).json({ success: true, message: 'Lote guardado exitosamente', cantidad: resultados.length });
  } catch (error: any) {
    await client.query('ROLLBACK'); // Cancelar todo si hay error
    console.error("Error guardando lote de resultados:", error);
    res.status(500).json({ error: "Error en BD: " + error.message });
  } finally {
    client.release();
  }
});

// ==========================================
// DIMENSIÓN 1: ANALÍTICA DETALLADA POR PRUEBA
// ==========================================
// NUEVA RUTA: Guardar puntaje manual de una pregunta y recalcular puntaje/nota en BD
app.post('/api/resultados/:id/puntaje-manual', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { pregunta_num, puntos } = req.body;
  const preguntaNum = Number.parseInt(String(pregunta_num), 10);

  if (!Number.isFinite(preguntaNum) || preguntaNum < 1) {
    return res.status(400).json({ error: 'Número de pregunta inválido.' });
  }

  try {
    const existingRes = await pool.query('SELECT * FROM resultados WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Resultado no encontrado.' });
    }
    const existingRow = existingRes.rows[0];

    const allowed = await canAccessPrueba(req.user!, String(existingRow.prueba_id));
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para modificar resultados de esta evaluación.' });
    }

    const pruebaRes = await pool.query('SELECT * FROM pruebas WHERE id = $1', [existingRow.prueba_id]);
    if (pruebaRes.rows.length === 0) {
      return res.status(404).json({ error: 'Prueba asociada no encontrada.' });
    }
    const pruebaRow = pruebaRes.rows[0];
    const pautaForma = obtenerPautaDeForma(pruebaRow.pauta_respuestas || {}, existingRow.forma || 'A');
    const cfg = parsePreguntaConfig(pautaForma[String(preguntaNum)] ?? pautaForma[preguntaNum]);

    const esVacio = puntos === null || puntos === undefined || String(puntos).trim() === '';
    let updatedManualRes;

    if (esVacio) {
      updatedManualRes = await pool.query(
        `UPDATE resultados
         SET puntajes_manuales = COALESCE(puntajes_manuales, '{}'::jsonb) - $1
         WHERE id = $2
         RETURNING *`,
        [String(preguntaNum), id]
      );
    } else {
      const puntosNum = Number(puntos);
      if (!Number.isFinite(puntosNum) || puntosNum < 0) {
        return res.status(400).json({ error: 'El puntaje debe ser un número mayor o igual a 0.' });
      }
      const puntosClamped = Math.min(cfg.puntos, Math.max(0, Number(puntosNum.toFixed(2))));

      updatedManualRes = await pool.query(
        `UPDATE resultados
         SET puntajes_manuales = jsonb_set(
           COALESCE(puntajes_manuales, '{}'::jsonb),
           ARRAY[$1],
           to_jsonb($2::numeric)
         )
         WHERE id = $3
         RETURNING *`,
        [String(preguntaNum), puntosClamped, id]
      );
    }

    const updatedRow = updatedManualRes.rows[0];
    const evalRow = evaluarResultadoFila(updatedRow, pruebaRow);

    const finalRes = await pool.query(
      `UPDATE resultados
       SET puntaje_obtenido = $1, nota = $2
       WHERE id = $3
       RETURNING *`,
      [evalRow.puntajeObtenido, evalRow.notaFinal, id]
    );

    return res.json({
      success: true,
      data: finalRes.rows[0],
      puntaje_obtenido: evalRow.puntajeObtenido,
      puntaje_total: evalRow.puntajeTotalPosible,
      nota: evalRow.notaFinal,
    });
  } catch (error: any) {
    console.error('Error guardando puntaje manual:', error);
    return res.status(500).json({ error: 'Error interno guardando puntaje.' });
  }
});

// RUTA ACTUALIZADA: Estadísticas de la prueba
app.get('/api/estadisticas/prueba/:prueba_id', authenticateToken, async (req: AuthRequest, res) => {
  const { prueba_id } = req.params;

  try {
    const allowed = await canAccessPrueba(req.user!, prueba_id);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para ver las estadísticas de esta prueba.' });
    }

    const pruebaRes = await pool.query('SELECT * FROM pruebas WHERE id = $1', [prueba_id]);
    if (pruebaRes.rows.length === 0) {
      return res.status(404).json({ error: 'Prueba no encontrada.' });
    }

    const prueba = pruebaRes.rows[0];
    const resultadosRes = await pool.query(
      `SELECT r.*, COALESCE(a.nombre_completo, '') AS nombre_alumno, a.curso_id
       FROM resultados r
       LEFT JOIN alumnos a ON a.rut = r.alumno_rut
       WHERE r.prueba_id = $1
       ORDER BY r.nota DESC, r.alumno_rut ASC`,
      [prueba_id]
    );

    const filas = resultadosRes.rows;
    const totalEvaluados = filas.length;
    const cantidadPreguntas = Number(prueba.cantidad_preguntas) || 0;
    const cantidadAlternativas = Math.min(5, Math.max(4, Number(prueba.cantidad_alternativas) || 5));
    const letrasAlternativas = ['A', 'B', 'C', 'D', 'E'].slice(0, cantidadAlternativas);
    const pautaCompleta = prueba.pauta_respuestas || {};
    const rawExigencia = Number(prueba.nivel_exigencia ?? 0.6);
    const nivelExigencia = rawExigencia > 1 ? rawExigencia / 100 : rawExigencia;

    let sumaNotas = 0;
    let notaMaxima = 0;
    let notaMinima = 7.0;
    const notasCalculadas: number[] = [];

    const filasEvaluadas: Array<{
      raw: any;
      evalRow: ReturnType<typeof evaluarResultadoFila>;
      matrizItem: any;
    }> = filas.map((fila: any) => {
      const evalRow = evaluarResultadoFila(fila, prueba);
      sumaNotas += evalRow.notaFinal;
      if (evalRow.notaFinal > notaMaxima) notaMaxima = evalRow.notaFinal;
      if (evalRow.notaFinal < notaMinima) notaMinima = evalRow.notaFinal;
      notasCalculadas.push(evalRow.notaFinal);

      return {
        raw: fila,
        evalRow,
        matrizItem: {
          id: fila.id,
          alumno_rut: fila.alumno_rut,
          nombre_alumno: fila.nombre_alumno || 'Sin registro en nómina',
          forma: evalRow.forma,
          puntaje_obtenido: evalRow.puntajeObtenido,
          puntaje_total: evalRow.puntajeTotalPosible,
          nota: evalRow.notaFinal,
          fecha_escaneo: fila.fecha_escaneo,
          celdas: evalRow.celdas,
        },
      };
    });

    // Ordenamos matriz por nota recalculada descendente, puntaje y RUT
    const matriz = [...filasEvaluadas]
      .sort((a, b) => {
        if (b.evalRow.notaFinal !== a.evalRow.notaFinal) return b.evalRow.notaFinal - a.evalRow.notaFinal;
        if (b.evalRow.puntajeObtenido !== a.evalRow.puntajeObtenido) return b.evalRow.puntajeObtenido - a.evalRow.puntajeObtenido;
        return String(a.raw.alumno_rut || '').localeCompare(String(b.raw.alumno_rut || ''));
      })
      .map((item) => item.matrizItem);

    // 2. KPIs Generales
    const aprobados = notasCalculadas.filter((n) => n >= 4.0).length;
    const kpis = {
      total_evaluados: totalEvaluados,
      promedio: totalEvaluados > 0 ? Number((sumaNotas / totalEvaluados).toFixed(2)) : 0,
      nota_maxima: totalEvaluados > 0 ? Number(notaMaxima.toFixed(1)) : 0,
      nota_minima: totalEvaluados > 0 ? Number(notaMinima.toFixed(1)) : 0,
      aprobados,
      reprobados: totalEvaluados - aprobados,
      tasa_aprobacion: totalEvaluados > 0 ? Number(((aprobados / totalEvaluados) * 100).toFixed(1)) : 0,
      nivel_exigencia: Number((nivelExigencia * 100).toFixed(0)),
    };

    // 3. Histograma
    const rangos = [
      { rango: '1.0 - 1.9', min: 1.0, max: 1.999, estado: 'reprobado' },
      { rango: '2.0 - 2.9', min: 2.0, max: 2.999, estado: 'reprobado' },
      { rango: '3.0 - 3.9', min: 3.0, max: 3.999, estado: 'reprobado' },
      { rango: '4.0 - 4.9', min: 4.0, max: 4.999, estado: 'aprobado' },
      { rango: '5.0 - 5.9', min: 5.0, max: 5.999, estado: 'aprobado' },
      { rango: '6.0 - 7.0', min: 6.0, max: 7.001, estado: 'aprobado' },
    ];
    const histograma = rangos.map((r) => ({
      rango: r.rango,
      estado: r.estado,
      cantidad: notasCalculadas.filter((n) => n >= r.min && n <= r.max).length,
    }));

    // 4. Análisis Psicométrico (ordenado usando notas recalculadas)
    const ordenadosPorNota = [...filasEvaluadas].sort((a, b) => {
      if (b.evalRow.notaFinal !== a.evalRow.notaFinal) return b.evalRow.notaFinal - a.evalRow.notaFinal;
      return b.evalRow.puntajeObtenido - a.evalRow.puntajeObtenido;
    });
    const n27 = totalEvaluados >= 4 ? Math.max(1, Math.round(totalEvaluados * 0.27)) : totalEvaluados >= 2 ? 1 : 0;
    const grupoSuperior = n27 > 0 ? ordenadosPorNota.slice(0, n27) : [];
    const grupoInferior = n27 > 0 ? ordenadosPorNota.slice(totalEvaluados - n27) : [];

    const logroPreguntaDeEvaluacion = (item: typeof filasEvaluadas[number], numPregunta: number): number => {
      const celda = item.evalRow.celdas[numPregunta - 1];
      if (!celda) return 0;
      if (celda.estado === 'correcta') return 1;
      if (celda.estado === 'desarrollo') {
        if (celda.puntaje_manual === null || celda.puntos <= 0) return 0;
        return Math.min(1, celda.puntaje_manual / celda.puntos);
      }
      return 0;
    };

    const pautaBase = obtenerPautaDeForma(pautaCompleta, 'A');
    let puntajeTotalPruebaBase = 0;

    const preguntas = Array.from({ length: cantidadPreguntas }, (_, idx) => {
      const numPregunta = idx + 1;
      const cfgBase = parsePreguntaConfig(pautaBase[String(numPregunta)] ?? pautaBase[numPregunta]);
      if (!cfgBase.anulada) {
        puntajeTotalPruebaBase += cfgBase.puntos;
      }

      const conteo: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, '-': 0, '*': 0 };
      let totalCorrectas = 0;
      let sumaLogro = 0;

      filasEvaluadas.forEach((item) => {
        const respArray = Array.isArray(item.raw.respuestas_alumno) ? item.raw.respuestas_alumno : [];
        const marcadaRaw = String(respArray[idx] || '-').trim().toUpperCase();
        if (marcadaRaw === '*' || marcadaRaw === '-') conteo[marcadaRaw]++;
        else if (letrasAlternativas.includes(marcadaRaw)) conteo[marcadaRaw]++;
        else conteo['-']++;

        const celda = item.evalRow.celdas[idx];
        if (celda?.estado === 'correcta') totalCorrectas++;
        sumaLogro += logroPreguntaDeEvaluacion(item, numPregunta);
      });

      const distribucion: Record<string, { count: number; pct: number }> = {};
      [...letrasAlternativas, '-', '*'].forEach((op) => {
        const c = conteo[op] || 0;
        distribucion[op] = { count: c, pct: totalEvaluados > 0 ? Number(((c / totalEvaluados) * 100).toFixed(1)) : 0 };
      });

      const indiceDificultad = totalEvaluados > 0
        ? Number((sumaLogro / totalEvaluados).toFixed(2))
        : 0;

      let indiceDiscriminacion = 0;
      if (n27 > 0) {
        const supProm = grupoSuperior.reduce((acc, it) => acc + logroPreguntaDeEvaluacion(it, numPregunta), 0) / n27;
        const infProm = grupoInferior.reduce((acc, it) => acc + logroPreguntaDeEvaluacion(it, numPregunta), 0) / n27;
        indiceDiscriminacion = Number((supProm - infProm).toFixed(2));
      }

      return {
        numero: numPregunta,
        respuesta_correcta: cfgBase.correcta || '-',
        puntos: cfgBase.puntos,
        tipo: cfgBase.tipo,
        anulada: cfgBase.anulada,
        total_correctas: totalCorrectas,
        indice_dificultad: cfgBase.anulada ? 0 : indiceDificultad,
        indice_discriminacion: cfgBase.anulada ? 0 : indiceDiscriminacion,
        distribucion,
      };
    });

    return res.json({
      prueba: {
        id: prueba.id,
        nombre: prueba.nombre,
        asignatura_nombre: prueba.asignatura_nombre,
        nombre_docente: prueba.nombre_docente,
        cantidad_preguntas: cantidadPreguntas,
        puntaje_total: Number(puntajeTotalPruebaBase.toFixed(2)),
        cantidad_alternativas: cantidadAlternativas,
        cantidad_formas: Number(prueba.cantidad_formas) || 1,
        nivel_exigencia: nivelExigencia,
        pauta_respuestas: pautaCompleta,
      },
      kpis,
      histograma,
      preguntas,
      matriz,
    });
  } catch (error: any) {
    console.error("Error en GET /api/estadisticas/prueba/:prueba_id:", error);
    return res.status(500).json({ error: "Error interno calculando analítica de prueba: " + error.message });
  }
});

// ==========================================
// DIMENSIÓN 2: ANALÍTICA GLOBAL (CON RBAC)
// ==========================================
app.get('/api/estadisticas/docente', authenticateToken, async (req: AuthRequest, res) => {
  const { docente_id, fecha_inicio, fecha_fin, asignatura_id, curso_id } = req.query;
  const user = req.user!;

  const isUuid = (val: unknown): val is string =>
    typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

  try {
    const buildFilters = (includeFechaResultado: boolean) => {
      const scope = buildPruebaScopeSql(user, 'p', 1);
      const conditions: string[] = [scope.sql];
      const params: any[] = [...scope.params];
      let idx = params.length + 1;

      if (user.rol !== 'docente' && typeof docente_id === 'string' && docente_id.trim() !== '' && docente_id.trim() !== 'all') {
        const docVal = docente_id.trim();
        if (isUuid(docVal)) {
          conditions.push(`(
            p.docente_id = $${idx}::uuid
            OR c.docente_id = $${idx}::uuid
            OR EXISTS (
              SELECT 1 FROM docente_asignatura da
              WHERE da.docente_id = $${idx}::uuid AND da.asignatura_id = p.asignatura_id
            )
            OR p.nombre_docente ILIKE (
              SELECT '%' || u.nombre_completo || '%' FROM usuarios u WHERE u.id = $${idx}::uuid LIMIT 1
            )
          )`);
          params.push(docVal);
          idx++;
        } else {
          conditions.push(`p.nombre_docente ILIKE $${idx}`);
          params.push(`%${docVal}%`);
          idx++;
        }
      }

      if (typeof asignatura_id === 'string' && asignatura_id.trim() !== '' && asignatura_id.trim() !== 'all') {
        const asigVal = asignatura_id.trim();
        if (isUuid(asigVal)) {
          conditions.push(`(p.asignatura_id = $${idx}::uuid OR asig.id = $${idx}::uuid)`);
          params.push(asigVal);
          idx++;
        } else {
          conditions.push(`COALESCE(asig.nombre, p.asignatura_nombre, 'General') = $${idx}`);
          params.push(asigVal);
          idx++;
        }
      }

      if (typeof curso_id === 'string' && curso_id.trim() !== '' && curso_id.trim() !== 'all') {
        const cursoVal = curso_id.trim();
        if (isUuid(cursoVal)) {
          conditions.push(`c.id = $${idx}::uuid`);
          params.push(cursoVal);
          idx++;
        } else {
          conditions.push(`COALESCE(c.nombre, p.asignatura_nombre, 'Sin curso') = $${idx}`);
          params.push(cursoVal);
          idx++;
        }
      }

      const dateCol = includeFechaResultado
        ? 'COALESCE(r.fecha_escaneo, p.creado_en)'
        : 'p.creado_en';

      if (typeof fecha_inicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha_inicio.trim())) {
        conditions.push(`${dateCol} >= $${idx}::date`);
        params.push(fecha_inicio.trim());
        idx++;
      }

      if (typeof fecha_fin === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha_fin.trim())) {
        conditions.push(`${dateCol} < ($${idx}::date + INTERVAL '1 day')`);
        params.push(fecha_fin.trim());
        idx++;
      }

      return { whereSql: conditions.join(' AND '), params };
    };

    const filterConRes = buildFilters(true);

    const gestionSql = `
      SELECT
        COUNT(DISTINCT p.id)::int AS total_pruebas,
        COUNT(r.id)::int AS total_hojas,
        COALESCE(ROUND(AVG(r.nota)::numeric, 2), 0)::float AS promedio_general,
        COALESCE(
          ROUND(
            (100.0 * SUM(CASE WHEN r.nota >= 4.0 THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0))::numeric,
            1
          ),
          0
        )::float AS tasa_aprobacion_general
      FROM pruebas p
      LEFT JOIN asignaturas asig ON asig.id = p.asignatura_id
      LEFT JOIN resultados r ON r.prueba_id = p.id
      LEFT JOIN alumnos al ON al.rut = r.alumno_rut
      LEFT JOIN cursos c ON c.id = al.curso_id
      WHERE ${filterConRes.whereSql};
    `;

    const rankingSql = `
      SELECT
        COALESCE(c.id::text, p.asignatura_nombre, 'sin-curso') AS curso_id,
        COALESCE(c.nombre, p.asignatura_nombre, 'Curso sin asignar') AS curso_nombre,
        COALESCE(c.anio_academico::text, EXTRACT(YEAR FROM COALESCE(p.creado_en, CURRENT_TIMESTAMP))::text) AS anio_academico,
        COUNT(DISTINCT p.id)::int AS total_pruebas,
        COUNT(r.id)::int AS total_hojas,
        COUNT(DISTINCT r.alumno_rut)::int AS total_alumnos,
        COALESCE(ROUND(AVG(r.nota)::numeric, 2), 0)::float AS promedio_notas,
        COALESCE(
          ROUND(
            (100.0 * SUM(CASE WHEN r.nota >= 4.0 THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0))::numeric,
            1
          ),
          0
        )::float AS tasa_aprobacion
      FROM resultados r
      INNER JOIN pruebas p ON p.id = r.prueba_id
      LEFT JOIN asignaturas asig ON asig.id = p.asignatura_id
      LEFT JOIN alumnos al ON al.rut = r.alumno_rut
      LEFT JOIN cursos c ON c.id = al.curso_id
      WHERE ${filterConRes.whereSql}
      GROUP BY
        COALESCE(c.id::text, p.asignatura_nombre, 'sin-curso'),
        COALESCE(c.nombre, p.asignatura_nombre, 'Curso sin asignar'),
        COALESCE(c.anio_academico::text, EXTRACT(YEAR FROM COALESCE(p.creado_en, CURRENT_TIMESTAMP))::text)
      ORDER BY promedio_notas DESC, tasa_aprobacion DESC;
    `;

    const evolucionSql = `
      SELECT
        p.id::text AS prueba_id,
        p.nombre AS prueba_nombre,
        COALESCE(asig.nombre, p.asignatura_nombre, 'General') AS asignatura_nombre,
        TO_CHAR(DATE(COALESCE(MAX(r.fecha_escaneo), p.creado_en)), 'YYYY-MM-DD') AS fecha,
        COUNT(r.id)::int AS total_hojas,
        COALESCE(ROUND(AVG(r.nota)::numeric, 2), 0)::float AS promedio_notas,
        COALESCE(
          ROUND(
            (100.0 * SUM(CASE WHEN r.nota >= 4.0 THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0))::numeric,
            1
          ),
          0
        )::float AS tasa_aprobacion
      FROM pruebas p
      LEFT JOIN asignaturas asig ON asig.id = p.asignatura_id
      INNER JOIN resultados r ON r.prueba_id = p.id
      LEFT JOIN alumnos al ON al.rut = r.alumno_rut
      LEFT JOIN cursos c ON c.id = al.curso_id
      WHERE ${filterConRes.whereSql}
      GROUP BY p.id, p.nombre, COALESCE(asig.nombre, p.asignatura_nombre, 'General'), p.creado_en
      ORDER BY COALESCE(MAX(r.fecha_escaneo), p.creado_en) ASC;
    `;

    const alumnosBaseSql = `
      WITH resumen_alumnos AS (
        SELECT
          r.alumno_rut AS rut,
          COALESCE(NULLIF(MAX(al.nombre_completo), ''), 'Alumno no registrado') AS nombre_completo,
          COALESCE(MAX(c.nombre), MAX(p.asignatura_nombre), 'Sin curso') AS curso_nombre,
          COUNT(r.id)::int AS evaluaciones_rendidas,
          ROUND(AVG(r.nota)::numeric, 2)::float AS promedio_nota,
          MIN(r.nota)::float AS nota_minima,
          MAX(r.nota)::float AS nota_maxima
        FROM resultados r
        INNER JOIN pruebas p ON p.id = r.prueba_id
        LEFT JOIN asignaturas asig ON asig.id = p.asignatura_id
        LEFT JOIN alumnos al ON al.rut = r.alumno_rut
        LEFT JOIN cursos c ON c.id = al.curso_id
        WHERE ${filterConRes.whereSql}
        GROUP BY r.alumno_rut
      )
    `;

    const destacadosSql = `${alumnosBaseSql} SELECT * FROM resumen_alumnos ORDER BY promedio_nota DESC, evaluaciones_rendidas DESC LIMIT 10;`;
    const enRiesgoSql = `${alumnosBaseSql} SELECT * FROM resumen_alumnos WHERE promedio_nota < 4.0 ORDER BY promedio_nota ASC, evaluaciones_rendidas DESC;`;

    // Catálogo de filtros disponibles acotado según el rol del usuario
    const scopeFiltros = buildPruebaScopeSql(user, 'p', 1);
    let usuariosFiltroSql = `SELECT id::text AS id, nombre_completo AS nombre FROM usuarios WHERE rol = 'docente'`;
    const usuariosFiltroParams: any[] = [];
    if (user.rol === 'docente') {
      usuariosFiltroSql = `SELECT id::text AS id, nombre_completo AS nombre FROM usuarios WHERE id = $1::uuid`;
      usuariosFiltroParams.push(user.id);
    } else if ((user.rol === 'jefe_carrera' || user.rol === 'director') && user.carrera_id) {
      usuariosFiltroSql = `SELECT id::text AS id, nombre_completo AS nombre FROM usuarios WHERE carrera_id = $1::uuid`;
      usuariosFiltroParams.push(user.carrera_id);
    } else if (user.rol === 'decano' && user.facultad_id) {
      usuariosFiltroSql = `
        SELECT u.id::text AS id, u.nombre_completo AS nombre
        FROM usuarios u
        LEFT JOIN carreras ca ON ca.id = u.carrera_id
        WHERE u.facultad_id = $1::uuid OR ca.facultad_id = $1::uuid`;
      usuariosFiltroParams.push(user.facultad_id);
    }

    const [gestionRes, rankingRes, evolucionRes, destacadosRes, enRiesgoRes, docentesCatalogRes, docentesPruebasRes, asigCatalogRes, cursosCatalogRes] = await Promise.all([
      pool.query(gestionSql, filterConRes.params),
      pool.query(rankingSql, filterConRes.params),
      pool.query(evolucionSql, filterConRes.params),
      pool.query(destacadosSql, filterConRes.params),
      pool.query(enRiesgoSql, filterConRes.params),
      pool.query(usuariosFiltroSql, usuariosFiltroParams),
      pool.query(
        `SELECT DISTINCT COALESCE(p.docente_id::text, p.nombre_docente) AS id, p.nombre_docente AS nombre
         FROM pruebas p
         WHERE ${scopeFiltros.sql} AND p.nombre_docente IS NOT NULL AND p.nombre_docente <> ''`,
        scopeFiltros.params
      ),
      pool.query(
        `SELECT DISTINCT COALESCE(a.id::text, p.asignatura_nombre) AS id, COALESCE(a.nombre, p.asignatura_nombre) AS nombre
         FROM pruebas p
         LEFT JOIN asignaturas a ON a.id = p.asignatura_id
         WHERE ${scopeFiltros.sql} AND COALESCE(a.nombre, p.asignatura_nombre) IS NOT NULL AND COALESCE(a.nombre, p.asignatura_nombre) <> ''`,
        scopeFiltros.params
      ),
      pool.query(`SELECT id::text AS id, nombre, anio_academico FROM cursos ORDER BY anio_academico DESC, nombre ASC`),
    ]);

    const docMap = new Map<string, { id: string; nombre: string }>();
    [...docentesCatalogRes.rows, ...docentesPruebasRes.rows].forEach((d: any) => {
      if (d?.id && d?.nombre) {
        const key = String(d.nombre).trim().toLowerCase();
        if (!docMap.has(key) || isUuid(String(d.id))) {
          docMap.set(key, { id: String(d.id), nombre: String(d.nombre) });
        }
      }
    });

    const asigMap = new Map<string, { id: string; nombre: string }>();
    asigCatalogRes.rows.forEach((a: any) => {
      if (a?.id && a?.nombre) {
        asigMap.set(String(a.id), { id: String(a.id), nombre: String(a.nombre) });
      }
    });

    return res.json({
      metricas_gestion: gestionRes.rows[0] || {
        total_pruebas: 0,
        total_hojas: 0,
        promedio_general: 0,
        tasa_aprobacion_general: 0,
      },
      ranking_cursos: rankingRes.rows,
      evolucion_temporal: evolucionRes.rows,
      alumnos_destacados: destacadosRes.rows,
      alumnos_en_riesgo: enRiesgoRes.rows,
      filtros_disponibles: {
        docentes: Array.from(docMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        asignaturas: Array.from(asigMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        cursos: cursosCatalogRes.rows,
      },
    });
  } catch (error: any) {
    console.error("Error en GET /api/estadisticas/docente:", error);
    return res.status(500).json({ error: "Error interno calculando analítica docente: " + error.message });
  }
});

// ==========================================
// RUTA PARA VALIDAR SI UN RUT EXISTE EN LA BD
// ==========================================
app.get('/api/alumnos/validar/:rut', authenticateToken, async (req, res) => {
  // 1. Obtenemos el RUT que viene en la URL (ej: /api/alumnos/validar/12785317-7)
  const { rut } = req.params;
  
  try {
    // 2. Consultamos la tabla "alumnos" en Neon
    const result = await pool.query('SELECT * FROM alumnos WHERE rut = $1', [rut]);
    
    // 3. Si encontramos al menos 1 resultado, el alumno existe.
    if (result.rows.length > 0) {
      res.json({ existe: true, alumno: result.rows[0] });
    } else {
      // Si no hay resultados, el RUT no está registrado.
      res.json({ existe: false });
    }
  } catch (error) {
    // Si hay un error en la base de datos, avisamos al frontend.
    console.error("Error validando RUT:", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// ==========================================
// RUTA PARA IMPORTAR ALUMNOS MASIVAMENTE (Optimizada y Deduplicada)
// ==========================================
app.post('/api/alumnos/importar', authenticateToken, requireRoles('admin', 'jefe_carrera', 'director', 'decano'), async (req, res) => {
  const { alumnos } = req.body; 
  
  if (!Array.isArray(alumnos) || alumnos.length === 0) {
    return res.status(400).json({ error: "No se recibieron alumnos válidos." });
  }

  try {
    // 1. DEDUPLICACIÓN: Usamos un Mapa para quedarnos con un solo registro por RUT.
    // Si un RUT aparece 2 veces, el mapa se queda con la última aparición.
    const mapaUnicos = new Map();
    for (const alumno of alumnos) {
      mapaUnicos.set(alumno.rut, alumno);
    }
    const alumnosUnicos = Array.from(mapaUnicos.values());

    // 2. INSERCIÓN MASIVA POR LOTES (para no saturar Postgres)
    const BATCH_SIZE = 1000;
    let procesados = 0;

    for (let i = 0; i < alumnosUnicos.length; i += BATCH_SIZE) {
      const batch = alumnosUnicos.slice(i, i + BATCH_SIZE);
      
      const valuesPlaceholders: string[] = [];
      const valuesParams: any[] = [];
      
      batch.forEach((alumno: any, index) => {
        const offset = index * 2;
        valuesPlaceholders.push(`($${offset + 1}, $${offset + 2})`);
        valuesParams.push(alumno.rut, alumno.nombre_completo);
      });

      const query = `
        INSERT INTO alumnos (rut, nombre_completo) 
        VALUES ${valuesPlaceholders.join(', ')}
        ON CONFLICT (rut) DO UPDATE 
        SET nombre_completo = EXCLUDED.nombre_completo;
      `;
      
      const result = await pool.query(query, valuesParams);
      procesados += result.rowCount || 0; 
    }

    // 3. Respuesta de éxito
    const duplicadosEliminados = alumnos.length - alumnosUnicos.length;
    const mensajeExtra = duplicadosEliminados > 0 
      ? ` (se ignoraron ${duplicadosEliminados} RUTs duplicados en el Excel)` 
      : '';

    res.json({ 
      success: true, 
      message: `Éxito. Se procesaron ${procesados} alumnos${mensajeExtra}.`
    });

  } catch (error: any) {
    console.error("Error en importación masiva:", error);
    res.status(500).json({ error: "Error interno al guardar en la base de datos: " + error.message });
  }
});

// Ruta para buscar alumnos por nombre o apellido
app.get('/api/alumnos/buscar', authenticateToken, async (req, res) => {
  try {
    const query = req.query.q as string;
    
    if (!query || query.trim().length < 3) {
      return res.json([]);
    }

    // 1. Separamos lo que escribió el usuario por espacios.
    const palabras = query.trim().split(/\s+/);
    
    // 2. Construimos las condiciones usando translate() para ignorar tildes, diéresis y ñ.
    // translate() busca caracteres específicos y los reemplaza por otros.
    const condiciones = palabras.map((_, index) => 
      `translate(lower(nombre_completo), 'áéíóúüñ', 'aeiouun') LIKE translate(lower($${index + 1}), 'áéíóúüñ', 'aeiouun')`
    ).join(' AND ');
    
    // 3. Los valores a buscar se pasan igual
    const valores = palabras.map(p => `%${p}%`);

    const result = await pool.query(
      `SELECT rut, nombre_completo AS nombre, '' AS apellido, '' AS carrera 
       FROM alumnos 
       WHERE ${condiciones} 
       LIMIT 10`,
      valores
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error buscando alumnos:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const isDevBackend = Boolean(process.env.BACKEND_PORT);
if (!isDevBackend) {
  const distDir = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        return res.sendFile(path.join(distDir, 'index.html'));
      }
      next();
    });
  }
}

// Exportamos la app para Vercel (Serverless)
export default app;

// Para AI Studio o entorno local, seguimos levantando el servidor tradicional
if (process.env.NODE_ENV !== 'production') {
  const PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => console.log(`Backend en puerto ${PORT}`));
}
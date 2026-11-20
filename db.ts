import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
type PgPool = InstanceType<typeof Pool>;

dotenv.config();

export const isDbConfigured = Boolean(
  process.env.DATABASE_URL &&
  process.env.DATABASE_URL.trim() !== '' &&
  !process.env.DATABASE_URL.includes('localhost') &&
  !process.env.DATABASE_URL.includes('127.0.0.1')
);

const ACADEMIC_BACKUP_FILE = path.join(process.cwd(), '.academic_db.json');

function loadAcademicData(): any {
  try {
    if (fs.existsSync(ACADEMIC_BACKUP_FILE)) {
      return JSON.parse(fs.readFileSync(ACADEMIC_BACKUP_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Aviso leyendo .academic_db.json:', e);
  }
  return { sedes: [], campus: [], facultades: [], carreras: [], asignaturas: [], docente_asignatura: [] };
}

function saveAcademicData(data: any): void {
  try {
    fs.writeFileSync(ACADEMIC_BACKUP_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Error guardando .academic_db.json:', e);
  }
}

const realPool: PgPool | null = isDbConfigured
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  : null;

export const pool: any = {
  isRealPool: Boolean(realPool),
  getRealPool: () => realPool,
  async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    if (realPool) {
      try {
        const res = await realPool.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
      } catch (err: any) {
        if (err?.code !== 'ECONNREFUSED' && !err?.message?.includes('ECONNREFUSED')) {
          throw err;
        }
        console.warn('DB no accesible (ECONNREFUSED en realPool), utilizando almacenamiento local en .academic_db.json');
      }
    }

    // Manejador local cuando no hay base de datos remota configurada o está inaccesible
    const sql = String(text || '').trim().toUpperCase();
    const data = loadAcademicData();

    if (sql.includes('INSERT INTO SEDES')) {
      const nombre = params[0] ? String(params[0]).trim() : '';
      const ciudad = params[1] ? String(params[1]).trim() : '';
      const currentSedes = data.sedes || [];
      const newId = currentSedes.length > 0
        ? Math.max(...currentSedes.map((s: any) => Number(s.id) || 0)) + 1
        : 1;
      const newRow = { id: newId, nombre, ciudad };
      currentSedes.push(newRow);
      data.sedes = currentSedes;
      saveAcademicData(data);
      return { rows: [newRow], rowCount: 1 };
    }

    if (sql.includes('COUNT(*)') && sql.includes('SEDES')) {
      const count = (data.sedes || []).length;
      return { rows: [{ count: String(count) }], rowCount: 1 };
    }

    if (sql.startsWith('SELECT') && sql.includes('SEDES')) {
      return { rows: data.sedes || [], rowCount: (data.sedes || []).length };
    }

    return { rows: [], rowCount: 0 };
  },
  async connect() {
    if (realPool) {
      return realPool.connect();
    }
    return {
      query: (t: string, p?: any[]) => pool.query(t, p),
      release: () => {},
    };
  },
  on(_event: string, _callback: any) {
    return pool;
  },
  async end() {
    if (realPool) {
      await realPool.end();
    }
  }
};

export async function safeQuery(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  try {
    return await pool.query(text, params);
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED')) {
      console.warn('DB no disponible (ECONNREFUSED), utilizando almacenamiento en memoria.');
    } else {
      console.warn('Aviso DB en consulta:', err?.message || err);
    }
    return { rows: [], rowCount: 0 };
  }
}
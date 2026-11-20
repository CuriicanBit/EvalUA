export type EstadoEscaneo = 'Completado' | 'Procesando' | 'Revisión Manual' | 'Error OMR';

export interface EscaneoItem {
  id: string;
  prueba: string;
  curso: string;
  fecha: string;
  estado: EstadoEscaneo;
  alumnosCount: number;
  puntajeTotal: number;
  nivelExigencia: number;
  promedioNotas?: number;
  hojasConAlerta?: number;
}

export interface Prueba {
  id: string;
  titulo: string;
  asignatura: string;
  curso: string;
  preguntasCount: number;
  puntajeTotal: number;
  nivelExigencia: number;
  fechaCreacion: string;
}

export interface AlumnoResultado {
  rut: string;
  nombre: string;
  puntaje: number;
  nota: number;
  respuestasCorrectas: number;
  estadoLectura: 'Óptima' | 'Revisada';
}

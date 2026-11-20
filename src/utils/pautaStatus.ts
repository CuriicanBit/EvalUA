export interface PautaStatus {
  completa: boolean;
  estado: 'vacia' | 'incompleta' | 'completa';
  respondidas: number;
  requeridas: number;
  formasFaltantes: string[];
  mensaje: string;
}

const LETRAS_FORMAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export function evaluarEstadoPauta(prueba: any): PautaStatus {
  const numPreguntas = Math.max(1, Number(prueba?.cantidad_preguntas || prueba?.preguntasCount || 0) || 1);
  const numFormas = Math.max(1, Math.min(4, Number(prueba?.cantidad_formas || prueba?.formas || 1) || 1));
  const formasRequeridas = LETRAS_FORMAS.slice(0, numFormas);
  const requeridas = numPreguntas * numFormas;

  let pauta = prueba?.pauta_respuestas;
  if (typeof pauta === 'string') {
    try {
      pauta = JSON.parse(pauta);
    } catch {
      pauta = null;
    }
  }

  if (!pauta || typeof pauta !== 'object' || Array.isArray(pauta) || Object.keys(pauta).length === 0) {
    return {
      completa: false,
      estado: 'vacia',
      respondidas: 0,
      requeridas,
      formasFaltantes: formasRequeridas,
      mensaje: 'La pauta de respuestas aún no ha sido creada ni guardada.',
    };
  }

  // Soporte defensivo en caso de pauta plana { "1": "A", ... } en vez de { A: { "1": "A" } }
  const keys = Object.keys(pauta);
  const esFormatoPorForma = keys.some((k) => LETRAS_FORMAS.includes(k.toUpperCase()) && typeof pauta[k] === 'object');

  let respondidas = 0;
  const formasFaltantes: string[] = [];

  // Función auxiliar para verificar si una pregunta está configurada válidamente
  const esPreguntaConfigurada = (val: any): boolean => {
    if (!val) return false;
    // Formato antiguo (string)
    if (typeof val === 'string') return val.trim().length > 0;
    // Formato nuevo (objeto)
    if (typeof val === 'object') {
      // Está configurada si tiene una respuesta correcta seleccionada, está anulada, o es de desarrollo
      return !!(val.correcta || val.anulada || val.tipo === 'desarrollo');
    }
    return false;
  };

  if (esFormatoPorForma) {
    for (const forma of formasRequeridas) {
      const mapaForma = pauta[forma] || pauta[forma.toLowerCase()] || {};
      let respondidasForma = 0;
      for (let i = 1; i <= numPreguntas; i++) {
        const val = mapaForma[i] ?? mapaForma[String(i)];
        if (esPreguntaConfigurada(val)) {
          respondidasForma++;
        }
      }
      respondidas += respondidasForma;
      if (respondidasForma < numPreguntas) {
        formasFaltantes.push(forma);
      }
    }
  } else {
    // Formato plano heredado (equivale a Forma A)
    let respondidasFlat = 0;
    for (let i = 1; i <= numPreguntas; i++) {
      const val = pauta[i] ?? pauta[String(i)];
      if (esPreguntaConfigurada(val)) {
        respondidasFlat++;
      }
    }
    respondidas = respondidasFlat;
    if (respondidasFlat < numPreguntas) {
      formasFaltantes.push('A');
    }
    if (numFormas > 1) {
      formasFaltantes.push(...formasRequeridas.slice(1));
    }
  }

  if (respondidas === 0) {
    return {
      completa: false,
      estado: 'vacia',
      respondidas: 0,
      requeridas,
      formasFaltantes,
      mensaje: 'La pauta de respuestas aún no ha sido creada ni guardada.',
    };
  }

  if (respondidas < requeridas || formasFaltantes.length > 0) {
    return {
      completa: false,
      estado: 'incompleta',
      respondidas,
      requeridas,
      formasFaltantes,
      mensaje: `La pauta está incompleta (${respondidas} de ${requeridas} respuestas configuradas).`,
    };
  }

  return {
    completa: true,
    estado: 'completa',
    respondidas,
    requeridas,
    formasFaltantes: [],
    mensaje: 'Pauta completa y guardada.',
  };
}
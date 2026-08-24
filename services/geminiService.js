const { GoogleGenerativeAI } = require("@google/generative-ai");

// ============================================================
// Servicio Gemini encapsulado
// ============================================================
// Acá definimos la lista de modelos. El orden importa:
// primero prueba el primero, si falla (cuota, 503, etc) pasa al siguiente.
// Configurás los modelos en .env con GEMINI_MODELOS separados por coma.
//
// Ejemplo en .env:
// GEMINI_MODELOS=gemini-2.5-flash-preview-09-2025,gemini-2.0-flash,gemini-1.5-flash
// ============================================================

const MODELOS_POR_DEFECTO = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash'
];

function obtenerModelos() {
  const desdeEnv = (process.env.GEMINI_MODELOS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return desdeEnv.length > 0 ? desdeEnv : MODELOS_POR_DEFECTO;
}

/**
 * Genera texto usando Gemini.
 * Prueba cada modelo de la lista. Si uno falla, salta al siguiente.
 * Devuelve el texto plano (ya con .trim()) o null si todos fallaron.
 */
async function generarTextoGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ No hay GEMINI_API_KEY configurada');
    return null;
  }

  const modelos = obtenerModelos();
  const genAI = new GoogleGenerativeAI(apiKey);

  let ultimoError = null;

  for (const modelo of modelos) {
    try {
      console.log(`🤖 Probando modelo Gemini: ${modelo}`);
      const model = genAI.getGenerativeModel({ model: modelo });
      const result = await model.generateContent(prompt);
      const usage = result.response.usageMetadata;
      if (usage) {
        const precioEntrada = 0.30; // USD por millón de tokens (gemini 2.5/2.0 flash)
        const precioSalida = 2.50;  // USD por millón de tokens
        const costoEntrada = ((usage.promptTokenCount || 0) / 1000000) * precioEntrada;
        const costoSalida = ((usage.candidatesTokenCount || 0) / 1000000) * precioSalida;
        const costoTotal = (costoEntrada + costoSalida).toFixed(6);
        console.log(`📊 Tokens -> Entrada: ${usage.promptTokenCount} | Salida: ${usage.candidatesTokenCount} | Total: ${usage.totalTokenCount}`);
        console.log(`💰 Costo estimado: $${costoTotal} USD (${modelo})`);
      }
      return result.response.text().trim();
    } catch (error) {
      ultimoError = error;
      console.warn(`⚠️ Modelo ${modelo} falló: ${error.message}. Probando siguiente...`);
    }
  }

  console.error('❌ Todos los modelos de Gemini fallaron:', ultimoError?.message || ultimoError);
  return null;
}

/**
 * Genera texto multimodal (con imagen) usando Gemini.
 * El parámetro base64 debe ser el contenido del archivo codificado en base64.
 */
async function generarTextoConImagen(prompt, mimeType, base64) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ No hay GEMINI_API_KEY configurada');
    return null;
  }

  const modelos = obtenerModelos();
  const genAI = new GoogleGenerativeAI(apiKey);

  let ultimoError = null;

  for (const modelo of modelos) {
    try {
      console.log(`🖼️ Probando modelo Gemini con visión: ${modelo}`);
      const model = genAI.getGenerativeModel({ model: modelo });
      const result = await model.generateContent([
        { text: prompt },
        { inlineData: { data: base64, mimeType } }
      ]);
      return result.response.text().trim();
    } catch (error) {
      ultimoError = error;
      console.warn(`⚠️ Modelo ${modelo} falló con imagen: ${error.message}. Probando siguiente...`);
    }
  }

  console.error('❌ Todos los modelos de Gemini fallaron con imagen:', ultimoError?.message || ultimoError);
  return null;
}

module.exports = { generarTextoGemini, generarTextoConImagen };

import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const ai = new GoogleGenAI();

// Enfoques variados para que cada ficha tenga dinámicas y contextos distintos
const ENFOQUES_VARIACION = [
  "Usa situaciones de la vida cotidiana (compras, viajes, deportes, cocina, naturaleza) con nombres de personajes poco habituales.",
  "Plantea los ejercicios combinando distintos formatos (completar huecos, relacionar, corregir errores, preguntas cortas y retos prácticos).",
  "Ambienta los ejemplos y problemas en escenarios creativos (ciencia, espacio, animales, inventos, historia o aventuras).",
  "Utiliza estructuras variadas en cada bloque: alterna ejercicios directos con pequeños acertijos, tablas para completar o casos prácticos.",
  "Evita los ejemplos típicos de libro de texto; inventa datos numéricos, frases y textos frescos y originales.",
];

function validarYNormalizar(raw, cantidadEsperada) {
  const ejercicios =
    raw?.ejercicios || raw?.exercises || raw?.actividades || raw?.activities || [];

  if (!Array.isArray(ejercicios) || ejercicios.length < cantidadEsperada) {
    throw new Error(
      `Incompleto: se pidieron ${cantidadEsperada} y llegaron ${ejercicios.length}.`
    );
  }

  return {
    titulo: raw?.titulo || raw?.title || "Ficha de Actividades",
    instrucciones_generales:
      raw?.instrucciones_generales ||
      raw?.instructions ||
      "Lee atentamente cada ejercicio y resuélvelo.",
    ejercicios: ejercicios.slice(0, cantidadEsperada).map((ej, idx) => ({
      enunciado: (ej?.enunciado || ej?.question || ej?.statement || `Ejercicio ${idx + 1}`)
        .replace(/^\d+[\.\-\)]\s*/, "")
        .trim(),
      contenido: (ej?.contenido || ej?.content || "").replace(/\\n/g, "\n"),
      lineas_respuesta:
        ej?.lineas_respuesta !== undefined ? Number(ej.lineas_respuesta) : 2,
      solucion: (ej?.solucion || ej?.solution || ej?.answer || "Consultar con el educador.")
        .replace(/\\n/g, "\n"),
    })),
  };
}

// 1. Cascada de modelos gratuitos de Google AI Studio
async function intentarConGoogle(prompt, cantidadEsperada, esquema) {
  const modelosGoogle = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemma-4-31b-it",
  ];

  for (const modelo of modelosGoogle) {
    try {
      const esGemma = modelo.startsWith("gemma");
      const esLite = modelo.includes("lite");

      const config = esGemma
        ? { temperature: 0.9 }
        : {
            responseMimeType: "application/json",
            responseSchema: esquema,
            temperature: 0.9,
            ...(esLite ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
          };

      const promesa = ai.models.generateContent({
        model: modelo,
        contents: prompt,
        config,
      });

      const limiteMs = esGemma ? 8000 : 15000;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), limiteMs)
      );

      const response = await Promise.race([promesa, timeout]);
      let texto = response.text || "{}";
      texto = texto.replace(/```json/gi, "").replace(/```/g, "").trim();

      const normalizado = validarYNormalizar(JSON.parse(texto), cantidadEsperada);
      return { ...normalizado, _modeloUsado: modelo };
    } catch (err) {
      console.warn(`Saltando ${modelo} (${err.message})`);
    }
  }

  return null;
}

// 2. Cascada de respaldo en Groq
async function generarConGroq(prompt, cantidadEsperada) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Todos los modelos de Google están ocupados y no hay GROQ_API_KEY.");
  }

  const resModelos = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resModelos.ok) {
    throw new Error(`Error consultando modelos de Groq (${resModelos.status})`);
  }

  const listaData = await resModelos.json();
  const idsDisponibles = (listaData.data || []).map((m) => m.id);

  const candidatosTexto = idsDisponibles.filter(
    (id) =>
      !id.includes("whisper") &&
      !id.includes("guard") &&
      !id.includes("tts") &&
      !id.includes("prompt") &&
      !id.toLowerCase().includes("qwen")
  );

  const preferencias = [
    "gpt-oss-120b",
    "llama-3.3",
    "llama-3.1-70b",
    "llama-4-scout",
    "gpt-oss-20b",
    "llama-3.1-8b",
  ];

  const ordenados = [...candidatosTexto].sort((a, b) => {
    const idxA = preferencias.findIndex((p) => a.toLowerCase().includes(p));
    const idxB = preferencias.findIndex((p) => b.toLowerCase().includes(p));
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  let ultimoError = "";

  for (const modeloElegido of ordenados.slice(0, 4)) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modeloElegido,
          temperature: 0.9,
          max_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Eres un maestro creativo de refuerzo escolar. Responde ÚNICAMENTE con un objeto JSON válido usando EXACTAMENTE estas claves en español (incluso si la asignatura es Inglés). El array "ejercicios" DEBE contener OBLIGATORIAMENTE ${cantidadEsperada} elementos distintos e inéditos:
              {
                "titulo": "string",
                "instrucciones_generales": "string",
                "ejercicios": [
                  {
                    "enunciado": "string",
                    "contenido": "string",
                    "lineas_respuesta": 2,
                    "solucion": "string"
                  }
                ]
              }`,
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        const normalizado = validarYNormalizar(parsed, cantidadEsperada);
        return { ...normalizado, _modeloUsado: `groq/${modeloElegido}` };
      }

      ultimoError = `Groq (${res.status}): ${await res.text()}`;
    } catch (err) {
      ultimoError = err.message;
    }
  }

  throw new Error(ultimoError || "No se pudo generar la ficha en este momento.");
}

export async function POST(request) {
  try {
    const datos = await request.json();
    const cantidad = Number(datos.numEjercicios) || 5;

    // Semilla única por cada clic para garantizar variedad total
    const semillaUnica = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const enfoqueAleatorio =
      datos.asignatura === "Matemáticas"
        ? "Varía los números, el orden de los ejercicios y los contextos de los problemas respecto a cualquier ficha anterior."
        : ENFOQUES_VARIACION[Math.floor(Math.random() * ENFOQUES_VARIACION.length)];

    const reglaComprension =
      datos.asignatura === "Comp. Lectora"
        ? `
      REGLA ESPECIAL PARA COMPRENSIÓN LECTORA:
      - El ejercicio número 1 DEBE contener un texto de lectura completamente nuevo y original (de 150 a 300 palabras según el curso) dentro del campo "contenido", con enunciado "Lee atentamente el siguiente texto:" y "lineas_respuesta": 0.
      - Los ejercicios siguientes (del 2 al ${cantidad}) serán preguntas variadas de comprensión sobre ese texto.
      `
        : "";

    const bloquesCalculo = Math.ceil(cantidad / 2);
    const bloquesProblemas = cantidad - bloquesCalculo;

    const reglaMatematicas =
      datos.asignatura === "Matemáticas"
        ? `
      REGLA OBLIGATORIA PARA MATEMÁTICAS (CUMPLIR ESTRICTAMENTE):
      - Los primeros ${bloquesCalculo} bloques (del 1 al ${bloquesCalculo}) DEBEN ser ÚNICAMENTE CÁLCULO NUMÉRICO PURO SIN TEXTO NI HISTORIAS.
        * En "contenido" pon SOLO 4 operaciones matemáticas directas con apartados a), b), c), d) separadas por saltos de línea reales (nunca escribas los caracteres "\\n"), por ejemplo:
          a) 348 × 26 = ____
          b) 519 × 34 = ____
          c) 704 × 18 = ____
          d) 625 × 47 = ____
        * PROHIBIDO poner nombres de personas, objetos o frases dentro de estos primeros ${bloquesCalculo} bloques. Solo números y signos matemáticos (+, -, ×, ÷, =, fracciones, etc. según el tema).
      - Los últimos ${bloquesProblemas} bloques (del ${bloquesCalculo + 1} al ${cantidad}) DEBEN ser PROBLEMAS DE TEXTO aplicados al tema exacto "${datos.tema}", usando números COMPLETAMENTE DISTINTOS a los de los bloques de cálculo anteriores.
      `
        : "";

    const prompt = `
      [ID de sesión única: ${semillaUnica}]
      Actúa como un maestro experto y muy creativo en apoyo escolar de la Asociación Ozanam.
      Crea una ficha de trabajo COMPLETAMENTE NUEVA E INÉDITA para imprimir con EXACTAMENTE ${cantidad} actividades/ejercicios distintos:
      - Asignatura: ${datos.asignatura}
      - Contenido / Tema concreto: ${datos.tema}
      - Curso / Edad: ${datos.curso}
      - Nivel de dificultad: ${datos.dificultad}
      - Cantidad OBLIGATORIA de bloques en el array "ejercicios": ${cantidad}
      - Detalle adicional: ${datos.observaciones || "Ninguno"}

      DIRECTRIZ DE ORIGINALIDAD PARA ESTA FICHA:
      ${enfoqueAleatorio}
      Inventa ejercicios, números, frases, historias y ejemplos totalmente distintos a cualquier ficha anterior. No repitas patrones ni ejemplos tópicos.

      REGLAS ESTRICTAS:
      1. Genera los ${cantidad} ejercicios completos (del 1 al ${cantidad}). Nunca pongas menos de ${cantidad}.
      2. No incluyas números al principio del campo "enunciado" (escribe "Calcula las siguientes operaciones", no "1. Calcula...").
      3. Si la asignatura es Inglés, redacta el contenido de los ejercicios en inglés adaptado al nivel, pero mantén las claves del JSON en español ("titulo", "instrucciones_generales", "ejercicios", "enunciado", "contenido", "lineas_respuesta", "solucion").
      4. En "contenido", pon los ítems listos para hacer en papel (apartados a, b, c, d..., frases con huecos ___ o datos del problema).
      5. En "lineas_respuesta", indica 1, 2 o 3 líneas según el espacio necesario (0 si es solo un texto de lectura).
      6. En "solucion", pon la respuesta correcta de forma clara y completa.
      7. Responde SOLO con el objeto JSON válido.
      ${reglaComprension}
      ${reglaMatematicas}
    `;

    const esquema = {
      type: Type.OBJECT,
      properties: {
        titulo: { type: Type.STRING },
        instrucciones_generales: { type: Type.STRING },
        ejercicios: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              enunciado: { type: Type.STRING },
              contenido: { type: Type.STRING },
              lineas_respuesta: { type: Type.INTEGER },
              solucion: { type: Type.STRING },
            },
            required: ["enunciado", "lineas_respuesta", "solucion"],
          },
        },
      },
      required: ["titulo", "instrucciones_generales", "ejercicios"],
    };

    const resultadoGoogle = await intentarConGoogle(prompt, cantidad, esquema);
    if (resultadoGoogle) {
      return NextResponse.json(resultadoGoogle);
    }

    const resultadoGroq = await generarConGroq(prompt, cantidad);
    return NextResponse.json(resultadoGroq);
  } catch (error) {
    console.error("Error general:", error);
    return NextResponse.json(
      { error: error.message || "No se pudo generar la ficha en este momento." },
      { status: 500 }
    );
  }
}
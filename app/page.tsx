"use client";
import { useState, useEffect, useRef } from "react";
import { TEMAS_MATEMATICAS } from "./asignaturas/matematicas";
import { TEMAS_LENGUA } from "./asignaturas/lengua";
import { TEMAS_INGLES } from "./asignaturas/ingles";
import { TEMAS_NATURALES } from "./asignaturas/ciencias-naturales";
import { TEMAS_SOCIALES } from "./asignaturas/ciencias-sociales";
import { TEMAS_COMPRENSION } from "./asignaturas/comprension-lectora";

// 👇 PARA AÑADIR UNA ASIGNATURA NUEVA EN EL FUTURO:
// 1. Impórtala arriba (ej: import { TEMAS_FRANCES } from "./asignaturas/frances";)
// 2. Añádela aquí debajo y la pestaña aparecerá sola en la pantalla:
const TEMARIO: Record<string, string[]> = {
  Matemáticas: TEMAS_MATEMATICAS,
  Lengua: TEMAS_LENGUA,
  "Comp. Lectora": TEMAS_COMPRENSION,
  Inglés: TEMAS_INGLES,
  "C. Naturales": TEMAS_NATURALES,
  "C. Sociales": TEMAS_SOCIALES,
};

interface Ejercicio {
  enunciado: string;
  contenido?: string;
  lineas_respuesta: number;
  solucion: string;
}

interface ResultadoFicha {
  titulo: string;
  instrucciones_generales: string;
  ejercicios: Ejercicio[];
}

const TIEMPO_LIMITE_SEGUNDOS = 180; // 3:00 minutos

export default function RefuerzoOzanam() {
  const listaAsignaturas = Object.keys(TEMARIO);

  const [asignatura, setAsignatura] = useState<string>(listaAsignaturas[0]);
  const [tema, setTema] = useState<string>(TEMARIO[listaAsignaturas[0]][0]);
  const [temaPersonalizado, setTemaPersonalizado] = useState<string>("");
  const [curso, setCurso] = useState("3º - 4º Primaria (8-10 años)");
  const [dificultad, setDificultad] = useState("Media (refuerzo estándar)");
  const [numEjercicios, setNumEjercicios] = useState(5);
  const [observaciones, setObservaciones] = useState("");

  const [resultado, setResultado] = useState<ResultadoFicha | null>(null);
  const [cargando, setCargando] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(TIEMPO_LIMITE_SEGUNDOS);
  const [mostrarSoluciones, setMostrarSoluciones] = useState(false);
  const [avisoExito, setAvisoExito] = useState(false);

  const seccionResultadoRef = useRef<HTMLElement | null>(null);

  const cambiarAsignatura = (nueva: string) => {
    setAsignatura(nueva);
    setTema(TEMARIO[nueva][0]);
    setTemaPersonalizado("");
  };

  useEffect(() => {
    if (!cargando) {
      setSegundosRestantes(TIEMPO_LIMITE_SEGUNDOS);
      return;
    }
    const intervalo = setInterval(() => {
      setSegundosRestantes((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(intervalo);
  }, [cargando]);

  useEffect(() => {
    if (!resultado) return;

    setAvisoExito(true);
    const timerAviso = setTimeout(() => setAvisoExito(false), 6000);

    setTimeout(() => {
      seccionResultadoRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Silencio si el navegador bloquea audio
    }

    return () => clearTimeout(timerAviso);
  }, [resultado]);

  const temaFinal = tema === "Otro" ? temaPersonalizado.trim() : tema;

  const minutosFormateados = Math.floor(segundosRestantes / 60);
  const segundosFormateados = String(segundosRestantes % 60).padStart(2, "0");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setResultado(null);
    setAvisoExito(false);

    const controlador = new AbortController();
    const temporizador = setTimeout(
      () => controlador.abort(),
      TIEMPO_LIMITE_SEGUNDOS * 1000
    );

    try {
      const res = await fetch("/api/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asignatura,
          tema: temaFinal,
          curso,
          dificultad,
          numEjercicios,
          observaciones,
        }),
        signal: controlador.signal,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Error al generar la ficha");
      }
      setResultado(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        alert("La petición tardó demasiado. Inténtalo de nuevo.");
      } else {
        const msg = err instanceof Error ? err.message : "Error inesperado.";
        alert("Error: " + msg);
      }
    } finally {
      clearTimeout(temporizador);
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16 print:bg-white print:pb-0">
      {/* Cabecera (oculta al imprimir) */}
      <header className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white shadow-md print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-300"></span>
            Asociación Ozanam · Apoyo y Refuerzo Escolar
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Generador de Fichas y Actividades
          </h1>
          <p className="text-teal-100 text-sm mt-1">
            Crea ejercicios personalizados listos para imprimir con solucionario aparte.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 -mt-5 print:mt-0 print:px-0 print:max-w-none">
        {/* Formulario (oculto al imprimir) */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 p-6 sm:p-8 space-y-6 print:hidden"
        >
          {/* Selector dinámico de Asignatura */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              1. Elige la asignatura
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {listaAsignaturas.map((asig) => {
                const activa = asignatura === asig;
                return (
                  <button
                    key={asig}
                    type="button"
                    onClick={() => cambiarAsignatura(asig)}
                    className={`py-3.5 px-4 rounded-xl font-bold text-base border-2 transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      activa
                        ? "border-teal-600 bg-teal-50 text-teal-800 shadow-sm"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>{asig}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Contenido y Nivel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Contenido / Tarea */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                2. Contenido o tarea a reforzar ({asignatura})
              </label>
              <select
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium text-sm rounded-xl px-4 py-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition"
              >
                {TEMARIO[asignatura].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                <option value="Otro">✏️ Otro contenido (escribir tema libre...)</option>
              </select>

              {tema === "Otro" && (
                <input
                  type="text"
                  required
                  placeholder={`Escribe aquí el tema concreto de ${asignatura} (ej. Análisis sintáctico, ecuaciones, ríos de España...)`}
                  value={temaPersonalizado}
                  onChange={(e) => setTemaPersonalizado(e.target.value)}
                  className="w-full mt-2.5 bg-teal-50/50 border border-teal-400 text-slate-900 text-sm rounded-xl px-4 py-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition"
                />
              )}
            </div>

            {/* Curso / Edad */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                3. Curso / Edad del niño o niña
              </label>
              <select
                value={curso}
                onChange={(e) => setCurso(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition"
              >
                <option>1º - 2º Primaria (6-8 años)</option>
                <option>3º - 4º Primaria (8-10 años)</option>
                <option>5º - 6º Primaria (10-12 años)</option>
                <option>1º - 2º ESO (12-14 años)</option>
                <option>3º - 4º ESO (14-16 años)</option>
              </select>
            </div>

            {/* Dificultad */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                4. Nivel de dificultad
              </label>
              <select
                value={dificultad}
                onChange={(e) => setDificultad(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition"
              >
                <option>Iniciación / Apoyo básico (muy guiado)</option>
                <option>Media (refuerzo estándar)</option>
                <option>Ampliación / Reto</option>
              </select>
            </div>

            {/* Número de ejercicios */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                5. Número de bloques de ejercicios
              </label>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-300 rounded-xl px-4 py-2">
                <span className="text-sm text-slate-600">Cantidad de actividades:</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setNumEjercicios((n) => Math.max(2, n - 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-bold text-slate-900">
                    {numEjercicios}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNumEjercicios((n) => Math.min(20, n + 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Personalización opcional */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                6. Detalle o temática (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Con temática de fútbol, números hasta el 999..."
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition"
              />
            </div>
          </div>

          {/* Botón Generar */}
          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md shadow-teal-600/20 transition-all flex items-center justify-center gap-2.5 disabled:opacity-75 cursor-pointer"
          >
            {cargando ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Preparando ficha de {asignatura}...</span>
                <span className="ml-1 bg-white/20 px-2.5 py-0.5 rounded-md text-xs font-mono">
                  {minutosFormateados}:{segundosFormateados}
                </span>
              </>
            ) : (
              <span>Generar Ficha de Ejercicios</span>
            )}
          </button>
        </form>

        {/* Ficha Generada */}
        {resultado && (
          <section
            ref={seccionResultadoRef}
            className="mt-8 bg-white p-6 sm:p-10 rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 space-y-6 scroll-mt-6 print:mt-0 print:p-0 print:shadow-none print:border-none"
          >
            {/* Aviso de éxito */}
            {avisoExito && (
              <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl shadow-sm print:hidden">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                    ✓
                  </span>
                  <div className="text-sm">
                    <strong>¡Ficha lista!</strong> Puedes imprimirla o descargarla en PDF con el solucionario en hoja aparte.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAvisoExito(false)}
                  className="text-emerald-700 hover:text-emerald-950 text-xs font-bold px-2 py-1 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            )}

            {/* Barra de acciones (solo pantalla) */}
            <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 print:hidden">
              <div className="text-sm text-slate-600">
                Asignatura: <strong className="text-slate-900">{asignatura}</strong> ·{" "}
                <span className="text-slate-500">{temaFinal}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarSoluciones(!mostrarSoluciones)}
                  className="text-sm bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer"
                >
                  {mostrarSoluciones ? "Ocultar Soluciones" : "Ver Soluciones"}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-sm bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-semibold shadow-sm transition cursor-pointer"
                >
                  Descargar PDF / Imprimir
                </button>
              </div>
            </div>

            {/* HOJA 1 (PDF): FICHA DEL ALUMNO */}
            <div>
              {/* Cabecera oficial impresión */}
              <div className="hidden print:block border-b-2 border-gray-800 pb-4 mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-lg uppercase tracking-wide">
                    Asociación Ozanam · Apoyo Escolar
                  </span>
                  <span className="text-sm font-semibold text-gray-700">
                    {asignatura} · {curso}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm pt-1">
                  <div className="col-span-2">
                    <strong>Nombre:</strong> _____________________________________________
                  </div>
                  <div>
                    <strong>Fecha:</strong> _______________
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 print:text-xl">
                  {resultado.titulo}
                </h2>
                <p className="text-sm text-slate-600 mt-1 print:text-black">
                  {resultado.instrucciones_generales}
                </p>
              </div>

              <div className="space-y-6">
                {(resultado.ejercicios || []).map((ej, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 break-inside-avoid print:bg-transparent print:border-gray-300 print:p-3.5"
                  >
                    <p className="font-bold text-slate-900 text-base">
                      {idx + 1}. {ej.enunciado.replace(/^\d+[\.\-\)]\s*/, "")}
                    </p>

                    {ej.contenido && (
                      <div className="mt-2.5 whitespace-pre-line font-mono text-sm sm:text-base bg-white p-3.5 rounded-lg border border-slate-200 text-slate-800 print:border-none print:p-1 print:text-black">
                        {ej.contenido}
                      </div>
                    )}

                    {/* Solución visible en pantalla si el monitor activa "Ver Soluciones" */}
                    {mostrarSoluciones && ej.lineas_respuesta > 0 && (
                      <div className="mt-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-lg print:hidden">
                        <strong>Solución:</strong> {ej.solucion}
                      </div>
                    )}

                    {/* Líneas en blanco para escribir en el PDF impreso */}
                    {ej.lineas_respuesta > 0 && (
                      <div className="hidden print:block mt-4 space-y-5">
                        {Array.from({ length: ej.lineas_respuesta }).map((_, lIdx) => (
                          <div key={lIdx} className="border-b border-gray-400 h-4"></div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* HOJA 2 (SOLO PDF): SOLUCIONARIO PARA EL VOLUNTARIO / EDUCADOR */}
            <div className="hidden print:block print:break-before-page">
              <div className="border-b-2 border-gray-800 pb-3 mb-6">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg uppercase tracking-wide">
                    Asociación Ozanam
                  </span>
                  <span className="text-sm font-semibold uppercase tracking-wider text-gray-700">
                    Hoja de Soluciones (Educadores)
                  </span>
                </div>
                <p className="text-base font-bold text-black mt-2">
                  {asignatura}: {resultado.titulo}
                </p>
              </div>

              <div className="space-y-4">
                {(resultado.ejercicios || []).map((ej, idx) => (
                  <div key={idx} className="break-inside-avoid border-b border-gray-200 pb-3 text-sm">
                    <p className="font-bold text-black">
                      {idx + 1}. {ej.enunciado.replace(/^\d+[\.\-\)]\s*/, "")}
                    </p>
                    <p className="text-gray-800 mt-1 whitespace-pre-line">
                      <strong>Solución:</strong> {ej.solucion}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
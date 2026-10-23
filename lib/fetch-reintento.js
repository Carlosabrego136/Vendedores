// Pide un JSON al servidor y, si el servidor está saturado (por ejemplo, la
// base de datos sin conexiones libres en ese instante), reintenta solo unas
// cuantas veces con espera creciente. Si al final no se pudo, lanza un error
// para que la pantalla avise y ofrezca "Reintentar" en vez de quedarse en
// "Cargando..." para siempre.
const ESPERAS_MS = [1500, 3000, 5000];

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonConReintento(url, opciones = {}) {
  let ultimoError;
  for (let intento = 0; intento <= ESPERAS_MS.length; intento += 1) {
    try {
      const res = await fetch(url, { cache: 'no-store', ...opciones });
      if (!res.ok) throw new Error(`Respuesta ${res.status}`);
      return await res.json();
    } catch (err) {
      ultimoError = err;
      if (err && err.name === 'AbortError') throw err;
      if (intento < ESPERAS_MS.length) {
        await esperar(ESPERAS_MS[intento] + Math.floor(Math.random() * 400));
      }
    }
  }
  throw ultimoError;
}

// Conexión a la MISMA base de datos Aiven (Postgres) que usa el sistema
// principal de ENVIOS AYORA. Esta sección de Vendedores lee y escribe ahí
// directamente (no es una copia de los datos).
//
// IMPORTANTE — por qué NO se usa un "pool" de conexiones aquí:
// la base de Aiven solo permite 20 conexiones en total, compartidas con varios
// sistemas. En Vercel cada petición puede correr en una instancia distinta y,
// apenas responde, Vercel la "congela": los temporizadores dejan de correr, así
// que una conexión de un pool (aunque tenga idleTimeoutMillis) se queda ABIERTA
// y sin usar durante varios minutos, ocupando uno de los 20 lugares. Con unas
// cuantas instancias se llenaba el límite y todo fallaba con "too many clients
// already" (código 53300), incluso con casi nadie usando el sistema.
//
// Ahora cada consulta abre su propia conexión, la usa y la CIERRA antes de
// responder, así no queda ninguna conexión abierta ni dormida.
const { Client } = require('pg');
const { sanitizeConnectionString } = require('./pg-connection');

function configCliente() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'Falta DATABASE_URL en el archivo .env.local (usa la misma cadena de conexión del sistema principal).'
    );
  }
  return {
    connectionString: sanitizeConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000, // tiempo máximo para conectarse
    statement_timeout: 15000, // tiempo máximo para que una consulta responda
    query_timeout: 15000,
  };
}

// Máximo de consultas simultáneas por instancia de Vercel (las demás esperan
// su turno), para que una sola instancia no abra muchas conexiones a la vez.
const MAX_SIMULTANEAS = 2;
let enUso = 0;
const enEspera = [];

function tomarTurno() {
  if (enUso < MAX_SIMULTANEAS) {
    enUso += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => enEspera.push(resolve));
}

function soltarTurno() {
  const siguiente = enEspera.shift();
  if (siguiente) siguiente(); // el turno pasa directo al siguiente en espera
  else enUso -= 1;
}

// Cuando no se pudo CONECTAR (por ejemplo, no queda ninguna conexión libre en
// la base: código 53300, o la conexión tardó demasiado), la consulta todavía
// no se ejecutó, así que es seguro volver a intentar — incluso al guardar
// datos: no se puede duplicar nada. Se reintenta unas veces con una pequeña
// espera, que normalmente basta para que se libere un lugar.
const ESPERAS_REINTENTO_MS = [300, 700, 1300];
const CODIGOS_REINTENTABLES = new Set(['53300', '57P03', 'ECONNRESET', 'ETIMEDOUT']);

function esSinConexionesLibres(err) {
  return Boolean(err) && err.code === '53300';
}

function esErrorDeConexionReintentable(err) {
  if (!err) return false;
  if (CODIGOS_REINTENTABLES.has(err.code)) return true;
  return /timeout|terminated|ECONNRESET/i.test(String(err.message || ''));
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ejecutarUnaVez(text, params) {
  const client = new Client(configCliente());
  // Evita que un error asíncrono de la conexión tumbe toda la función.
  client.on('error', () => {});
  try {
    await client.connect();
  } catch (err) {
    err.fallaAlConectar = true; // la consulta no llegó a ejecutarse
    try {
      await client.end();
    } catch (e) {}
    throw err;
  }
  try {
    return await client.query(text, params);
  } finally {
    try {
      await client.end();
    } catch (e) {}
  }
}

async function query(text, params) {
  await tomarTurno();
  try {
    for (let intento = 0; ; intento += 1) {
      try {
        return await ejecutarUnaVez(text, params);
      } catch (err) {
        const sePuedeReintentar =
          err && err.fallaAlConectar && esErrorDeConexionReintentable(err) && intento < ESPERAS_REINTENTO_MS.length;
        if (!sePuedeReintentar) throw err;
        // Un poco de variación al azar para que varias peticiones que
        // fallaron juntas no vuelvan a chocar todas en el mismo instante.
        await esperar(ESPERAS_REINTENTO_MS[intento] + Math.floor(Math.random() * 200));
      }
    }
  } finally {
    soltarTurno();
  }
}

module.exports = { query, esSinConexionesLibres };

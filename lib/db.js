// Conexión a la MISMA base de datos Aiven (Postgres) que usa el sistema
// principal de ENVIOS AYORA. Esta sección de Vendedores lee y escribe ahí
// directamente (no es una copia de los datos).
const { Pool } = require('pg');
const { pgConfig } = require('./pg-connection');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'Falta DATABASE_URL en el archivo .env.local (usa la misma cadena de conexión del sistema principal).'
      );
    }
    pool = new Pool(pgConfig(process.env.DATABASE_URL));
  }
  return pool;
}

// La base de datos de Aiven (plan básico) solo permite 20 conexiones en
// total, compartidas con otros sistemas. Cuando se juntan varias peticiones
// a la vez, a veces no queda ninguna libre y Postgres responde con el código
// 53300 ("too many clients" / "remaining connection slots...") — antes eso
// se veía como un 500 en pantalla. Ese error se da ANTES de que la consulta
// se ejecute, así que es seguro volver a intentar (incluso al guardar datos:
// no se puede duplicar nada). Se reintenta unas cuantas veces con una
// pequeña espera, que normalmente basta para que otra conexión se libere.
const ESPERAS_REINTENTO_MS = [300, 700, 1300];

function esSinConexionesLibres(err) {
  return Boolean(err) && err.code === '53300';
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function query(text, params) {
  const p = getPool();
  for (let intento = 0; ; intento += 1) {
    try {
      return await p.query(text, params);
    } catch (err) {
      if (!esSinConexionesLibres(err) || intento >= ESPERAS_REINTENTO_MS.length) throw err;
      // Un poco de variación al azar para que varias peticiones que
      // fallaron juntas no vuelvan a chocar todas en el mismo instante.
      await esperar(ESPERAS_REINTENTO_MS[intento] + Math.floor(Math.random() * 200));
    }
  }
}

module.exports = { getPool, query, esSinConexionesLibres };

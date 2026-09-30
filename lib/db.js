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

async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

module.exports = { getPool, query };

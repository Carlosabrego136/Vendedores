// Aiven usa un certificado propio (no viene firmado por una autoridad pública
// estándar), y cuando el connection string trae "?sslmode=require" la
// librería `pg` a veces ignora la opción ssl explícita y valida el
// certificado de forma estricta, tronando con:
//   Error: self signed certificate in certificate chain
//
// Para evitarlo: quitamos el "sslmode" de la URL y forzamos nosotros mismos
// el objeto ssl con rejectUnauthorized:false (seguimos usando SSL, solo no
// exigimos que el certificado esté firmado por una CA pública).

function sanitizeConnectionString(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch (err) {
    // Si por alguna razón no se puede parsear como URL, la regresamos tal cual.
    return url;
  }
}

function pgConfig(connectionString) {
  return {
    connectionString: sanitizeConnectionString(connectionString),
    ssl: { rejectUnauthorized: false },
    // Antes no había ningún límite de tiempo: si la base de datos (o la
    // conexión hacia ella) se quedaba trabada, la consulta se quedaba
    // esperando para siempre y la pantalla de "Imprimir credenciales" se
    // quedaba atorada sin ningún aviso. Con estos límites, si algo tarda
    // demasiado, se corta solo y el código de arriba (que ya sabe manejar
    // errores) puede avisar y dejar reintentar, en vez de quedarse colgado.
    connectionTimeoutMillis: 8000, // tiempo máximo para conseguir una conexión del pool
    statement_timeout: 15000, // tiempo máximo para que una consulta responda
    query_timeout: 15000,
  };
}

module.exports = { sanitizeConnectionString, pgConfig };

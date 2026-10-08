// Trae la foto de credencial de varios vendedores en una sola consulta, en
// vez de pedirla uno por uno (eso es lo que hacía que la pantalla de
// "Imprimir varias credenciales" se trabara o tardara mucho con selecciones
// grandes). Se usa solo con los ids que ya se seleccionaron para imprimir.
const { query } = require('../../../lib/db');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const idsParam = req.query.ids;
  if (!idsParam) return res.status(200).json([]);

  const ids = String(idsParam)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) return res.status(200).json([]);

  try {
    const { rows } = await query(
      'SELECT id, foto_credencial FROM vendedores WHERE id = ANY($1::uuid[])',
      [ids]
    );
    return res.status(200).json(rows);
  } catch (err) {
    // Antes, si la consulta tronaba (ej. por un id raro o un problema
    // pasajero de conexión), la función se caía sin responder nada y la
    // pantalla de imprimir se quedaba esperando sin saber qué pasó. Ahora
    // siempre se contesta algo, para que el navegador pueda avisar y dejar
    // reintentar en vez de quedarse trabado.
    console.error('Error al traer fotos de credencial:', err);
    return res.status(500).json({ error: 'No se pudieron traer las fotos en este momento.' });
  }
}

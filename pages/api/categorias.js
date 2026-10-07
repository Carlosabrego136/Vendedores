// Lee y crea las categorías/bloques (misma base de datos compartida con el
// panel principal). También se pueden crear desde aquí ahora, porque el
// campo "Categoría" del formulario de vendedor permite escribir una
// categoría nueva directamente (y se da de alta sola si no existía).
const { query } = require('../../lib/db');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { rows } = await query('SELECT * FROM categorias ORDER BY nombre ASC');
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { clave, nombre } = req.body;
    if (!clave || !nombre) return res.status(400).json({ error: 'clave y nombre son requeridos' });
    const { rows } = await query(
      'INSERT INTO categorias (clave, nombre) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET nombre = $2 RETURNING *',
      [clave, nombre]
    );
    return res.status(201).json(rows[0]);
  }

  res.status(405).end();
}

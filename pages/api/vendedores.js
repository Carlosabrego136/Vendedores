const { query } = require('../../lib/db');
const { nanoid } = require('nanoid');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const incluirInactivos = req.query.incluirInactivos === '1';
    const { rows } = await query(
      `SELECT v.*, c.nombre AS categoria_nombre
       FROM vendedores v
       LEFT JOIN categorias c ON c.id = v.categoria_id
       ${incluirInactivos ? '' : 'WHERE v.activo = true'}
       ORDER BY v.nombre ASC`
    );
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { nombre, categoria_id } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    const qr_codigo = `VEND-${nanoid(10)}`;
    const { rows } = await query(
      'INSERT INTO vendedores (nombre, categoria_id, qr_codigo) VALUES ($1, $2, $3) RETURNING *',
      [nombre, categoria_id || null, qr_codigo]
    );
    return res.status(201).json(rows[0]);
  }

  res.status(405).end();
}

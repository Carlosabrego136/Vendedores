const { query } = require('../../../lib/db');

// Reporte de vendedores cuyo registro está por vencer (o ya venció),
// para que la clienta pueda revisarlos organizados por mes.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { rows } = await query(
    `SELECT id, nombre, telefono, fecha_ingreso, fecha_vencimiento, estatus
     FROM vendedores
     WHERE activo = true
       AND fecha_vencimiento <= (CURRENT_DATE + INTERVAL '60 days')
     ORDER BY fecha_vencimiento ASC`
  );
  return res.status(200).json(rows);
}

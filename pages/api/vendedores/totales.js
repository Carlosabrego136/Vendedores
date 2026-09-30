const { query } = require('../../../lib/db');

// Totales por estatus, contando TODOS los vendedores (activos y
// desactivados) para que el número siempre sea el real, sin importar si en
// pantalla se está mostrando el filtro de "desactivados" o no.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { rows } = await query(
    `SELECT estatus, COUNT(*)::int AS total
     FROM vendedores
     GROUP BY estatus`
  );

  const totales = {
    activo: 0,
    inactivo: 0,
    alerta_riesgo: 0,
    vetado: 0,
  };
  let total = 0;
  rows.forEach((r) => {
    if (totales[r.estatus] !== undefined) totales[r.estatus] = r.total;
    total += r.total;
  });

  return res.status(200).json({ ...totales, total });
}

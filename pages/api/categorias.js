// Lee las categorías/bloques que ya existen en el sistema principal (misma
// base de datos compartida). Aquí solo se leen para poder asignárselas a un
// vendedor — las categorías en sí se siguen creando/editando desde el panel
// principal, no desde este proyecto.
const { query } = require('../../lib/db');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { rows } = await query('SELECT * FROM categorias ORDER BY nombre ASC');
    return res.status(200).json(rows);
  }

  res.status(405).end();
}

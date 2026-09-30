const { query } = require('../../../lib/db');

function calcularVencimiento(fechaIngresoStr) {
  const d = new Date(`${fechaIngresoStr}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    // Trae el registro completo, incluyendo la foto de la INE — se usa solo
    // al abrir el detalle/edición de un vendedor en particular.
    const { rows } = await query('SELECT * FROM vendedores WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
    return res.status(200).json(rows[0]);
  }

  if (req.method === 'PATCH') {
    const {
      nombre,
      categoria_id,
      activo,
      telefono,
      fecha_nacimiento,
      fecha_ingreso,
      facebook,
      referencia1_nombre,
      referencia1_telefono,
      referencia2_nombre,
      referencia2_telefono,
      ine_foto,
      estatus,
    } = req.body;

    // La fecha de vencimiento se recalcula sola si cambia la fecha de
    // ingreso — nunca se edita a mano.
    const vencimiento = fecha_ingreso ? calcularVencimiento(fecha_ingreso) : null;

    // Si se manda un estatus nuevo, mantenemos sincronizado el booleano
    // "activo" que ya usa el panel administrativo general (activo = true
    // solo cuando el estatus queda en "activo"), sin tocar ni mostrar nada
    // nuevo allá.
    const activoDesdeEstatus = estatus ? estatus === 'activo' : null;

    const { rows } = await query(
      `UPDATE vendedores
       SET nombre = COALESCE($1, nombre),
           categoria_id = CASE WHEN $2::text = '__null__' THEN NULL ELSE COALESCE($2::uuid, categoria_id) END,
           activo = COALESCE($3, COALESCE($4, activo)),
           telefono = COALESCE($5, telefono),
           fecha_nacimiento = COALESCE($6::date, fecha_nacimiento),
           fecha_ingreso = COALESCE($7::date, fecha_ingreso),
           fecha_vencimiento = COALESCE($8::date, fecha_vencimiento),
           facebook = COALESCE($9, facebook),
           referencia1_nombre = COALESCE($10, referencia1_nombre),
           referencia1_telefono = COALESCE($11, referencia1_telefono),
           referencia2_nombre = COALESCE($12, referencia2_nombre),
           referencia2_telefono = COALESCE($13, referencia2_telefono),
           ine_foto = COALESCE($14, ine_foto),
           estatus = COALESCE($15, estatus)
       WHERE id = $16
       RETURNING id, nombre, qr_codigo, estatus, activo, fecha_ingreso, fecha_vencimiento`,
      [
        nombre ?? null,
        categoria_id === null ? '__null__' : categoria_id ?? null,
        activo ?? null,
        activoDesdeEstatus,
        telefono ?? null,
        fecha_nacimiento ?? null,
        fecha_ingreso ?? null,
        vencimiento,
        facebook ?? null,
        referencia1_nombre ?? null,
        referencia1_telefono ?? null,
        referencia2_nombre ?? null,
        referencia2_telefono ?? null,
        ine_foto ?? null,
        estatus ?? null,
        id,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
    return res.status(200).json(rows[0]);
  }

  if (req.method === 'DELETE') {
    try {
      const { rows } = await query('DELETE FROM vendedores WHERE id = $1 RETURNING id', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      // 23503 = violación de llave foránea (el vendedor tiene paquetes registrados)
      if (err.code === '23503') {
        return res.status(409).json({
          error: 'No se puede eliminar: este vendedor tiene paquetes o asistencias registradas en su historial. Puedes desactivarlo en su lugar.',
        });
      }
      console.error(err);
      return res.status(500).json({ error: 'Error al eliminar el vendedor' });
    }
  }

  res.status(405).end();
}

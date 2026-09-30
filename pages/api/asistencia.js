const { query } = require('../../lib/db');

// Cuántos días de aviso antes del vencimiento se consideran "por vencer"
// (la clienta puso de ejemplo 7 días; usamos 15 para que le dé más margen).
const DIAS_AVISO_VENCIMIENTO = 15;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasEntre(fechaA, fechaB) {
  const a = new Date(`${fechaA}T00:00:00Z`);
  const b = new Date(`${fechaB}T00:00:00Z`);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Se llama al escanear el QR de un vendedor el día del pase de lista
    // (los viernes). Registra su asistencia de HOY si no la tenía ya.
    const { qr_codigo } = req.body;
    if (!qr_codigo) return res.status(400).json({ error: 'qr_codigo es requerido' });

    const { rows: vendedores } = await query(
      'SELECT id, nombre, estatus, fecha_vencimiento FROM vendedores WHERE qr_codigo = $1',
      [qr_codigo]
    );
    if (vendedores.length === 0) {
      return res.status(404).json({ error: 'No se encontró ningún vendedor con ese código QR.' });
    }
    const vendedor = vendedores[0];
    const hoy = hoyISO();

    const { rows: insertados } = await query(
      `INSERT INTO asistencias_vendedores (vendedor_id, fecha)
       VALUES ($1, $2)
       ON CONFLICT (vendedor_id, fecha) DO NOTHING
       RETURNING id`,
      [vendedor.id, hoy]
    );
    const yaEstabaRegistrado = insertados.length === 0;

    const diasParaVencer = vendedor.fecha_vencimiento
      ? diasEntre(hoy, vendedor.fecha_vencimiento)
      : null;
    const porVencer = diasParaVencer !== null && diasParaVencer <= DIAS_AVISO_VENCIMIENTO;

    return res.status(200).json({
      ok: true,
      yaEstabaRegistrado,
      vendedor: {
        id: vendedor.id,
        nombre: vendedor.nombre,
        estatus: vendedor.estatus,
        fecha_vencimiento: vendedor.fecha_vencimiento,
      },
      diasParaVencer,
      porVencer,
    });
  }

  if (req.method === 'GET') {
    // Historial de asistencias — se usa para mostrar la lista de quién ha
    // asistido, agrupado por fecha (recuerda: solo se escanea los viernes,
    // así que cada fecha distinta ya es, en la práctica, una semana distinta).
    const { rows } = await query(
      `SELECT a.fecha, a.creado_en, v.id AS vendedor_id, v.nombre AS vendedor_nombre
       FROM asistencias_vendedores a
       JOIN vendedores v ON v.id = a.vendedor_id
       ORDER BY a.fecha DESC, v.nombre ASC
       LIMIT 500`
    );
    return res.status(200).json(rows);
  }

  res.status(405).end();
}

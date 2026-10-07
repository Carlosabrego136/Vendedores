const { query } = require('../../lib/db');
const { nanoid } = require('nanoid');

// Calcula la fecha de vencimiento como 1 año exacto después del ingreso.
// Se recalcula sola siempre que se registra o se cambia la fecha de ingreso —
// no es un campo que la clienta tenga que llenar a mano.
function calcularVencimiento(fechaIngresoStr) {
  const d = new Date(`${fechaIngresoStr}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const incluirInactivos = req.query.incluirInactivos === '1';
    // Nota: no se selecciona ine_foto aquí (solo si tiene una guardada), para
    // no cargar la lista completa con imágenes pesadas en base64.
    const { rows } = await query(
      `SELECT v.id, v.nombre, v.categoria_id, c.nombre AS categoria_nombre,
              v.qr_codigo, v.activo, v.estatus, v.telefono, v.fecha_nacimiento,
              v.fecha_ingreso, v.fecha_vencimiento, v.facebook,
              v.referencia1_nombre, v.referencia1_telefono,
              v.referencia2_nombre, v.referencia2_telefono,
              v.numero_registro,
              (v.ine_foto IS NOT NULL) AS tiene_ine,
              (v.foto_credencial IS NOT NULL) AS tiene_foto_credencial
       FROM vendedores v
       LEFT JOIN categorias c ON c.id = v.categoria_id
       ${incluirInactivos ? '' : 'WHERE v.activo = true'}
       ORDER BY v.nombre ASC`
    );
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const {
      nombre,
      categoria_id,
      telefono,
      fecha_nacimiento,
      fecha_ingreso,
      facebook,
      referencia1_nombre,
      referencia1_telefono,
      referencia2_nombre,
      referencia2_telefono,
      ine_foto,
      foto_credencial,
      estatus,
    } = req.body;

    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

    const qr_codigo = `VEND-${nanoid(10)}`;
    const ingreso = fecha_ingreso || hoyISO();
    const vencimiento = calcularVencimiento(ingreso);
    const estatusFinal = estatus || 'activo';

    // El número de registro se asigna solo, de forma consecutiva (1, 2, 3...),
    // tomando el máximo ya usado + 1 — así nunca hay que capturarlo a mano.
    const { rows } = await query(
      `WITH siguiente AS (
         SELECT COALESCE(MAX(numero_registro), 0) + 1 AS n FROM vendedores
       )
       INSERT INTO vendedores
         (nombre, categoria_id, qr_codigo, telefono, fecha_nacimiento,
          fecha_ingreso, fecha_vencimiento, facebook,
          referencia1_nombre, referencia1_telefono,
          referencia2_nombre, referencia2_telefono, ine_foto, estatus, activo,
          foto_credencial, numero_registro)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, siguiente.n
       FROM siguiente
       RETURNING id, nombre, qr_codigo, estatus, fecha_ingreso, fecha_vencimiento, numero_registro`,
      [
        nombre,
        categoria_id || null,
        qr_codigo,
        telefono || null,
        fecha_nacimiento || null,
        ingreso,
        vencimiento,
        facebook || null,
        referencia1_nombre || null,
        referencia1_telefono || null,
        referencia2_nombre || null,
        referencia2_telefono || null,
        ine_foto || null,
        estatusFinal,
        estatusFinal === 'activo',
        foto_credencial || null,
      ]
    );
    return res.status(201).json(rows[0]);
  }

  res.status(405).end();
}

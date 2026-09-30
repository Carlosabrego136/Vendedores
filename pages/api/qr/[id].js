// Genera la imagen PNG del QR de un vendedor, lista para imprimir.
const QRCode = require('qrcode');
const { query } = require('../../../lib/db');

export default async function handler(req, res) {
  const { id } = req.query;

  const { rows } = await query('SELECT * FROM vendedores WHERE id = $1', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

  const vendedor = rows[0];
  const png = await QRCode.toBuffer(vendedor.qr_codigo, { width: 400, margin: 2 });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="qr-vendedor-${vendedor.nombre}.png"`);
  res.status(200).send(png);
}

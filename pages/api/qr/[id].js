// Genera la imagen PNG del QR de un vendedor, lista para imprimir.
const QRCode = require('qrcode');
const { query } = require('../../../lib/db');

export default async function handler(req, res) {
  const { id } = req.query;

  // Antes traía la fila completa con SELECT * (incluyendo las fotos de INE
  // y credencial, que pueden pesar bastante) nada más para leer el nombre y
  // el código QR — eso hacía más lenta cada tarjeta de QR, y con "Imprimir
  // varios QR" (una petición por cada tarjeta seleccionada) el efecto se
  // multiplicaba. Aquí solo se necesitan estas tres columnas.
  try {
    const { rows } = await query('SELECT nombre, qr_codigo FROM vendedores WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const vendedor = rows[0];
    const png = await QRCode.toBuffer(vendedor.qr_codigo, { width: 400, margin: 2 });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-vendedor-${vendedor.nombre}.png"`);
    return res.status(200).send(png);
  } catch (err) {
    // 503 = "temporalmente no disponible, intenta de nuevo" (la pantalla de
    // imprimir varios QR ya sabe reintentar cuando recibe un error).
    console.error(err);
    return res.status(503).json({ error: 'No se pudo generar el QR en este momento. Intenta de nuevo.' });
  }
}

// Imagen PNG del QR a partir del propio código (ej. "VEND-AbC123xyz0"), SIN
// consultar la base de datos.
//
// Antes cada tarjeta pedía su QR a /api/qr/[id], que primero buscaba el código
// en la base de datos: con 20 o 30 credenciales seleccionadas eso abría 20 o 30
// conexiones al mismo tiempo, y la base de Aiven solo permite 20 en total (las
// comparte con otros sistemas), así que se saturaba. El código del QR ya viene
// en la lista de vendedores, así que aquí se genera la imagen directo.
//
// La imagen es exactamente la misma que genera /api/qr/[id] (mismo tamaño y
// margen). Como el resultado nunca cambia para un mismo código, se guarda en
// caché por mucho tiempo (navegador y red de Vercel).
const QRCode = require('qrcode');

// Solo se aceptan códigos con la forma que genera el sistema (VEND-...), para
// que nadie use esta dirección para generar QR de cualquier texto.
const FORMATO_CODIGO = /^VEND-[A-Za-z0-9_-]{4,40}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { codigo } = req.query;
  if (typeof codigo !== 'string' || !FORMATO_CODIGO.test(codigo)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'Código inválido' });
  }

  try {
    const png = await QRCode.toBuffer(codigo, { width: 400, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    return res.status(200).send(png);
  } catch (err) {
    console.error(err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'No se pudo generar el QR.' });
  }
}

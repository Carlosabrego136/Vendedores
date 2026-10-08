// Página de DIAGNÓSTICO temporal: no trae las fotos completas, solo su
// tamaño en KB, para detectar rápido si algún vendedor tiene una foto
// (de credencial o de INE) mucho más pesada de lo normal — eso es lo que
// puede estar haciendo que "Imprimir varias credenciales" y "Imprimir
// varios QR" se tarden tanto o se queden cargando.
// No modifica ni borra nada, solo lee. Se puede quitar después de usarla.
const { query } = require('../../../lib/db');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { rows } = await query(
    `SELECT
       nombre,
       numero_registro,
       ROUND(OCTET_LENGTH(foto_credencial) / 1024.0, 1) AS kb_foto_credencial,
       ROUND(OCTET_LENGTH(ine_foto) / 1024.0, 1) AS kb_ine_foto
     FROM vendedores
     WHERE foto_credencial IS NOT NULL OR ine_foto IS NOT NULL
     ORDER BY GREATEST(
       COALESCE(OCTET_LENGTH(foto_credencial), 0),
       COALESCE(OCTET_LENGTH(ine_foto), 0)
     ) DESC`
  );

  return res.status(200).json(rows);
}

// Ficha completa del vendedor: toda su información en una sola hoja para
// ver o imprimir (a diferencia de /qr/[id].js, que solo muestra el QR).
import Head from 'next/head';
import Link from 'next/link';
import { query } from '../../lib/db';

const ESTATUS_LABEL = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  alerta_riesgo: 'Alerta de riesgo',
  vetado: 'Vetado',
};
const ESTATUS_COLOR = {
  activo: '#1f9d4d',
  inactivo: '#8b5e3c',
  alerta_riesgo: '#c07a12',
  vetado: '#b3261e',
};

function soloFecha(valor) {
  if (!valor) return '';
  return String(valor).slice(0, 10);
}

// pg regresa las columnas DATE como objetos Date de JS (no como texto). Para
// mandarlas como prop de getServerSideProps hay que convertirlas nosotros —
// String(unaFecha) da algo como "Wed Sep 30 2026 ..." (no sirve), por eso
// usamos toISOString(), que sí da "2026-09-30T00:00:00.000Z".
function serializarFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function formatoFecha(valor) {
  const corta = soloFecha(valor);
  if (!corta) return '—';
  const d = new Date(`${corta}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

export async function getServerSideProps({ params }) {
  const { id } = params;
  const { rows } = await query(
    `SELECT v.*, c.nombre AS categoria_nombre
     FROM vendedores v
     LEFT JOIN categorias c ON c.id = v.categoria_id
     WHERE v.id = $1`,
    [id]
  );
  if (rows.length === 0) return { notFound: true };

  const v = rows[0];
  return {
    props: {
      vendedor: {
        id: v.id,
        nombre: v.nombre,
        telefono: v.telefono,
        qr_codigo: v.qr_codigo,
        categoria_nombre: v.categoria_nombre || null,
        fecha_nacimiento: serializarFecha(v.fecha_nacimiento),
        fecha_ingreso: serializarFecha(v.fecha_ingreso),
        fecha_vencimiento: serializarFecha(v.fecha_vencimiento),
        facebook: v.facebook,
        referencia1_nombre: v.referencia1_nombre,
        referencia1_telefono: v.referencia1_telefono,
        referencia2_nombre: v.referencia2_nombre,
        referencia2_telefono: v.referencia2_telefono,
        ine_foto: v.ine_foto,
        estatus: v.estatus,
        activo: v.activo,
        numero_registro: v.numero_registro ?? null,
      },
    },
  };
}

// Número de registro con 4 dígitos (0001, 0002, ...), como lo pidió la clienta.
function formatoNumeroRegistro(n) {
  if (n === null || n === undefined) return null;
  return String(n).padStart(4, '0');
}

export default function FichaVendedor({ vendedor }) {
  const colorEstatus = ESTATUS_COLOR[vendedor.estatus] || ESTATUS_COLOR.activo;
  const labelEstatusTxt = ESTATUS_LABEL[vendedor.estatus] || vendedor.estatus;

  return (
    <div className="ficha-pagina">
      <Head>
        <title>Ficha de {vendedor.nombre} — ENVIOS AYORA</title>
      </Head>

      <div className="ficha-barra no-imprimir">
        <Link href="/" className="btn secondary">
          ← Volver a Vendedores
        </Link>
        <div className="ficha-barra-derecha">
          <Link href={`/qr/${vendedor.id}`} className="btn secondary">
            Ver solo el QR
          </Link>
          <Link href={`/credencial/${vendedor.id}`} className="btn secondary">
            Ver credencial
          </Link>
          <button className="btn" onClick={() => window.print()}>
            Imprimir ficha
          </button>
        </div>
      </div>

      <div className="ficha-hoja">
        <div className="ficha-encabezado">
          <img src="/logo.jpg" alt="ENVIOS AYORA" className="ficha-logo" />
          <div>
            <h1 className="ficha-nombre">{vendedor.nombre}</h1>
            {formatoNumeroRegistro(vendedor.numero_registro) && (
              <p className="ficha-numero-registro">No. de registro: {formatoNumeroRegistro(vendedor.numero_registro)}</p>
            )}
          </div>
          <span className="ficha-estatus" style={{ background: `${colorEstatus}1a`, color: colorEstatus, border: `1.5px solid ${colorEstatus}` }}>
            {labelEstatusTxt}
          </span>
        </div>

        <div className="ficha-cuerpo">
          <div className="ficha-columna">
            <h2>Datos generales</h2>
            <dl>
              <dt>Teléfono</dt>
              <dd>{vendedor.telefono || '—'}</dd>
              <dt>Facebook</dt>
              <dd>{vendedor.facebook || '—'}</dd>
              <dt>Categoría</dt>
              <dd>{vendedor.categoria_nombre || '—'}</dd>
              <dt>Fecha de nacimiento</dt>
              <dd>{formatoFecha(vendedor.fecha_nacimiento)}</dd>
              <dt>Fecha de ingreso</dt>
              <dd>{formatoFecha(vendedor.fecha_ingreso)}</dd>
              <dt>Fecha de vencimiento</dt>
              <dd>{formatoFecha(vendedor.fecha_vencimiento)}</dd>
              <dt>Código QR</dt>
              <dd>{vendedor.qr_codigo}</dd>
            </dl>

            <h2>Referencias</h2>
            <dl>
              <dt>Referencia 1</dt>
              <dd>
                {vendedor.referencia1_nombre || '—'}
                {vendedor.referencia1_telefono ? ` — ${vendedor.referencia1_telefono}` : ''}
              </dd>
              <dt>Referencia 2</dt>
              <dd>
                {vendedor.referencia2_nombre || '—'}
                {vendedor.referencia2_telefono ? ` — ${vendedor.referencia2_telefono}` : ''}
              </dd>
            </dl>
          </div>

          <div className="ficha-columna ficha-columna-ine">
            <h2>Identificación (INE)</h2>
            {vendedor.ine_foto ? (
              <img src={vendedor.ine_foto} alt="Foto de la INE" className="ficha-ine-imagen" />
            ) : (
              <p className="ficha-sin-ine">No se ha capturado una foto de la INE para este vendedor.</p>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        body {
          background: #fff !important;
        }
        .ficha-pagina {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 16px 48px;
          background: #f4f5f7;
        }
        .ficha-barra {
          width: 100%;
          max-width: 760px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 10px;
        }
        .ficha-barra-derecha {
          display: flex;
          gap: 8px;
        }
        .btn {
          display: inline-block;
          padding: 10px 18px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 14px;
          text-decoration: none;
          cursor: pointer;
          border: none;
          background: linear-gradient(135deg, #33455f 0%, #131c30 100%);
          color: #fff;
        }
        .btn.secondary {
          background: #fff;
          color: #101a30;
          border: 2px solid #101a30;
        }
        .ficha-hoja {
          width: 100%;
          max-width: 760px;
          background: #fff;
          border: 2px solid #101a30;
          border-radius: 16px;
          padding: 28px 26px;
        }
        .ficha-encabezado {
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 18px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .ficha-logo {
          height: 56px;
          border-radius: 8px;
        }
        .ficha-marca {
          margin: 0 0 2px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: 12px;
          font-weight: 700;
          color: #6b7280;
        }
        .ficha-nombre {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: #101a30;
        }
        .ficha-numero-registro {
          margin: 4px 0 0;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.03em;
          color: #6b7280;
        }
        .ficha-estatus {
          margin-left: auto;
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 12.5px;
          font-weight: 700;
        }
        .ficha-cuerpo {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 28px;
        }
        .ficha-columna h2 {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          margin: 0 0 10px;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 6px;
        }
        .ficha-columna dl {
          margin: 0 0 18px;
        }
        .ficha-columna dt {
          font-size: 11.5px;
          color: #6b7280;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-top: 10px;
        }
        .ficha-columna dd {
          margin: 2px 0 0;
          font-size: 15px;
          color: #111827;
          font-weight: 600;
        }
        .ficha-ine-imagen {
          width: 100%;
          max-width: 320px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
        }
        .ficha-sin-ine {
          font-size: 13.5px;
          color: #9ca3af;
        }

        @media (max-width: 640px) {
          .ficha-cuerpo {
            grid-template-columns: 1fr;
          }
          .ficha-estatus {
            margin-left: 0;
          }
        }

        @media print {
          .no-imprimir {
            display: none !important;
          }
          .ficha-pagina {
            padding: 0;
            background: #fff;
          }
          .ficha-hoja {
            border: none;
          }
        }
      `}</style>
    </div>
  );
}

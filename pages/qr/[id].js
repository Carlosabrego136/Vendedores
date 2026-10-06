// Página para VER e IMPRIMIR el QR de un vendedor, con su nombre.
// Versión de este proyecto separado: solo maneja vendedores (no clientes),
// y el botón de "Volver" regresa a la página principal de este mismo sitio.
import Head from 'next/head';
import Link from 'next/link';
import { query } from '../../lib/db';

export async function getServerSideProps({ params }) {
  const { id } = params;

  const { rows } = await query('SELECT * FROM vendedores WHERE id = $1', [id]);

  if (rows.length === 0) {
    return { notFound: true };
  }

  const vendedor = rows[0];

  return {
    props: {
      id,
      qrCodigo: vendedor.qr_codigo,
      numeroRegistro: vendedor.numero_registro ?? null,
      // En esta tarjeta (la que se imprime para la credencial) se muestra el
      // nombre de Facebook del vendedor si lo tiene capturado; si no, se usa
      // su nombre real. Así lo pidió la clienta.
      nombreMostrado: vendedor.facebook && vendedor.facebook.trim() ? vendedor.facebook.trim() : vendedor.nombre,
    },
  };
}

// Número de registro con 4 dígitos (0001, 0002, ...), como lo pidió la clienta.
function formatoNumeroRegistro(n) {
  if (n === null || n === undefined) return null;
  return String(n).padStart(4, '0');
}

export default function VerQr({ id, nombreMostrado, qrCodigo, numeroRegistro }) {
  const numeroFormateado = formatoNumeroRegistro(numeroRegistro);
  return (
    <div className="qr-pagina">
      <Head>
        <title>QR de {nombreMostrado} — ENVIOS AYORA</title>
      </Head>

      <div className="qr-barra no-imprimir">
        <Link href="/" className="btn secondary">
          ← Volver a Vendedores
        </Link>
        <button className="btn" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      <div className="qr-tarjeta">
        <img src="/logo.jpg" alt="ENVIOS AYORA" className="qr-logo" />
        <p className="qr-etiqueta">Vendedor</p>
        <h1 className="qr-nombre">{nombreMostrado}</h1>
        {numeroFormateado && <p className="qr-numero-registro">No. de registro: {numeroFormateado}</p>}
        <img src={`/api/qr/${id}`} alt={`Código QR de ${nombreMostrado}`} className="qr-imagen" />
        <p className="qr-codigo">{qrCodigo}</p>
      </div>

      <style jsx global>{`
        body {
          background: #fff !important;
        }
        .qr-pagina {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 16px;
          background: #fff;
        }
        .qr-barra {
          width: 100%;
          max-width: 420px;
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
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
        .qr-tarjeta {
          width: 100%;
          max-width: 420px;
          border: 2px solid #101a30;
          border-radius: 16px;
          padding: 32px 24px;
          text-align: center;
          background: #fff;
        }
        .qr-logo {
          height: 70px;
          width: auto;
          border-radius: 10px;
          margin-bottom: 12px;
        }
        .qr-etiqueta {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 13px;
          font-weight: 700;
          color: #6b7280;
          margin: 0 0 4px;
        }
        .qr-nombre {
          font-size: 24px;
          font-weight: 800;
          margin: 0 0 4px;
          color: #101a30;
        }
        .qr-numero-registro {
          font-size: 13.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
          color: #33455f;
          margin: 0 0 20px;
        }
        .qr-imagen {
          width: 100%;
          max-width: 300px;
          height: auto;
        }
        .qr-codigo {
          margin-top: 16px;
          font-size: 13px;
          color: #6b7280;
          letter-spacing: 0.04em;
        }

        @media print {
          .no-imprimir {
            display: none !important;
          }
          .qr-pagina {
            padding: 0;
            align-items: flex-start;
          }
          /* Tamaño credencial / tarjeta de banco (estándar CR80: 85.6mm x
             54mm), tal como lo pidió la clienta, para pegarla atrás de la
             credencial del vendedor. */
          .qr-tarjeta {
            border: none;
            width: 85.6mm;
            max-width: 85.6mm;
            height: 54mm;
            padding: 3mm 4mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .qr-logo {
            height: 9mm;
            margin-bottom: 1mm;
          }
          .qr-etiqueta {
            font-size: 6.5px;
            margin: 0;
          }
          .qr-nombre {
            font-size: 10px;
            margin: 0;
            line-height: 1.15;
          }
          .qr-numero-registro {
            font-size: 7px;
            margin: 0 0 1mm;
          }
          .qr-imagen {
            width: 24mm;
            max-width: 24mm;
            margin: 0 auto;
          }
          .qr-codigo {
            font-size: 6px;
            margin-top: 1mm;
          }
        }
      `}</style>
    </div>
  );
}

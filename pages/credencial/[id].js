// Credencial imprimible del vendedor, con el mismo diseño que la clienta ya
// usaba a mano en PowerPoint (fondo y logo FÉNIX extraídos de su plantilla
// original). Se llena sola con los datos del vendedor — lo único que hay que
// cargar por vendedor es su foto (desde /  al editarlo en la página principal).
import Head from 'next/head';
import Link from 'next/link';
import { query } from '../../lib/db';

function soloFecha(valor) {
  if (!valor) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

// "Vigencia" en formato MM/AAAA, como en la plantilla original — se usa la
// fecha de vencimiento porque ya se calcula sola (ingreso + 1 año) y es el
// dato que le importa saber a quien revise la credencial.
function vigenciaTexto(fechaVencimiento) {
  const corta = soloFecha(fechaVencimiento);
  if (!corta) return '—';
  const [anio, mes] = corta.split('-');
  if (!anio || !mes) return '—';
  return `${mes}/${anio}`;
}

function formatoNumeroRegistro(n) {
  if (n === null || n === undefined) return '—';
  return String(n).padStart(4, '0');
}

export async function getServerSideProps({ params }) {
  const { id } = params;
  const { rows } = await query('SELECT * FROM vendedores WHERE id = $1', [id]);
  if (rows.length === 0) return { notFound: true };

  const v = rows[0];
  return {
    props: {
      id,
      nombreReal: v.nombre,
      // En la credencial, igual que en la tarjeta del QR, el nombre
      // principal/grande es el de Facebook; si no lo tiene capturado, se usa
      // el nombre real para no dejarlo en blanco.
      nombreFacebook: v.facebook && v.facebook.trim() ? v.facebook.trim() : v.nombre,
      numeroRegistro: v.numero_registro ?? null,
      vigencia: vigenciaTexto(v.fecha_vencimiento),
      fotoCredencial: v.foto_credencial || null,
    },
  };
}

export default function Credencial({ id, nombreReal, nombreFacebook, numeroRegistro, vigencia, fotoCredencial }) {
  return (
    <div className="cred-pagina">
      <Head>
        <title>Credencial de {nombreFacebook} — ENVIOS AYORA</title>
      </Head>

      <div className="cred-barra no-imprimir">
        <Link href="/" className="btn secondary">
          ← Volver a Vendedores
        </Link>
        <div className="cred-barra-derecha">
          <Link href={`/qr/${id}`} className="btn secondary">
            Ver tarjeta del QR
          </Link>
          <Link href="/imprimir-credenciales" className="btn secondary">
            Imprimir varias
          </Link>
          <button className="btn" onClick={() => window.print()}>
            Imprimir credencial
          </button>
        </div>
      </div>

      {!fotoCredencial && (
        <p className="cred-aviso no-imprimir">
          Este vendedor todavía no tiene una foto para la credencial. Entra a "Editar" en la lista de
          Vendedores y sube su foto antes de imprimir.
        </p>
      )}

      <div className="cred-tarjeta">
        <img src="/credencial-fondo.jpg" alt="" className="cred-fondo" />
        <img src="/credencial-logo.png" alt="FÉNIX Recolección y Envíos" className="cred-logo" />

        <div className="cred-foto-caja">
          {fotoCredencial ? (
            <img src={fotoCredencial} alt={nombreFacebook} className="cred-foto" />
          ) : (
            <div className="cred-foto-vacia" />
          )}
        </div>
        <p className="cred-estatus">VENDEDOR ACTIVO</p>

        <p className="cred-num-etiqueta">NUM. DE REGISTRO</p>
        <p className="cred-num-valor">{formatoNumeroRegistro(numeroRegistro)}</p>

        <div className="cred-nombres">
          <p className="cred-nombre-facebook">{nombreFacebook}</p>
          <p className="cred-nombre-real">{nombreReal}</p>
        </div>

        <p className="cred-vigencia">VIGENCIA {vigencia}</p>
      </div>

      <style jsx global>{`
        body {
          background: #fff !important;
        }
        .cred-pagina {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 16px 48px;
          background: #f4f5f7;
          gap: 16px;
        }
        .cred-barra {
          width: 100%;
          max-width: 420px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }
        .cred-barra-derecha {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
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
        .cred-aviso {
          width: 100%;
          max-width: 420px;
          background: #fef3c7;
          color: #92400e;
          font-size: 13px;
          padding: 10px 14px;
          border-radius: 10px;
        }

        /* En pantalla se muestra grande para poder revisarla cómoda; al
           imprimir se vuelve a tamaño credencial (ver @media print). */
        .cred-tarjeta {
          position: relative;
          width: 300px;
          aspect-ratio: 13.78 / 21.65;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
          border: 1px solid #d1d5db;
        }
        .cred-fondo {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: fill;
          z-index: 0;
        }
        .cred-logo {
          position: absolute;
          left: 35.7%;
          top: 2.18%;
          width: 60.67%;
          height: 26.17%;
          object-fit: contain;
          z-index: 2;
        }
        .cred-foto-caja {
          position: absolute;
          left: 7.39%;
          top: 32.52%;
          width: 45.71%;
          height: 38.18%;
          z-index: 1;
          border: 2px solid #000;
          background: #fff;
          overflow: hidden;
        }
        .cred-foto {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .cred-foto-vacia {
          width: 100%;
          height: 100%;
          background: repeating-linear-gradient(
            45deg,
            #e5e7eb,
            #e5e7eb 6px,
            #f3f4f6 6px,
            #f3f4f6 12px
          );
        }
        .cred-estatus {
          position: absolute;
          left: 7.39%;
          top: 71.01%;
          width: 45.71%;
          height: 3.26%;
          z-index: 2;
          margin: 0;
          background: #000;
          color: #fff;
          font-weight: 800;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .cred-num-etiqueta {
          position: absolute;
          left: 58.06%;
          top: 32.23%;
          width: 38.31%;
          height: 3.26%;
          z-index: 2;
          margin: 0;
          color: #111827;
          font-weight: 700;
          font-size: 8.5px;
          text-align: center;
        }
        .cred-num-valor {
          position: absolute;
          left: 58.97%;
          top: 35.44%;
          width: 35.18%;
          height: 11.19%;
          z-index: 2;
          margin: 0;
          color: #111827;
          font-weight: 800;
          font-size: 32px;
          text-align: center;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cred-nombres {
          position: absolute;
          left: 4.24%;
          top: 77.85%;
          width: 88.31%;
          height: 13.21%;
          z-index: 2;
          text-align: center;
        }
        .cred-nombre-facebook {
          margin: 0;
          color: #111827;
          font-weight: 800;
          font-size: 18px;
          line-height: 1.1;
        }
        .cred-nombre-real {
          margin: 2px 0 0;
          color: #1d3a63;
          font-weight: 600;
          font-size: 11px;
          line-height: 1.1;
        }
        .cred-vigencia {
          position: absolute;
          left: 28.49%;
          top: 93.9%;
          width: 39.8%;
          height: 3.26%;
          z-index: 2;
          margin: 0;
          color: #111827;
          font-weight: 700;
          font-size: 9.5px;
          text-align: center;
        }

        @media print {
          .no-imprimir {
            display: none !important;
          }
          .cred-pagina {
            padding: 0;
            align-items: flex-start;
          }
          /* Tamaño credencial / tarjeta de banco en vertical (CR80: 54mm x
             85.6mm), para que combine con la tarjeta del QR que ya se
             imprime en el mismo tamaño (horizontal). */
          .cred-tarjeta {
            width: 54mm;
            aspect-ratio: auto;
            height: 85.6mm;
            border: none;
            box-shadow: none;
            border-radius: 0;
          }
          .cred-estatus {
            font-size: 7px;
          }
          .cred-num-etiqueta {
            font-size: 5px;
          }
          .cred-num-valor {
            font-size: 18px;
          }
          .cred-nombre-facebook {
            font-size: 11px;
          }
          .cred-nombre-real {
            font-size: 6.5px;
          }
          .cred-vigencia {
            font-size: 6px;
          }
        }
      `}</style>
    </div>
  );
}

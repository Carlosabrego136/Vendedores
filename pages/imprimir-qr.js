// Página para seleccionar varios vendedores e imprimir de un jalón sus
// tarjetas de QR en tamaño credencial (como la de /qr/[id].js), en vez de
// entrar uno por uno. Pedido por la clienta para cuando necesite imprimir
// más de una de un jalón; lo normal será imprimir una sola conforme se va
// registrando cada vendedor, para lo cual sigue sirviendo /qr/[id].js.
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Cuántas tarjetas caben en una hoja carta en tamaño credencial (3 columnas
// x 3 filas, igual que en "Imprimir varias credenciales" — la tarjeta de QR
// usa exactamente el mismo tamaño y orientación que la credencial, así que
// caben las mismas 9 por hoja). Igual que en el proyecto principal, partimos
// la lista nosotros mismos en grupos de este tamaño y forzamos el salto de
// página — no podemos confiar en que el navegador reparta bien las tarjetas
// en varias hojas (en Chrome Android se cortaba todo después de la primera
// hoja).
const TARJETAS_POR_HOJA = 9;

function formatoNumeroRegistro(n) {
  if (n === null || n === undefined) return null;
  return String(n).padStart(4, '0');
}

function nombreParaTarjeta(v) {
  return v.facebook && v.facebook.trim() ? v.facebook.trim() : v.nombre;
}

export default function ImprimirQr() {
  const [vendedores, setVendedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  // Ids de las imágenes de QR que ya terminaron de cargar (o fallaron), de
  // las que se están mostrando ahorita, para no imprimir tarjetas en blanco
  // porque la imagen no alcanzó a cargar a tiempo. Este set SOLO CRECE: así
  // si se cambia la selección (se marca/desmarca algún vendedor) no se
  // pierde el avance de las imágenes que ya habían cargado antes — ese
  // reinicio accidental era el bug que hacía que el contador se quedara
  // pegado en "Cargando QR... (2/9)" aunque las imágenes ya hubieran
  // cargado. El mismo bug que se corrigió antes en
  // "Imprimir varias credenciales".
  const [imagenesListas, setImagenesListas] = useState(() => new Set());
  // Ids cuyo QR falló al cargarse (problema de conexión al pedir la
  // imagen). Se marca para poder avisar y ofrecer un botón de
  // "Reintentar" en vez de dejarlo así nada más.
  const [erroresCarga, setErroresCarga] = useState(() => new Set());
  const [intentoCarga, setIntentoCarga] = useState(0);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const res = await fetch('/api/vendedores');
      setVendedores(await res.json());
      setCargando(false);
    }
    cargar();
  }, []);

  const vendedoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return vendedores;
    return vendedores.filter((v) => v.nombre.toLowerCase().includes(q));
  }, [vendedores, busqueda]);

  const tarjetas = useMemo(
    () => vendedores.filter((v) => seleccionados.has(v.id)),
    [vendedores, seleccionados]
  );

  const hojas = useMemo(() => {
    const grupos = [];
    for (let i = 0; i < tarjetas.length; i += TARJETAS_POR_HOJA) {
      grupos.push(tarjetas.slice(i, i + TARJETAS_POR_HOJA));
    }
    return grupos;
  }, [tarjetas]);

  // Cuántas de las tarjetas seleccionadas ahorita ya tienen su imagen de QR
  // lista. Se calcula siempre fresco a partir de "tarjetas" e
  // "imagenesListas" (nunca se reinicia a mano), para que no se pierda el
  // avance al cambiar la selección.
  const cargadas = useMemo(
    () => tarjetas.filter((v) => imagenesListas.has(v.id)).length,
    [tarjetas, imagenesListas]
  );

  const todasCargadas = tarjetas.length > 0 && cargadas >= tarjetas.length;

  // Solo los errores de alguien que sigue seleccionado ahorita.
  const erroresVisibles = useMemo(
    () => tarjetas.filter((v) => erroresCarga.has(v.id)),
    [tarjetas, erroresCarga]
  );

  // Vuelve a intentar cargar solo los QR que fallaron, sin perder los que
  // sí cargaron bien ni la selección actual. Cambia el número de intento
  // para que la imagen pida de nuevo la URL (no se quede pegada al mismo
  // intento fallido).
  function reintentarFallidos() {
    if (erroresCarga.size === 0) return;
    setImagenesListas((prev) => {
      const siguiente = new Set(prev);
      erroresCarga.forEach((id) => siguiente.delete(id));
      return siguiente;
    });
    setErroresCarga(new Set());
    setIntentoCarga((n) => n + 1);
  }

  function alternar(id) {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function seleccionarVisibles() {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      vendedoresFiltrados.forEach((v) => siguiente.add(v.id));
      return siguiente;
    });
  }

  function quitarSeleccion() {
    setSeleccionados(new Set());
  }

  function imprimir() {
    if (!todasCargadas) {
      alert('Espera un momento a que terminen de cargar todos los códigos QR antes de imprimir.');
      return;
    }
    window.print();
  }

  return (
    <div className="iq-pagina">
      <Head>
        <title>Imprimir QR — Vendedores</title>
        <link rel="icon" href="/logo.jpg" />
      </Head>

      <div className="iq-barra no-imprimir">
        <Link href="/" className="btn secondary">
          ← Volver a Vendedores
        </Link>

        <input
          className="iq-buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre..."
        />

        <button className="btn secondary" onClick={seleccionarVisibles}>
          Seleccionar todos los que se muestran
        </button>
        <button className="btn secondary" onClick={quitarSeleccion}>
          Quitar selección
        </button>

        <button className="btn" onClick={imprimir} disabled={tarjetas.length === 0 || !todasCargadas}>
          {tarjetas.length === 0
            ? 'Imprimir'
            : todasCargadas
            ? `Imprimir (${tarjetas.length})`
            : `Cargando QR... (${cargadas}/${tarjetas.length})`}
        </button>
      </div>

      {erroresVisibles.length > 0 && (
        <p className="iq-aviso iq-aviso-error no-imprimir">
          {erroresVisibles.length === 1
            ? `No se pudo cargar el QR de "${nombreParaTarjeta(erroresVisibles[0])}" (problema de conexión).`
            : `No se pudieron cargar ${erroresVisibles.length} códigos QR (problema de conexión).`}{' '}
          <button className="btn secondary iq-btn-reintentar" onClick={reintentarFallidos}>
            Reintentar
          </button>
        </p>
      )}

      <div className="iq-cuerpo no-imprimir">
        {cargando ? (
          <p className="iq-vacio">Cargando...</p>
        ) : vendedoresFiltrados.length === 0 ? (
          <p className="iq-vacio">No hay vendedores que coincidan con la búsqueda.</p>
        ) : (
          <div className="iq-lista">
            {vendedoresFiltrados.map((v) => (
              <label key={v.id} className="iq-fila">
                <input
                  type="checkbox"
                  checked={seleccionados.has(v.id)}
                  onChange={() => alternar(v.id)}
                />
                <span className="iq-fila-nombre">{v.nombre}</span>
                {v.facebook && <span className="iq-fila-facebook">Facebook: {v.facebook}</span>}
                {formatoNumeroRegistro(v.numero_registro) && (
                  <span className="iq-fila-numero">No. {formatoNumeroRegistro(v.numero_registro)}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Las tarjetas a imprimir se generan siempre (ocultas en pantalla con
          la clase no-imprimir aplicada a iq-cuerpo de arriba), para que las
          imágenes de los QR puedan precargar antes de imprimir. */}
      <div className="iq-hojas">
        {hojas.map((grupo, indiceHoja) => (
          <div className="iq-hoja" key={indiceHoja}>
            {grupo.map((v) => {
              const numero = formatoNumeroRegistro(v.numero_registro);
              const nombreMostrado = nombreParaTarjeta(v);
              return (
                <div className="iq-tarjeta" key={v.id}>
                  <img src="/logo.jpg" alt="ENVIOS AYORA" className="iq-logo" />
                  <p className="iq-etiqueta">Vendedor</p>
                  <h1 className="iq-nombre">{nombreMostrado}</h1>
                  {numero && <p className="iq-numero">No. de registro: {numero}</p>}
                  <img
                    src={`/api/qr/${v.id}${intentoCarga > 0 ? `?r=${intentoCarga}` : ''}`}
                    alt={`Código QR de ${nombreMostrado}`}
                    className="iq-imagen"
                    onLoad={() => {
                      setErroresCarga((prev) => {
                        if (!prev.has(v.id)) return prev;
                        const siguiente = new Set(prev);
                        siguiente.delete(v.id);
                        return siguiente;
                      });
                      setImagenesListas((prev) => (prev.has(v.id) ? prev : new Set(prev).add(v.id)));
                    }}
                    onError={() => {
                      setErroresCarga((prev) => (prev.has(v.id) ? prev : new Set(prev).add(v.id)));
                      // Igual se marca como "lista" para no dejar el botón de
                      // imprimir pegado para siempre — si no se reintenta, esa
                      // tarjeta sale con el QR en blanco.
                      setImagenesListas((prev) => (prev.has(v.id) ? prev : new Set(prev).add(v.id)));
                    }}
                  />
                  <p className="iq-codigo">{v.qr_codigo}</p>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <style jsx global>{`
        body {
          background: #fff !important;
        }
        .iq-pagina {
          min-height: 100vh;
          background: #f3f4f6;
        }
        .iq-barra {
          position: sticky;
          top: 0;
          z-index: 5;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          background: #101a30;
          color: #fff;
          padding: 12px 16px;
        }
        .btn {
          display: inline-block;
          padding: 10px 16px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 13.5px;
          text-decoration: none;
          cursor: pointer;
          border: none;
          background: linear-gradient(135deg, #33455f 0%, #131c30 100%);
          color: #fff;
          white-space: nowrap;
        }
        .btn.secondary {
          background: #1f2937;
          color: #fff;
          border: 1px solid #374151;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .iq-buscar {
          flex: 1;
          min-width: 160px;
          max-width: 260px;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid #374151;
        }
        .iq-aviso {
          margin: 12px 16px 0;
          background: #fef3c7;
          color: #92400e;
          font-size: 13px;
          padding: 10px 14px;
          border-radius: 10px;
        }
        .iq-aviso-error {
          background: #fee2e2;
          color: #991b1b;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .iq-btn-reintentar {
          padding: 6px 12px;
          font-size: 12px;
        }
        .iq-cuerpo {
          padding: 16px;
        }
        .iq-vacio {
          color: #6b7280;
          padding: 10px 4px;
        }
        .iq-lista {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 640px;
        }
        .iq-fila {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 10px 12px;
          flex-wrap: wrap;
          cursor: pointer;
        }
        .iq-fila input {
          width: auto;
        }
        .iq-fila-nombre {
          font-weight: 700;
          color: #111827;
        }
        .iq-fila-facebook {
          font-size: 12.5px;
          color: #6b7280;
        }
        .iq-fila-numero {
          margin-left: auto;
          font-size: 11.5px;
          font-weight: 700;
          color: #33455f;
          background: #eef0f4;
          border-radius: 6px;
          padding: 2px 8px;
        }

        /* Oculto SOLO en pantalla, nunca "reactivado" para impresión: antes
           se escondía con una propiedad que se volvía a cambiar justo
           @media print, y ese cambio de último momento es lo que
           confundía al navegador al calcular varias hojas (con pocas
           tarjetas salía bien, pero con selecciones grandes —"seleccionar
           todo"— solo armaba la primera hoja y el resto se perdía). Al no
           tocar nada en @media print, la impresión usa el acomodo normal
           de siempre. Las imágenes igual precargan con display:none (el
           navegador las pide igual, nomás no se dibujan en pantalla). */
        @media screen {
          .iq-hojas {
            display: none;
          }
        }

        .iq-tarjeta {
          /* Mismo tamaño y orientación que la credencial (CR80 vertical:
             54mm x 85.6mm), para que quepan las mismas 9 tarjetas por hoja
             en el mismo acomodo de 3 columnas x 3 filas. */
          width: 54mm;
          height: 85.6mm;
          border: 1px solid #d1d5db;
          border-radius: 3mm;
          padding: 4mm 4mm;
          text-align: center;
          background: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .iq-logo {
          height: 10mm;
          margin-bottom: 2mm;
          border-radius: 2px;
        }
        .iq-etiqueta {
          margin: 0;
          font-size: 6.5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6b7280;
          font-weight: 700;
        }
        .iq-nombre {
          margin: 0;
          font-size: 11px;
          font-weight: 800;
          color: #101a30;
          line-height: 1.15;
        }
        .iq-numero {
          margin: 0 0 1mm;
          font-size: 7px;
          font-weight: 700;
          color: #33455f;
        }
        .iq-imagen {
          width: 30mm;
          max-width: 30mm;
          margin: 3mm auto;
        }
        .iq-codigo {
          margin-top: 1mm;
          font-size: 6.5px;
          color: #6b7280;
          word-break: break-all;
        }

        @media print {
          /* Define explícitamente el tamaño de hoja y márgenes chicos: sin
             esto cada dispositivo/impresora usa sus propios márgenes por
             default (que varían bastante entre computadora y celular), y
             como las tarjetas miden exactamente 54mm x 85.6mm, un margen
             de más podía hacer que no cupiera la tercera fila completa en
             una sola hoja física. */
          @page {
            size: letter;
            margin: 4mm;
          }
          .no-imprimir {
            display: none !important;
          }
          .iq-pagina {
            background: #fff;
          }
          .iq-hoja {
            display: grid;
            grid-template-columns: repeat(3, 54mm);
            grid-auto-rows: 85.6mm;
            gap: 0;
            justify-content: center;
            page-break-after: always;
            break-after: page;
          }
          .iq-hoja:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .iq-tarjeta {
            border: none;
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

// Página para seleccionar varios vendedores e imprimir de un jalón sus
// credenciales (con foto, VENDEDOR ACTIVO, número de registro y vigencia),
// en vez de entrar de una en una por /credencial/[id].js. Mismo mecanismo
// que ya se usa en /imprimir-qr.js para las tarjetas de QR.
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// La credencial es tamaño CR80 en vertical (54mm x 85.6mm). En una hoja
// carta (215.9mm x 279.4mm) caben 3 columnas x 3 filas con ese tamaño, así
// que partimos la selección en grupos de 9 y forzamos el salto de página
// nosotros mismos (igual que con las tarjetas de QR, para que no se corte
// mal en Chrome Android).
const TARJETAS_POR_HOJA = 9;

function soloFecha(valor) {
  if (!valor) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

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

function nombreParaTarjeta(v) {
  return v.facebook && v.facebook.trim() ? v.facebook.trim() : v.nombre;
}

export default function ImprimirCredenciales() {
  const [vendedores, setVendedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  // La lista general de /api/vendedores no trae la foto de la credencial
  // completa de cada quien (solo si tiene o no, "tiene_foto_credencial"),
  // para no hacer pesada esa lista. Aquí se va guardando la foto real de
  // cada vendedor seleccionado, pedida aparte, según se necesita.
  const [fotos, setFotos] = useState({});
  // Cuántas tarjetas ya están listas para imprimirse (ya sea porque no
  // tienen foto, o porque su foto ya se trajo del servidor y ya terminó de
  // cargar en pantalla) — para no mandar a imprimir fotos en blanco porque
  // no alcanzaron a llegar a tiempo.
  const [cargadas, setCargadas] = useState(0);

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

  const sinFoto = useMemo(() => tarjetas.filter((v) => !v.tiene_foto_credencial), [tarjetas]);

  const hojas = useMemo(() => {
    const grupos = [];
    for (let i = 0; i < tarjetas.length; i += TARJETAS_POR_HOJA) {
      grupos.push(tarjetas.slice(i, i + TARJETAS_POR_HOJA));
    }
    return grupos;
  }, [tarjetas]);

  // Por cada tarjeta seleccionada que sí tiene foto de credencial, se pide
  // su foto completa (si todavía no la teníamos ya guardada en "fotos").
  useEffect(() => {
    let cancelado = false;
    async function traerFaltantes() {
      const faltantes = tarjetas.filter((v) => v.tiene_foto_credencial && !(v.id in fotos));
      if (faltantes.length === 0) return;
      const resultados = await Promise.all(
        faltantes.map(async (v) => {
          try {
            const res = await fetch(`/api/vendedores/${v.id}`);
            if (!res.ok) return [v.id, null];
            const datos = await res.json();
            return [v.id, datos.foto_credencial || null];
          } catch (err) {
            return [v.id, null];
          }
        })
      );
      if (cancelado) return;
      setFotos((prev) => {
        const siguiente = { ...prev };
        resultados.forEach(([id, foto]) => {
          siguiente[id] = foto;
        });
        return siguiente;
      });
      // Si alguna foto no se pudo traer (error de red), esa tarjeta ya no
      // tiene imagen que esperar — se cuenta como lista para no dejar el
      // botón de imprimir trabado para siempre.
      const fallidas = resultados.filter(([, foto]) => !foto).length;
      if (fallidas > 0) setCargadas((n) => n + fallidas);
    }
    traerFaltantes();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarjetas]);

  useEffect(() => {
    // Las tarjetas sin foto ya cuentan como "listas" desde el inicio; las
    // que sí tienen foto se van sumando cuando su imagen termina de cargar
    // (o falla al traerla, ver arriba).
    setCargadas(tarjetas.filter((v) => !v.tiene_foto_credencial).length);
  }, [tarjetas]);

  const todasCargadas = tarjetas.length > 0 && cargadas >= tarjetas.length;

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
      alert('Espera un momento a que terminen de cargar todas las fotos antes de imprimir.');
      return;
    }
    window.print();
  }

  return (
    <div className="ic-pagina">
      <Head>
        <title>Imprimir credenciales — Vendedores</title>
        <link rel="icon" href="/logo.jpg" />
      </Head>

      <div className="ic-barra no-imprimir">
        <Link href="/" className="btn secondary">
          ← Volver a Vendedores
        </Link>

        <input
          className="ic-buscar"
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
            : `Cargando fotos... (${cargadas}/${tarjetas.length})`}
        </button>
      </div>

      {sinFoto.length > 0 && (
        <p className="ic-aviso no-imprimir">
          {sinFoto.length === 1
            ? `"${nombreParaTarjeta(sinFoto[0])}" todavía no tiene foto para la credencial — se va a imprimir con el recuadro en blanco.`
            : `${sinFoto.length} de los vendedores seleccionados todavía no tienen foto para la credencial — se van a imprimir con el recuadro en blanco.`}
        </p>
      )}

      <div className="ic-cuerpo no-imprimir">
        {cargando ? (
          <p className="ic-vacio">Cargando...</p>
        ) : vendedoresFiltrados.length === 0 ? (
          <p className="ic-vacio">No hay vendedores que coincidan con la búsqueda.</p>
        ) : (
          <div className="ic-lista">
            {vendedoresFiltrados.map((v) => (
              <label key={v.id} className="ic-fila">
                <input
                  type="checkbox"
                  checked={seleccionados.has(v.id)}
                  onChange={() => alternar(v.id)}
                />
                <span className="ic-fila-nombre">{v.nombre}</span>
                {v.facebook && <span className="ic-fila-facebook">Facebook: {v.facebook}</span>}
                {!v.tiene_foto_credencial && <span className="ic-fila-sinfoto">Sin foto</span>}
                {formatoNumeroRegistro(v.numero_registro) && (
                  <span className="ic-fila-numero">No. {formatoNumeroRegistro(v.numero_registro)}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Las credenciales a imprimir se generan siempre (ocultas en pantalla
          porque iq-cuerpo de arriba trae la clase no-imprimir), para que las
          fotos puedan precargar antes de imprimir. */}
      <div className="ic-hojas">
        {hojas.map((grupo, indiceHoja) => (
          <div className="ic-hoja" key={indiceHoja}>
            {grupo.map((v) => {
              const nombreFacebook = nombreParaTarjeta(v);
              const foto = fotos[v.id];
              return (
                <div className="ic-tarjeta" key={v.id}>
                  <img src="/credencial-fondo.jpg" alt="" className="ic-fondo" />
                  <img src="/credencial-logo.png" alt="" className="ic-logo" />

                  <div className="ic-foto-caja">
                    {foto ? (
                      <img
                        src={foto}
                        alt={nombreFacebook}
                        className="ic-foto"
                        onLoad={() => setCargadas((n) => n + 1)}
                        onError={() => setCargadas((n) => n + 1)}
                      />
                    ) : (
                      <div className="ic-foto-vacia" />
                    )}
                  </div>
                  <p className="ic-estatus">VENDEDOR ACTIVO</p>

                  <p className="ic-num-etiqueta">NUM. DE REGISTRO</p>
                  <p className="ic-num-valor">{formatoNumeroRegistro(v.numero_registro)}</p>

                  <div className="ic-nombres">
                    <p className="ic-nombre-facebook">{nombreFacebook}</p>
                    <p className="ic-nombre-real">{v.nombre}</p>
                  </div>

                  <p className="ic-vigencia">VIGENCIA {vigenciaTexto(v.fecha_vencimiento)}</p>
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
        .ic-pagina {
          min-height: 100vh;
          background: #f3f4f6;
        }
        .ic-barra {
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
        .ic-buscar {
          flex: 1;
          min-width: 160px;
          max-width: 260px;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid #374151;
        }
        .ic-aviso {
          margin: 12px 16px 0;
          background: #fef3c7;
          color: #92400e;
          font-size: 13px;
          padding: 10px 14px;
          border-radius: 10px;
        }
        .ic-cuerpo {
          padding: 16px;
        }
        .ic-vacio {
          color: #6b7280;
          padding: 10px 4px;
        }
        .ic-lista {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 640px;
        }
        .ic-fila {
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
        .ic-fila input {
          width: auto;
        }
        .ic-fila-nombre {
          font-weight: 700;
          color: #111827;
        }
        .ic-fila-facebook {
          font-size: 12.5px;
          color: #6b7280;
        }
        .ic-fila-sinfoto {
          font-size: 11px;
          font-weight: 700;
          color: #92400e;
          background: #fef3c7;
          border-radius: 6px;
          padding: 2px 8px;
        }
        .ic-fila-numero {
          margin-left: auto;
          font-size: 11.5px;
          font-weight: 700;
          color: #33455f;
          background: #eef0f4;
          border-radius: 6px;
          padding: 2px 8px;
        }

        .ic-hojas {
          position: absolute;
          left: -9999px;
          top: 0;
        }

        .ic-tarjeta {
          position: relative;
          width: 54mm;
          height: 85.6mm;
          overflow: hidden;
          background: #fff;
        }
        .ic-fondo {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: fill;
          z-index: 0;
        }
        .ic-logo {
          position: absolute;
          left: 35.7%;
          top: 2.18%;
          width: 60.67%;
          height: 26.17%;
          object-fit: contain;
          z-index: 2;
        }
        .ic-foto-caja {
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
        .ic-foto {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ic-foto-vacia {
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
        .ic-estatus {
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
          font-size: 7px;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .ic-num-etiqueta {
          position: absolute;
          left: 58.06%;
          top: 32.23%;
          width: 38.31%;
          height: 3.26%;
          z-index: 2;
          margin: 0;
          color: #111827;
          font-weight: 700;
          font-size: 5px;
          text-align: center;
        }
        .ic-num-valor {
          position: absolute;
          left: 58.97%;
          top: 35.44%;
          width: 35.18%;
          height: 11.19%;
          z-index: 2;
          margin: 0;
          color: #111827;
          font-weight: 800;
          font-size: 18px;
          text-align: center;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ic-nombres {
          position: absolute;
          left: 4.24%;
          top: 77.85%;
          width: 88.31%;
          height: 13.21%;
          z-index: 2;
          text-align: center;
        }
        .ic-nombre-facebook {
          margin: 0;
          color: #111827;
          font-weight: 800;
          font-size: 11px;
          line-height: 1.1;
        }
        .ic-nombre-real {
          margin: 2px 0 0;
          color: #1d3a63;
          font-weight: 600;
          font-size: 6.5px;
          line-height: 1.1;
        }
        .ic-vigencia {
          position: absolute;
          left: 28.49%;
          top: 93.9%;
          width: 39.8%;
          height: 3.26%;
          z-index: 2;
          margin: 0;
          color: #111827;
          font-weight: 700;
          font-size: 6px;
          text-align: center;
        }

        @media print {
          .no-imprimir {
            display: none !important;
          }
          .ic-pagina {
            background: #fff;
          }
          .ic-hojas {
            position: static;
          }
          .ic-hoja {
            display: grid;
            grid-template-columns: repeat(3, 54mm);
            grid-auto-rows: 85.6mm;
            gap: 0;
            justify-content: center;
            page-break-after: always;
            break-after: page;
          }
          .ic-hoja:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .ic-tarjeta {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

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
  // Ids cuya imagen YA terminó de mostrarse en pantalla (o falló al
  // mostrarse) — a diferencia de un contador que se va sumando, esto solo
  // crece y nunca se reinicia por accidente. Antes había un contador
  // ("cargadas") que se reiniciaba a 0 cada vez que se cambiaba la
  // selección, y eso borraba el avance de fotos que ya habían cargado bien,
  // dejando el botón de imprimir atorado aunque todo ya estuviera listo.
  const [imagenesListas, setImagenesListas] = useState(() => new Set());
  // Ids de vendedores cuya foto falló al traerse (error del servidor, o se
  // tardó demasiado y se cortó sola) — antes, si la petición se quedaba
  // trabada, la pantalla se quedaba esperando para siempre sin ningún aviso
  // ni forma de reintentar. Ahora se guarda aquí para poder avisar y dar un
  // botón de "Reintentar".
  const [erroresCarga, setErroresCarga] = useState(() => new Set());
  const [intentoFotos, setIntentoFotos] = useState(0);
  // Diagnóstico temporal, visible en la misma pantalla (no hace falta
  // herramientas de desarrollador): va guardando un registro de lo que pasa
  // cada vez que se piden las fotos, para ver exactamente en qué paso se
  // queda algo sin resolver.
  const [debugLog, setDebugLog] = useState([]);
  // El panel de diagnóstico solo se muestra si se entra con "?debug=1" en el
  // link — así la clienta y las vendedoras nunca lo ven, pero nosotros lo
  // podemos prender cuando lo necesitemos sin tener que tocar el código.
  const [mostrarDebug, setMostrarDebug] = useState(false);
  useEffect(() => {
    try {
      setMostrarDebug(new URLSearchParams(window.location.search).get('debug') === '1');
    } catch (err) {}
  }, []);
  function agregarLog(texto) {
    const hora = new Date().toLocaleTimeString('es-MX', { hour12: false });
    setDebugLog((prev) => [...prev.slice(-30), `${hora} ${texto}`]);
  }

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

  // Solo los errores que corresponden a alguien que sigue seleccionado
  // (si se quita de la selección a alguien que había fallado, ya no tiene
  // caso seguir mostrando el aviso por esa persona).
  const erroresVisibles = useMemo(
    () => tarjetas.filter((v) => erroresCarga.has(v.id)),
    [tarjetas, erroresCarga]
  );

  const hojas = useMemo(() => {
    const grupos = [];
    for (let i = 0; i < tarjetas.length; i += TARJETAS_POR_HOJA) {
      grupos.push(tarjetas.slice(i, i + TARJETAS_POR_HOJA));
    }
    return grupos;
  }, [tarjetas]);

  // Se piden de un solo jalón (una sola consulta) las fotos de credencial
  // de todos los seleccionados que todavía no se tengan guardadas en
  // "fotos" — antes se pedía una por una por cada vendedor, y con
  // selecciones grandes eso se trababa o tardaba mucho.
  //
  // Además, la petición tiene un límite de tiempo (20 segundos): antes, si
  // se quedaba a medias (conexión lenta o inestable), se quedaba esperando
  // para siempre sin ningún aviso — la única salida era recargar toda la
  // página y volver a seleccionar. Ahora, si tarda demasiado, se corta sola
  // y se avisa con un botón de "Reintentar".
  useEffect(() => {
    let cancelado = false;
    const controlador = new AbortController();
    const limite = setTimeout(() => controlador.abort(), 20000);

    async function traerFaltantes() {
      const faltantes = tarjetas.filter((v) => v.tiene_foto_credencial && !(v.id in fotos));
      if (faltantes.length === 0) {
        agregarLog(`Nada que pedir (faltantes=0) para [${tarjetas.map((v) => v.nombre).join(', ')}]`);
        return;
      }
      const ids = faltantes.map((v) => v.id).join(',');
      agregarLog(`Pidiendo ${faltantes.length} foto(s): ${faltantes.map((v) => v.nombre).join(', ')}`);
      let resultados = [];
      let huboError = false;
      try {
        const res = await fetch(`/api/vendedores/fotos-credencial?ids=${encodeURIComponent(ids)}`, {
          signal: controlador.signal,
          cache: 'no-store',
        });
        agregarLog(`Respuesta: status=${res.status} ok=${res.ok}`);
        if (res.ok) {
          const filas = await res.json();
          resultados = filas.map((f) => [f.id, f.foto_credencial || null]);
          agregarLog(
            `Filas recibidas: ${filas.length} — con foto: ${resultados.filter(([, f]) => f).length}, sin foto: ${resultados.filter(([, f]) => !f).length}`
          );
        } else {
          huboError = true;
        }
      } catch (err) {
        huboError = true;
        resultados = [];
        agregarLog(`Error en la petición: ${err && err.name ? err.name : err}`);
      }
      clearTimeout(limite);
      if (cancelado) {
        agregarLog('Esta petición se canceló (cambió la selección antes de terminar).');
        return;
      }
      // Cualquier seleccionado que se haya pedido pero no vino en la
      // respuesta (por ejemplo, si falló o se cortó la consulta) se marca
      // como sin foto encontrada, para no dejar el botón de imprimir
      // trabado — y si fue por un error real (no porque el vendedor
      // simplemente no tenga foto), se guarda aparte para poder reintentar.
      const idsRecibidos = new Set(resultados.map(([id]) => id));
      const nuevosErrores = new Set();
      faltantes.forEach((v) => {
        if (!idsRecibidos.has(v.id)) {
          resultados.push([v.id, null]);
          if (huboError) nuevosErrores.add(v.id);
        }
      });
      setFotos((prev) => {
        const siguiente = { ...prev };
        resultados.forEach(([id, foto]) => {
          siguiente[id] = foto;
        });
        return siguiente;
      });
      if (nuevosErrores.size > 0) {
        setErroresCarga((prev) => new Set([...prev, ...nuevosErrores]));
      }
      agregarLog(
        `Guardado en memoria: ${resultados.length} registro(s) — ahora toca esperar a que cada <img> termine de cargar en pantalla.`
      );
    }
    traerFaltantes();
    return () => {
      cancelado = true;
      clearTimeout(limite);
      controlador.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarjetas, intentoFotos]);

  // Reintenta traer solo las fotos que fallaron (sin perder las que sí se
  // cargaron bien ni la selección actual).
  function reintentarFotosFallidas() {
    if (erroresCarga.size === 0) return;
    setFotos((prev) => {
      const siguiente = { ...prev };
      erroresCarga.forEach((id) => {
        delete siguiente[id];
      });
      return siguiente;
    });
    setErroresCarga(new Set());
    setIntentoFotos((n) => n + 1);
  }

  // Cuántas de las tarjetas seleccionadas ya están listas para imprimirse,
  // calculado siempre a partir del estado real (nunca un contador aparte
  // que se pueda desfasar): está lista si no tiene foto, si ya se supo que
  // no tiene foto real (fotos[id] es null), o si su imagen ya terminó de
  // cargar en pantalla.
  const cargadas = useMemo(
    () =>
      tarjetas.filter((v) => {
        if (!v.tiene_foto_credencial) return true;
        if (!(v.id in fotos)) return false;
        if (!fotos[v.id]) return true;
        return imagenesListas.has(v.id);
      }).length,
    [tarjetas, fotos, imagenesListas]
  );

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

      {mostrarDebug && debugLog.length > 0 && (
        <div className="ic-debug no-imprimir">
          <p className="ic-debug-titulo">Diagnóstico (temporal):</p>
          {debugLog.map((linea, i) => (
            <p key={i} className="ic-debug-linea">{linea}</p>
          ))}
        </div>
      )}

      {erroresVisibles.length > 0 && (
        <p className="ic-aviso ic-aviso-error no-imprimir">
          {erroresVisibles.length === 1
            ? `No se pudo traer la foto de "${nombreParaTarjeta(erroresVisibles[0])}" (tardó demasiado o hubo un problema de conexión).`
            : `No se pudieron traer ${erroresVisibles.length} fotos (tardaron demasiado o hubo un problema de conexión).`}{' '}
          <button className="btn secondary ic-btn-reintentar" onClick={reintentarFotosFallidas}>
            Reintentar
          </button>
        </p>
      )}

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
                        onLoad={() => {
                          agregarLog(`Imagen cargada en pantalla: ${v.nombre}`);
                          setImagenesListas((prev) => (prev.has(v.id) ? prev : new Set(prev).add(v.id)));
                        }}
                        onError={() => {
                          agregarLog(`La imagen de ${v.nombre} no se pudo mostrar (dato dañado o src inválido).`);
                          setImagenesListas((prev) => (prev.has(v.id) ? prev : new Set(prev).add(v.id)));
                        }}
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
        .ic-debug {
          margin: 12px 16px 0;
          background: #111827;
          color: #a5f3fc;
          font-family: monospace;
          font-size: 11.5px;
          padding: 10px 14px;
          border-radius: 10px;
          max-height: 260px;
          overflow-y: auto;
        }
        .ic-debug-titulo {
          margin: 0 0 6px;
          color: #fff;
          font-weight: 700;
          font-family: inherit;
        }
        .ic-debug-linea {
          margin: 2px 0;
        }
        .ic-aviso-error {
          background: #fee2e2;
          color: #991b1b;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ic-btn-reintentar {
          padding: 6px 12px;
          font-size: 12px;
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

        /* Oculto SOLO en pantalla, nunca "reactivado" para impresión: antes
           se escondía con una propiedad (primero "position", luego
           "height") que se volvía a cambiar justo @media print, y ese
           cambio de última hora es lo que confundía al navegador al
           calcular varias hojas (con pocas tarjetas salía bien, pero con
           selecciones grandes —"seleccionar todo"— solo armaba la primera
           hoja y el resto se perdía o se encimaba). Al no tocar nada en
           @media print, la impresión usa el acomodo normal de siempre,
           sin ningún recálculo de último momento. Las imágenes igual
           precargan con display:none (el navegador las pide igual, nomás
           no se dibujan en pantalla). */
        @media screen {
          .ic-hojas {
            display: none;
          }
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
          /* ESTA es la causa real de que solo saliera 1 hoja sin importar
             cuántas se seleccionaran: styles/globals.css le pone
             "height: 100%" a <html> y <body> (para que la pantalla normal
             no haga scroll raro). Esa altura fija de "una sola pantalla"
             también se aplicaba al imprimir, y el navegador recortaba todo
             el documento a esa altura (una hoja) en vez de dejarlo crecer
             para varias hojas — por eso siempre salía 1 sola hoja sin
             importar si se seleccionaban 11, 18 o 78. Aquí se anula nada
             más para imprimir. */
          html,
          body {
            height: auto !important;
          }
          /* Define explícitamente el tamaño de hoja y márgenes chicos: sin
             esto cada dispositivo/impresora usa sus propios márgenes por
             default (que varían bastante entre computadora y celular), y
             como las tarjetas miden exactamente 54mm x 85.6mm, un margen
             de más podía hacer que no cupiera la tercera fila completa en
             una sola hoja física — eso es lo que se veía como una hoja
             "incompleta" o con tarjetas que se recorren a la siguiente. */
          @page {
            size: letter;
            margin: 4mm;
          }
          .no-imprimir {
            display: none !important;
          }
          .ic-pagina {
            background: #fff;
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

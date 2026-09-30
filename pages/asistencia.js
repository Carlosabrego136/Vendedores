import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import jsQR from 'jsqr';

const ESTATUS_LABEL = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  alerta_riesgo: 'Alerta de riesgo',
  vetado: 'Vetado',
};

// La fecha "fecha" del renglón de asistencia viene solo con "YYYY-MM-DD"
// (no es una columna DATE con hora), pero fecha_vencimiento del vendedor sí
// puede venir con hora/zona pegada — nos quedamos solo con los primeros 10
// caracteres para que ambas funcionen igual.
function formatoFecha(fechaIso) {
  if (!fechaIso) return '';
  const corta = String(fechaIso).slice(0, 10);
  const d = new Date(`${corta}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Asistencia() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const escaneandoRef = useRef(true);
  const animRef = useRef(null);

  const [camaraLista, setCamaraLista] = useState(false);
  const [errorCamara, setErrorCamara] = useState('');
  const [resultado, setResultado] = useState(null);
  const [cargandoResultado, setCargandoResultado] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  async function cargarHistorial() {
    const res = await fetch('/api/asistencia');
    const data = await res.json();
    setHistorial(data);
  }

  useEffect(() => {
    cargarHistorial();

    let activo = true;

    async function iniciarCamara() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (!activo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamaraLista(true);
        loopEscaneo();
      } catch (err) {
        setErrorCamara(
          'No se pudo acceder a la cámara. Revisa que le hayas dado permiso a este sitio para usarla.'
        );
      }
    }

    function loopEscaneo() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        animRef.current = requestAnimationFrame(loopEscaneo);
        return;
      }
      if (video.readyState === video.HAVE_ENOUGH_DATA && escaneandoRef.current) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const codigo = jsQR(imagen.data, imagen.width, imagen.height);
        if (codigo && codigo.data) {
          procesarCodigo(codigo.data);
        }
      }
      animRef.current = requestAnimationFrame(loopEscaneo);
    }

    iniciarCamara();

    return () => {
      activo = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function procesarCodigo(qrCodigo) {
    if (!escaneandoRef.current) return;
    escaneandoRef.current = false;
    setCargandoResultado(true);
    try {
      const res = await fetch('/api/asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_codigo: qrCodigo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultado({ error: data.error || 'No se pudo registrar la asistencia.' });
      } else {
        setResultado(data);
        cargarHistorial();
      }
    } catch (err) {
      setResultado({ error: 'No se pudo conectar. Intenta de nuevo.' });
    } finally {
      setCargandoResultado(false);
    }
  }

  function escanearOtro() {
    setResultado(null);
    escaneandoRef.current = true;
  }

  const historialAgrupado = historial.reduce((acc, fila) => {
    const clave = fila.fecha;
    if (!acc[clave]) acc[clave] = [];
    acc[clave].push(fila);
    return acc;
  }, {});

  return (
    <div className="asis-shell">
      <Head>
        <title>Pase de lista — Vendedores</title>
      </Head>

      <div className="asis-header">
        <Link href="/" className="asis-volver">
          ← Volver a Vendedores
        </Link>
        <h1>Pase de lista</h1>
        <p>Escanea el código QR del vendedor para registrar su asistencia de hoy.</p>
      </div>

      <div className="asis-camara-wrap">
        {errorCamara && <p className="asis-error-camara">{errorCamara}</p>}
        <video ref={videoRef} className="asis-video" muted playsInline />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {!camaraLista && !errorCamara && <p className="asis-cargando">Abriendo cámara...</p>}

        {(cargandoResultado || resultado) && (
          <div className="asis-overlay">
            {cargandoResultado ? (
              <p>Verificando...</p>
            ) : resultado.error ? (
              <div className="asis-resultado error">
                <p className="asis-resultado-titulo">No encontrado</p>
                <p>{resultado.error}</p>
                <button className="asis-btn" onClick={escanearOtro}>
                  Escanear otro
                </button>
              </div>
            ) : (
              <div className={`asis-resultado ${resultado.porVencer ? 'por-vencer' : 'ok'}`}>
                <p className="asis-resultado-titulo">
                  {resultado.yaEstabaRegistrado ? 'Ya estaba registrado' : '✔ Asistencia registrada'}
                </p>
                <p className="asis-resultado-nombre">{resultado.vendedor.nombre}</p>
                <p className="asis-resultado-estatus">
                  Estatus: {ESTATUS_LABEL[resultado.vendedor.estatus] || resultado.vendedor.estatus}
                </p>
                {resultado.vendedor.fecha_vencimiento && (
                  <p className="asis-resultado-venc">
                    Vencimiento: {formatoFecha(resultado.vendedor.fecha_vencimiento)}
                  </p>
                )}
                {resultado.porVencer && (
                  <p className="asis-resultado-aviso">
                    ⚠ Su registro está por vencer en {resultado.diasParaVencer} día
                    {resultado.diasParaVencer === 1 ? '' : 's'} — recuérdale renovar su información.
                  </p>
                )}
                <button className="asis-btn" onClick={escanearOtro}>
                  Escanear otro
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="asis-panel">
        <button className="asis-btn secundario" onClick={() => setMostrarHistorial((v) => !v)}>
          {mostrarHistorial ? 'Ocultar historial' : 'Ver historial de asistencias'}
        </button>

        {mostrarHistorial && (
          <div className="asis-historial">
            {Object.keys(historialAgrupado).length === 0 ? (
              <p className="asis-vacio">Todavía no hay asistencias registradas.</p>
            ) : (
              Object.keys(historialAgrupado)
                .sort((a, b) => (a < b ? 1 : -1))
                .map((fecha) => (
                  <div key={fecha} className="asis-semana">
                    <h3>{formatoFecha(fecha)}</h3>
                    <ul>
                      {historialAgrupado[fecha].map((f) => (
                        <li key={`${f.vendedor_id}-${f.fecha}`}>{f.vendedor_nombre}</li>
                      ))}
                    </ul>
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        html, body {
          background: #0a1120;
        }
        .asis-shell {
          min-height: 100vh;
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 16px 40px;
        }
        .asis-header {
          width: 100%;
          max-width: 480px;
          text-align: center;
          margin-bottom: 16px;
        }
        .asis-volver {
          display: inline-block;
          margin-bottom: 12px;
          font-size: 13.5px;
          color: #c7cdd8;
          text-decoration: none;
        }
        .asis-header h1 {
          margin: 0 0 6px;
          font-size: 26px;
          font-weight: 800;
        }
        .asis-header p {
          margin: 0;
          color: #b7bfcc;
          font-size: 14px;
        }
        .asis-camara-wrap {
          position: relative;
          width: 100%;
          max-width: 480px;
          aspect-ratio: 3 / 4;
          background: #000;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(199, 205, 216, 0.35);
          margin-bottom: 20px;
        }
        .asis-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .asis-cargando,
        .asis-error-camara {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #c7cdd8;
          text-align: center;
          padding: 0 20px;
        }
        .asis-overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 17, 32, 0.92);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .asis-resultado {
          text-align: center;
          background: linear-gradient(135deg, #1b2740 0%, #0a1120 100%);
          border-radius: 16px;
          padding: 24px 20px;
          border: 2px solid rgba(199, 205, 216, 0.35);
          width: 100%;
        }
        .asis-resultado.ok {
          border-color: #34c759;
        }
        .asis-resultado.por-vencer {
          border-color: #f5a524;
        }
        .asis-resultado.error {
          border-color: #d93c3c;
        }
        .asis-resultado-titulo {
          font-weight: 800;
          font-size: 17px;
          margin: 0 0 8px;
        }
        .asis-resultado-nombre {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 6px;
        }
        .asis-resultado-estatus,
        .asis-resultado-venc {
          margin: 2px 0;
          color: #c7cdd8;
          font-size: 14px;
        }
        .asis-resultado-aviso {
          margin: 12px 0 0;
          color: #ffcf86;
          font-size: 13.5px;
          font-weight: 600;
        }
        .asis-btn,
        .asis-btn.secundario {
          margin-top: 16px;
          border: none;
          border-radius: 10px;
          padding: 10px 18px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          background: linear-gradient(135deg, #33455f 0%, #131c30 100%);
          border: 1px solid rgba(199, 205, 216, 0.4);
          color: #fff;
        }
        .asis-panel {
          width: 100%;
          max-width: 480px;
        }
        .asis-historial {
          margin-top: 16px;
          background: linear-gradient(135deg, #1b2740 0%, #0a1120 100%);
          border: 1px solid rgba(199, 205, 216, 0.3);
          border-radius: 14px;
          padding: 16px;
          max-height: 400px;
          overflow-y: auto;
        }
        .asis-semana {
          margin-bottom: 14px;
        }
        .asis-semana h3 {
          margin: 0 0 6px;
          font-size: 14px;
          color: #dfe3ea;
          border-bottom: 1px solid rgba(199, 205, 216, 0.2);
          padding-bottom: 4px;
        }
        .asis-semana ul {
          margin: 0;
          padding-left: 18px;
          color: #c7cdd8;
          font-size: 13.5px;
        }
        .asis-vacio {
          color: #9aa4b5;
          font-size: 13.5px;
        }
      `}</style>
    </div>
  );
}

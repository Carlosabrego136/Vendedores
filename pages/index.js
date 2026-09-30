import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Fondo de video pedido por la clienta para esta sección — se usa tal cual,
// sin ninguna capa de opacidad/tinte encima (así lo pidió explícitamente).
const VIDEO_FONDO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_135039_b04d00db-6ee2-4e2a-a7f5-b2dfd3d24fd2.mp4';

export default function Vendedores() {
  const [vendedores, setVendedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEdicion, setNombreEdicion] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [aviso, setAviso] = useState('');

  async function cargar() {
    setCargando(true);
    const url = `/api/vendedores${mostrarInactivos ? '?incluirInactivos=1' : ''}`;
    const res = await fetch(url);
    setVendedores(await res.json());
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInactivos]);

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    await fetch('/api/vendedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    });
    setNombre('');
    setAviso(`Se agregó a "${nombre.trim()}" correctamente.`);
    cargar();
  }

  function iniciarEdicion(v) {
    setEditandoId(v.id);
    setNombreEdicion(v.nombre);
  }

  async function guardarEdicion(id) {
    if (!nombreEdicion.trim()) return;
    await fetch(`/api/vendedores/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreEdicion }),
    });
    setEditandoId(null);
    cargar();
  }

  async function alternarActivo(v) {
    const accion = v.activo ? 'desactivar' : 'reactivar';
    if (!confirm(`¿Seguro que quieres ${accion} a "${v.nombre}"?`)) return;
    await fetch(`/api/vendedores/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !v.activo }),
    });
    cargar();
  }

  async function eliminar(v) {
    if (!confirm(`¿Eliminar permanentemente a "${v.nombre}"? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/vendedores/${v.id}`, { method: 'DELETE' });
    if (res.ok) {
      cargar();
      return;
    }
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo eliminar al vendedor.');
  }

  const vendedoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return vendedores;
    return vendedores.filter((v) => v.nombre.toLowerCase().includes(q));
  }, [vendedores, busqueda]);

  return (
    <div className="vend-shell">
      <Head>
        <title>Vendedores — ENVIOS AYORA</title>
        <link rel="icon" href="/logo.jpg" />
      </Head>

      <video className="vend-video" autoPlay loop muted playsInline preload="auto">
        <source src={VIDEO_FONDO} type="video/mp4" />
      </video>

      <div className="vend-content">
        <header className="vend-header">
          <div className="vend-brand">
            <img src="/logo.jpg" alt="ENVIOS AYORA" />
            <span className="vend-brand-tag">ENVIOS AYORA</span>
          </div>
          <h1>Vendedores</h1>
          <p className="vend-subtitulo">Agrega, edita y genera los códigos QR de tus vendedores.</p>
        </header>

        <main className="vend-main">
          <section className="vend-panel">
            <h2>Agregar vendedor</h2>
            <form onSubmit={crear} className="vend-form">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre del vendedor, ej. Magalli Renata"
              />
              <button type="submit" className="vend-btn">Agregar</button>
            </form>
            {aviso && <p className="vend-aviso">{aviso}</p>}
          </section>

          <section className="vend-panel">
            <h2>Buscar / lista de vendedores</h2>

            <input
              className="vend-buscar"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Escribe un nombre para filtrar..."
            />

            <label className="vend-checkbox">
              <input
                type="checkbox"
                checked={mostrarInactivos}
                onChange={(e) => setMostrarInactivos(e.target.checked)}
              />
              Mostrar también los desactivados
            </label>

            {cargando ? (
              <p className="vend-vacio">Cargando...</p>
            ) : vendedoresFiltrados.length === 0 ? (
              <p className="vend-vacio">No hay vendedores para mostrar.</p>
            ) : (
              <div className="vend-lista">
                {vendedoresFiltrados.map((v) => (
                  <div key={v.id} className={`vend-tarjeta ${v.activo ? '' : 'inactivo'}`}>
                    <div className="vend-tarjeta-top">
                      {editandoId === v.id ? (
                        <input
                          className="vend-input-edicion"
                          value={nombreEdicion}
                          onChange={(e) => setNombreEdicion(e.target.value)}
                        />
                      ) : (
                        <span className="vend-nombre">{v.nombre}</span>
                      )}
                      <span className={`vend-badge ${v.activo ? 'activo' : 'desactivado'}`}>
                        {v.activo ? 'Activo' : 'Desactivado'}
                      </span>
                    </div>

                    <div className="vend-tarjeta-acciones">
                      {editandoId === v.id ? (
                        <>
                          <button className="vend-btn-mini" onClick={() => guardarEdicion(v.id)}>
                            Guardar
                          </button>
                          <button className="vend-btn-mini secundario" onClick={() => setEditandoId(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <Link className="vend-btn-mini" href={`/qr/${v.id}`}>
                            Ver / imprimir QR
                          </Link>
                          <button className="vend-btn-mini secundario" onClick={() => iniciarEdicion(v)}>
                            Editar
                          </button>
                          <button className="vend-btn-mini secundario" onClick={() => alternarActivo(v)}>
                            {v.activo ? 'Desactivar' : 'Reactivar'}
                          </button>
                          <button className="vend-btn-mini peligro" onClick={() => eliminar(v)}>
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        <footer className="vend-footer">ENVIOS AYORA — sección de vendedores</footer>
      </div>

      <style jsx global>{`
        html, body {
          background: transparent;
        }
        .vend-shell {
          position: relative;
          min-height: 100vh;
        }
        .vend-video {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          object-fit: cover;
          z-index: -1;
        }
        .vend-content {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          color: #fff;
          display: flex;
          flex-direction: column;
        }
        .vend-header {
          padding: 24px 20px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 6px;
        }
        .vend-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
        }
        .vend-brand img {
          height: 60px;
          border-radius: 10px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
        }
        .vend-brand-tag {
          display: inline-block;
          padding: 6px 18px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: linear-gradient(135deg, #33455f 0%, #131c30 100%);
          border: 1px solid rgba(199, 205, 216, 0.4);
          color: #dfe3ea;
        }
        .vend-header h1 {
          margin: 4px 0 0;
          font-size: 30px;
          font-weight: 800;
        }
        .vend-subtitulo {
          margin: 4px 0 0;
          color: #c7cdd8;
          font-size: 14.5px;
          max-width: 480px;
        }
        .vend-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          padding: 8px 16px 32px;
        }
        .vend-panel {
          width: 100%;
          max-width: 620px;
          background: linear-gradient(135deg, #1b2740 0%, #0a1120 100%);
          border: 1px solid rgba(199, 205, 216, 0.35);
          border-radius: 18px;
          padding: 22px 20px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        }
        .vend-panel h2 {
          margin: 0 0 14px;
          font-size: 17px;
          font-weight: 700;
          color: #fff;
        }
        .vend-form {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .vend-form input {
          flex: 1;
          min-width: 180px;
        }
        .vend-panel input[type='text'],
        .vend-panel input:not([type]),
        .vend-form input,
        .vend-buscar,
        .vend-input-edicion {
          background: #0a1120;
          border: 1px solid rgba(199, 205, 216, 0.35);
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 15px;
          color: #fff;
          outline: none;
        }
        .vend-panel input::placeholder {
          color: #9aa4b5;
        }
        .vend-buscar {
          width: 100%;
          margin-bottom: 14px;
        }
        .vend-btn,
        .vend-btn-mini {
          border: none;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          background: linear-gradient(135deg, #33455f 0%, #131c30 100%);
          border: 1px solid rgba(199, 205, 216, 0.4);
          color: #fff;
        }
        .vend-btn {
          padding: 12px 20px;
          font-size: 15px;
        }
        .vend-btn:hover,
        .vend-btn-mini:hover {
          filter: brightness(1.15);
        }
        .vend-aviso {
          margin: 12px 0 0;
          font-size: 13.5px;
          color: #b7bfcc;
        }
        .vend-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
          font-weight: 600;
          color: #dfe3ea;
          margin-bottom: 16px;
          cursor: pointer;
        }
        .vend-checkbox input {
          width: auto;
          margin: 0;
        }
        .vend-vacio {
          color: #9aa4b5;
          font-size: 14px;
          margin: 6px 0 0;
        }
        .vend-lista {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .vend-tarjeta {
          background: linear-gradient(135deg, #26314a 0%, #10172a 100%);
          border: 1px solid rgba(199, 205, 216, 0.3);
          border-radius: 14px;
          padding: 14px 16px;
        }
        .vend-tarjeta.inactivo {
          opacity: 0.6;
        }
        .vend-tarjeta-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .vend-nombre {
          font-size: 16px;
          font-weight: 700;
          color: #fff;
        }
        .vend-badge {
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 4px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .vend-badge.activo {
          background: rgba(52, 199, 89, 0.18);
          color: #7ee2a0;
          border: 1px solid rgba(52, 199, 89, 0.35);
        }
        .vend-badge.desactivado {
          background: rgba(199, 205, 216, 0.12);
          color: #c7cdd8;
          border: 1px solid rgba(199, 205, 216, 0.3);
        }
        .vend-tarjeta-acciones {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .vend-btn-mini {
          padding: 8px 14px;
          font-size: 13px;
          text-decoration: none;
          display: inline-block;
        }
        .vend-btn-mini.secundario {
          background: rgba(199, 205, 216, 0.1);
          border: 1px solid rgba(199, 205, 216, 0.3);
        }
        .vend-btn-mini.peligro {
          background: rgba(217, 60, 60, 0.18);
          border: 1px solid rgba(217, 60, 60, 0.4);
          color: #ffb4b4;
        }
        .vend-input-edicion {
          flex: 1;
          min-width: 140px;
        }
        .vend-footer {
          text-align: center;
          padding: 16px;
          font-size: 12.5px;
          color: #9aa4b5;
        }

        @media (min-width: 640px) {
          .vend-header h1 {
            font-size: 34px;
          }
        }
      `}</style>
    </div>
  );
}

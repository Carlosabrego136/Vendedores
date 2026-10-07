import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Fondo de video pedido por la clienta para esta sección — se usa tal cual,
// sin ninguna capa de opacidad/tinte encima (así lo pidió explícitamente).
const VIDEO_FONDO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_135039_b04d00db-6ee2-4e2a-a7f5-b2dfd3d24fd2.mp4';

const DIAS_AVISO_VENCIMIENTO = 15;

const ESTATUS_OPCIONES = [
  { valor: 'activo', label: 'Activo', color: '#34c759' },
  { valor: 'inactivo', label: 'Inactivo', color: '#8b5e3c' },
  { valor: 'alerta_riesgo', label: 'Alerta de riesgo', color: '#f5a524' },
  { valor: 'vetado', label: 'Vetado', color: '#d93c3c' },
];

function colorEstatus(valor) {
  return (ESTATUS_OPCIONES.find((o) => o.valor === valor) || ESTATUS_OPCIONES[0]).color;
}
function labelEstatus(valor) {
  return (ESTATUS_OPCIONES.find((o) => o.valor === valor) || ESTATUS_OPCIONES[0]).label;
}

// Postgres devuelve las columnas DATE como objetos Date completos (con hora
// y zona), y al pasar por JSON quedan como "2026-10-02T00:00:00.000Z". Esta
// función se queda solo con el "YYYY-MM-DD", sin importar si ya venía así
// de corto o con toda la hora pegada.
function soloFecha(valor) {
  if (!valor) return '';
  return String(valor).slice(0, 10);
}

function formatoFecha(fechaIso) {
  const corta = soloFecha(fechaIso);
  if (!corta) return '—';
  const d = new Date(`${corta}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Número de registro con 4 dígitos (0001, 0002, ...), como lo pidió la clienta.
function formatoNumeroRegistro(n) {
  if (n === null || n === undefined) return null;
  return String(n).padStart(4, '0');
}

// En las listas solo se debe ver el nombre de Facebook del vendedor (y si no
// tiene, su nombre real como respaldo) — por seguridad, para no exponer el
// nombre real de las personas. El nombre real solo se sigue mostrando en la
// ficha completa del vendedor.
function nombreMostrar(v) {
  return v.facebook && v.facebook.trim() ? v.facebook.trim() : v.nombre;
}

// Convierte un texto escrito a mano ("Ropa y calzado") en una "clave" simple
// para guardarla en la base de datos (sin acentos, espacios ni símbolos).
function generarClave(nombre) {
  return (
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'cat'
  );
}

// Dado el texto que se escribió en el campo "Categoría", busca si ya existe
// una categoría con ese nombre (sin importar mayúsculas/espacios) y reusa su
// id; si no existe, la crea en ese momento. Así el campo queda "editable
// escribiendo" sin duplicar categorías por error.
async function resolverCategoriaId(textoCategoria, categoriasActuales, onNuevaCategoria) {
  const texto = (textoCategoria || '').trim();
  if (!texto) return null;

  const existente = categoriasActuales.find(
    (c) => c.nombre.trim().toLowerCase() === texto.toLowerCase()
  );
  if (existente) return existente.id;

  const base = generarClave(texto);
  const clavesUsadas = new Set(categoriasActuales.map((c) => c.clave));
  let clave = base;
  let sufijo = 2;
  while (clavesUsadas.has(clave)) {
    clave = `${base}-${sufijo}`;
    sufijo += 1;
  }

  const res = await fetch('/api/categorias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave, nombre: texto }),
  });
  if (!res.ok) return null;
  const nueva = await res.json();
  if (onNuevaCategoria) onNuevaCategoria(nueva);
  return nueva.id;
}

function diasParaVencer(fechaVencimiento) {
  const corta = soloFecha(fechaVencimiento);
  if (!corta) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${corta}T00:00:00`);
  if (Number.isNaN(venc.getTime())) return null;
  return Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
}

// Comprime una foto en el navegador antes de subirla, para que no se guarde
// un archivo enorme en la base de datos. maxAncho/calidad se ajustan según
// el uso: la INE solo necesita leerse, mientras que la foto de la credencial
// se imprime, así que se guarda un poco más grande/nítida.
function comprimirImagen(file, maxAncho = 900, calidad = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.onload = () => {
        const escala = Math.min(1, maxAncho / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function CampoFoto({ valor, onChange, etiquetaVacio, etiquetaConValor, maxAncho, calidad, claseVistaPrevia }) {
  const [subiendo, setSubiendo] = useState(false);

  async function alSeleccionar(e) {
    const file = e.target.files[0];
    // Se limpia el input para que, si se vuelve a elegir el mismo archivo
    // (por ejemplo tomar otra foto y repetirla), el evento onChange se
    // dispare de nuevo igual.
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    try {
      const dataUrl = await comprimirImagen(file, maxAncho, calidad);
      onChange(dataUrl);
    } catch (err) {
      alert('No se pudo procesar la foto, intenta de nuevo.');
    } finally {
      setSubiendo(false);
    }
  }

  // Dos botones separados y explícitos en vez de uno solo: en varios
  // celulares Android, un solo input sin "capture" a veces abre directo la
  // galería y nunca ofrece la cámara (según el modelo/versión de Android).
  // Con un botón para cada cosa, las dos opciones quedan siempre visibles
  // sin depender de lo que decida el teléfono.
  return (
    <div className="vend-ine">
      {valor && <img src={valor} alt="Foto" className={claseVistaPrevia || 'vend-ine-preview'} />}
      <div className="vend-ine-botones">
        <label className="vend-btn-mini secundario vend-ine-boton">
          {subiendo ? 'Procesando...' : `📷 ${valor ? 'Tomar otra foto' : 'Tomar foto'}`}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={alSeleccionar}
            style={{ display: 'none' }}
          />
        </label>
        <label className="vend-btn-mini secundario vend-ine-boton">
          {subiendo ? 'Procesando...' : `🖼 ${valor ? 'Elegir otra de galería' : 'Elegir de galería'}`}
          <input
            type="file"
            accept="image/*"
            onChange={alSeleccionar}
            style={{ display: 'none' }}
          />
        </label>
      </div>
    </div>
  );
}

function FormularioVendedor({ inicial, onGuardar, onCancelar, textoBoton, categorias }) {
  const [datos, setDatos] = useState({
    nombre: inicial?.nombre || '',
    categoria_texto: inicial?.categoria_nombre || '',
    telefono: inicial?.telefono || '',
    fecha_nacimiento: inicial?.fecha_nacimiento ? inicial.fecha_nacimiento.slice(0, 10) : '',
    facebook: inicial?.facebook || '',
    referencia1_nombre: inicial?.referencia1_nombre || '',
    referencia1_telefono: inicial?.referencia1_telefono || '',
    referencia2_nombre: inicial?.referencia2_nombre || '',
    referencia2_telefono: inicial?.referencia2_telefono || '',
    ine_foto: inicial?.ine_foto || '',
    foto_credencial: inicial?.foto_credencial || '',
    estatus: inicial?.estatus || 'activo',
  });

  function set(campo, valor) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  return (
    <div className="vend-form-completo">
      <div className="vend-grid-2">
        <div>
          <label>Nombre</label>
          <input value={datos.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Nombre completo" />
        </div>
        <div>
          <label>Teléfono</label>
          <input value={datos.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="Ej. 646 123 4567" />
        </div>
        <div>
          <label>Categoría</label>
          <input
            list="vend-categorias-lista"
            value={datos.categoria_texto}
            onChange={(e) => set('categoria_texto', e.target.value)}
            placeholder="Ej. Ropa, calzado, marca..."
          />
        </div>
        <div>
          <label>Fecha de nacimiento</label>
          <input type="date" value={datos.fecha_nacimiento} onChange={(e) => set('fecha_nacimiento', e.target.value)} />
        </div>
        <div>
          <label>Facebook</label>
          <input value={datos.facebook} onChange={(e) => set('facebook', e.target.value)} placeholder="Nombre o link de perfil" />
        </div>
        <div>
          <label>Referencia 1 — nombre</label>
          <input value={datos.referencia1_nombre} onChange={(e) => set('referencia1_nombre', e.target.value)} />
        </div>
        <div>
          <label>Referencia 1 — teléfono</label>
          <input value={datos.referencia1_telefono} onChange={(e) => set('referencia1_telefono', e.target.value)} />
        </div>
        <div>
          <label>Referencia 2 — nombre</label>
          <input value={datos.referencia2_nombre} onChange={(e) => set('referencia2_nombre', e.target.value)} />
        </div>
        <div>
          <label>Referencia 2 — teléfono</label>
          <input value={datos.referencia2_telefono} onChange={(e) => set('referencia2_telefono', e.target.value)} />
        </div>
      </div>

      <label style={{ marginTop: 10, display: 'block' }}>Foto de la INE</label>
      <CampoFoto
        valor={datos.ine_foto}
        onChange={(v) => set('ine_foto', v)}
        etiquetaVacio="Tomar foto de INE"
        etiquetaConValor="Cambiar foto de INE"
        maxAncho={900}
        calidad={0.7}
      />

      <label style={{ marginTop: 14, display: 'block' }}>
        Foto para la credencial (retrato del vendedor)
      </label>
      <CampoFoto
        valor={datos.foto_credencial}
        onChange={(v) => set('foto_credencial', v)}
        etiquetaVacio="Tomar foto para la credencial"
        etiquetaConValor="Cambiar foto de la credencial"
        maxAncho={700}
        calidad={0.85}
        claseVistaPrevia="vend-credencial-foto-preview"
      />

      <label style={{ marginTop: 14, display: 'block' }}>Estatus del vendedor</label>
      <div className="vend-estatus-opciones">
        {ESTATUS_OPCIONES.map((op) => {
          const seleccionada = datos.estatus === op.valor;
          return (
            <button
              type="button"
              key={op.valor}
              className="vend-estatus-pill"
              style={{
                color: op.color,
                borderColor: op.color,
                background: seleccionada ? `${op.color}33` : 'transparent',
                opacity: seleccionada ? 1 : 0.55,
              }}
              onClick={() => set('estatus', op.valor)}
            >
              {op.label}
            </button>
          );
        })}
      </div>

      <div className="vend-form-acciones">
        <button className="vend-btn" onClick={() => onGuardar(datos)}>
          {textoBoton}
        </button>
        {onCancelar && (
          <button className="vend-btn-mini secundario" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

export default function Vendedores() {
  const [vendedores, setVendedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [porVencer, setPorVencer] = useState([]);
  const [mostrarReporte, setMostrarReporte] = useState(false);
  const [totales, setTotales] = useState(null);
  const [avisoCopiado, setAvisoCopiado] = useState('');
  const [categorias, setCategorias] = useState([]);

  async function cargar() {
    setCargando(true);
    const url = `/api/vendedores${mostrarInactivos ? '?incluirInactivos=1' : ''}`;
    const res = await fetch(url);
    setVendedores(await res.json());
    setCargando(false);
  }

  async function cargarCategorias() {
    const res = await fetch('/api/categorias');
    setCategorias(await res.json());
  }

  function agregarCategoriaLocal(nueva) {
    setCategorias((cs) => (cs.some((c) => c.id === nueva.id) ? cs : [...cs, nueva]));
  }

  async function cargarPorVencer() {
    const res = await fetch('/api/vendedores/por-vencer');
    setPorVencer(await res.json());
  }

  async function cargarTotales() {
    const res = await fetch('/api/vendedores/totales');
    setTotales(await res.json());
  }

  useEffect(() => {
    cargar();
    cargarPorVencer();
    cargarTotales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInactivos]);

  useEffect(() => {
    cargarCategorias();
  }, []);

  async function crear(datos) {
    if (!datos.nombre.trim()) {
      alert('El nombre es obligatorio.');
      return;
    }
    const { categoria_texto, ...resto } = datos;
    const categoria_id = await resolverCategoriaId(categoria_texto, categorias, agregarCategoriaLocal);
    await fetch('/api/vendedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...resto, categoria_id }),
    });
    setMostrarAlta(false);
    cargar();
    cargarPorVencer();
    cargarTotales();
  }

  async function guardarEdicion(id, datos) {
    const { categoria_texto, ...resto } = datos;
    const categoria_id = await resolverCategoriaId(categoria_texto, categorias, agregarCategoriaLocal);
    await fetch(`/api/vendedores/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...resto, categoria_id }),
    });
    setEditandoId(null);
    cargar();
    cargarPorVencer();
    cargarTotales();
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
    cargarTotales();
  }

  async function eliminar(v) {
    if (!confirm(`¿Eliminar permanentemente a "${v.nombre}"? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/vendedores/${v.id}`, { method: 'DELETE' });
    if (res.ok) {
      cargar();
      cargarPorVencer();
      cargarTotales();
      return;
    }
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo eliminar al vendedor.');
  }

  // Copia la lista de vendedores que se está viendo en este momento (ya
  // filtrada por el buscador) como texto separado por tabulaciones, para que
  // al pegarlo en Excel cada dato caiga en su propia columna.
  async function copiarParaExcel() {
    const encabezados = [
      'No. registro',
      'Nombre',
      'Teléfono',
      'Estatus',
      'Fecha de nacimiento',
      'Fecha de ingreso',
      'Fecha de vencimiento',
      'Facebook',
      'Referencia 1',
      'Tel. Referencia 1',
      'Referencia 2',
      'Tel. Referencia 2',
    ];

    const filas = vendedoresFiltrados.map((v) => [
      formatoNumeroRegistro(v.numero_registro) || '',
      v.nombre || '',
      v.telefono || '',
      labelEstatus(v.estatus),
      formatoFecha(v.fecha_nacimiento),
      formatoFecha(v.fecha_ingreso),
      formatoFecha(v.fecha_vencimiento),
      v.facebook || '',
      v.referencia1_nombre || '',
      v.referencia1_telefono || '',
      v.referencia2_nombre || '',
      v.referencia2_telefono || '',
    ]);

    const texto = [encabezados, ...filas].map((fila) => fila.join('\t')).join('\n');

    let copiado = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
        copiado = true;
      }
    } catch (err) {
      copiado = false;
    }
    if (!copiado) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = texto;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copiado = true;
      } catch (err) {
        copiado = false;
      }
    }

    setAvisoCopiado(
      copiado
        ? `Se copiaron ${filas.length} vendedor${filas.length === 1 ? '' : 'es'}. Ya puedes pegarlo en Excel (Ctrl/Cmd + V).`
        : 'No se pudo copiar automáticamente. Intenta de nuevo.'
    );
    setTimeout(() => setAvisoCopiado(''), 6000);
  }

  const vendedoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return vendedores;
    return vendedores.filter((v) => v.nombre.toLowerCase().includes(q));
  }, [vendedores, busqueda]);

  const porVencerAgrupado = useMemo(() => {
    const grupos = {};
    porVencer.forEach((v) => {
      const d = new Date(`${soloFecha(v.fecha_vencimiento)}T00:00:00`);
      const clave = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(v);
    });
    return grupos;
  }, [porVencer]);

  return (
    <div className="vend-shell">
      <Head>
        <title>Vendedores — ENVIOS AYORA</title>
        <link rel="icon" href="/logo.jpg" />
      </Head>

      <video className="vend-video" autoPlay loop muted playsInline preload="auto">
        <source src={VIDEO_FONDO} type="video/mp4" />
      </video>

      <datalist id="vend-categorias-lista">
        {categorias.map((c) => (
          <option key={c.id} value={c.nombre} />
        ))}
      </datalist>

      <div className="vend-content">
        <header className="vend-header">
          <div className="vend-brand">
            <img src="/logo.jpg" alt="ENVIOS AYORA" />
          </div>
          <h1>Vendedores</h1>
          <p className="vend-subtitulo">Agrega, edita y genera los códigos QR de tus vendedores.</p>
          <div className="vend-header-acciones">
            <Link href="/asistencia" className="vend-btn vend-btn-asistencia">
              📋 Pase de lista (asistencia)
            </Link>
            <Link href="/imprimir-qr" className="vend-btn vend-btn-asistencia">
              🖨 Imprimir varios QR
            </Link>
            <Link href="/imprimir-credenciales" className="vend-btn vend-btn-asistencia">
              🖨 Imprimir varias credenciales
            </Link>
          </div>
        </header>

        <main className="vend-main">
          {porVencer.length > 0 && (
            <section className="vend-panel vend-panel-reporte">
              <button className="vend-reporte-toggle" onClick={() => setMostrarReporte((v) => !v)}>
                <span>
                  ⚠ {porVencer.length} registro{porVencer.length === 1 ? '' : 's'} por vencer o vencido{porVencer.length === 1 ? '' : 's'}
                </span>
                <span>{mostrarReporte ? '▲' : '▼'}</span>
              </button>
              {mostrarReporte && (
                <div className="vend-reporte-lista">
                  {Object.keys(porVencerAgrupado).map((mes) => (
                    <div key={mes} className="vend-reporte-mes">
                      <h3>{mes}</h3>
                      {porVencerAgrupado[mes].map((v) => {
                        const dias = diasParaVencer(v.fecha_vencimiento);
                        const vencido = dias !== null && dias < 0;
                        return (
                          <div key={v.id} className="vend-reporte-item">
                            <span>{nombreMostrar(v)}</span>
                            <span className={vencido ? 'vencido' : 'por-vencer-texto'}>
                              {vencido
                                ? `Venció el ${formatoFecha(v.fecha_vencimiento)}`
                                : `Vence el ${formatoFecha(v.fecha_vencimiento)} (${dias} día${dias === 1 ? '' : 's'})`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="vend-panel">
            <div className="vend-panel-titulo-fila">
              <h2>Agregar vendedor</h2>
              <button className="vend-btn-mini secundario" onClick={() => setMostrarAlta((v) => !v)}>
                {mostrarAlta ? 'Cerrar' : '+ Nuevo vendedor'}
              </button>
            </div>
            {mostrarAlta && (
              <FormularioVendedor
                onGuardar={crear}
                textoBoton="Agregar vendedor"
                onCancelar={() => setMostrarAlta(false)}
                categorias={categorias}
              />
            )}
          </section>

          {totales && (
            <section className="vend-panel vend-panel-totales">
              <h2>Total de comerciantes registrados</h2>
              <div className="vend-totales-fila">
                {ESTATUS_OPCIONES.map((op) => (
                  <div key={op.valor} className="vend-total-pill" style={{ borderColor: op.color, color: op.color }}>
                    <span className="vend-total-numero">{totales[op.valor] ?? 0}</span>
                    <span className="vend-total-label">{op.label}</span>
                  </div>
                ))}
                <div className="vend-total-pill vend-total-pill-general">
                  <span className="vend-total-numero">{totales.total ?? 0}</span>
                  <span className="vend-total-label">Total</span>
                </div>
              </div>
            </section>
          )}

          <section className="vend-panel">
            <div className="vend-panel-titulo-fila">
              <h2>Buscar / lista de vendedores</h2>
              <button className="vend-btn-mini secundario" onClick={copiarParaExcel}>
                📋 Copiar para Excel
              </button>
            </div>
            {avisoCopiado && <p className="vend-aviso-copiado">{avisoCopiado}</p>}

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
                {vendedoresFiltrados.map((v) => {
                  const dias = diasParaVencer(v.fecha_vencimiento);
                  const porVencerFlag = dias !== null && dias <= DIAS_AVISO_VENCIMIENTO;
                  const vencidoFlag = dias !== null && dias < 0;

                  return (
                    <div key={v.id} className={`vend-tarjeta ${v.activo ? '' : 'inactivo'}`}>
                      <div className="vend-tarjeta-top">
                        <span className="vend-nombre">
                          {formatoNumeroRegistro(v.numero_registro) && (
                            <span className="vend-numero-registro">{formatoNumeroRegistro(v.numero_registro)}</span>
                          )}
                          {nombreMostrar(v)}
                        </span>
                        <div className="vend-badges">
                          <span
                            className="vend-badge"
                            style={{
                              background: `${colorEstatus(v.estatus)}26`,
                              color: colorEstatus(v.estatus),
                              border: `1px solid ${colorEstatus(v.estatus)}55`,
                            }}
                          >
                            {labelEstatus(v.estatus)}
                          </span>
                          {porVencerFlag && (
                            <span className={`vend-badge ${vencidoFlag ? 'vend-badge-vencido' : 'vend-badge-por-vencer'}`}>
                              {vencidoFlag ? 'Vencido' : 'Por vencer'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="vend-tarjeta-datos">
                        {v.telefono && <span>📞 {v.telefono}</span>}
                        {v.categoria_nombre && <span>Categoría: {v.categoria_nombre}</span>}
                        <span>Ingreso: {formatoFecha(v.fecha_ingreso)}</span>
                        <span>Vencimiento: {formatoFecha(v.fecha_vencimiento)}</span>
                      </div>

                      {editandoId === v.id ? (
                        <FormularioVendedor
                          inicial={v}
                          onGuardar={(datos) => guardarEdicion(v.id, datos)}
                          onCancelar={() => setEditandoId(null)}
                          textoBoton="Guardar cambios"
                          categorias={categorias}
                        />
                      ) : (
                        <div className="vend-tarjeta-acciones">
                          <Link className="vend-btn-mini" href={`/qr/${v.id}`}>
                            Ver / imprimir QR
                          </Link>
                          <Link className="vend-btn-mini" href={`/credencial/${v.id}`}>
                            Ver credencial
                          </Link>
                          <Link className="vend-btn-mini" href={`/ficha/${v.id}`}>
                            Ver ficha completa
                          </Link>
                          <button className="vend-btn-mini secundario" onClick={() => setEditandoId(v.id)}>
                            Editar
                          </button>
                          <button className="vend-btn-mini secundario" onClick={() => alternarActivo(v)}>
                            {v.activo ? 'Desactivar' : 'Reactivar'}
                          </button>
                          <button className="vend-btn-mini peligro" onClick={() => eliminar(v)}>
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
          inset: 0;
          width: 100%;
          height: 100%;
          min-width: 100%;
          min-height: 100%;
          object-fit: cover;
          z-index: -1;
          background: #05060a;
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
        .vend-header-acciones {
          margin-top: 10px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .vend-btn-asistencia {
          text-decoration: none;
          display: inline-block;
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
          max-width: 680px;
          background: linear-gradient(135deg, #1b2740 0%, #0a1120 100%);
          border: 1px solid rgba(199, 205, 216, 0.35);
          border-radius: 18px;
          padding: 22px 20px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        }
        .vend-panel-titulo-fila {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .vend-panel h2 {
          margin: 0 0 14px;
          font-size: 17px;
          font-weight: 700;
          color: #fff;
        }
        .vend-panel-titulo-fila h2 {
          margin: 0;
        }
        .vend-panel-reporte {
          border-color: rgba(245, 165, 36, 0.5);
        }
        .vend-panel-totales h2 {
          margin-bottom: 12px;
        }
        .vend-totales-fila {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .vend-total-pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 10px 16px;
          border-radius: 12px;
          border: 1.5px solid;
          min-width: 88px;
        }
        .vend-total-pill-general {
          border-color: rgba(199, 205, 216, 0.5);
          color: #dfe3ea;
        }
        .vend-total-numero {
          font-size: 22px;
          font-weight: 800;
        }
        .vend-total-label {
          font-size: 11px;
          font-weight: 600;
          color: #c7cdd8;
          text-align: center;
        }
        .vend-aviso-copiado {
          margin: 8px 0 4px;
          font-size: 13px;
          color: #7ee2a0;
          font-weight: 600;
        }
        .vend-reporte-toggle {
          width: 100%;
          background: none;
          border: none;
          color: #ffcf86;
          font-weight: 700;
          font-size: 14.5px;
          display: flex;
          justify-content: space-between;
          cursor: pointer;
          padding: 0;
        }
        .vend-reporte-lista {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .vend-reporte-mes h3 {
          margin: 0 0 6px;
          font-size: 13.5px;
          text-transform: capitalize;
          color: #dfe3ea;
          border-bottom: 1px solid rgba(199, 205, 216, 0.2);
          padding-bottom: 4px;
        }
        .vend-reporte-item {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 13px;
          padding: 4px 0;
          color: #c7cdd8;
          flex-wrap: wrap;
        }
        .vend-reporte-item .vencido {
          color: #ff8a8a;
          font-weight: 700;
        }
        .vend-reporte-item .por-vencer-texto {
          color: #ffcf86;
          font-weight: 600;
        }
        .vend-form-completo {
          margin-top: 12px;
        }
        .vend-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 14px;
        }
        .vend-form-completo label {
          font-size: 12.5px;
          color: #c7cdd8;
          font-weight: 600;
          margin-bottom: 4px;
          display: block;
        }
        .vend-panel input[type='text'],
        .vend-panel input[type='date'],
        .vend-panel input:not([type]),
        .vend-buscar {
          width: 100%;
          background: #0a1120;
          border: 1px solid rgba(199, 205, 216, 0.35);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14.5px;
          color: #fff;
          outline: none;
          margin-bottom: 4px;
        }
        .vend-panel input::placeholder {
          color: #9aa4b5;
        }
        .vend-buscar {
          margin-bottom: 14px;
        }
        .vend-ine {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .vend-ine-preview {
          width: 90px;
          height: 60px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid rgba(199, 205, 216, 0.4);
        }
        .vend-ine-botones {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .vend-ine-boton {
          cursor: pointer;
        }
        .vend-credencial-foto-preview {
          width: 60px;
          height: 80px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid rgba(199, 205, 216, 0.4);
        }
        .vend-estatus-opciones {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .vend-estatus-pill {
          border-radius: 999px;
          padding: 7px 14px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          border-width: 1.5px;
          border-style: solid;
        }
        .vend-form-acciones {
          margin-top: 16px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
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
          margin-bottom: 8px;
        }
        .vend-nombre {
          font-size: 16px;
          font-weight: 700;
          color: #fff;
        }
        .vend-numero-registro {
          display: inline-block;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.03em;
          color: #9aa4b5;
          background: rgba(199, 205, 216, 0.12);
          border: 1px solid rgba(199, 205, 216, 0.3);
          border-radius: 6px;
          padding: 2px 7px;
          margin-right: 8px;
          vertical-align: middle;
        }
        .vend-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .vend-badge {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 4px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .vend-badge-por-vencer {
          background: rgba(245, 165, 36, 0.18);
          color: #ffcf86;
          border: 1px solid rgba(245, 165, 36, 0.4);
        }
        .vend-badge-vencido {
          background: rgba(217, 60, 60, 0.18);
          color: #ff8a8a;
          border: 1px solid rgba(217, 60, 60, 0.4);
        }
        .vend-tarjeta-datos {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 12.5px;
          color: #9aa4b5;
          margin-bottom: 12px;
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
        .vend-footer {
          text-align: center;
          padding: 16px;
          font-size: 12.5px;
          color: #9aa4b5;
        }

        @media (max-width: 480px) {
          .vend-grid-2 {
            grid-template-columns: 1fr;
          }
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

/* Mi CRM — aplicación de una sola página, sin dependencias.
 * Los datos se guardan en el navegador (localStorage). Usa Ajustes → Exportar
 * para hacer copias de seguridad o pasar los datos a otro equipo. */
(() => {
  'use strict';

  // ===== Configuración =====
  const KEY = 'mi-crm:datos:v1';
  const THEME_KEY = 'mi-crm:tema';

  const ETAPAS = [
    { id: 'nuevo', nombre: 'Nuevo', prob: 10 },
    { id: 'contactado', nombre: 'Contactado', prob: 25 },
    { id: 'propuesta', nombre: 'Propuesta', prob: 50 },
    { id: 'negociacion', nombre: 'Negociación', prob: 75 },
    { id: 'ganado', nombre: 'Ganado', prob: 100 },
    { id: 'perdido', nombre: 'Perdido', prob: 0 },
  ];
  const ETAPAS_ABIERTAS = ETAPAS.filter(e => e.id !== 'ganado' && e.id !== 'perdido');
  const ESTADOS = ['Lead', 'Prospecto', 'Cliente', 'Inactivo'];
  const ORIGENES = ['Web', 'Referido', 'Redes sociales', 'Evento', 'Llamada en frío', 'Email', 'Otro'];
  const PRIORIDADES = ['Alta', 'Media', 'Baja'];
  const TIPOS_NOTA = ['Nota', 'Llamada', 'Email', 'Reunión'];
  const MONEDAS = [
    ['EUR', 'Euro (€)'], ['USD', 'Dólar estadounidense ($)'], ['MXN', 'Peso mexicano'],
    ['COP', 'Peso colombiano'], ['ARS', 'Peso argentino'], ['CLP', 'Peso chileno'],
    ['PEN', 'Sol peruano'], ['UYU', 'Peso uruguayo'], ['GTQ', 'Quetzal'], ['BOB', 'Boliviano'],
  ];

  // ===== Utilidades =====
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '');

  const isoLocal = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const hoy = () => isoLocal(new Date());
  const sumarDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };
  const haceHoras = h => new Date(Date.now() - h * 3600e3).toISOString();
  const aFecha = iso => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);

  const fmtFecha = iso => iso ? aFecha(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtFechaCorta = iso => iso ? aFecha(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '';
  const fmtFechaHora = iso => iso ? aFecha(iso).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  function fmtDinero(n) {
    try {
      return new Intl.NumberFormat('es', { style: 'currency', currency: state.ajustes.moneda, maximumFractionDigits: 0 }).format(n || 0);
    } catch {
      return Math.round(n || 0).toLocaleString('es') + ' ' + state.ajustes.moneda;
    }
  }
  function relativo(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'ahora mismo';
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    if (s < 86400 * 7) { const d = Math.floor(s / 86400); return d === 1 ? 'ayer' : `hace ${d} días`; }
    return fmtFecha(iso);
  }
  function vencimiento(fecha) {
    if (!fecha) return null;
    const h = hoy();
    if (fecha < h) return 'vencida';
    if (fecha === h) return 'hoy';
    return 'futura';
  }
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const tono = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const avatar = (nombre, cls = '') => `<span class="avatar ${cls}" style="--h:${tono(nombre)}" aria-hidden="true">${esc(iniciales(nombre))}</span>`;
  const etapa = id => ETAPAS.find(e => e.id === id) || ETAPAS[0];
  const abierta = o => o.etapa !== 'ganado' && o.etapa !== 'perdido';

  // ===== Estado y persistencia =====
  const vacio = () => ({ ajustes: { nombre: 'Mi CRM', moneda: 'EUR', demo: false }, contactos: [], oportunidades: [], tareas: [], actividad: [] });

  function normalizar(d) {
    const b = vacio();
    const arr = v => Array.isArray(v) ? v : [];
    return {
      ajustes: { ...b.ajustes, ...(d && typeof d.ajustes === 'object' ? d.ajustes : {}) },
      contactos: arr(d?.contactos).map(c => ({ etiquetas: [], notas: [], ...c })),
      oportunidades: arr(d?.oportunidades),
      tareas: arr(d?.tareas),
      actividad: arr(d?.actividad),
    };
  }
  function cargar() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalizar(JSON.parse(raw));
    } catch { /* almacenamiento no disponible */ }
    return datosDemo();
  }
  let avisoGuardado = false;
  function guardar() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch {
      if (!avisoGuardado) { toast('Este navegador no permite guardar datos. Exporta una copia antes de cerrar.', 'error'); avisoGuardado = true; }
    }
  }
  function registrar(texto, tipo = 'info') {
    state.actividad.unshift({ id: uid(), texto, tipo, fecha: new Date().toISOString() });
    if (state.actividad.length > 300) state.actividad.length = 300;
  }

  const buscarContacto = id => state.contactos.find(c => c.id === id);
  const nombreContacto = id => buscarContacto(id)?.nombre || '';

  let state = cargar();
  const ui = { q: '', estado: 'Todos', orden: 'nombre', dir: 1, filtroTareas: 'pendientes' };

  // ===== Datos de ejemplo =====
  function datosDemo() {
    const d = vacio();
    d.ajustes.demo = true;
    const c = (nombre, empresa, estado, origen, etiquetas, extra = {}) => {
      const id = uid();
      d.contactos.push({
        id, nombre, empresa, estado, origen, etiquetas,
        email: slug(nombre.split(' ')[0]) + '@' + (slug(empresa) || 'correo') + '.com',
        telefono: '+34 6' + String(Math.floor(10000000 + Math.random() * 89999999)),
        info: '', notas: [], creado: haceHoras(24 * (5 + Math.random() * 60)), ...extra,
      });
      return id;
    };
    const lucia = c('Lucía Fernández', 'Estudio Nébula', 'Cliente', 'Referido', ['diseño', 'recurrente'], { info: 'Prefiere que la contacten por la mañana.' });
    const javier = c('Javier Morales', 'Logística Sur', 'Prospecto', 'Evento', ['transporte']);
    const ana = c('Ana Beltrán', 'Clínica Sonrisa', 'Lead', 'Web', ['salud']);
    const diego = c('Diego Ramírez', 'Ferretería Ramírez', 'Cliente', 'Llamada en frío', ['retail']);
    const sofia = c('Sofía Castillo', 'Café Aroma', 'Prospecto', 'Redes sociales', ['hostelería']);
    const marta = c('Marta Ríos', 'Inmobiliaria Horizonte', 'Lead', 'Web', ['inmobiliaria']);
    const pablo = c('Pablo Ortega', 'Gimnasio Vital', 'Inactivo', 'Referido', []);
    const elena = c('Elena Vargas', 'Academia Prisma', 'Cliente', 'Email', ['educación', 'recurrente']);

    const addNota = (cid, tipo, texto, horas) => d.contactos.find(x => x.id === cid).notas.push({ id: uid(), tipo, texto, fecha: haceHoras(horas) });
    addNota(lucia, 'Reunión', 'Revisamos la propuesta de rediseño web. Quiere añadir tienda online en una segunda fase.', 30);
    addNota(lucia, 'Email', 'Envío del presupuesto actualizado.', 6);
    addNota(javier, 'Llamada', 'Interesado en el plan anual. Pide referencias de otros clientes del sector.', 50);
    addNota(ana, 'Nota', 'Llegó por el formulario web. Necesita una web con reservas.', 20);
    addNota(sofia, 'Reunión', 'Café en su local. Quiere mejorar su presencia en redes.', 72);
    addNota(diego, 'Llamada', 'Muy satisfecho con el último trabajo.', 200);

    const o = (titulo, contactoId, valor, et, cierreDias, horas = 48) => d.oportunidades.push({
      id: uid(), titulo, contactoId, valor, etapa: et, probabilidad: etapa(et).prob, cierre: sumarDias(cierreDias), descripcion: '',
      creado: haceHoras(horas + 100), actualizado: haceHoras(horas),
      ...(et === 'ganado' || et === 'perdido' ? { cerradoEn: haceHoras(horas) } : {}),
    });
    o('Tienda online — fase 2', lucia, 4800, 'propuesta', 14, 6);
    o('Plan anual de marketing', javier, 9600, 'negociacion', 7, 20);
    o('Web con sistema de reservas', ana, 3200, 'contactado', 21, 20);
    o('Gestión de redes sociales', sofia, 1800, 'nuevo', 30, 72);
    o('Catálogo digital', diego, 2500, 'ganado', -3, 72);
    o('Landing para captación', marta, 1200, 'nuevo', 25, 10);
    o('Renovación mantenimiento', elena, 1500, 'ganado', -1, 30);
    o('Campaña de verano', pablo, 2200, 'perdido', -20, 400);
    o('Cursos online', elena, 6400, 'propuesta', 18, 40);

    const t = (titulo, contactoId, vence, prioridad, hecha = false) => d.tareas.push({
      id: uid(), titulo, contactoId, vence: sumarDias(vence), prioridad, hecha, descripcion: '', creado: haceHoras(60),
      ...(hecha ? { hechaEn: haceHoras(12) } : {}),
    });
    t('Llamar para cerrar condiciones del plan anual', javier, 0, 'Alta');
    t('Enviar ejemplos de webs con reservas', ana, 1, 'Media');
    t('Seguimiento propuesta tienda online', lucia, 3, 'Media');
    t('Preparar presupuesto de redes', sofia, -1, 'Alta');
    t('Pedir testimonio', diego, 6, 'Baja');
    t('Enviar factura catálogo', diego, -2, 'Media', true);

    d.actividad = [
      { id: uid(), tipo: 'info', texto: 'Nota añadida a Lucía Fernández', fecha: haceHoras(6) },
      { id: uid(), tipo: 'info', texto: 'Oportunidad «Landing para captación» creada', fecha: haceHoras(10) },
      { id: uid(), tipo: 'tarea', texto: 'Tarea completada: Enviar factura catálogo', fecha: haceHoras(12) },
      { id: uid(), tipo: 'info', texto: '«Plan anual de marketing» pasó a Negociación', fecha: haceHoras(20) },
      { id: uid(), tipo: 'ganado', texto: '¡Oportunidad ganada! «Renovación mantenimiento»', fecha: haceHoras(30) },
      { id: uid(), tipo: 'ganado', texto: '¡Oportunidad ganada! «Catálogo digital»', fecha: haceHoras(72) },
    ];
    return d;
  }

  // ===== Router =====
  function ruta() {
    const h = location.hash.replace(/^#\/?/, '') || 'panel';
    if (h.startsWith('contacto-')) return { vista: 'contactos', id: decodeURIComponent(h.slice(9)) };
    const [vista, id] = h.split('/');
    return { vista, id: id ? decodeURIComponent(id) : null };
  }
  function ir(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  function render() {
    const { vista, id } = ruta();
    $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === vista));
    const vistas = {
      panel: vPanel,
      contactos: () => id ? vContacto(id) : vContactos(),
      oportunidades: vOportunidades,
      tareas: vTareas,
      ajustes: vAjustes,
    };
    const fn = vistas[vista] || vPanel;
    $('#view').innerHTML = fn();
    $('#brandName').textContent = state.ajustes.nombre;
    document.title = state.ajustes.nombre;
    if (vista === 'oportunidades') activarKanban();
  }

  // ===== Vistas =====
  function vPanel() {
    const ops = state.oportunidades;
    const abiertas = ops.filter(abierta);
    const valorAbierto = abiertas.reduce((s, o) => s + (+o.valor || 0), 0);
    const ponderado = abiertas.reduce((s, o) => s + (+o.valor || 0) * (+o.probabilidad || 0) / 100, 0);
    const mes = hoy().slice(0, 7);
    const ganadasMes = ops.filter(o => o.etapa === 'ganado' && (o.cerradoEn || o.actualizado || '').slice(0, 7) === mes);
    const ganadas = ops.filter(o => o.etapa === 'ganado').length;
    const perdidas = ops.filter(o => o.etapa === 'perdido').length;
    const conversion = ganadas + perdidas ? Math.round(ganadas / (ganadas + perdidas) * 100) : null;
    const pendientes = state.tareas.filter(t => !t.hecha);
    const vencidas = pendientes.filter(t => vencimiento(t.vence) === 'vencida');
    const clientes = state.contactos.filter(c => c.estado === 'Cliente').length;

    const porEtapa = ETAPAS_ABIERTAS.map(e => {
      const items = abiertas.filter(o => o.etapa === e.id);
      return { ...e, n: items.length, total: items.reduce((s, o) => s + (+o.valor || 0), 0) };
    });
    const max = Math.max(1, ...porEtapa.map(e => e.total));

    const proximas = [...pendientes].sort((a, b) => (a.vence || '9999').localeCompare(b.vence || '9999')).slice(0, 6);
    const saludo = (() => { const h = new Date().getHours(); return h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; })();

    return `
      ${state.ajustes.demo ? `
        <div class="notice">
          <span>Estás viendo <strong>datos de ejemplo</strong> para que pruebes el CRM. Cuando quieras, empieza con el tuyo en blanco.</span>
          <div class="actions">
            <button class="btn sm" data-action="mantener-demo">Seguir con el ejemplo</button>
            <button class="btn sm primary" data-action="empezar-limpio">Empezar desde cero</button>
          </div>
        </div>` : ''}
      <div class="page-head">
        <div>
          <h1>${saludo}</h1>
          <p class="muted">${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} · Este es el resumen de tu negocio.</p>
        </div>
        <div class="actions">
          <button class="btn" data-action="nuevo-contacto">+ Contacto</button>
          <button class="btn" data-action="nueva-tarea">+ Tarea</button>
          <button class="btn primary" data-action="nueva-oportunidad">+ Oportunidad</button>
        </div>
      </div>

      <div class="kpis">
        <div class="card kpi"><div class="label">Contactos</div><div class="value num">${state.contactos.length}</div><div class="sub">${clientes} ${clientes === 1 ? 'cliente' : 'clientes'}</div></div>
        <div class="card kpi"><div class="label">Pipeline abierto</div><div class="value num">${fmtDinero(valorAbierto)}</div><div class="sub">${abiertas.length} oportunidades · previsión ${fmtDinero(ponderado)}</div></div>
        <div class="card kpi"><div class="label">Ganado este mes</div><div class="value num">${fmtDinero(ganadasMes.reduce((s, o) => s + (+o.valor || 0), 0))}</div><div class="sub">${ganadasMes.length} cerradas${conversion !== null ? ` · ${conversion}% de éxito` : ''}</div></div>
        <div class="card kpi"><div class="label">Tareas pendientes</div><div class="value num">${pendientes.length}</div><div class="sub">${vencidas.length ? `<span class="warn">${vencidas.length} vencida${vencidas.length > 1 ? 's' : ''}</span>` : 'Todo al día'}</div></div>
      </div>

      <div class="grid-2">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>Pipeline por etapa</h2><a class="btn sm ghost" href="#oportunidades">Ver tablero →</a></div>
            <div class="card-body">
              ${abiertas.length ? `<div class="bars">${porEtapa.map(e => `
                <div class="bar-row">
                  <span class="name">${esc(e.nombre)}</span>
                  <div class="bar-track" title="${esc(fmtDinero(e.total))}"><div class="bar-fill" style="width:${e.total ? Math.max(2, e.total / max * 100) : 0}%"></div></div>
                  <span class="val">${fmtDinero(e.total)}<small>${e.n}</small></span>
                </div>`).join('')}</div>`
                : `<div class="empty-state"><h3>Sin oportunidades abiertas</h3><p>Crea una para empezar a seguir tus ventas.</p><button class="btn primary" data-action="nueva-oportunidad">+ Nueva oportunidad</button></div>`}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2>Próximas tareas</h2><a class="btn sm ghost" href="#tareas">Ver todas →</a></div>
            ${proximas.length ? proximas.map(filaTarea).join('') : `<div class="empty-state"><h3>Nada pendiente</h3><p>¡Buen trabajo! No tienes tareas abiertas.</p></div>`}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Actividad reciente</h2></div>
          <div class="card-body">
            ${state.actividad.length ? `<ul class="feed">${state.actividad.slice(0, 12).map(a => `
              <li><span class="dot ${esc(a.tipo)}"></span><div><div>${esc(a.texto)}</div><div class="muted small">${relativo(a.fecha)}</div></div></li>`).join('')}</ul>`
              : '<p class="muted">Aquí verás lo que vayas haciendo.</p>'}
          </div>
        </div>
      </div>`;
  }

  function contactosFiltrados() {
    const q = norm(ui.q);
    let lista = state.contactos.filter(c =>
      (ui.estado === 'Todos' || c.estado === ui.estado) &&
      (!q || norm([c.nombre, c.empresa, c.email, c.telefono, (c.etiquetas || []).join(' ')].join(' ')).includes(q)));
    const valor = c => state.oportunidades.filter(o => o.contactoId === c.id && abierta(o)).reduce((s, o) => s + (+o.valor || 0), 0);
    const ultimo = c => [c.creado, ...(c.notas || []).map(n => n.fecha)].filter(Boolean).sort().pop() || '';
    const claves = { nombre: c => norm(c.nombre), empresa: c => norm(c.empresa), estado: c => ESTADOS.indexOf(c.estado), valor, ultimo };
    const k = claves[ui.orden] || claves.nombre;
    lista.sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * ui.dir; });
    return { lista, valor, ultimo };
  }

  function tablaContactos() {
    const { lista, valor, ultimo } = contactosFiltrados();
    if (!state.contactos.length) {
      return `<div class="empty-state"><h3>Aún no tienes contactos</h3><p>Añade a tus clientes, leads y prospectos para empezar.</p><button class="btn primary" data-action="nuevo-contacto">+ Nuevo contacto</button></div>`;
    }
    if (!lista.length) return `<div class="empty-state"><h3>Sin resultados</h3><p>Prueba con otra búsqueda o filtro.</p></div>`;
    const th = (k, t, cls = '') => `<th class="sortable ${cls}" data-action="ordenar" data-k="${k}">${t}${ui.orden === k ? (ui.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
    return `<div class="table-wrap"><table>
      <thead><tr>${th('nombre', 'Nombre')}${th('empresa', 'Empresa', 'hide-sm')}${th('estado', 'Estado')}<th class="hide-sm">Teléfono</th>${th('valor', 'Pipeline', 'hide-sm')}${th('ultimo', 'Última actividad', 'hide-sm')}</tr></thead>
      <tbody>${lista.map(c => `
        <tr data-href="#contacto-${encodeURIComponent(c.id)}">
          <td><div class="person">${avatar(c.nombre)}<div style="min-width:0"><div class="name">${esc(c.nombre)}</div><div class="sub">${esc(c.email || c.empresa || '')}</div></div></div></td>
          <td class="hide-sm">${esc(c.empresa || '—')}</td>
          <td><span class="badge ${slug(c.estado)}">${esc(c.estado)}</span></td>
          <td class="hide-sm num">${esc(c.telefono || '—')}</td>
          <td class="hide-sm num">${valor(c) ? fmtDinero(valor(c)) : '<span class="muted">—</span>'}</td>
          <td class="hide-sm muted">${ultimo(c) ? relativo(ultimo(c)) : '—'}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function vContactos() {
    const cuenta = e => e === 'Todos' ? state.contactos.length : state.contactos.filter(c => c.estado === e).length;
    return `
      <div class="page-head">
        <div><h1>Contactos</h1><p class="muted">${state.contactos.length} en total</p></div>
        <div class="actions">
          <button class="btn" data-action="exportar-csv">Exportar CSV</button>
          <button class="btn primary" data-action="nuevo-contacto">+ Nuevo contacto</button>
        </div>
      </div>
      <div class="toolbar">
        <input type="search" id="buscarContactos" placeholder="Filtrar por nombre, empresa, email o etiqueta…" value="${esc(ui.q)}">
        <div class="chips">${['Todos', ...ESTADOS].map(e => `<button class="chip ${ui.estado === e ? 'active' : ''}" data-action="filtro-estado" data-v="${e}">${e}<span class="count">${cuenta(e)}</span></button>`).join('')}</div>
      </div>
      <div class="card" id="tablaContactos">${tablaContactos()}</div>`;
  }

  function vContacto(id) {
    const c = buscarContacto(id);
    if (!c) return `<a class="back" href="#contactos">← Contactos</a><div class="card empty-state"><h3>Contacto no encontrado</h3><p>Puede que se haya eliminado.</p></div>`;
    const ops = state.oportunidades.filter(o => o.contactoId === id);
    const tareas = state.tareas.filter(t => t.contactoId === id).sort((a, b) => (a.hecha - b.hecha) || (a.vence || '').localeCompare(b.vence || ''));
    const notas = [...(c.notas || [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
    return `
      <a class="back" href="#contactos">← Contactos</a>
      <div class="card card-pad" style="margin-bottom:18px">
        <div class="profile">
          ${avatar(c.nombre, 'lg')}
          <div class="info">
            <h1>${esc(c.nombre)}</h1>
            <p>${esc(c.empresa || 'Sin empresa')} · <span class="badge ${slug(c.estado)}">${esc(c.estado)}</span></p>
            ${(c.etiquetas || []).length ? `<div class="tags">${c.etiquetas.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="actions">
            ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">Email</a>` : ''}
            ${c.telefono ? `<a class="btn" href="tel:${esc(c.telefono.replace(/\s+/g, ''))}">Llamar</a>` : ''}
            <button class="btn" data-action="editar-contacto" data-id="${esc(c.id)}">Editar</button>
          </div>
        </div>
        <dl class="facts">
          <div><dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd></div>
          <div><dt>Teléfono</dt><dd>${esc(c.telefono || '—')}</dd></div>
          <div><dt>Origen</dt><dd>${esc(c.origen || '—')}</dd></div>
          <div><dt>Alta en el CRM</dt><dd>${fmtFecha(c.creado)}</dd></div>
          ${c.info ? `<div class="full"><dt>Información</dt><dd>${esc(c.info)}</dd></div>` : ''}
        </dl>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>Historial</h2><span class="muted small">${notas.length}</span></div>
          <div class="card-body">
            <form class="inline-form" data-form="nota" data-id="${esc(c.id)}">
              <textarea name="texto" placeholder="Escribe una nota, resumen de llamada o reunión…" required></textarea>
              <div class="row">
                <select name="tipo" aria-label="Tipo">${TIPOS_NOTA.map(t => `<option>${t}</option>`).join('')}</select>
                <span class="spacer"></span>
                <button class="btn primary sm" type="submit">Añadir al historial</button>
              </div>
            </form>
            ${notas.length ? `<ul class="timeline">${notas.map(n => `
              <li>
                <span class="ico ${slug(n.tipo)}"></span>
                <div class="head"><strong>${esc(n.tipo)}</strong><span>${fmtFechaHora(n.fecha)}</span>
                  <button class="del" title="Eliminar nota" aria-label="Eliminar nota" data-action="borrar-nota" data-id="${esc(c.id)}" data-nota="${esc(n.id)}">✕</button></div>
                <div class="text">${esc(n.texto)}</div>
              </li>`).join('')}</ul>` : '<p class="muted">Todavía no hay interacciones registradas.</p>'}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>Oportunidades</h2><button class="btn sm" data-action="nueva-oportunidad" data-contacto="${esc(c.id)}">+ Añadir</button></div>
            <div class="card-body">${ops.length ? `<ul class="list">${ops.map(o => `
              <li data-action="editar-oportunidad" data-id="${esc(o.id)}" style="cursor:pointer">
                <div class="grow"><div class="title">${esc(o.titulo)}</div><div class="meta">${o.cierre ? 'Cierre ' + fmtFecha(o.cierre) : 'Sin fecha'}</div></div>
                <span class="num">${fmtDinero(o.valor)}</span>
                <span class="badge ${o.etapa}">${esc(etapa(o.etapa).nombre)}</span>
              </li>`).join('')}</ul>` : '<p class="muted">Sin oportunidades.</p>'}</div>
          </div>
          <div class="card">
            <div class="card-head"><h2>Tareas</h2><button class="btn sm" data-action="nueva-tarea" data-contacto="${esc(c.id)}">+ Añadir</button></div>
            ${tareas.length ? tareas.map(t => filaTarea(t, false)).join('') : '<div class="card-body"><p class="muted">Sin tareas.</p></div>'}
          </div>
        </div>
      </div>`;
  }

  function vOportunidades() {
    const ops = state.oportunidades;
    const abiertas = ops.filter(abierta);
    const total = abiertas.reduce((s, o) => s + (+o.valor || 0), 0);
    const pond = abiertas.reduce((s, o) => s + (+o.valor || 0) * (+o.probabilidad || 0) / 100, 0);
    const ganado = ops.filter(o => o.etapa === 'ganado').reduce((s, o) => s + (+o.valor || 0), 0);
    const h = hoy();
    return `
      <div class="page-head">
        <div><h1>Oportunidades</h1><p class="muted">Arrastra las tarjetas entre columnas para cambiar de etapa.</p></div>
        <div class="actions"><button class="btn primary" data-action="nueva-oportunidad">+ Nueva oportunidad</button></div>
      </div>
      <div class="pipeline-summary">
        <div>En curso<strong class="num">${fmtDinero(total)}</strong></div>
        <div>Previsión ponderada<strong class="num">${fmtDinero(pond)}</strong></div>
        <div>Total ganado<strong class="num">${fmtDinero(ganado)}</strong></div>
      </div>
      <div class="kanban">
        ${ETAPAS.map(e => {
          const items = ops.filter(o => o.etapa === e.id).sort((a, b) => (a.cierre || '9999').localeCompare(b.cierre || '9999'));
          return `<div class="col" data-etapa="${e.id}">
            <div class="col-head">
              <div class="t">${esc(e.nombre)} <span class="n">${items.length}</span></div>
              <div class="sum">${fmtDinero(items.reduce((s, o) => s + (+o.valor || 0), 0))}</div>
              <div class="stripe"></div>
            </div>
            <div class="col-cards">
              ${items.map(o => `
                <div class="deal" draggable="true" data-id="${esc(o.id)}" data-action="editar-oportunidad" tabindex="0">
                  <div class="t">${esc(o.titulo)}</div>
                  ${o.contactoId ? `<div class="c">${esc(nombreContacto(o.contactoId))}${buscarContacto(o.contactoId)?.empresa ? ' · ' + esc(buscarContacto(o.contactoId).empresa) : ''}</div>` : ''}
                  <div class="f"><span class="v">${fmtDinero(o.valor)}</span>
                  <span class="d ${abierta(o) && o.cierre && o.cierre < h ? 'late' : ''}">${o.cierre ? fmtFechaCorta(o.cierre) : ''}${abierta(o) ? ` · ${+o.probabilidad || 0}%` : ''}</span></div>
                </div>`).join('')}
              <button class="add-card" data-action="nueva-oportunidad" data-etapa="${e.id}">+ Añadir</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function filaTarea(t, mostrarContacto = true) {
    const v = t.hecha ? null : vencimiento(t.vence);
    const fechaBadge = v === 'vencida' ? `<span class="badge vencida">Vencida · ${fmtFechaCorta(t.vence)}</span>`
      : v === 'hoy' ? '<span class="badge hoy">Hoy</span>'
      : t.vence ? `<span>${fmtFecha(t.vence)}</span>` : '';
    return `<div class="task ${t.hecha ? 'done' : ''}">
      <input type="checkbox" class="check" data-action="toggle-tarea" data-id="${esc(t.id)}" ${t.hecha ? 'checked' : ''} aria-label="Marcar como hecha">
      <div class="grow">
        <div class="title" data-action="editar-tarea" data-id="${esc(t.id)}">${esc(t.titulo)}</div>
        <div class="meta">${fechaBadge}
          ${mostrarContacto && t.contactoId && buscarContacto(t.contactoId) ? `<a href="#contacto-${encodeURIComponent(t.contactoId)}">${esc(nombreContacto(t.contactoId))}</a>` : ''}
        </div>
      </div>
      ${!t.hecha && t.prioridad ? `<span class="badge ${slug(t.prioridad)}">${esc(t.prioridad)}</span>` : ''}
    </div>`;
  }

  function vTareas() {
    const h = hoy();
    const filtros = {
      pendientes: ['Pendientes', t => !t.hecha],
      hoy: ['Para hoy', t => !t.hecha && t.vence && t.vence <= h],
      vencidas: ['Vencidas', t => !t.hecha && t.vence && t.vence < h],
      completadas: ['Completadas', t => t.hecha],
      todas: ['Todas', () => true],
    };
    const [, f] = filtros[ui.filtroTareas] || filtros.pendientes;
    const ordenPrio = p => PRIORIDADES.indexOf(p) < 0 ? 9 : PRIORIDADES.indexOf(p);
    const lista = state.tareas.filter(f).sort((a, b) =>
      ui.filtroTareas === 'completadas' ? (b.hechaEn || '').localeCompare(a.hechaEn || '')
        : (a.hecha - b.hecha) || (a.vence || '9999').localeCompare(b.vence || '9999') || ordenPrio(a.prioridad) - ordenPrio(b.prioridad));

    let cuerpo;
    if (!lista.length) {
      cuerpo = `<div class="empty-state"><h3>${ui.filtroTareas === 'completadas' ? 'Aún no has completado tareas' : 'No hay tareas aquí'}</h3><p>Organiza tus llamadas, envíos y seguimientos.</p><button class="btn primary" data-action="nueva-tarea">+ Nueva tarea</button></div>`;
    } else if (ui.filtroTareas === 'pendientes' || ui.filtroTareas === 'todas') {
      const grupos = [
        ['Vencidas', t => !t.hecha && t.vence && t.vence < h, 'danger'],
        ['Hoy', t => !t.hecha && t.vence === h, ''],
        ['Próximos 7 días', t => !t.hecha && t.vence > h && t.vence <= sumarDias(7), ''],
        ['Más adelante', t => !t.hecha && (!t.vence || t.vence > sumarDias(7)), ''],
        ['Completadas', t => t.hecha, ''],
      ];
      cuerpo = grupos.map(([nombre, g, cls]) => {
        const items = lista.filter(g);
        return items.length ? `<div class="group-title ${cls}">${nombre} · ${items.length}</div>${items.map(t => filaTarea(t)).join('')}` : '';
      }).join('');
    } else {
      cuerpo = lista.map(t => filaTarea(t)).join('');
    }

    return `
      <div class="page-head">
        <div><h1>Tareas</h1><p class="muted">${state.tareas.filter(t => !t.hecha).length} pendientes</p></div>
        <div class="actions"><button class="btn primary" data-action="nueva-tarea">+ Nueva tarea</button></div>
      </div>
      <div class="toolbar"><div class="chips">${Object.entries(filtros).map(([k, [n, fn]]) =>
        `<button class="chip ${ui.filtroTareas === k ? 'active' : ''}" data-action="filtro-tareas" data-v="${k}">${n}<span class="count">${state.tareas.filter(fn).length}</span></button>`).join('')}</div></div>
      <div class="card">${cuerpo}</div>`;
  }

  function vAjustes() {
    const a = state.ajustes;
    return `
      <div class="page-head"><div><h1>Ajustes</h1><p class="muted">Personaliza tu CRM y gestiona tus datos.</p></div></div>
      <div class="settings">
        <form class="card card-pad" data-form="ajustes">
          <h2>General</h2>
          <div class="grid-form" style="margin-top:14px">
            <label class="field"><span>Nombre del CRM o de tu negocio</span><input name="nombre" value="${esc(a.nombre)}" maxlength="40" required></label>
            <label class="field"><span>Moneda</span><select name="moneda">${MONEDAS.map(([v, n]) => `<option value="${v}" ${v === a.moneda ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          </div>
          <div class="row"><button class="btn primary" type="submit">Guardar cambios</button></div>
        </form>

        <div class="card card-pad">
          <h2>Copias de seguridad</h2>
          <p class="muted">Tus datos se guardan solo en este navegador y en este equipo. Exporta una copia de vez en cuando, o para pasarlos a otro dispositivo.</p>
          <div class="row">
            <button class="btn" data-action="exportar-json">Exportar copia (.json)</button>
            <button class="btn" data-action="importar">Importar copia</button>
            <button class="btn" data-action="exportar-csv">Exportar contactos (.csv)</button>
          </div>
          <p class="muted small" style="margin-top:10px">${state.contactos.length} contactos · ${state.oportunidades.length} oportunidades · ${state.tareas.length} tareas</p>
        </div>

        <div class="card card-pad danger-zone">
          <h2>Zona de peligro</h2>
          <p class="muted">Estas acciones reemplazan todos tus datos actuales.</p>
          <div class="row">
            <button class="btn" data-action="cargar-demo">Cargar datos de ejemplo</button>
            <button class="btn danger" data-action="borrar-todo">Borrar todos los datos</button>
          </div>
        </div>
      </div>`;
  }

  // ===== Modal de formularios =====
  function campoHTML(c, v) {
    const val = v ?? c.def ?? '';
    const id = 'f_' + c.name;
    const req = c.required ? 'required' : '';
    let input;
    if (c.type === 'select') {
      input = `<select id="${id}" name="${c.name}" ${req}>${c.options.map(o => {
        const [ov, ol] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`;
      }).join('')}</select>`;
    } else if (c.type === 'textarea') {
      input = `<textarea id="${id}" name="${c.name}" rows="3" placeholder="${esc(c.placeholder || '')}">${esc(val)}</textarea>`;
    } else {
      const type = c.type === 'tags' ? 'text' : (c.type || 'text');
      const extra = c.type === 'number' ? `min="${c.min ?? 0}" ${c.max != null ? `max="${c.max}"` : ''} step="any" inputmode="decimal"` : '';
      input = `<input id="${id}" type="${type}" name="${c.name}" value="${esc(Array.isArray(val) ? val.join(', ') : val)}" ${req} ${extra} placeholder="${esc(c.placeholder || '')}">`;
    }
    return `<label class="field ${c.full ? 'full' : ''}" for="${id}"><span>${esc(c.label)}${c.required ? ' *' : ''}</span>${input}${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ''}</label>`;
  }

  function abrirFormulario({ titulo, campos, valores = {}, onGuardar, onEliminar, alCambiar }) {
    const dlg = $('#modal');
    dlg.innerHTML = `<form novalidate>
      <header class="modal-head"><h2>${esc(titulo)}</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button></header>
      <div class="modal-body grid-form">${campos.map(c => campoHTML(c, valores[c.name])).join('')}</div>
      <footer class="modal-foot">
        ${onEliminar ? '<button type="button" class="btn danger" data-delete>Eliminar</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </footer></form>`;
    const form = $('form', dlg);
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const datos = {};
      for (const c of campos) {
        let v = fd.get(c.name);
        if (typeof v === 'string') v = v.trim();
        if (c.type === 'number') v = v === '' ? 0 : Number(v);
        if (c.type === 'tags') v = String(v || '').split(',').map(s => s.trim()).filter(Boolean);
        datos[c.name] = v;
      }
      onGuardar(datos);
      dlg.close();
      guardar();
      render();
    });
    if (alCambiar) form.addEventListener('change', e => alCambiar(form, e.target.name));
    $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
    if (onEliminar) {
      $('[data-delete]', dlg).addEventListener('click', async () => {
        if (!(await confirmar('Esta acción no se puede deshacer.', { titulo: '¿Eliminar definitivamente?', ok: 'Eliminar', peligro: true }))) return;
        onEliminar();
        dlg.close();
        guardar();
        render();
      });
    }
    dlg.showModal();
    const primero = $('input, select, textarea', form);
    if (primero) primero.focus();
  }
  // Cerrar el modal al pulsar fuera
  $('#modal').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  const opcionesContacto = () => [['', '— Sin contacto —'], ...[...state.contactos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(c => [c.id, c.nombre + (c.empresa ? ` (${c.empresa})` : '')])];

  function formContacto(c) {
    abrirFormulario({
      titulo: c ? 'Editar contacto' : 'Nuevo contacto',
      valores: c || {},
      campos: [
        { name: 'nombre', label: 'Nombre completo', required: true, placeholder: 'Ej. María López' },
        { name: 'empresa', label: 'Empresa', placeholder: 'Opcional' },
        { name: 'email', label: 'Email', type: 'email', placeholder: 'nombre@empresa.com' },
        { name: 'telefono', label: 'Teléfono', type: 'tel' },
        { name: 'estado', label: 'Estado', type: 'select', options: ESTADOS, def: 'Lead' },
        { name: 'origen', label: '¿Cómo llegó?', type: 'select', options: ['', ...ORIGENES], def: '' },
        { name: 'etiquetas', label: 'Etiquetas', type: 'tags', full: true, placeholder: 'Separadas por comas: vip, sector, ciudad…' },
        { name: 'info', label: 'Información adicional', type: 'textarea', full: true, placeholder: 'Dirección, preferencias, cumpleaños…' },
      ],
      onGuardar: d => {
        if (c) {
          if (c.estado !== d.estado) registrar(`${d.nombre} pasó a ${d.estado}`);
          Object.assign(c, d, { actualizado: new Date().toISOString() });
          toast('Contacto actualizado');
        } else {
          const nuevo = { id: uid(), ...d, notas: [], creado: new Date().toISOString() };
          state.contactos.push(nuevo);
          registrar(`Nuevo contacto: ${d.nombre}`);
          toast('Contacto creado');
          setTimeout(() => ir('#contacto-' + encodeURIComponent(nuevo.id)));
        }
      },
      onEliminar: c ? () => {
        state.contactos = state.contactos.filter(x => x.id !== c.id);
        state.oportunidades.forEach(o => { if (o.contactoId === c.id) o.contactoId = ''; });
        state.tareas.forEach(t => { if (t.contactoId === c.id) t.contactoId = ''; });
        registrar(`Contacto eliminado: ${c.nombre}`, 'borrado');
        toast('Contacto eliminado');
        location.hash = '#contactos';
      } : null,
    });
  }

  function formOportunidad(o, { contacto = '', etapaInicial = 'nuevo' } = {}) {
    abrirFormulario({
      titulo: o ? 'Editar oportunidad' : 'Nueva oportunidad',
      valores: o || { contactoId: contacto, etapa: etapaInicial, probabilidad: etapa(etapaInicial).prob, cierre: sumarDias(30) },
      campos: [
        { name: 'titulo', label: 'Título', required: true, full: true, placeholder: 'Ej. Rediseño de la web' },
        { name: 'contactoId', label: 'Contacto', type: 'select', options: opcionesContacto() },
        { name: 'valor', label: `Valor (${state.ajustes.moneda})`, type: 'number', placeholder: '0' },
        { name: 'etapa', label: 'Etapa', type: 'select', options: ETAPAS.map(e => [e.id, e.nombre]) },
        { name: 'probabilidad', label: 'Probabilidad (%)', type: 'number', max: 100 },
        { name: 'cierre', label: 'Fecha prevista de cierre', type: 'date' },
        { name: 'descripcion', label: 'Detalles', type: 'textarea', full: true },
      ],
      alCambiar: (form, name) => {
        if (name === 'etapa') form.elements.probabilidad.value = etapa(form.elements.etapa.value).prob;
      },
      onGuardar: d => {
        d.probabilidad = Math.min(100, Math.max(0, d.probabilidad));
        if (o) {
          const antes = o.etapa;
          Object.assign(o, d, { actualizado: new Date().toISOString() });
          if (antes !== d.etapa) cambioEtapa(o);
          toast('Oportunidad actualizada');
        } else {
          const nueva = { id: uid(), ...d, creado: new Date().toISOString(), actualizado: new Date().toISOString() };
          state.oportunidades.push(nueva);
          registrar(`Oportunidad «${d.titulo}» creada`);
          if (!abierta(nueva)) cambioEtapa(nueva);
          toast('Oportunidad creada');
        }
      },
      onEliminar: o ? () => {
        state.oportunidades = state.oportunidades.filter(x => x.id !== o.id);
        registrar(`Oportunidad «${o.titulo}» eliminada`, 'borrado');
        toast('Oportunidad eliminada');
      } : null,
    });
  }

  function cambioEtapa(o) {
    o.actualizado = new Date().toISOString();
    if (o.etapa === 'ganado') {
      o.cerradoEn = o.actualizado;
      registrar(`¡Oportunidad ganada! «${o.titulo}»`, 'ganado');
      const c = buscarContacto(o.contactoId);
      if (c && c.estado !== 'Cliente') { c.estado = 'Cliente'; registrar(`${c.nombre} ahora es Cliente`); }
      toast('¡Enhorabuena! Oportunidad ganada 🎉');
    } else if (o.etapa === 'perdido') {
      o.cerradoEn = o.actualizado;
      registrar(`Oportunidad perdida: «${o.titulo}»`, 'perdido');
    } else {
      delete o.cerradoEn;
      registrar(`«${o.titulo}» pasó a ${etapa(o.etapa).nombre}`);
    }
  }

  function formTarea(t, { contacto = '' } = {}) {
    abrirFormulario({
      titulo: t ? 'Editar tarea' : 'Nueva tarea',
      valores: t || { contactoId: contacto, vence: hoy(), prioridad: 'Media' },
      campos: [
        { name: 'titulo', label: '¿Qué hay que hacer?', required: true, full: true, placeholder: 'Ej. Llamar para confirmar la reunión' },
        { name: 'contactoId', label: 'Contacto', type: 'select', options: opcionesContacto() },
        { name: 'vence', label: 'Fecha límite', type: 'date' },
        { name: 'prioridad', label: 'Prioridad', type: 'select', options: PRIORIDADES },
        { name: 'descripcion', label: 'Detalles', type: 'textarea', full: true },
      ],
      onGuardar: d => {
        if (t) { Object.assign(t, d); toast('Tarea actualizada'); }
        else {
          state.tareas.push({ id: uid(), ...d, hecha: false, creado: new Date().toISOString() });
          registrar(`Nueva tarea: ${d.titulo}`, 'tarea');
          toast('Tarea creada');
        }
      },
      onEliminar: t ? () => { state.tareas = state.tareas.filter(x => x.id !== t.id); toast('Tarea eliminada'); } : null,
    });
  }

  // ===== Kanban (arrastrar y soltar) =====
  function activarKanban() {
    let arrastrando = null;
    $$('.deal').forEach(card => {
      card.addEventListener('dragstart', e => {
        arrastrando = card.dataset.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', arrastrando);
      });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); $$('.col.drop').forEach(c => c.classList.remove('drop')); });
    });
    $$('.col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drop'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain') || arrastrando;
        moverOportunidad(id, col.dataset.etapa);
      });
    });
  }
  function moverOportunidad(id, nuevaEtapa) {
    const o = state.oportunidades.find(x => x.id === id);
    if (!o || o.etapa === nuevaEtapa) return;
    o.etapa = nuevaEtapa;
    o.probabilidad = etapa(nuevaEtapa).prob;
    cambioEtapa(o);
    guardar();
    render();
  }

  // ===== Exportar / importar =====
  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function exportarCSV() {
    const cols = [['nombre', 'Nombre'], ['empresa', 'Empresa'], ['email', 'Email'], ['telefono', 'Teléfono'], ['estado', 'Estado'], ['origen', 'Origen'], ['etiquetas', 'Etiquetas'], ['info', 'Información'], ['creado', 'Creado']];
    const celda = v => { const s = Array.isArray(v) ? v.join(', ') : String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const filas = [cols.map(c => c[1]).join(';'), ...state.contactos.map(c => cols.map(([k]) => celda(k === 'creado' ? (c.creado || '').slice(0, 10) : c[k])).join(';'))];
    const tab = v => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).replace(/[\t\r\n]+/g, ' ');
    const tabla = [cols.map(c => c[1]).join('\t'), ...state.contactos.map(c => cols.map(([k]) => tab(k === 'creado' ? (c.creado || '').slice(0, 10) : c[k])).join('\t'))];
    mostrarExportacion({
      titulo: 'Exportar contactos',
      ayuda: `${state.contactos.length} contactos. Pulsa Copiar y pégalo en Excel o Google Sheets: cada dato irá a su columna.`,
      texto: tabla.join('\n'),
      archivo: `contactos-${hoy()}.csv`,
      contenidoArchivo: '\ufeff' + filas.join('\r\n'),
      tipo: 'text/csv;charset=utf-8',
    });
  }

  async function importarTexto(txt) {
    let datos;
    try {
      datos = JSON.parse(txt);
      if (!datos || !Array.isArray(datos.contactos)) throw new Error('formato');
    } catch {
      toast('Eso no es una copia válida de Mi CRM. Comprueba que el texto esté completo.', 'error');
      return;
    }
    const ok = await confirmar(
      `Se importarán ${datos.contactos.length} contactos, ${(datos.oportunidades || []).length} oportunidades y ${(datos.tareas || []).length} tareas.\n\nTus datos actuales se reemplazarán.`,
      { titulo: '¿Importar esta copia?', ok: 'Importar', peligro: true });
    if (!ok) return;
    state = normalizar(datos);
    state.ajustes.demo = false;
    registrar('Copia de seguridad importada');
    guardar();
    if ($('#modal').open) $('#modal').close();
    toast('Datos importados correctamente');
    ir('#panel');
  }
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importarTexto(await file.text());
  });

  function abrirImportacion() {
    const dlg = $('#modal');
    dlg.innerHTML = `<form>
      <header class="modal-head"><h2>Importar copia de seguridad</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button></header>
      <div class="modal-body">
        <p class="muted" style="margin:0 0 12px">Elige el archivo .json que exportaste o pega aquí su contenido. Reemplazará los datos actuales.</p>
        <button type="button" class="btn" data-file>Elegir archivo…</button>
        <label class="field" for="importText" style="margin-top:14px"><span>O pega la copia</span>
          <textarea id="importText" class="export-text" rows="8" placeholder='{"ajustes": … }'></textarea></label>
      </div>
      <footer class="modal-foot"><span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn primary">Importar</button></footer>
    </form>`;
    $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
    $('[data-file]', dlg).addEventListener('click', () => $('#importFile').click());
    $('form', dlg).addEventListener('submit', e => {
      e.preventDefault();
      const txt = $('#importText', dlg).value.trim();
      if (!txt) { toast('Pega el contenido de la copia o elige un archivo', 'error'); return; }
      importarTexto(txt);
    });
    dlg.showModal();
  }

  function mostrarExportacion({ titulo, ayuda, texto, archivo, contenidoArchivo = texto, tipo }) {
    const dlg = $('#modal');
    dlg.innerHTML = `<form>
      <header class="modal-head"><h2>${esc(titulo)}</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button></header>
      <div class="modal-body">
        <p class="muted" style="margin:0 0 12px">${esc(ayuda)}</p>
        <textarea id="exportText" class="export-text" rows="10" readonly aria-label="Contenido exportado">${esc(texto)}</textarea>
      </div>
      <footer class="modal-foot">
        <button type="button" class="btn" data-dl>Descargar archivo</button>
        <span class="spacer"></span>
        <button type="submit" class="btn primary">Copiar</button>
      </footer>
    </form>`;
    const ta = $('#exportText', dlg);
    const seleccionar = () => { ta.focus(); ta.select(); toast('Texto seleccionado: cópialo con Ctrl+C (o mantén pulsado en el móvil)'); };
    $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
    $('[data-dl]', dlg).addEventListener('click', () => descargar(archivo, contenidoArchivo, tipo));
    $('form', dlg).addEventListener('submit', e => {
      e.preventDefault();
      if (!navigator.clipboard?.writeText) { seleccionar(); return; }
      navigator.clipboard.writeText(texto).then(() => toast('Copiado al portapapeles'), seleccionar);
    });
    dlg.showModal();
  }

  // ===== Confirmaciones dentro de la página =====
  function confirmar(mensaje, { titulo = '¿Seguro?', ok = 'Aceptar', peligro = false, escribir = '' } = {}) {
    return new Promise(resolve => {
      const dlg = $('#confirmDlg');
      dlg.innerHTML = `<form>
        <header class="modal-head"><h2>${esc(titulo)}</h2></header>
        <div class="modal-body">
          <p style="margin:0;white-space:pre-line">${esc(mensaje)}</p>
          ${escribir ? `<label class="field" for="confirmInput" style="margin-top:14px"><span>Escribe ${esc(escribir)} para confirmar</span><input id="confirmInput" autocomplete="off"></label>` : ''}
        </div>
        <footer class="modal-foot"><span class="spacer"></span>
          <button type="button" class="btn ghost" data-no>Cancelar</button>
          <button type="submit" class="btn ${peligro ? 'danger-solid' : 'primary'}" data-ok ${escribir ? 'disabled' : ''}>${esc(ok)}</button>
        </footer>
      </form>`;
      let resultado = false;
      const input = $('#confirmInput', dlg);
      const botonOk = $('[data-ok]', dlg);
      if (input) input.addEventListener('input', () => { botonOk.disabled = input.value.trim().toUpperCase() !== escribir; });
      $('form', dlg).addEventListener('submit', e => { e.preventDefault(); if (botonOk.disabled) return; resultado = true; dlg.close(); });
      $('[data-no]', dlg).addEventListener('click', () => dlg.close());
      dlg.addEventListener('close', () => resolve(resultado), { once: true });
      dlg.showModal();
      (input || botonOk).focus();
    });
  }

  // ===== Acciones =====
  const acciones = {
    'nuevo-contacto': () => formContacto(null),
    'editar-contacto': d => formContacto(buscarContacto(d.id)),
    'nueva-oportunidad': d => formOportunidad(null, { contacto: d.contacto || '', etapaInicial: d.etapa || 'nuevo' }),
    'editar-oportunidad': d => { const o = state.oportunidades.find(x => x.id === d.id); if (o) formOportunidad(o); },
    'nueva-tarea': d => formTarea(null, { contacto: d.contacto || '' }),
    'editar-tarea': d => { const t = state.tareas.find(x => x.id === d.id); if (t) formTarea(t); },
    'toggle-tarea': (d, el) => {
      const t = state.tareas.find(x => x.id === d.id);
      if (!t) return;
      t.hecha = el.checked;
      if (t.hecha) { t.hechaEn = new Date().toISOString(); registrar(`Tarea completada: ${t.titulo}`, 'tarea'); }
      else delete t.hechaEn;
      guardar();
      setTimeout(render, t.hecha ? 250 : 0);
    },
    'borrar-nota': async d => {
      const c = buscarContacto(d.id);
      if (!c || !(await confirmar('Se quitará del historial de este contacto.', { titulo: '¿Eliminar esta nota?', ok: 'Eliminar', peligro: true }))) return;
      c.notas = c.notas.filter(n => n.id !== d.nota);
      guardar(); render();
    },
    'filtro-estado': d => { ui.estado = d.v; render(); },
    'filtro-tareas': d => { ui.filtroTareas = d.v; render(); },
    'ordenar': d => { if (ui.orden === d.k) ui.dir *= -1; else { ui.orden = d.k; ui.dir = 1; } $('#tablaContactos').innerHTML = tablaContactos(); },
    'exportar-json': () => mostrarExportacion({
      titulo: 'Copia de seguridad',
      ayuda: 'Guarda este texto en un lugar seguro (un email a ti mismo, una nota o un archivo). Para recuperarlo, usa Importar copia y pégalo.',
      texto: JSON.stringify(state),
      archivo: `mi-crm-copia-${hoy()}.json`,
      contenidoArchivo: JSON.stringify(state, null, 2),
      tipo: 'application/json',
    }),
    'exportar-csv': exportarCSV,
    'importar': abrirImportacion,
    'mantener-demo': () => { state.ajustes.demo = false; guardar(); render(); },
    'empezar-limpio': async () => {
      if (!(await confirmar('Se borrarán los datos de ejemplo y tu CRM quedará vacío, listo para tus contactos.', { titulo: '¿Empezar desde cero?', ok: 'Empezar desde cero' }))) return;
      const { nombre, moneda } = state.ajustes;
      state = vacio(); state.ajustes.nombre = nombre; state.ajustes.moneda = moneda;
      registrar('¡Bienvenido a tu CRM!');
      guardar(); toast('Listo. Empieza añadiendo tu primer contacto'); render();
    },
    'cargar-demo': async () => {
      if (!(await confirmar('Todos tus datos se reemplazarán por los de ejemplo.', { titulo: '¿Cargar datos de ejemplo?', ok: 'Cargar ejemplo', peligro: true }))) return;
      state = datosDemo(); guardar(); ir('#panel');
    },
    'borrar-todo': async () => {
      if (!(await confirmar('Se borrarán todos tus contactos, oportunidades y tareas. No se puede deshacer.', { titulo: '¿Borrar todos los datos?', ok: 'Borrar todo', peligro: true, escribir: 'BORRAR' }))) return;
      state = vacio(); guardar(); toast('Datos borrados'); ir('#panel');
    },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el && acciones[el.dataset.action]) {
      if (el.type === 'checkbox') { acciones[el.dataset.action](el.dataset, el); return; }
      e.preventDefault();
      acciones[el.dataset.action](el.dataset, el);
      return;
    }
    const fila = e.target.closest('tr[data-href]');
    if (fila && !e.target.closest('a')) ir(fila.dataset.href);
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.deal')) { e.preventDefault(); acciones['editar-oportunidad'](e.target.dataset); }
  });

  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    if (f.dataset.form === 'nota') {
      const c = buscarContacto(f.dataset.id);
      const texto = String(fd.get('texto') || '').trim();
      if (!c || !texto) return;
      c.notas.push({ id: uid(), tipo: fd.get('tipo'), texto, fecha: new Date().toISOString() });
      registrar(`${fd.get('tipo')} registrada con ${c.nombre}`);
      guardar(); render(); toast('Añadido al historial');
    } else if (f.dataset.form === 'ajustes') {
      state.ajustes.nombre = String(fd.get('nombre') || '').trim() || 'Mi CRM';
      state.ajustes.moneda = fd.get('moneda');
      guardar(); render(); toast('Ajustes guardados');
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'buscarContactos') { ui.q = e.target.value; $('#tablaContactos').innerHTML = tablaContactos(); }
  });

  // ===== Búsqueda global =====
  const buscador = $('#globalSearch');
  const resultados = $('#searchResults');
  function buscarGlobal() {
    const q = norm(buscador.value.trim());
    if (!q) { resultados.hidden = true; return; }
    const cs = state.contactos.filter(c => norm([c.nombre, c.empresa, c.email, c.telefono, (c.etiquetas || []).join(' ')].join(' ')).includes(q)).slice(0, 6)
      .map(c => ({ href: '#contacto-' + encodeURIComponent(c.id), html: `${avatar(c.nombre, 'sm')}<span>${esc(c.nombre)}${c.empresa ? ` <span class="muted">· ${esc(c.empresa)}</span>` : ''}</span><span class="kind">Contacto</span>` }));
    const os = state.oportunidades.filter(o => norm(o.titulo + ' ' + nombreContacto(o.contactoId)).includes(q)).slice(0, 4)
      .map(o => ({ href: '#oportunidades', id: o.id, html: `<span>${esc(o.titulo)} <span class="muted">· ${fmtDinero(o.valor)}</span></span><span class="kind">${esc(etapa(o.etapa).nombre)}</span>` }));
    const todos = [...cs, ...os];
    resultados.innerHTML = todos.length
      ? todos.map((r, i) => `<a href="${r.href}" ${r.id ? `data-op="${esc(r.id)}"` : ''} class="${i === 0 ? 'sel' : ''}">${r.html}</a>`).join('')
      : '<div class="empty muted">Sin resultados</div>';
    resultados.hidden = false;
  }
  function cerrarBusqueda() { resultados.hidden = true; buscador.value = ''; }
  buscador.addEventListener('input', buscarGlobal);
  buscador.addEventListener('focus', buscarGlobal);
  buscador.addEventListener('keydown', e => {
    const links = $$('a', resultados);
    const i = links.findIndex(a => a.classList.contains('sel'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!links.length) return;
      const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach((a, k) => a.classList.toggle('sel', k === n));
    } else if (e.key === 'Enter' && links[i]) {
      e.preventDefault(); links[i].click();
    } else if (e.key === 'Escape') { cerrarBusqueda(); buscador.blur(); }
  });
  resultados.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    const op = a.dataset.op;
    cerrarBusqueda();
    ir(a.getAttribute('href'));
    if (op) setTimeout(() => acciones['editar-oportunidad']({ id: op }), 0);
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) resultados.hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !$('#modal').open) { e.preventDefault(); buscador.focus(); }
  });

  // ===== Tema =====
  function aplicarTema(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  let tema = null;
  try { tema = localStorage.getItem(THEME_KEY); } catch { /* sin almacenamiento */ }
  aplicarTema(tema);
  $('#themeToggle').addEventListener('click', () => {
    const oscuroAhora = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    tema = oscuroAhora ? 'light' : 'dark';
    aplicarTema(tema);
    try { localStorage.setItem(THEME_KEY, tema); } catch { /* sin almacenamiento */ }
  });

  // ===== Toast =====
  let toastTimer;
  function toast(msg, tipo = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + tipo;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ===== Inicio =====
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  window.addEventListener('storage', e => { if (e.key === KEY) { state = cargar(); render(); } });
  guardar();
  render();
})();

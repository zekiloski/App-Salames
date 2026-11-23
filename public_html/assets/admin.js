/* Salame Monitor - panel de administrador
 * Alta de clientes, usuarios y cámaras; suspensión de cuentas; equipos que dejaron de mandar datos.
 */
{
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let D = null, sel = null, PRUEBA = false;

/* ---------- Modo prueba ----------
 * Imita a api/admin.php dentro del navegador, sin servidor ni base de datos.
 * Los datos (PruebaDB, en ui.js) quedan solo en este navegador y los comparte el panel del salamero.
 */
const {hoy, leer: leerPrueba, guardar: guardarPrueba, borrar: borrarPrueba} = PruebaDB;
const azar = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

function apiPrueba(body, silencioso) {
  const db = leerPrueba(), err = m => { if (!silencioso) alert(m); throw new Error(m); };
  const emp = id => db.empresas.find(e => e.id == id) || err('No existe');
  if (!body) {
    const camaras = db.camaras.map(c => ({...c, empresa: emp(c.empresa_id).nombre,
      sin_datos: !c.ultima_lectura || Date.now() - new Date(c.ultima_lectura.replace(' ', 'T')) > 30 * 60000}));
    const empresas = db.empresas.map(e => ({...e, camaras: db.camaras.filter(c => c.empresa_id == e.id && c.activa).length,
      usuarios: db.usuarios.filter(u => u.empresa_id == e.id && u.activo).length}));
    return {sin_datos_min: 30, empresas, camaras, usuarios: db.usuarios};
  }
  const b = body, id = +b.id, nid = () => ++db.n, num = k => (b[k] === '' || isNaN(+b[k])) ? err(`${k} tiene que ser un número`) : +b[k];
  let r = {ok: true};
  switch (b.accion) {
    case 'empresa_crear':
      if (!String(b.nombre || '').trim()) err('Falta nombre');
      r.id = nid(); db.empresas.push({id: r.id, nombre: b.nombre.trim(), contacto: b.contacto || null, estado: 'activa', creada: hoy()}); break;
    case 'empresa_estado': emp(id).estado = b.estado; break;
    case 'usuario_crear':
      emp(b.empresa_id);
      if (!/^\S+@\S+\.\S+$/.test(b.email || '')) err('Mail inválido');
      if (db.usuarios.some(u => u.email == b.email.toLowerCase())) err('Ya existe un usuario con ese mail');
      r.email = b.email.toLowerCase(); r.password = azar(4);
      // Solo en modo prueba se guarda la contraseña tal cual, para poder entrar al panel del salamero.
      // El servidor real guarda únicamente el hash.
      db.usuarios.push({id: nid(), empresa_id: +b.empresa_id, email: r.email, nombre: b.nombre || r.email, activo: true, ultimo_login: null, pass: r.password}); break;
    case 'usuario_clave': r.password = azar(4); db.usuarios.find(u => u.id == id).pass = r.password; break;
    case 'usuario_activo': db.usuarios.find(u => u.id == id).activo = !!b.activo; break;
    case 'camara_crear':
      emp(b.empresa_id);
      if (!String(b.nombre || '').trim()) err('Falta nombre');
      r.id = nid(); r.device_token = azar(24);
      db.camaras.push({id: r.id, empresa_id: +b.empresa_id, nombre: b.nombre.trim(), etapa: b.etapa || 'Secado',
        t_min: num('t_min'), t_max: num('t_max'), h_min: num('h_min'), h_max: num('h_max'), activa: true, ultima_lectura: null}); break;
    case 'camara_editar': {
      const c = db.camaras.find(x => x.id == id);
      for (const k of ['t_min', 't_max', 'h_min', 'h_max']) if (k in b) c[k] = num(k);
      if ('activa' in b) c.activa = !!b.activa; break;
    }
    case 'camara_token': r.device_token = azar(24); break;
    default: err('Acción desconocida');
  }
  guardarPrueba(db);
  return r;
}

// En modo prueba, link para probar el ingreso del salamero con los datos recién creados
const probar = () => PRUEBA ? ' <a class="probar" href="index.html" target="_blank">Probar el ingreso del salamero ›</a>' : '';

function entrarPrueba() {
  PRUEBA = true;
  $('#login').hidden = true; $('#admin').hidden = false; $('#user').hidden = false;
  $('#userName').textContent = 'Modo prueba';
  $('#prueba').hidden = false;
  cargar();
}

// silencioso: no muestra alert (el modal muestra el error adentro)
async function api(body, silencioso) {
  if (PRUEBA) return apiPrueba(body, silencioso);
  const r = await fetch('api/admin.php', body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {cache: 'no-store'});
  let d = {}; try { d = await r.json(); } catch (e) {}
  if (r.status == 401) { location.reload(); throw new Error('sesión'); }
  if (!r.ok) { if (!silencioso) alert(d.error || 'Error ' + r.status); throw new Error(d.error || 'Error ' + r.status); }
  return d;
}

// Contraseñas y tokens se muestran una sola vez: no quedan guardados en texto plano.
function secreto(html) { $('#secreto').innerHTML = html + ' <button class="btn sm" id="cerrarSecreto">Listo, lo anoté</button>'; $('#secreto').hidden = false; $('#secreto').scrollIntoView({behavior: 'smooth'}); }
document.addEventListener('click', e => { if (e.target.id == 'cerrarSecreto') $('#secreto').hidden = true; });

const hace = ts => {
  if (!ts) return 'nunca';
  const m = Math.round((Date.now() - new Date(ts.replace(' ', 'T'))) / 60000);
  return m < 60 ? `hace ${m} min` : m < 2880 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};

async function cargar() { D = await api(); render(); }

function render() {
  const emp = id => D.empresas.find(e => e.id == id);
  const caidas = D.camaras.filter(c => c.activa && c.sin_datos && (emp(c.empresa_id) || {}).estado == 'activa');
  $('#caidosBadge').hidden = !caidas.length; $('#caidosBadge').textContent = caidas.length;
  $('#caidos').innerHTML = caidas.length
    ? caidas.map(c => `<div class="alert">${ic('sinSenal', 'c-ember')}<time>${hace(c.ultima_lectura)}</time><span><b>${esc(c.empresa)}</b> · ${esc(c.nombre)}</span></div>`).join('')
    : `<p class="note">Todos los equipos mandaron datos en los últimos ${D.sin_datos_min} minutos.</p>`;

  $('#empresas').innerHTML = D.empresas.length ? D.empresas.map(e => `<tr class="click" data-id="${e.id}" tabindex="0">
    <td><b>${esc(e.nombre)}</b></td><td>${esc(e.contacto || '–')}</td>
    <td><span class="estado ${e.estado == 'activa' ? 'n-ok' : 'n-pr'}">${ic(e.estado == 'activa' ? 'ok' : 'pausa')}${e.estado}</span></td>
    <td class="n">${e.camaras}</td><td class="n">${e.usuarios}</td>
    <td class="n acc"><a class="btn sm" href="index.html?empresa_id=${e.id}">${ic('vivo')}Ver panel</a></td></tr>`).join('')
    : '<tr><td colspan="6">Todavía no hay clientes.</td></tr>';

  renderDetalle();
}

function renderDetalle() {
  const e = D.empresas.find(x => x.id == sel);
  if (!e) { $('#detalle').innerHTML = ''; return; }
  const cams = D.camaras.filter(c => c.empresa_id == e.id), users = D.usuarios.filter(u => u.empresa_id == e.id);
  $('#detalle').innerHTML = `
  <div class="panel" style="margin-top:16px">
    <div class="row"><h2>${esc(e.nombre)}</h2>
      <button class="btn ${e.estado == 'activa' ? 'warn' : 'pri'}" data-a="estado">${ic(e.estado == 'activa' ? 'pausa' : 'ok')}${e.estado == 'activa' ? 'Suspender cuenta' : 'Reactivar cuenta'}</button></div>
    ${e.estado == 'suspendida' ? '<p class="note">Cuenta suspendida: los usuarios no pueden entrar al panel. Los equipos siguen guardando lecturas.</p>' : ''}

    <div class="row sub-row"><h3>${ic('termometro')}Cámaras</h3><button class="btn" data-a="nuevaCamara">${ic('mas')}Agregar cámara</button></div>
    <div class="scroll"><table class="stack"><thead><tr><th>Cámara</th><th>Etapa</th><th class="n">Temp.</th><th class="n">Humedad</th><th>Último dato</th><th></th></tr></thead><tbody>
    ${cams.map(c => `<tr><td><b>${esc(c.nombre)}</b>${c.activa ? '' : ' <span class="tag f">inactiva</span>'}</td><td>${esc(c.etapa)}</td>
      <td class="n">${c.t_min}–${c.t_max} °C</td><td class="n">${c.h_min}–${c.h_max} %</td>
      <td class="${c.sin_datos && c.activa ? 'bad' : ''}">${hace(c.ultima_lectura)}</td>
      <td class="n acc"><button class="btn sm" data-a="rangos" data-id="${c.id}">${ic('termometro')}Rangos</button> <button class="btn sm" data-a="token" data-id="${c.id}">${ic('llave')}Nuevo token</button> <button class="btn sm" data-a="activa" data-id="${c.id}">${ic(c.activa ? 'pausa' : 'ok')}${c.activa ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('') || '<tr><td colspan="6">Sin cámaras.</td></tr>'}
    </tbody></table></div>

    <div class="row sub-row"><h3>${ic('usuarios')}Usuarios</h3><button class="btn" data-a="nuevoUsuario">${ic('mas')}Agregar usuario</button></div>
    <div class="scroll"><table class="stack"><thead><tr><th>Nombre</th><th>Mail</th><th>Último ingreso</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr><td><b>${esc(u.nombre)}</b>${u.activo ? '' : ' <span class="tag f">de baja</span>'}</td><td>${esc(u.email)}</td><td>${hace(u.ultimo_login)}</td>
      <td class="n acc"><button class="btn sm" data-a="clave" data-id="${u.id}">${ic('llave')}Nueva contraseña</button> <button class="btn sm" data-a="uactivo" data-id="${u.id}">${ic(u.activo ? 'pausa' : 'ok')}${u.activo ? 'Dar de baja' : 'Reactivar'}</button></td></tr>`).join('') || '<tr><td colspan="4">Sin usuarios.</td></tr>'}
    </tbody></table></div>
  </div>`;
}

/* ---------- Eventos ---------- */
const elegir = tr => { sel = +tr.dataset.id; renderDetalle(); $('#detalle').scrollIntoView({behavior: 'smooth'}); };
$('#empresas').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a')) elegir(tr); });
$('#empresas').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key == 'Enter') elegir(tr); });

/* ---------- Ventanas (modales) para dar de alta ---------- */
function abrirModal(id) {
  const m = $('#' + id), f = m.querySelector('form');
  f.reset(); m.querySelector('.err').textContent = '';
  const e = D && D.empresas.find(x => x.id == sel);
  m.querySelectorAll('.para-empresa').forEach(s => s.textContent = e ? e.nombre : '');
  if (id == 'mCamara') rangosEtapa();
  m.showModal();
  f.querySelector('input,select').focus();
}
document.querySelectorAll('dialog.modal').forEach(m => {
  m.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => m.close()));
  m.addEventListener('click', e => { if (e.target == m) m.close(); });  // tocar afuera cierra
});
document.querySelectorAll('[data-modal]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); abrirModal(b.dataset.modal); }));

// Envía el formulario del modal; si la API rechaza, muestra el error adentro del modal sin cerrarlo
async function enviar(form, fn) {
  const err = form.querySelector('.err'), btn = form.querySelector('[type=submit]');
  err.textContent = ''; btn.disabled = true;
  try { await fn(Object.fromEntries(new FormData(form))); form.closest('dialog').close(); }
  catch (e) { err.textContent = e.message || 'No se pudo guardar.'; }
  finally { btn.disabled = false; }
  await cargar();
}

// Rangos de referencia por etapa: se completan solos al elegir la etapa (se pueden cambiar)
const ETAPAS = {Estufado: [20, 24, 88, 95], Secado: [12, 15, 75, 85], Estacionamiento: [10, 14, 70, 80]};
function rangosEtapa() {
  const f = $('#fCamara'), r = ETAPAS[f.etapa.value];
  if (r) ['t_min', 't_max', 'h_min', 'h_max'].forEach((k, i) => f[k].value = r[i]);
}
$('#fCamara').etapa.addEventListener('change', rangosEtapa);

$('#fEmpresa').addEventListener('submit', e => { e.preventDefault(); enviar(e.target, async f => {
  const r = await api({accion: 'empresa_crear', nombre: f.nombre, contacto: f.contacto}, true);
  sel = r.id;
  if (f.email) {
    const u = await api({accion: 'usuario_crear', empresa_id: r.id, email: f.email, nombre: f.responsable}, true);
    secreto(`Cliente creado. Pasale al salamero estos datos para entrar: Mail <code>${esc(u.email)}</code> · Contraseña <code>${esc(u.password)}</code>${probar()}`);
  }
}); });

$('#fCamara').addEventListener('submit', e => { e.preventDefault(); enviar(e.target, async f => {
  const r = await api({accion: 'camara_crear', empresa_id: sel, ...f}, true);
  secreto(`Cámara creada. Token para el ESP32 (<code>DEVICE_TOKEN</code>): <code>${esc(r.device_token)}</code>`);
}); });

$('#fUsuario').addEventListener('submit', e => { e.preventDefault(); enviar(e.target, async f => {
  const r = await api({accion: 'usuario_crear', empresa_id: sel, ...f}, true);
  secreto(`Usuario creado. Mail: <code>${esc(r.email)}</code> · Contraseña: <code>${esc(r.password)}</code>${probar()}`);
}); });

$('#detalle').addEventListener('click', async e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const id = +b.dataset.id, a = b.dataset.a;
  if (a == 'nuevaCamara') return abrirModal('mCamara');
  if (a == 'nuevoUsuario') return abrirModal('mUsuario');
  if (a == 'estado') {
    const e2 = D.empresas.find(x => x.id == sel), nuevo = e2.estado == 'activa' ? 'suspendida' : 'activa';
    if (nuevo == 'suspendida' && !confirm(`¿Suspender a ${e2.nombre}? No van a poder entrar al panel hasta que la reactives.`)) return;
    await api({accion: 'empresa_estado', id: sel, estado: nuevo});
  } else if (a == 'token') {
    if (!confirm('El ESP32 de esta cámara va a dejar de mandar datos hasta que le cargues el token nuevo. ¿Seguir?')) return;
    const r = await api({accion: 'camara_token', id});
    secreto(`Token nuevo para el ESP32: <code>${esc(r.device_token)}</code>`);
  } else if (a == 'activa') {
    const c = D.camaras.find(x => x.id == id);
    await api({accion: 'camara_editar', id, activa: !c.activa});
  } else if (a == 'rangos') {
    const c = D.camaras.find(x => x.id == id);
    const v = prompt('Rangos: temp. mín, temp. máx, hum. mín, hum. máx', [c.t_min, c.t_max, c.h_min, c.h_max].join(', '));
    if (!v) return;
    const [t_min, t_max, h_min, h_max] = v.split(',').map(s => s.trim().replace(/\s/g, ''));
    await api({accion: 'camara_editar', id, t_min, t_max, h_min, h_max});
  } else if (a == 'clave') {
    const r = await api({accion: 'usuario_clave', id});
    secreto(`Contraseña nueva: <code>${esc(r.password)}</code>${probar()}`);
  } else if (a == 'uactivo') {
    const u = D.usuarios.find(x => x.id == id);
    await api({accion: 'usuario_activo', id, activo: !u.activo});
  }
  await cargar();
});

$('#verPrueba').addEventListener('click', entrarPrueba);
$('#borrarPrueba').addEventListener('click', () => {
  if (!confirm('¿Borrar todas las empresas, cámaras y usuarios de prueba?')) return;
  borrarPrueba();
  sel = null; cargar();
});

$('#salir').addEventListener('click', async () => {
  if (PRUEBA) { location.reload(); return; }
  await fetch('api/auth.php', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{"accion":"salir"}'});
  location.reload();
});

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const r = await fetch('api/auth.php', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: f.get('email'), password: f.get('password')})});
  const d = await r.json().catch(() => ({}));
  if (r.ok && d.rol == 'admin') location.reload();
  else if (r.ok) location.href = 'index.html';
  else $('#loginErr').textContent = d.error || 'No se pudo ingresar.';
});

/* ---------- Arranque ---------- */
(async () => {
  let r, u;
  try { r = await fetch('api/auth.php', {cache: 'no-store'}); u = await r.json(); }
  catch (e) { return entrarPrueba(); }  // sin servidor PHP (por ejemplo, abriendo el archivo en la PC): modo prueba
  if (!r.ok) { document.body.classList.add('login-on'); $('#login').hidden = false; return; }
  if (u.rol != 'admin') { location.href = 'index.html'; return; }
  $('#user').hidden = false; $('#userName').textContent = u.nombre;
  $('#admin').hidden = false;
  await cargar();
})();
}

/* Salame Monitor - panel de administrador
 * Alta de clientes, usuarios y cámaras; suspensión de cuentas; equipos que dejaron de mandar datos.
 */
{
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let D = null, sel = null;

async function api(body) {
  const r = await fetch('api/admin.php', body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {cache: 'no-store'});
  let d = {}; try { d = await r.json(); } catch (e) {}
  if (r.status == 401) { location.reload(); throw new Error('sesión'); }
  if (!r.ok) { alert(d.error || 'Error ' + r.status); throw new Error(d.error); }
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
  const caidas = D.camaras.filter(c => c.activa && c.sin_datos && emp(c.empresa_id)?.estado == 'activa');
  $('#caidos').innerHTML = caidas.length
    ? caidas.map(c => `<div class="alert"><span class="dot" style="background:var(--ember)"></span><time>${hace(c.ultima_lectura)}</time><span><b>${esc(c.empresa)}</b> · ${esc(c.nombre)}</span></div>`).join('')
    : `<p class="note">Todos los equipos mandaron datos en los últimos ${D.sin_datos_min} minutos.</p>`;

  $('#empresas').innerHTML = D.empresas.length ? D.empresas.map(e => `<tr class="click" data-id="${e.id}" tabindex="0">
    <td><b>${esc(e.nombre)}</b></td><td>${esc(e.contacto || '–')}</td>
    <td><span class="tag ${e.estado == 'activa' ? '' : 'f'}">${e.estado}</span></td>
    <td class="n">${e.camaras}</td><td class="n">${e.usuarios}</td>
    <td class="n"><a href="index.html?empresa_id=${e.id}">Ver panel</a></td></tr>`).join('')
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
      <button class="btn ${e.estado == 'activa' ? 'warn' : 'pri'}" data-a="estado">${e.estado == 'activa' ? 'Suspender cuenta' : 'Reactivar cuenta'}</button></div>
    ${e.estado == 'suspendida' ? '<p class="note">Cuenta suspendida: los usuarios no pueden entrar al panel. Los equipos siguen guardando lecturas.</p>' : ''}

    <h3 style="margin-top:16px">Cámaras</h3>
    <div class="scroll"><table><thead><tr><th>Cámara</th><th>Etapa</th><th class="n">Temp.</th><th class="n">Humedad</th><th>Último dato</th><th></th></tr></thead><tbody>
    ${cams.map(c => `<tr><td><b>${esc(c.nombre)}</b>${c.activa ? '' : ' <span class="tag f">inactiva</span>'}</td><td>${esc(c.etapa)}</td>
      <td class="n">${c.t_min}–${c.t_max} °C</td><td class="n">${c.h_min}–${c.h_max} %</td>
      <td class="${c.sin_datos && c.activa ? 'bad' : ''}">${hace(c.ultima_lectura)}</td>
      <td class="n"><button class="btn sm" data-a="rangos" data-id="${c.id}">Rangos</button> <button class="btn sm" data-a="token" data-id="${c.id}">Nuevo token</button> <button class="btn sm" data-a="activa" data-id="${c.id}">${c.activa ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('') || '<tr><td colspan="6">Sin cámaras.</td></tr>'}
    </tbody></table></div>
    <form class="form inline" id="fCamara">
      <label>Nueva cámara<input name="nombre" required placeholder="Cámara 1 · Secado"></label>
      <label>Etapa<input name="etapa" value="Secado"></label>
      <label>Temp. mín<input name="t_min" type="number" step="0.1" value="12" required></label>
      <label>Temp. máx<input name="t_max" type="number" step="0.1" value="15" required></label>
      <label>Hum. mín<input name="h_min" type="number" step="0.1" value="75" required></label>
      <label>Hum. máx<input name="h_max" type="number" step="0.1" value="85" required></label>
      <button class="btn pri">Agregar cámara</button>
    </form>

    <h3 style="margin-top:20px">Usuarios</h3>
    <div class="scroll"><table><thead><tr><th>Nombre</th><th>Mail</th><th>Último ingreso</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr><td><b>${esc(u.nombre)}</b>${u.activo ? '' : ' <span class="tag f">de baja</span>'}</td><td>${esc(u.email)}</td><td>${hace(u.ultimo_login)}</td>
      <td class="n"><button class="btn sm" data-a="clave" data-id="${u.id}">Nueva contraseña</button> <button class="btn sm" data-a="uactivo" data-id="${u.id}">${u.activo ? 'Dar de baja' : 'Reactivar'}</button></td></tr>`).join('') || '<tr><td colspan="4">Sin usuarios.</td></tr>'}
    </tbody></table></div>
    <form class="form inline" id="fUsuario">
      <label>Nombre<input name="nombre" placeholder="Encargado"></label>
      <label>Mail<input name="email" type="email" required></label>
      <button class="btn pri">Crear usuario</button>
    </form>
  </div>`;
}

/* ---------- Eventos ---------- */
const elegir = tr => { sel = +tr.dataset.id; renderDetalle(); $('#detalle').scrollIntoView({behavior: 'smooth'}); };
$('#empresas').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a')) elegir(tr); });
$('#empresas').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key == 'Enter') elegir(tr); });

$('#fEmpresa').addEventListener('submit', async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const r = await api({accion: 'empresa_crear', ...f});
  e.target.reset(); sel = r.id; await cargar();
});

$('#detalle').addEventListener('submit', async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (e.target.id == 'fCamara') {
    const r = await api({accion: 'camara_crear', empresa_id: sel, ...f});
    secreto(`Cámara creada. Token para el ESP32 (<code>DEVICE_TOKEN</code>): <code>${esc(r.device_token)}</code>`);
  } else if (e.target.id == 'fUsuario') {
    const r = await api({accion: 'usuario_crear', empresa_id: sel, ...f});
    secreto(`Usuario creado. Mail: <code>${esc(r.email)}</code> · Contraseña: <code>${esc(r.password)}</code>`);
  }
  await cargar();
});

$('#detalle').addEventListener('click', async e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const id = +b.dataset.id, a = b.dataset.a;
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
    secreto(`Contraseña nueva: <code>${esc(r.password)}</code>`);
  } else if (a == 'uactivo') {
    const u = D.usuarios.find(x => x.id == id);
    await api({accion: 'usuario_activo', id, activo: !u.activo});
  }
  await cargar();
});

$('#salir').addEventListener('click', async () => {
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
  const r = await fetch('api/auth.php', {cache: 'no-store'});
  const u = await r.json().catch(() => ({}));
  if (!r.ok) { $('#login').hidden = false; return; }
  if (u.rol != 'admin') { location.href = 'index.html'; return; }
  $('#user').hidden = false; $('#userName').textContent = u.nombre;
  $('#admin').hidden = false;
  await cargar();
})();
}

/* Salame Monitor - frontend
 * Pide iniciar sesión y lee los datos de la empresa del usuario desde api/estado.php.
 * Si la API no responde (por ejemplo, sin PHP), o se toca "Ver demo", arranca en modo demo con datos simulados.
 * Un administrador puede ver el panel de un cliente con index.html?empresa_id=N.
 */
{
const $ = s => document.querySelector(s);
const EMP = new URLSearchParams(location.search).get('empresa_id');
const API = 'api/estado.php' + (EMP ? '?empresa_id=' + encodeURIComponent(EMP) : '');
const POLL_MS = 60000;

const PARAMS = [
  ['Estufado / fermentación', '20–24 °C', '88–95 %', '2 a 4 días'],
  ['Secado', '12–15 °C', '75–85 %', '2 a 4 semanas'],
  ['Estacionamiento / maduración', '10–14 °C', '70–80 %', 'hasta llegar al peso final']];

const MATS = [
  ['Cerebro', 'ESP32 (Wi-Fi)', 'Una placa por cámara. Lee los sensores y manda los datos a la app cada 5 minutos. Guarda lecturas si se corta internet.', '1 por cámara'],
  ['Aire', 'Sensor de temperatura y humedad SHT31 o SHT45', 'Mide el ambiente de la cámara. Pedirlo con carcasa o filtro para ambientes húmedos.', '2 por cámara (arriba y abajo)'],
  ['Producto', 'Sonda DS18B20 de acero inoxidable', 'Se pincha en una pieza testigo para medir la temperatura del interior del salame.', '1 o 2 por cámara'],
  ['Peso (clave)', 'Celda de carga + módulo HX711', 'Pesa sola una vara testigo cada hora. Así la app calcula la pérdida de peso real sin bajar piezas.', '1 por cámara (celda de 5 a 20 kg)'],
  ['Acidez', 'Medidor de pH de pinchar (portátil)', 'Para la fermentación. Se mide a mano y se carga en la app.', '1 para toda la fábrica'],
  ['Actividad de agua', 'Análisis aw (laboratorio o equipo)', 'Confirma que el salame está seguro. Se hace por lote y se carga el resultado.', 'Por lote, opcional al inicio'],
  ['Aire en movimiento', 'Sensor de corriente o anemómetro chico', 'Opcional: avisa si se paró el ventilador o el forzador.', 'Opcional'],
  ['Instalación', 'Caja estanca IP65, fuente 5 V, cables y prensacables', 'Todo va en una caja cerrada fuera del flujo de aire directo. Si no llega el Wi-Fi, repetidor o módulo 4G.', '1 kit por cámara'],
  ['Avisos', 'Relé o sirena (opcional)', 'Además del aviso al celular, puede encender una luz o sirena en planta.', 'Opcional']];

let modo = 'demo', S = null, cam = 0, fail = false;

/* ---------- Datos demo ---------- */
function demoState() {
  const camaras = [
    {id: 1, nombre: 'Cámara 1 · Secado', t_min: 12, t_max: 15, h_min: 75, h_max: 85, tb: 13.5, hb: 80},
    {id: 2, nombre: 'Cámara 2 · Estufado', t_min: 20, t_max: 24, h_min: 88, h_max: 95, tb: 22, hb: 92},
    {id: 3, nombre: 'Cámara 3 · Estacionamiento', t_min: 10, t_max: 14, h_min: 70, h_max: 80, tb: 12, hb: 75}];
  const lecturas = {};
  for (const c of camaras) {
    const a = [];
    for (let i = 0; i <= 96; i++) {
      const x = i / 96, t = c.tb + Math.sin(x * Math.PI * 4) * .8 + (Math.random() - .5) * .4;
      a.push({t: +t.toFixed(1), h: +(c.hb + Math.cos(x * Math.PI * 3) * 2.5 + (Math.random() - .5) * 1.2).toFixed(1), tp: +(t + .6).toFixed(1)});
    }
    lecturas[c.id] = a;
  }
  const L = (codigo, producto, etapa, camara_id, dia, perdida, meta, kg, horas) => {
    const curva = [];
    for (let d = 0; d <= dia; d++) curva.push({dia: d, perdida: +(perdida * (1 - Math.exp(-d / 9)) / (1 - Math.exp(-dia / 9)) + (d && d < dia ? (Math.random() - .5) * .6 : 0)).toFixed(1)});
    return {codigo, producto, etapa, camara_id, dia, perdida, meta, kg, horas_fuera: horas, origen: 'Granja zona Oncativo (cargado por el elaborador)', curva};
  };
  return {
    camaras, lecturas,
    lotes: [
      L('L-2611-01', 'Salame tipo Oncativo · calibre 50', 'Secado', 1, 14, 22.4, 33, 420, 0.4),
      L('L-2611-02', 'Salame tipo Oncativo · calibre 70', 'Secado', 1, 9, 13.1, 35, 380, 0),
      L('L-2611-03', 'Salamín picado fino', 'Estufado', 2, 2, 4.2, 30, 260, 0),
      L('L-2610-07', 'Salame tipo Oncativo · calibre 50', 'Estacionamiento', 3, 24, 30.8, 33, 510, 0),
      L('L-2610-05', 'Bondiola curada', 'Estacionamiento', 3, 31, 32.9, 33, 190, 0)],
    alertas: [
      {nivel: 'ok', hora: '08:12', mensaje: 'Cámara 1: humedad volvió al rango (79 %).'},
      {nivel: 'alta', hora: '06:40', mensaje: 'Cámara 1: humedad en 88 % durante 25 min. Se avisó al responsable.'},
      {nivel: 'info', hora: 'Ayer 18:05', mensaje: 'Lote L-2610-05 llegó al 32,9 % de pérdida: listo para revisar.'}]
  };
}

/* ---------- Carga de datos reales ---------- */
async function loadReal() {
  const r = await fetch(API, {cache: 'no-store'});
  if (r.status == 401 || r.status == 403) { location.reload(); throw new Error('sesión'); }  // vencida o suspendida
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ---------- Sesión ---------- */
async function api(url, body) {
  const r = await fetch(url, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {cache: 'no-store'});
  let d = {}; try { d = await r.json(); } catch (e) {}
  return {status: r.status, d};
}
function showUser(u) {
  $('#user').hidden = false;
  $('#userName').textContent = u.nombre;
  $('#adminLink').hidden = u.rol != 'admin';
}
function showLogin(msg) {
  document.body.classList.add('login-on');
  $('#login').hidden = false; $('#modo').hidden = true;
  $('#loginErr').textContent = msg || '';
}

/* ---------- Render ---------- */
const C = () => S.camaras[cam];
const serie = () => S.lecturas[C().id] || [];
const svg = $('#chart');

function drawChart() {
  if (!S) return;
  const s = svg, W = s.clientWidth, H = s.clientHeight, data = serie();
  if (!W || !H) return;
  if (data.length < 2) { s.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--mut)" font-size="15">Todavía no hay lecturas para esta cámara</text>`; return; }
  const c = C(), small = W < 520, pl = small ? 30 : 40, pr = small ? 30 : 44, pt = 14, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
  const tMin = c.t_min - 6, tMax = c.t_max + 6, hMin = Math.max(40, c.h_min - 20), hMax = 100;
  const X = i => pl + i / (data.length - 1) * iw, YT = v => pt + (1 - (v - tMin) / (tMax - tMin)) * ih, YH = v => pt + (1 - (v - hMin) / (hMax - hMin)) * ih;
  const path = (k, Y) => data.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[k]).toFixed(1)).join('');
  let g = `<rect x="${pl}" y="${YT(c.t_max)}" width="${iw}" height="${YT(c.t_min) - YT(c.t_max)}" fill="var(--red)" opacity=".08"/>`;
  g += `<rect x="${pl}" y="${YH(c.h_max)}" width="${iw}" height="${YH(c.h_min) - YH(c.h_max)}" fill="var(--mold)" opacity=".1"/>`;
  const ticks = small ? 3 : 5;
  for (let k = 0; k <= ticks; k++) {
    const y = pt + k / ticks * ih;
    g += `<line x1="${pl}" x2="${pl + iw}" y1="${y}" y2="${y}" stroke="var(--line)"/>`;
    g += `<text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="12" fill="var(--red)">${(tMax - k / ticks * (tMax - tMin)).toFixed(0)}°</text>`;
    g += `<text x="${pl + iw + 6}" y="${y + 4}" font-size="12" fill="var(--mold)">${(hMax - k / ticks * (hMax - hMin)).toFixed(0)}%</text>`;
  }
  ['−48 h', '−24 h', 'ahora'].forEach((l, k) => { g += `<text x="${pl + k / 2 * iw}" y="${H - 6}" font-size="12" fill="var(--mut)" text-anchor="${k == 0 ? 'start' : k == 2 ? 'end' : 'middle'}">${l}</text>`; });
  g += `<path d="${path('h', YH)}" fill="none" stroke="var(--mold)" stroke-width="2.5" stroke-linejoin="round"/>`;
  g += `<path d="${path('t', YT)}" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linejoin="round"/>`;
  const L = data.length - 1;
  g += `<circle cx="${X(L)}" cy="${YT(data[L].t)}" r="5" fill="var(--red)"/><circle cx="${X(L)}" cy="${YH(data[L].h)}" r="5" fill="var(--mold)"/>`;
  s.innerHTML = g;
}
const ro = new ResizeObserver(drawChart); ro.observe(svg);

function renderKpis() {
  const c = C(), data = serie(), p = data[data.length - 1];
  if (!p) { $('#kpis').innerHTML = '<div class="kpi"><span>Sin lecturas todavía</span></div>'; return; }
  const inT = p.t >= c.t_min && p.t <= c.t_max, inH = p.h >= c.h_min && p.h <= c.h_max;
  const lot = S.lotes.find(l => l.camara_id == c.id);
  $('#kpis').innerHTML = `
  <div class="kpi"><span>Temperatura aire</span><b style="color:var(--red)">${p.t.toFixed(1)} °C</b><span class="st ${inT ? 'okc' : 'bad'}">${inT ? 'En rango' : 'Fuera de rango'} · objetivo ${c.t_min}–${c.t_max} °C</span></div>
  <div class="kpi"><span>Humedad relativa</span><b style="color:var(--mold)">${p.h.toFixed(0)} %</b><span class="st ${inH ? 'okc' : 'bad'}">${inH ? 'En rango' : 'Fuera de rango'} · objetivo ${c.h_min}–${c.h_max} %</span></div>
  <div class="kpi"><span>Interior pieza testigo</span><b>${p.tp != null ? p.tp.toFixed(1) + ' °C' : '–'}</b><span class="st">Sonda en el salame</span></div>
  ${lot ? `<div class="kpi"><span>Pérdida de peso · ${esc(lot.codigo)}</span><b>${lot.perdida.toFixed(1)} %</b><span class="st">Meta ${lot.meta} % · día ${lot.dia}</span></div>` : ''}`;
}

const dotColor = n => n == 'alta' ? 'var(--ember)' : n == 'ok' ? 'var(--ok)' : 'var(--mold)';
function renderAlerts() {
  $('#alerts').innerHTML = S.alertas.length
    ? S.alertas.slice(0, 8).map(a => `<div class="alert"><span class="dot" style="background:${dotColor(a.nivel)}"></span><time>${esc(a.hora)}</time><span>${esc(a.mensaje)}</span></div>`).join('')
    : '<p class="note">Sin alertas.</p>';
}

const tagCls = st => st == 'Estufado' ? 'tag f' : st == 'Secado' ? 'tag' : 'tag l';
function renderLots() {
  $('#lots').innerHTML = S.lotes.length ? S.lotes.map((l, i) => {
    const pct = Math.min(100, l.perdida / l.meta * 100);
    return `<tr class="click" data-i="${i}" tabindex="0"><td><b>${esc(l.codigo)}</b></td><td>${esc(l.producto)}</td><td><span class="${tagCls(l.etapa)}">${esc(l.etapa)}</span></td><td class="n">${l.dia}</td><td class="n">${l.perdida.toFixed(1)} % de ${l.meta} %</td><td><div class="meter"><i style="width:${pct}%"></i></div></td></tr>`;
  }).join('') : '<tr><td colspan="6">No hay lotes cargados.</td></tr>';
}

function qr(seed) {
  let r = '', n = seed.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    n = (n * 1103515245 + 12345) >>> 0;
    const finder = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
    if (finder || n % 3 == 0) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg class="qr" viewBox="-1 -1 13 13" aria-label="Código del lote"><rect x="-1" y="-1" width="13" height="13" fill="#fff"/><g fill="#1d1214">${r}</g></svg>`;
}

let lotRO = null;
function showLot(i) {
  const l = S.lotes[i]; if (!l) return;
  const left = Math.max(0, Math.round((l.meta - l.perdida) / 0.5));
  $('#detail').innerHTML = `<div class="panel"><h3>${esc(l.codigo)} · curva de pérdida de peso</h3><div class="fig" style="min-height:280px"><svg id="lc"></svg></div><div class="legend"><span><i style="background:var(--red)"></i>Real (vara testigo)</span><span><i style="background:var(--mut)"></i>Curva esperada</span></div></div>
  <div class="ficha">${qr(l.codigo)}<h3>Ficha de trazabilidad</h3><dl>
  <dt>Lote</dt><dd>${esc(l.codigo)}</dd><dt>Producto</dt><dd>${esc(l.producto)}</dd><dt>Kilos embutidos</dt><dd>${l.kg} kg</dd>
  <dt>Etapa actual</dt><dd>${esc(l.etapa)} · día ${l.dia}</dd><dt>Pérdida de peso</dt><dd>${l.perdida.toFixed(1)} % (meta ${l.meta} %)</dd>
  <dt>Horas fuera de rango</dt><dd>${String(l.horas_fuera).replace('.', ',')} h</dd><dt>Estimado listo</dt><dd>${left ? 'en ' + left + ' días aprox.' : 'listo para revisar'}</dd>
  <dt>Origen cerdo</dt><dd>${esc(l.origen || '–')}</dd></dl>
  <p class="note">El QR va en la etiqueta: el comprador lo escanea y ve el recorrido del lote. Sirve como respaldo para la denominación de origen.</p></div>`;
  const s = $('#lc');
  const dr = () => {
    const W = s.clientWidth, H = s.clientHeight; if (!W) return;
    const max = Math.max(l.dia, 28), pl = 36, pb = 24, pt = 10, iw = W - pl - 12, ih = H - pt - pb;
    const X = d => pl + d / max * iw, Y = v => pt + (1 - v / 40) * ih, k = 1 - Math.exp(-28 / 9);
    let g = '';
    [0, 10, 20, 30, 40].forEach(v => { g += `<line x1="${pl}" x2="${pl + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${Y(v) + 4}" font-size="12" text-anchor="end" fill="var(--mut)">${v}%</text>`; });
    g += `<line x1="${pl}" x2="${pl + iw}" y1="${Y(l.meta)}" y2="${Y(l.meta)}" stroke="var(--mold)" stroke-dasharray="5 4"/><text x="${pl + iw}" y="${Y(l.meta) - 6}" font-size="12" text-anchor="end" fill="var(--mold)">meta ${l.meta}%</text>`;
    let e = ''; for (let d = 0; d <= max; d++) e += (d ? 'L' : 'M') + X(d) + ' ' + Y(l.meta * (1 - Math.exp(-d / 9)) / k);
    g += `<path d="${e}" fill="none" stroke="var(--mut)" stroke-width="2" stroke-dasharray="2 4"/>`;
    if (l.curva.length) g += `<path d="${l.curva.map((p, j) => (j ? 'L' : 'M') + X(p.dia) + ' ' + Y(p.perdida)).join('')}" fill="none" stroke="var(--red)" stroke-width="3"/>`;
    g += `<circle cx="${X(l.dia)}" cy="${Y(l.perdida)}" r="5" fill="var(--red)"/>`;
    [0, Math.round(max / 2), max].forEach((d, j) => { g += `<text x="${X(d)}" y="${H - 6}" font-size="12" fill="var(--mut)" text-anchor="${j == 0 ? 'start' : j == 2 ? 'end' : 'middle'}">día ${d}</text>`; });
    s.innerHTML = g;
  };
  if (lotRO) lotRO.disconnect();
  lotRO = new ResizeObserver(dr); lotRO.observe(s);
}

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }
function hora() { return new Date().toTimeString().slice(0, 5); }

function fillCams() {
  $('#cam').innerHTML = S.camaras.map((c, i) => `<option value="${i}">${esc(c.nombre)}</option>`).join('');
  $('#cam').value = cam;
}
function renderAll() {
  if (!S.camaras.length) {
    $('#camTitle').textContent = 'Todavía no hay cámaras cargadas';
    svg.innerHTML = ''; $('#kpis').innerHTML = ''; renderAlerts(); renderLots(); return;
  }
  if (cam >= S.camaras.length) cam = 0;
  $('#camTitle').textContent = C().nombre; drawChart(); renderKpis(); renderAlerts(); renderLots();
}

/* ---------- Simulación (solo demo) ---------- */
function tickDemo() {
  const c = C(), a = serie(), last = a[a.length - 1];
  const t = last.t + (c.tb - last.t) * .15 + (Math.random() - .5) * .3;
  const h = fail ? Math.min(97, last.h + 1.6) : last.h + (c.hb - last.h) * .2 + (Math.random() - .5);
  a.push({t: +t.toFixed(1), h: +h.toFixed(1), tp: +(t + .6).toFixed(1)}); a.shift();
  if (fail && h > c.h_max && !S.alertas[0].mensaje.includes('Simulada')) {
    S.alertas.unshift({nivel: 'alta', hora: hora(), mensaje: `${c.nombre}: humedad en ${h.toFixed(0)} %, por encima del ${c.h_max} %. Simulada: se avisó al responsable.`});
    renderAlerts();
  }
  drawChart(); renderKpis();
}

/* ---------- Eventos ---------- */
$('#cam').addEventListener('change', e => { cam = +e.target.value; fail = false; $('#fail').textContent = 'Simular falla de humedad'; renderAll(); });
$('#fail').addEventListener('click', () => {
  fail = !fail;
  $('#fail').textContent = fail ? 'Normalizar cámara' : 'Simular falla de humedad';
  if (!fail) { S.alertas.unshift({nivel: 'ok', hora: hora(), mensaje: C().nombre + ': condiciones normalizadas.'}); renderAlerts(); }
});
$('#lots').addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) showLot(+tr.dataset.i); });
$('#lots').addEventListener('keydown', e => { if (e.key == 'Enter') { const tr = e.target.closest('tr[data-i]'); if (tr) showLot(+tr.dataset.i); } });
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach(x => x.setAttribute('aria-selected', x == b));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id == 'v-' + b.dataset.v));
  if (b.dataset.v == 'camara') drawChart();
  if (b.dataset.v == 'lotes' && !$('#detail').innerHTML) showLot(0);
}));

$('#mats').innerHTML = MATS.map(m => `<div class="mat"><div class="k">${m[0]}</div><h3>${m[1]}</h3><p>${m[2]}</p><p class="note"><b>Cantidad:</b> ${m[3]}</p></div>`).join('');
$('#params').innerHTML = PARAMS.map(p => `<tr><td>${p[0]}</td><td class="n">${p[1]}</td><td class="n">${p[2]}</td><td>${p[3]}</td></tr>`).join('');

/* ---------- Arranque ---------- */
function startDemo() {
  document.body.classList.remove('login-on'); $('#login').hidden = true; $('#modo').hidden = false;
  S = demoState(); modo = 'demo';
  setInterval(tickDemo, 2500);
  fillCams(); renderAll();
}

async function startReal() {
  S = await loadReal(); modo = 'real';
  document.body.classList.remove('login-on'); $('#login').hidden = true; $('#modo').hidden = false;
  $('#modo').textContent = 'Datos en vivo'; $('#modo').classList.add('real');
  $('#empresa').textContent = S.empresa;
  $('#fail').hidden = true;
  setInterval(async () => { try { S = await loadReal(); renderAll(); } catch (e) { console.warn(e); } }, POLL_MS);
  fillCams(); renderAll();
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#loginErr').textContent = '';
  const {status, d} = await api('api/auth.php', {email: f.get('email'), password: f.get('password')});
  if (status == 200) { showUser(d); startReal().catch(err => showLogin('No se pudieron cargar los datos.')); }
  else showLogin(d.error || 'No se pudo ingresar.');
});
$('#verDemo').addEventListener('click', startDemo);
$('#salir').addEventListener('click', async () => { await api('api/auth.php', {accion: 'salir'}); location.href = location.pathname; });

(async () => {
  let r;
  try { r = await api('api/auth.php'); } catch (e) { return startDemo(); }  // sin API: demo
  if (r.status == 200) {
    showUser(r.d);
    if (r.d.rol == 'admin' && !EMP) { location.href = 'admin.html'; return; }
    try { await startReal(); } catch (e) { showLogin('No se pudieron cargar los datos.'); }
  } else if (r.status == 401 || r.status == 403) {
    if (r.d.suspendida) { $('#user').hidden = false; $('#adminLink').hidden = true; }
    showLogin(r.status == 403 ? r.d.error : '');
  } else startDemo();
})();
}

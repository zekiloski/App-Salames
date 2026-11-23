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
  ['placa', 'Cerebro', 'ESP32 (Wi-Fi)', 'Una placa por cámara. Lee los sensores y manda los datos a la app cada 5 minutos. Guarda lecturas si se corta internet.', '1 por cámara'],
  ['termometro', 'Aire', 'Sensor de temperatura y humedad SHT31 o SHT45', 'Mide el ambiente de la cámara. Pedirlo con carcasa o filtro para ambientes húmedos.', '2 por cámara (arriba y abajo)'],
  ['sonda', 'Producto', 'Sonda DS18B20 de acero inoxidable', 'Se pincha en una pieza testigo para medir la temperatura del interior del salame.', '1 o 2 por cámara'],
  ['balanza', 'Peso (clave)', 'Celda de carga + módulo HX711', 'Pesa sola una vara testigo cada hora. Así la app calcula la pérdida de peso real sin bajar piezas.', '1 por cámara (celda de 5 a 20 kg)'],
  ['ph', 'Acidez', 'Medidor de pH de pinchar (portátil)', 'Para la fermentación. Se mide a mano y se carga en la app.', '1 para toda la fábrica'],
  ['gota', 'Actividad de agua', 'Análisis aw (laboratorio o equipo)', 'Confirma que el salame está seguro. Se hace por lote y se carga el resultado.', 'Por lote, opcional al inicio'],
  ['aire', 'Aire en movimiento', 'Sensor de corriente o anemómetro chico', 'Opcional: avisa si se paró el ventilador o el forzador.', 'Opcional'],
  ['caja', 'Instalación', 'Caja estanca IP65, fuente 5 V, cables y prensacables', 'Todo va en una caja cerrada fuera del flujo de aire directo. Si no llega el Wi-Fi, repetidor o módulo 4G.', '1 kit por cámara'],
  ['campana', 'Avisos', 'Relé o sirena (opcional)', 'Además del aviso al celular, puede encender una luz o sirena en planta.', 'Opcional']];

/* ---------- Diagnóstico del estacionamiento ----------
 * Compara la pérdida de peso real de cada lote con una curva esperada y explica qué pasa.
 * La curva es una referencia general (llega a la meta en ~28 días): se ajusta con la prueba piloto.
 */
const DIAS_META = 28, TAU = 9;
const UMBRAL = 4;   // puntos de pérdida de diferencia con lo esperado antes de avisar
const esperada = (meta, d) => Math.min(meta, meta * (1 - Math.exp(-d / TAU)) / (1 - Math.exp(-DIAS_META / TAU)));

const NIVEL = {
  ok:       {ic: 'ok', txt: 'Va bien', cls: 'n-ok', exp: 'Pierde peso al ritmo esperado.'},
  listo:    {ic: 'listo', txt: 'Listo', cls: 'n-li', exp: 'Llegó a la meta de peso: revisalo para liberarlo.'},
  atencion: {ic: 'atencion', txt: 'Atención', cls: 'n-at', exp: 'Algo se está apartando. Revisalo hoy.'},
  problema: {ic: 'problema', txt: 'Problema', cls: 'n-pr', exp: 'El lote está en riesgo. Actuá cuanto antes.'}};
const PESO = {ok: 0, listo: 1, atencion: 2, problema: 3};

const CAUSAS = {
  rapido: {ic: 'rapido', titulo: 'Seca demasiado rápido',
    que: 'Pierde peso más rápido de lo normal. Riesgo de costra: la tripa se endurece por fuera y el interior queda húmedo y no termina de curarse.',
    hacer: 'Subí unos puntos la humedad de la cámara y bajá la ventilación. Revisá que no haya aire directo sobre las piezas.'},
  lento: {ic: 'lento', titulo: 'Seca muy lento',
    que: 'Pierde peso más despacio de lo normal. Riesgo de moho no deseado, olor ácido o pieza blanda.',
    hacer: 'Bajá la humedad y aumentá la circulación de aire. Revisá que la cámara no esté sobrecargada y que el frío y el deshumidificador funcionen.'},
  estancado: {ic: 'pausa', titulo: 'Dejó de perder peso',
    que: 'En los últimos 3 días casi no bajó de peso y todavía no llegó a la meta. Suele ser costra (el agua no puede salir) o una cámara demasiado húmeda.',
    hacer: 'Tocá una pieza. Si está dura por fuera y blanda por dentro, es costra: subí la humedad. Si está mojada o pegajosa por fuera, bajá la humedad y dale más aire.'},
  fuera: {ic: 'reloj', titulo: 'Muchas horas fuera de rango',
    que: 'La cámara estuvo varias horas fuera de la temperatura o humedad objetivo mientras este lote estaba adentro.',
    hacer: 'Revisá el equipo de frío, el humidificador y que la puerta cierre bien. En "Cámara en vivo" ves a qué hora se fue de rango.'},
  largo: {ic: 'reloj', titulo: 'Lleva mucho tiempo',
    que: 'Lleva más del doble del tiempo de referencia y no llegó a la meta.',
    hacer: 'Confirmá que la meta de pérdida sea la correcta para ese calibre y revisá las condiciones de la cámara.'},
  listo: {ic: 'listo', titulo: 'Llegó a la meta de peso',
    que: 'Ya perdió el peso previsto.',
    hacer: 'Revisá firmeza, color al corte y olor. Si podés, medí pH y actividad de agua antes de liberar el lote.'},
  ok: {ic: 'ok', titulo: 'Va bien',
    que: 'Pierde peso al ritmo esperado y la cámara estuvo en rango.',
    hacer: 'No hace falta hacer nada. Seguí controlando como siempre.'}};

function diagnostico(l) {
  const s = [], esp = esperada(l.meta, l.dia), dif = l.perdida - esp;
  const c = l.curva || [], ult = c[c.length - 1], hace3 = c.filter(p => p.dia <= l.dia - 3).pop();
  if (l.perdida >= l.meta) s.push(['listo', 'listo']);
  else {
    if (l.dia >= 2 && dif >= UMBRAL) s.push(['rapido', dif >= UMBRAL * 2 ? 'problema' : 'atencion']);
    if (l.dia >= 3 && dif <= -UMBRAL) s.push(['lento', dif <= -UMBRAL * 2 ? 'problema' : 'atencion']);
    if (l.dia >= 5 && hace3 && ult && ult.perdida - hace3.perdida < 0.5) s.push(['estancado', 'problema']);
    if (l.dia > DIAS_META * 2) s.push(['largo', 'atencion']);
  }
  if (l.horas_fuera >= 6) s.push(['fuera', l.horas_fuera >= 24 ? 'problema' : 'atencion']);
  const nivel = s.reduce((n, x) => PESO[x[1]] > PESO[n] ? x[1] : n, 'ok');
  return {nivel, esp, dif, senales: s.length ? s : [['ok', 'ok']]};
}
const estado = (nivel, corto) => { const n = NIVEL[nivel]; return `<span class="estado ${n.cls}">${ic(n.ic)}${corto ? '' : n.txt}</span>`; };

let modo = 'demo', S = null, cam = 0, fail = false;

/* ---------- Datos demo ---------- */
// propias: cámaras de una empresa del modo prueba (si no, las 3 de ejemplo). Las lecturas y lotes son simulados.
function demoState(propias) {
  const camaras = propias ? propias.map(c => ({id: c.id, nombre: c.nombre, t_min: c.t_min, t_max: c.t_max, h_min: c.h_min, h_max: c.h_max,
      tb: (c.t_min + c.t_max) / 2, hb: (c.h_min + c.h_max) / 2})) : [
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
  // estanca = días al final en los que el lote no perdió peso (para mostrar ese problema en la demo)
  const L = (codigo, producto, etapa, camara_id, dia, perdida, meta, kg, horas, estanca = 0) => {
    const curva = [], hasta = dia - estanca;
    for (let d = 0; d <= dia; d++) {
      const x = Math.min(d, hasta);
      curva.push({dia: d, perdida: +(perdida * (1 - Math.exp(-x / 9)) / (1 - Math.exp(-hasta / 9)) + (d && d < hasta ? (Math.random() - .5) * .6 : d > hasta ? (Math.random() - .5) * .2 : 0)).toFixed(1)});
    }
    return {codigo, producto, etapa, camara_id, dia, perdida, meta, kg, horas_fuera: horas, origen: 'Granja zona Oncativo (cargado por el elaborador)', curva};
  };
  let lotes = [
    L('L-2611-01', 'Salame tipo Oncativo · calibre 50', 'Secado', 1, 14, 25.8, 33, 420, 0.4),
    L('L-2611-02', 'Salame tipo Oncativo · calibre 70', 'Secado', 1, 9, 13.1, 35, 380, 0),
    L('L-2611-04', 'Salame picado grueso · calibre 40', 'Secado', 1, 5, 20.4, 33, 300, 7.5),
    L('L-2611-03', 'Salamín picado fino', 'Estufado', 2, 2, 4.2, 30, 260, 0),
    L('L-2610-07', 'Salame tipo Oncativo · calibre 50', 'Estacionamiento', 3, 24, 29.1, 33, 510, 0, 4),
    L('L-2610-05', 'Bondiola curada', 'Estacionamiento', 3, 31, 33.4, 33, 190, 0)];
  lotes.forEach(l => { l.piezas = Math.round(l.kg / 0.35); });   // ~350 g por pieza
  // Con cámaras propias, los lotes de ejemplo se reparten entre ellas (sin cámaras no hay lotes)
  if (propias) lotes = camaras.length ? lotes.map((l, i) => ({...l, camara_id: camaras[i % camaras.length].id})) : [];
  const c1 = camaras.length ? camaras[0].nombre : 'Cámara 1';
  return {
    camaras, lecturas, lotes,
    alertas: camaras.length ? [
      {nivel: 'ok', hora: '08:12', mensaje: c1 + ': humedad volvió al rango.'},
      {nivel: 'alta', hora: '06:40', mensaje: c1 + ': humedad fuera de rango durante 25 min. Se avisó al responsable.'},
      {nivel: 'info', hora: 'Ayer 18:05', mensaje: 'Lote L-2610-05 llegó a la meta de pérdida: listo para revisar.'}] : []
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
  const c = C(), small = W < 520, pl = small ? 30 : 40, pr = small ? 40 : 44, pt = 14, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
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
  const rango = ok => `<span class="st ${ok ? 'okc' : 'bad'}">${ic(ok ? 'ok' : 'atencion')}${ok ? 'En rango' : 'Fuera de rango'}`;
  $('#kpis').innerHTML = `
  <div class="kpi"><span class="kt">${ic('termometro', 'c-red')}Temperatura del aire</span><b style="color:var(--red)">${p.t.toFixed(1)} °C</b>${rango(inT)} · objetivo ${c.t_min}–${c.t_max} °C</span></div>
  <div class="kpi"><span class="kt">${ic('gota', 'c-mold')}Humedad del aire</span><b style="color:var(--mold)">${p.h.toFixed(0)} %</b>${rango(inH)} · objetivo ${c.h_min}–${c.h_max} %</span></div>
  <div class="kpi"><span class="kt">${ic('sonda')}Interior del salame</span><b>${p.tp != null ? p.tp.toFixed(1) + ' °C' : '–'}</b><span class="st">Sonda en la pieza testigo</span></div>
  ${lot ? `<div class="kpi"><span class="kt">${ic('balanza')}Pérdida de peso · ${esc(lot.codigo)}</span><b>${lot.perdida.toFixed(1)} %</b><span class="st">${estado(diagnostico(lot).nivel)} · meta ${lot.meta} % · día ${lot.dia}</span></div>` : ''}`;
}

const ALERTA = {alta: ['atencion', 'c-ember'], ok: ['ok', 'c-ok'], info: ['info', 'c-mold']};
function renderAlerts() {
  $('#alerts').innerHTML = S.alertas.length
    ? S.alertas.slice(0, 8).map(a => { const [i, c] = ALERTA[a.nivel] || ALERTA.info; return `<div class="alert">${ic(i, c)}<time>${esc(a.hora)}</time><span>${esc(a.mensaje)}</span></div>`; }).join('')
    : '<p class="note">Sin alertas.</p>';
}

// Resumen arriba de "Cámara en vivo": cuántos lotes van bien y cuáles necesitan atención
function renderResumen() {
  const D = S.lotes.map((l, i) => ({l, i, d: diagnostico(l)}));
  const cuenta = n => D.filter(x => x.d.nivel == n).length;
  const malos = D.filter(x => PESO[x.d.nivel] >= 2).sort((a, b) => PESO[b.d.nivel] - PESO[a.d.nivel]);
  $('#lotBadge').hidden = !malos.length; $('#lotBadge').textContent = malos.length;
  if (!S.lotes.length) { $('#resumen').innerHTML = ''; return; }
  $('#resumen').innerHTML = `<div class="panel resumen">
    <h3>${ic('lote')}Estado de los lotes</h3>
    <div class="chips">${['ok', 'listo', 'atencion', 'problema'].filter(cuenta).map(n => `<span class="chip ${NIVEL[n].cls}">${ic(NIVEL[n].ic)}<b>${cuenta(n)}</b> ${NIVEL[n].txt.toLowerCase()}</span>`).join('')}</div>
    ${malos.map(x => `<button class="aviso ${NIVEL[x.d.nivel].cls}" data-lote="${x.i}">${ic(CAUSAS[x.d.senales[0][0]].ic)}<span><b>${esc(x.l.codigo)}</b> · ${x.d.senales.map(s => CAUSAS[s[0]].titulo).join(' · ')}</span><span class="ver">Ver qué hacer ›</span></button>`).join('')}
  </div>`;
}

const tagCls = st => st == 'Estufado' ? 'tag f' : st == 'Secado' ? 'tag' : 'tag l';
function renderLots() {
  $('#lots').innerHTML = S.lotes.length ? S.lotes.map((l, i) => {
    const pct = Math.min(100, l.perdida / l.meta * 100), d = diagnostico(l);
    return `<tr class="click" data-i="${i}" tabindex="0"><td>${estado(d.nivel)}</td><td><b>${esc(l.codigo)}</b></td><td>${esc(l.producto)}<br><small class="cant">${cantidad(l)}</small></td><td><span class="${tagCls(l.etapa)}">${esc(l.etapa)}</span></td><td class="n">${l.dia}</td><td class="n">${l.perdida.toFixed(1)} % de ${l.meta} %</td><td><div class="meter"><i class="${NIVEL[d.nivel].cls}" style="width:${pct}%"></i></div></td></tr>`;
  }).join('') : '<tr><td colspan="7">No hay lotes cargados.</td></tr>';
  renderResumen();
}

// Qué significa cada estado (arriba de la tabla de lotes y en la guía)
const leyenda = () => ['ok', 'listo', 'atencion', 'problema'].map(n => `<div>${estado(n)}<span>${NIVEL[n].exp}</span></div>`).join('');

function qr(seed) {
  let r = '', n = seed.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    n = (n * 1103515245 + 12345) >>> 0;
    const finder = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
    if (finder || n % 3 == 0) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg class="qr" viewBox="-1 -1 13 13" aria-label="Código del lote"><rect x="-1" y="-1" width="13" height="13" fill="#fff"/><g fill="#1d1214">${r}</g></svg>`;
}

// Días que faltan para la meta: con el ritmo de los últimos 3 días si hay datos; si no, con la curva de referencia
function diasRestantes(l) {
  if (l.perdida >= l.meta) return 0;
  const c = l.curva || [], ult = c[c.length - 1], hace3 = c.filter(p => p.dia <= l.dia - 3).pop();
  if (l.dia >= 5 && ult && hace3 && ult.perdida > hace3.perdida) return Math.ceil((l.meta - l.perdida) / ((ult.perdida - hace3.perdida) / (ult.dia - hace3.dia)));
  return l.dia < DIAS_META ? DIAS_META - l.dia : null;
}

let lotRO = null;
function showLot(i) {
  const l = S.lotes[i]; if (!l) return;
  const d = diagnostico(l), left = diasRestantes(l);
  const coma = v => v.toFixed(1).replace('.', ',');
  $('#detail').innerHTML = `<div class="panel diag ${NIVEL[d.nivel].cls}">
    <h3>${estado(d.nivel)} ${esc(l.codigo)} · ¿cómo va el estacionamiento?</h3>
    <p class="cifra">${ic('balanza')}Perdió <b>${coma(l.perdida)} %</b> en ${l.dia} días. A esta altura lo esperado es <b>${coma(d.esp)} %</b>${Math.abs(d.dif) >= 1 ? ` (${d.dif > 0 ? 'va ' + coma(d.dif) + ' puntos adelantado' : 'va ' + coma(-d.dif) + ' puntos atrasado'})` : ''}.</p>
    ${d.senales.map(([k, n]) => `<div class="causa ${NIVEL[n].cls}">${ic(CAUSAS[k].ic, 'grande')}<div><h4>${CAUSAS[k].titulo}</h4><p>${CAUSAS[k].que}</p><p class="hacer">${ic('mano')}<span><b>Qué hacer:</b> ${CAUSAS[k].hacer}</span></p></div></div>`).join('')}
  </div>
  <div class="panel"><h3>${ic('balanza')}Curva de pérdida de peso</h3><div class="fig" style="min-height:280px"><svg id="lc" role="img" aria-label="Pérdida de peso real comparada con la esperada"></svg></div><div class="legend"><span><i style="background:var(--red)"></i>Real (vara testigo)</span><span><i style="background:var(--mut)"></i>Esperada</span><span><i style="background:var(--tint-ok);height:10px"></i>Zona normal</span></div></div>
  <div class="ficha">${qr(l.codigo)}<h3>Ficha de trazabilidad</h3><dl>
  <dt>Lote</dt><dd>${esc(l.codigo)}</dd><dt>Producto</dt><dd>${esc(l.producto)}</dd><dt>Embutido</dt><dd>${cantidad(l)}${l.fecha_inicio ? ' · ' + fechaTxt(l.fecha_inicio) : ''}</dd>
  <dt>Kilos hoy (estimado)</dt><dd>${miles(l.kg * (1 - l.perdida / 100), 0)} kg</dd>
  <dt>Etapa actual</dt><dd>${esc(l.etapa)} · día ${l.dia}</dd><dt>Pérdida de peso</dt><dd>${l.perdida.toFixed(1)} % (meta ${l.meta} %)</dd>
  <dt>Horas fuera de rango</dt><dd>${String(l.horas_fuera).replace('.', ',')} h</dd><dt>Estimado listo</dt><dd>${left === 0 ? 'listo para revisar' : left ? 'en ' + left + ' días aprox.' : 'todavía sin datos suficientes'}</dd>
  <dt>Origen cerdo</dt><dd>${esc(l.origen || '–')}</dd></dl>
  <p class="note">El QR va en la etiqueta: el comprador lo escanea y ve el recorrido del lote. Sirve como respaldo para la denominación de origen.</p></div>`;
  const s = $('#lc');
  const dr = () => {
    const W = s.clientWidth, H = s.clientHeight; if (!W) return;
    const max = Math.max(l.dia, 28), pl = 36, pb = 24, pt = 10, iw = W - pl - 12, ih = H - pt - pb;
    const X = d => pl + d / max * iw, Y = v => pt + (1 - Math.max(0, Math.min(40, v)) / 40) * ih;
    let g = '', arriba = '', abajo = '';
    // Zona normal: la curva esperada ± el margen con el que empieza a avisar
    for (let d = 0; d <= max; d++) { arriba += (d ? 'L' : 'M') + X(d) + ' ' + Y(esperada(l.meta, d) + UMBRAL); abajo = 'L' + X(d) + ' ' + Y(Math.max(0, esperada(l.meta, d) - UMBRAL)) + abajo; }
    g += `<path d="${arriba}${abajo}Z" fill="var(--tint-ok)"/>`;
    [0, 10, 20, 30, 40].forEach(v => { g += `<line x1="${pl}" x2="${pl + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${Y(v) + 4}" font-size="12" text-anchor="end" fill="var(--mut)">${v}%</text>`; });
    g += `<line x1="${pl}" x2="${pl + iw}" y1="${Y(l.meta)}" y2="${Y(l.meta)}" stroke="var(--mold)" stroke-dasharray="5 4"/><text x="${pl + iw}" y="${Y(l.meta) - 6}" font-size="12" text-anchor="end" fill="var(--mold)">meta ${l.meta}%</text>`;
    let e = ''; for (let d = 0; d <= max; d++) e += (d ? 'L' : 'M') + X(d) + ' ' + Y(esperada(l.meta, d));
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
// 1234.5 → "1.234,5" (formato argentino)
const miles = (v, dec = 1) => Number(v).toLocaleString('es-AR', {minimumFractionDigits: 0, maximumFractionDigits: dec});
const fechaTxt = f => f.split('-').reverse().join('/');
const cantidad = l => `${miles(l.kg)} kg` + (l.piezas ? ` · ${miles(l.piezas, 0)} piezas` : '');
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
// Lote cargado en el navegador (demo / modo prueba): todavía sin lecturas de la balanza
const loteLocal = l => ({...l, dia: Math.max(0, Math.round((new Date(hoyISO()) - new Date(l.fecha_inicio)) / 864e5)),
  perdida: 0, horas_fuera: 0, curva: [{dia: 0, perdida: 0}]});
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
  if (!S.camaras.length) return;
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
const tabs = document.querySelectorAll('[role=tab]');
function irA(v) {
  tabs.forEach(x => x.setAttribute('aria-selected', x.dataset.v == v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id == 'v-' + v));
  if (v == 'camara') drawChart();
  if (v == 'lotes' && !$('#detail').innerHTML) showLot(0);
  window.scrollTo(0, 0);
}
tabs.forEach(b => b.addEventListener('click', () => irA(b.dataset.v)));
$('#resumen').addEventListener('click', e => {
  const b = e.target.closest('[data-lote]'); if (!b) return;
  irA('lotes'); showLot(+b.dataset.lote); $('#detail').scrollIntoView({behavior: 'smooth'});
});

$('#leyenda').innerHTML = leyenda();
$('#guia').innerHTML = `<div class="panel"><h3>Los cuatro estados de un lote</h3><div class="leyenda col">${leyenda()}</div></div>` +
  Object.keys(CAUSAS).filter(k => k != 'ok').map(k => `<div class="causa panel">${ic(CAUSAS[k].ic, 'grande')}<div><h4>${CAUSAS[k].titulo}</h4><p>${CAUSAS[k].que}</p><p class="hacer">${ic('mano')}<span><b>Qué hacer:</b> ${CAUSAS[k].hacer}</span></p></div></div>`).join('');
$('#mats').innerHTML = MATS.map(m => `<div class="mat">${ic(m[0], 'grande c-red')}<div class="k">${m[1]}</div><h3>${m[2]}</h3><p>${m[3]}</p><p class="note"><b>Cantidad:</b> ${m[4]}</p></div>`).join('');
$('#params').innerHTML = PARAMS.map(p => `<tr><td>${p[0]}</td><td class="n">${p[1]}</td><td class="n">${p[2]}</td><td>${p[3]}</td></tr>`).join('');

/* ---------- Nuevo lote ---------- */
const fL = $('#fLote'), mL = $('#mLote');
mL.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => mL.close()));
mL.addEventListener('click', e => { if (e.target == mL) mL.close(); });

// Código sugerido: L-AAMM-NN (año, mes y número de lote del mes)
function codigoSugerido(fecha) {
  const pre = 'L-' + fecha.slice(2, 4) + fecha.slice(5, 7) + '-';
  const n = S.lotes.filter(l => l.codigo.startsWith(pre)).map(l => +l.codigo.slice(pre.length) || 0);
  return pre + String((n.length ? Math.max(...n) : 0) + 1).padStart(2, '0');
}
function pesoDeCamara() {
  const c = S.camaras.find(x => x.id == fL.camara_id.value), nota = $('#pesoBalanza');
  if (c && c.peso_g) {
    fL.peso_inicial_g.value = c.peso_g;
    nota.textContent = `La balanza de ${c.nombre} marca ${miles(c.peso_g)} g ahora. Si la vara testigo ya es la de este lote, dejalo así.`;
  } else nota.textContent = 'Colgá la vara testigo de este lote en la balanza de la cámara y anotá el peso. Con ese dato la app calcula cuánto peso va perdiendo.';
  const et = ['Estufado', 'Secado', 'Estacionamiento'].find(x => c && c.nombre.toLowerCase().includes(x.toLowerCase()));
  if (et) fL.etapa.value = et;
}
function calcLote() {
  const kg = +fL.kg.value, pz = +fL.piezas.value, meta = +fL.meta_perdida.value || 33;
  $('#calcLote').innerHTML = kg > 0
    ? `${pz > 0 ? `Promedio <b>${miles(kg / pz * 1000, 0)} g por pieza</b> al embutir. ` : ''}Al llegar a la meta quedan unos <b>${miles(kg * (1 - meta / 100), 0)} kg</b>${pz > 0 ? ` (≈ ${miles(kg * (1 - meta / 100) / pz * 1000, 0)} g por pieza)` : ''}.`
    : '';
}
$('#nuevoLote').addEventListener('click', () => {
  if (!S || !S.camaras.length) { alert('Primero hay que tener al menos una cámara cargada.'); return; }
  fL.reset(); mL.querySelector('.err').textContent = '';
  fL.camara_id.innerHTML = S.camaras.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  fL.camara_id.value = C().id;
  fL.fecha_inicio.value = hoyISO(); fL.fecha_inicio.max = hoyISO();
  fL.codigo.value = codigoSugerido(hoyISO());
  pesoDeCamara(); calcLote();
  mL.showModal(); fL.producto.focus();
});
fL.camara_id.addEventListener('change', pesoDeCamara);
fL.fecha_inicio.addEventListener('change', () => { if (/^L-\d{4}-\d{2}$/.test(fL.codigo.value)) fL.codigo.value = codigoSugerido(fL.fecha_inicio.value); });
['kg', 'piezas', 'meta_perdida'].forEach(k => fL[k].addEventListener('input', calcLote));

fL.addEventListener('submit', async e => {
  e.preventDefault();
  const err = mL.querySelector('.err'), btn = fL.querySelector('[type=submit]'), f = Object.fromEntries(new FormData(fL));
  const falta = [['producto', 'el producto'], ['kg', 'los kilos embutidos'], ['fecha_inicio', 'la fecha de embutido'], ['codigo', 'el código de lote'], ['peso_inicial_g', 'el peso de la vara testigo']]
    .find(([k]) => !String(f[k] || '').trim());
  if (falta) { err.textContent = 'Falta ' + falta[1] + '.'; fL[falta[0]].focus(); return; }
  if (!(+f.kg > 0)) { err.textContent = 'Los kilos embutidos tienen que ser mayores a 0.'; return; }
  if (f.piezas && !(Number.isInteger(+f.piezas) && +f.piezas > 0)) { err.textContent = 'La cantidad de piezas tiene que ser un número entero.'; return; }
  if (!(+f.peso_inicial_g > 0)) { err.textContent = 'El peso de la vara testigo tiene que ser mayor a 0.'; return; }
  const lote = {codigo: f.codigo.trim(), producto: f.producto.trim(), camara_id: +f.camara_id, etapa: f.etapa, fecha_inicio: f.fecha_inicio,
    kg: +f.kg, piezas: f.piezas ? +f.piezas : null, peso_inicial_g: +f.peso_inicial_g, meta: +f.meta_perdida || 33, origen: f.origen.trim() || null};

  btn.disabled = true; err.textContent = '';
  try {
    if (modo == 'real') {
      const {status, d} = await api('api/lotes.php' + (EMP ? '?empresa_id=' + encodeURIComponent(EMP) : ''), {...lote, meta_perdida: lote.meta});
      if (status != 201) throw new Error(d.error || 'No se pudo guardar el lote.');
      S = await loadReal();
    } else {
      if (S.lotes.some(l => l.codigo == lote.codigo)) throw new Error('Ya existe un lote con el código ' + lote.codigo);
      S.lotes.push(loteLocal(lote));
      if (PRUEBA && PRUEBA_EMP) { const db = PruebaDB.leer(); (db.lotes = db.lotes || []).push({...lote, empresa_id: PRUEBA_EMP}); PruebaDB.guardar(db); }
    }
    mL.close(); renderAll(); irA('lotes');
    showLot(S.lotes.findIndex(l => l.codigo == lote.codigo));
  } catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; }
});

/* ---------- Arranque ---------- */
// propias / empresa: cámaras y nombre de una empresa del modo prueba (si no, la demo general)
function startDemo(propias, empresa) {
  document.body.classList.remove('login-on'); $('#login').hidden = true; $('#modo').hidden = false;
  S = demoState(propias); modo = 'demo';
  if (empresa) { $('#empresa').textContent = empresa; $('#modo').textContent = 'Modo prueba · ' + empresa + ' · lecturas simuladas'; }
  setInterval(tickDemo, 2500);
  fillCams(); renderAll();
}

/* ---------- Modo prueba (sin servidor) ----------
 * Permite entrar con los usuarios creados en el modo prueba del administrador (PruebaDB, en ui.js).
 * Cada usuario ve solo las cámaras de su empresa, igual que en el servidor real.
 */
let PRUEBA = false, PRUEBA_EMP = null;
const SES = 'salame_prueba_uid';
const sesion = {get: () => { try { return sessionStorage.getItem(SES); } catch (e) { return null; } },
  set: v => { try { v ? sessionStorage.setItem(SES, v) : sessionStorage.removeItem(SES); } catch (e) {} }};

function entrarEmpresaPrueba(db, empId, u) {
  const e = db.empresas.find(x => x.id == empId);
  if (!e) return showLogin('La empresa no existe.');
  if (u && e.estado != 'activa') { sesion.set(null); return showLogin('Cuenta suspendida. Comunicate con el proveedor del servicio.'); }
  showUser(u || {nombre: 'Administrador · vista del cliente', rol: 'admin'});
  PRUEBA_EMP = empId;
  startDemo(db.camaras.filter(c => c.empresa_id == empId && c.activa), e.nombre);
  // Lotes cargados por este cliente en el modo prueba (se suman a los de ejemplo)
  S.lotes.push(...(db.lotes || []).filter(l => l.empresa_id == empId).map(loteLocal));
  renderAll();
}

function loginPrueba(email, pass) {
  const db = PruebaDB.leer(), u = db.usuarios.find(x => x.email == email.trim().toLowerCase());
  if (!u || !u.activo || u.pass !== pass) return showLogin('Mail o contraseña incorrectos.');
  u.ultimo_login = PruebaDB.hoy(); PruebaDB.guardar(db);
  sesion.set(u.id);
  entrarEmpresaPrueba(db, u.empresa_id, u);
}

function iniciarPrueba() {
  PRUEBA = true;
  $('#pruebaNota').hidden = false;
  const db = PruebaDB.leer();
  if (EMP) return entrarEmpresaPrueba(db, +EMP, null);   // "Ver panel" desde el administrador
  const u = db.usuarios.find(x => x.id == sesion.get() && x.activo);
  if (u) return entrarEmpresaPrueba(db, u.empresa_id, u);
  showLogin();
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
  if (PRUEBA) return loginPrueba(f.get('email'), f.get('password'));
  const {status, d} = await api('api/auth.php', {email: f.get('email'), password: f.get('password')});
  if (status == 200) { showUser(d); startReal().catch(err => showLogin('No se pudieron cargar los datos.')); }
  else showLogin(d.error || 'No se pudo ingresar.');
});
$('#verDemo').addEventListener('click', () => startDemo());
$('#salir').addEventListener('click', async () => {
  if (PRUEBA) sesion.set(null); else await api('api/auth.php', {accion: 'salir'});
  location.href = location.pathname;
});

(async () => {
  let r;
  try { r = await api('api/auth.php'); } catch (e) { return iniciarPrueba(); }  // sin servidor: modo prueba
  if (r.status == 200 && !r.d.rol) iniciarPrueba();  // el servidor no ejecuta PHP: modo prueba
  else if (r.status == 200) {
    showUser(r.d);
    if (r.d.rol == 'admin' && !EMP) { location.href = 'admin.html'; return; }
    try { await startReal(); } catch (e) { showLogin('No se pudieron cargar los datos.'); }
  } else if (r.status == 401 || r.status == 403) {
    if (r.d.suspendida) { $('#user').hidden = false; $('#adminLink').hidden = true; }
    showLogin(r.status == 403 ? r.d.error : '');
  } else startDemo();
})();
}

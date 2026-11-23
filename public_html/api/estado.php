<?php
// Devuelve todo lo que muestra el panel: cámaras, lecturas 48 h, lotes y alertas
// de la empresa del usuario logueado.
// GET api/estado.php                 (cliente)
// GET api/estado.php?empresa_id=3    (admin: ver el panel de un cliente)
declare(strict_types=1);
require __DIR__ . '/db.php';

$u = usuario();
$emp = empresa_de($u);
$pdo = db();
$num = fn($v) => $v === null ? null : (float)$v;

$q = $pdo->prepare('SELECT nombre FROM empresas WHERE id = ?');
$q->execute([$emp]);
$empresa = $q->fetchColumn();
if ($empresa === false) json_out(['error' => 'Empresa inexistente'], 404);

// Cámaras (sin el token)
$st = $pdo->prepare('SELECT id, nombre, etapa, t_min, t_max, h_min, h_max FROM camaras WHERE empresa_id = ? AND activa = 1 ORDER BY id');
$st->execute([$emp]);
$camaras = $st->fetchAll();
// Último peso de la balanza (últimas 3 h): se sugiere como peso inicial al cargar un lote nuevo
$pesoSt = $pdo->prepare('SELECT peso_g FROM lecturas WHERE camara_id = ? AND peso_g IS NOT NULL AND ts > NOW() - INTERVAL 3 HOUR ORDER BY ts DESC LIMIT 1');
foreach ($camaras as &$c) {
    foreach (['t_min','t_max','h_min','h_max'] as $k) $c[$k] = (float)$c[$k];
    $pesoSt->execute([$c['id']]);
    $p = $pesoSt->fetchColumn();
    $c['peso_g'] = $p === false ? null : (float)$p;
}
unset($c);

// Lecturas últimas 48 h, reducidas a ~200 puntos por cámara
$lecturas = [];
$st = $pdo->prepare('SELECT ts, temp, hum, temp_prod FROM lecturas WHERE camara_id = ? AND ts > NOW() - INTERVAL 48 HOUR ORDER BY ts');
foreach ($camaras as $c) {
    $st->execute([$c['id']]);
    $rows = $st->fetchAll();
    $paso = max(1, (int)ceil(count($rows) / 200));
    $out = [];
    foreach ($rows as $i => $r) {
        if ($i % $paso !== 0 && $i !== count($rows) - 1) continue;
        $out[] = ['ts' => $r['ts'], 't' => (float)$r['temp'], 'h' => (float)$r['hum'], 'tp' => $num($r['temp_prod'])];
    }
    $lecturas[$c['id']] = $out;
}

// Lotes en proceso
$lotes = [];
$porCam = [];
foreach ($camaras as $c) $porCam[$c['id']] = $c;

$curvaSt = $pdo->prepare(
  'SELECT DATE(ts) d, SUBSTRING_INDEX(GROUP_CONCAT(peso_g ORDER BY ts DESC), ",", 1) peso
     FROM lecturas WHERE camara_id = ? AND peso_g IS NOT NULL AND ts >= ?
    GROUP BY DATE(ts) ORDER BY d');
$fueraSt = $pdo->prepare(
  'SELECT COUNT(*) FROM lecturas WHERE camara_id = ? AND ts >= ?
     AND (temp < ? OR temp > ? OR hum < ? OR hum > ?)');

$lotesSt = $pdo->prepare("SELECT * FROM lotes WHERE empresa_id = ? AND estado = 'en_proceso' ORDER BY fecha_inicio");
$lotesSt->execute([$emp]);
foreach ($lotesSt->fetchAll() as $l) {
    $ini = (float)$l['peso_inicial_g'];
    $curvaSt->execute([$l['camara_id'], $l['fecha_inicio']]);
    $curva = [['dia' => 0, 'perdida' => 0]];
    $t0 = strtotime($l['fecha_inicio']);
    foreach ($curvaSt->fetchAll() as $r) {
        $dia = (int)round((strtotime($r['d']) - $t0) / 86400);
        if ($dia === 0) continue;
        $curva[] = ['dia' => $dia, 'perdida' => $ini > 0 ? round(($ini - (float)$r['peso']) / $ini * 100, 1) : 0];
    }
    $dia = (int)floor((time() - $t0) / 86400);
    $perdida = end($curva)['perdida'];

    $horas = 0;
    if (isset($porCam[$l['camara_id']])) {
        $c = $porCam[$l['camara_id']];
        $fueraSt->execute([$l['camara_id'], $l['fecha_inicio'], $c['t_min'], $c['t_max'], $c['h_min'], $c['h_max']]);
        $horas = round((int)$fueraSt->fetchColumn() * (int)(cfg()['intervalo_min'] ?? 5) / 60, 1);
    }

    $lotes[] = [
        'codigo' => $l['codigo'], 'producto' => $l['producto'], 'etapa' => $l['etapa'],
        'camara_id' => (int)$l['camara_id'], 'dia' => $dia, 'perdida' => (float)$perdida,
        'meta' => (float)$l['meta_perdida'], 'kg' => (float)$l['kg'], 'piezas' => $l['piezas'] === null ? null : (int)$l['piezas'],
        'fecha_inicio' => $l['fecha_inicio'], 'origen' => $l['origen'],
        'horas_fuera' => $horas, 'curva' => $curva,
    ];
}

// Alertas recientes
$alertas = [];
$st = $pdo->prepare('SELECT ts, nivel, mensaje FROM alertas WHERE empresa_id = ? ORDER BY ts DESC, id DESC LIMIT 10');
$st->execute([$emp]);
foreach ($st->fetchAll() as $a) {
    $hoy = date('Y-m-d') === substr($a['ts'], 0, 10);
    $alertas[] = ['nivel' => $a['nivel'], 'mensaje' => $a['mensaje'],
                  'hora' => ($hoy ? '' : date('d/m ', strtotime($a['ts']))) . substr($a['ts'], 11, 5)];
}

json_out(compact('empresa', 'camaras', 'lecturas', 'lotes', 'alertas'));

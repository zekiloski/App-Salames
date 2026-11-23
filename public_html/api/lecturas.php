<?php
// Recibe lecturas del ESP32.
// POST api/lecturas.php
// Header:  X-Device-Token: <token de la cámara>
// Body:    {"temp":13.4,"hum":80.2,"temp_prod":14.0,"peso_g":4821.5}
//      o   {"lecturas":[{"temp":..,"hum":..,"seg_atras":600}, ...]}  (lote de lecturas guardadas offline)
declare(strict_types=1);
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Usar POST'], 405);

$token = $_SERVER['HTTP_X_DEVICE_TOKEN'] ?? '';
if (strlen($token) < 20) json_out(['error' => 'Token faltante'], 401);

$st = db()->prepare('SELECT * FROM camaras WHERE device_token = ? AND activa = 1');
$st->execute([$token]);
$cam = $st->fetch();
if (!$cam) json_out(['error' => 'Token inválido'], 401);

$in = body_json();
$items = isset($in['lecturas']) && is_array($in['lecturas']) ? $in['lecturas'] : [$in];
if (count($items) > 500) json_out(['error' => 'Demasiadas lecturas'], 413);

// Si la empresa está suspendida se siguen guardando las lecturas (para no perder historial),
// pero el panel queda bloqueado hasta que se reactive la cuenta.
$ins = db()->prepare('INSERT INTO lecturas (camara_id, ts, temp, hum, temp_prod, peso_g) VALUES (?,?,?,?,?,?)');
$ok = 0; $ultima = null;
foreach ($items as $l) {
    if (!isset($l['temp'], $l['hum']) || !is_numeric($l['temp']) || !is_numeric($l['hum'])) continue;
    $t = (float)$l['temp']; $h = (float)$l['hum'];
    if ($t < -30 || $t > 60 || $h < 0 || $h > 100) continue;          // lectura imposible: se descarta
    $atras = isset($l['seg_atras']) ? max(0, (int)$l['seg_atras']) : 0;
    $ts = date('Y-m-d H:i:s', time() - $atras);
    $tp = isset($l['temp_prod']) && is_numeric($l['temp_prod']) ? (float)$l['temp_prod'] : null;
    $pg = isset($l['peso_g']) && is_numeric($l['peso_g']) && $l['peso_g'] > 0 ? (float)$l['peso_g'] : null;
    $ins->execute([$cam['id'], $ts, $t, $h, $tp, $pg]);
    $ok++;
    if ($atras === 0 || $ultima === null) $ultima = ['t' => $t, 'h' => $h];
}

if ($ok) db()->prepare('UPDATE camaras SET ultima_lectura = NOW() WHERE id = ?')->execute([$cam['id']]);

// Alertas de rango (con tiempo de espera para no repetir)
if ($ultima) {
    $prob = [];
    if ($ultima['t'] < $cam['t_min'] || $ultima['t'] > $cam['t_max'])
        $prob[] = sprintf('temperatura en %.1f °C (objetivo %s–%s)', $ultima['t'], (float)$cam['t_min'], (float)$cam['t_max']);
    if ($ultima['h'] < $cam['h_min'] || $ultima['h'] > $cam['h_max'])
        $prob[] = sprintf('humedad en %.0f %% (objetivo %s–%s)', $ultima['h'], (float)$cam['h_min'], (float)$cam['h_max']);

    $q = db()->prepare('SELECT nivel FROM alertas WHERE camara_id = ? ORDER BY ts DESC, id DESC LIMIT 1');
    $q->execute([$cam['id']]);
    $ultNivel = $q->fetchColumn();

    if ($prob) {
        $cd = (int)(cfg()['alerta_cooldown_min'] ?? 30);
        $r = db()->prepare("SELECT COUNT(*) FROM alertas WHERE camara_id = ? AND nivel = 'alta' AND ts > NOW() - INTERVAL ? MINUTE");
        $r->execute([$cam['id'], $cd]);
        if ((int)$r->fetchColumn() === 0) {
            db()->prepare("INSERT INTO alertas (empresa_id, camara_id, ts, nivel, mensaje) VALUES (?, ?, NOW(), 'alta', ?)")
                ->execute([$cam['empresa_id'], $cam['id'], $cam['nombre'] . ': ' . implode(' y ', $prob) . '.']);
            // Acá se puede sumar el aviso por WhatsApp / mail (ver README).
        }
    } elseif ($ultNivel === 'alta') {
        db()->prepare("INSERT INTO alertas (empresa_id, camara_id, ts, nivel, mensaje) VALUES (?, ?, NOW(), 'ok', ?)")
            ->execute([$cam['empresa_id'], $cam['id'], $cam['nombre'] . ': condiciones de vuelta en rango.']);
    }
}

json_out(['ok' => true, 'guardadas' => $ok]);

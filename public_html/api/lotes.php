<?php
// Alta y actualización de lotes (protegido con admin_key de config.php).
//
// Crear:
//   POST api/lotes.php   Header: X-Admin-Key: <clave>
//   {"codigo":"L-2611-01","producto":"Salame tipo Oncativo calibre 50","camara_id":2,
//    "etapa":"Estufado","fecha_inicio":"2026-11-23","kg":420,"peso_inicial_g":5200,
//    "meta_perdida":33,"origen":"Granja X, Oncativo"}
//
// Actualizar (mover de cámara, cambiar etapa o terminar):
//   {"accion":"actualizar","codigo":"L-2611-01","camara_id":1,"etapa":"Secado"}
//   {"accion":"actualizar","codigo":"L-2611-01","estado":"terminado"}
declare(strict_types=1);
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Usar POST'], 405);
if (!hash_equals((string)cfg()['admin_key'], $_SERVER['HTTP_X_ADMIN_KEY'] ?? '')) json_out(['error' => 'No autorizado'], 401);

$in = body_json();
$codigo = trim((string)($in['codigo'] ?? ''));
if ($codigo === '') json_out(['error' => 'Falta codigo'], 422);

if (($in['accion'] ?? '') === 'actualizar') {
    $campos = []; $vals = [];
    foreach (['camara_id', 'etapa', 'estado', 'meta_perdida', 'origen'] as $k) {
        if (array_key_exists($k, $in)) { $campos[] = "$k = ?"; $vals[] = $in[$k]; }
    }
    if (!$campos) json_out(['error' => 'Nada para actualizar'], 422);
    $vals[] = $codigo;
    $st = db()->prepare('UPDATE lotes SET ' . implode(', ', $campos) . ' WHERE codigo = ?');
    $st->execute($vals);
    json_out(['ok' => true, 'actualizados' => $st->rowCount()]);
}

foreach (['producto', 'camara_id', 'fecha_inicio', 'kg', 'peso_inicial_g'] as $k)
    if (empty($in[$k])) json_out(['error' => "Falta $k"], 422);

db()->prepare('INSERT INTO lotes (codigo, producto, camara_id, etapa, fecha_inicio, kg, peso_inicial_g, meta_perdida, origen)
               VALUES (?,?,?,?,?,?,?,?,?)')
    ->execute([$codigo, $in['producto'], (int)$in['camara_id'], $in['etapa'] ?? 'Estufado', $in['fecha_inicio'],
               (float)$in['kg'], (float)$in['peso_inicial_g'], (float)($in['meta_perdida'] ?? 33), $in['origen'] ?? null]);

json_out(['ok' => true, 'codigo' => $codigo], 201);

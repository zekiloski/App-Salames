<?php
// Alta y actualización de lotes de la empresa del usuario logueado.
// Un admin opera sobre un cliente agregando ?empresa_id=N a la URL.
//
// Crear:
//   POST api/lotes.php   (con sesión iniciada, Content-Type: application/json)
//   {"codigo":"L-2611-01","producto":"Salame tipo Oncativo calibre 50","camara_id":2,
//    "etapa":"Estufado","fecha_inicio":"2026-11-23","kg":420,"piezas":1200,"peso_inicial_g":5200,
//    "meta_perdida":33,"origen":"Granja X, Oncativo"}
//
// Actualizar (mover de cámara, cambiar etapa o terminar):
//   {"accion":"actualizar","codigo":"L-2611-01","camara_id":1,"etapa":"Secado"}
//   {"accion":"actualizar","codigo":"L-2611-01","estado":"terminado"}
declare(strict_types=1);
require __DIR__ . '/db.php';

exigir_json();
$u = usuario();
$emp = empresa_de($u);

$in = body_json();
$codigo = trim((string)($in['codigo'] ?? ''));
if ($codigo === '') json_out(['error' => 'Falta codigo'], 422);

// La cámara tiene que ser de la misma empresa
$camaraPropia = function ($id) use ($emp): int {
    $st = db()->prepare('SELECT id FROM camaras WHERE id = ? AND empresa_id = ?');
    $st->execute([(int)$id, $emp]);
    if (!$st->fetchColumn()) json_out(['error' => 'La cámara no existe o no es de esta empresa'], 422);
    return (int)$id;
};

if (($in['accion'] ?? '') === 'actualizar') {
    $campos = []; $vals = [];
    foreach (['camara_id', 'etapa', 'estado', 'meta_perdida', 'origen'] as $k) {
        if (!array_key_exists($k, $in)) continue;
        $campos[] = "$k = ?";
        $vals[] = $k === 'camara_id' ? $camaraPropia($in[$k]) : $in[$k];
    }
    if (!$campos) json_out(['error' => 'Nada para actualizar'], 422);
    if (isset($in['estado']) && !in_array($in['estado'], ['en_proceso', 'terminado'], true)) json_out(['error' => 'Estado inválido'], 422);
    array_push($vals, $codigo, $emp);
    $st = db()->prepare('UPDATE lotes SET ' . implode(', ', $campos) . ' WHERE codigo = ? AND empresa_id = ?');
    $st->execute($vals);
    json_out(['ok' => true, 'actualizados' => $st->rowCount()]);
}

$nombres = ['producto' => 'el producto', 'camara_id' => 'la cámara', 'fecha_inicio' => 'la fecha de embutido',
            'kg' => 'los kilos embutidos', 'peso_inicial_g' => 'el peso de la vara testigo'];
foreach ($nombres as $k => $txt)
    if (empty($in[$k])) json_out(['error' => "Falta $txt"], 422);

$positivo = fn($k) => is_numeric($in[$k]) && (float)$in[$k] > 0;
if (!$positivo('kg')) json_out(['error' => 'Los kilos embutidos tienen que ser un número mayor a 0'], 422);
if (!$positivo('peso_inicial_g')) json_out(['error' => 'El peso de la vara testigo tiene que ser un número mayor a 0'], 422);
$piezas = null;
if (isset($in['piezas']) && $in['piezas'] !== '') {
    if (!ctype_digit((string)$in['piezas']) || (int)$in['piezas'] < 1) json_out(['error' => 'La cantidad de piezas tiene que ser un número entero'], 422);
    $piezas = (int)$in['piezas'];
}
$fecha = DateTime::createFromFormat('Y-m-d', (string)$in['fecha_inicio']);
if (!$fecha || $fecha->format('Y-m-d') !== $in['fecha_inicio'] || $fecha > new DateTime('tomorrow'))
    json_out(['error' => 'La fecha de embutido no es válida'], 422);

$st = db()->prepare('SELECT 1 FROM lotes WHERE empresa_id = ? AND codigo = ?');
$st->execute([$emp, $codigo]);
if ($st->fetchColumn()) json_out(['error' => "Ya existe un lote con el código $codigo"], 409);

db()->prepare('INSERT INTO lotes (empresa_id, codigo, producto, camara_id, etapa, fecha_inicio, kg, piezas, peso_inicial_g, meta_perdida, origen)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    ->execute([$emp, $codigo, trim((string)$in['producto']), $camaraPropia($in['camara_id']), $in['etapa'] ?? 'Estufado', $in['fecha_inicio'],
               (float)$in['kg'], $piezas, (float)$in['peso_inicial_g'], (float)($in['meta_perdida'] ?? 33), trim((string)($in['origen'] ?? '')) ?: null]);

json_out(['ok' => true, 'codigo' => $codigo], 201);

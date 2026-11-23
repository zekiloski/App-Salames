<?php
// Panel de administrador (solo rol admin).
// GET  api/admin.php                      → empresas, cámaras (con estado de conexión) y usuarios
// POST api/admin.php {"accion": ...}      → altas y cambios:
//   empresa_crear   {nombre, contacto}
//   empresa_estado  {id, estado: "activa"|"suspendida"}
//   usuario_crear   {empresa_id, email, nombre, password?}   (sin password se genera una)
//   usuario_clave   {id}                                     (genera una contraseña nueva)
//   usuario_activo  {id, activo: true|false}
//   camara_crear    {empresa_id, nombre, etapa, t_min, t_max, h_min, h_max}  (devuelve el token del ESP32)
//   camara_editar   {id, nombre?, etapa?, t_min?, t_max?, h_min?, h_max?, activa?}
//   camara_token    {id}                                     (token nuevo: hay que recargar el ESP32)
declare(strict_types=1);
require __DIR__ . '/db.php';

$yo = usuario(true);
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $sinDatos = (int)(cfg()['sin_datos_min'] ?? 30);
    $camaras = $pdo->query(
        "SELECT c.id, c.empresa_id, e.nombre empresa, c.nombre, c.etapa, c.t_min, c.t_max, c.h_min, c.h_max,
                c.activa, c.ultima_lectura,
                (c.ultima_lectura IS NULL OR c.ultima_lectura < NOW() - INTERVAL $sinDatos MINUTE) sin_datos
           FROM camaras c JOIN empresas e ON e.id = c.empresa_id ORDER BY e.nombre, c.id")->fetchAll();
    foreach ($camaras as &$c) {
        foreach (['t_min','t_max','h_min','h_max'] as $k) $c[$k] = (float)$c[$k];
        $c['activa'] = (bool)$c['activa']; $c['sin_datos'] = (bool)$c['sin_datos'];
    }
    unset($c);
    $empresas = $pdo->query(
        'SELECT e.id, e.nombre, e.contacto, e.estado, e.creada,
                (SELECT COUNT(*) FROM camaras c WHERE c.empresa_id = e.id AND c.activa = 1) camaras,
                (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.activo = 1) usuarios
           FROM empresas e ORDER BY e.nombre')->fetchAll();
    $usuarios = $pdo->query(
        "SELECT u.id, u.empresa_id, u.email, u.nombre, u.activo, u.ultimo_login
           FROM usuarios u WHERE u.rol = 'cliente' ORDER BY u.empresa_id, u.nombre")->fetchAll();
    foreach ($usuarios as &$x) $x['activo'] = (bool)$x['activo'];
    unset($x);
    json_out(['sin_datos_min' => $sinDatos] + compact('empresas', 'camaras', 'usuarios'));
}

exigir_json();
$in = body_json();
$id = (int)($in['id'] ?? 0);
$clave = fn() => substr(strtr(base64_encode(random_bytes(12)), '+/', 'xy'), 0, 14);
$existe = function (string $tabla, int $id) use ($pdo): void {
    $st = $pdo->prepare("SELECT 1 FROM $tabla WHERE id = ?");
    $st->execute([$id]);
    if (!$st->fetchColumn()) json_out(['error' => 'No existe'], 404);
};
$rangos = function (array $in, bool $obligatorio): array {
    $out = [];
    foreach (['t_min', 't_max', 'h_min', 'h_max'] as $k) {
        if (!array_key_exists($k, $in)) { if ($obligatorio) json_out(['error' => "Falta $k"], 422); continue; }
        if (!is_numeric($in[$k])) json_out(['error' => "$k tiene que ser un número"], 422);
        $out[$k] = (float)$in[$k];
    }
    return $out;
};

switch ($in['accion'] ?? '') {
case 'empresa_crear':
    $nombre = trim((string)($in['nombre'] ?? ''));
    if ($nombre === '') json_out(['error' => 'Falta nombre'], 422);
    $pdo->prepare('INSERT INTO empresas (nombre, contacto) VALUES (?, ?)')->execute([$nombre, trim((string)($in['contacto'] ?? '')) ?: null]);
    json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId()], 201);

case 'empresa_estado':
    if (!in_array($in['estado'] ?? '', ['activa', 'suspendida'], true)) json_out(['error' => 'Estado inválido'], 422);
    $existe('empresas', $id);
    $pdo->prepare('UPDATE empresas SET estado = ? WHERE id = ?')->execute([$in['estado'], $id]);
    json_out(['ok' => true]);

case 'usuario_crear':
    $emp = (int)($in['empresa_id'] ?? 0);
    $existe('empresas', $emp);
    $email = strtolower(trim((string)($in['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['error' => 'Mail inválido'], 422);
    $pass = (string)($in['password'] ?? '') ?: $clave();
    if (strlen($pass) < 8) json_out(['error' => 'La contraseña tiene que tener al menos 8 caracteres'], 422);
    $st = $pdo->prepare('SELECT 1 FROM usuarios WHERE email = ?');
    $st->execute([$email]);
    if ($st->fetchColumn()) json_out(['error' => 'Ya existe un usuario con ese mail'], 409);
    $pdo->prepare("INSERT INTO usuarios (empresa_id, email, nombre, pass_hash, rol) VALUES (?, ?, ?, ?, 'cliente')")
        ->execute([$emp, $email, trim((string)($in['nombre'] ?? '')) ?: $email, password_hash($pass, PASSWORD_DEFAULT)]);
    json_out(['ok' => true, 'email' => $email, 'password' => $pass], 201);

case 'usuario_clave':
    $existe('usuarios', $id);
    $pass = $clave();
    $pdo->prepare("UPDATE usuarios SET pass_hash = ?, fallos = 0, bloqueado_hasta = NULL WHERE id = ? AND rol = 'cliente'")
        ->execute([password_hash($pass, PASSWORD_DEFAULT), $id]);
    json_out(['ok' => true, 'password' => $pass]);

case 'usuario_activo':
    $existe('usuarios', $id);
    $pdo->prepare("UPDATE usuarios SET activo = ? WHERE id = ? AND rol = 'cliente'")->execute([empty($in['activo']) ? 0 : 1, $id]);
    json_out(['ok' => true]);

case 'camara_crear':
    $emp = (int)($in['empresa_id'] ?? 0);
    $existe('empresas', $emp);
    $nombre = trim((string)($in['nombre'] ?? ''));
    if ($nombre === '') json_out(['error' => 'Falta nombre'], 422);
    $r = $rangos($in, true);
    $token = bin2hex(random_bytes(24));
    $pdo->prepare('INSERT INTO camaras (empresa_id, nombre, etapa, t_min, t_max, h_min, h_max, device_token) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$emp, $nombre, trim((string)($in['etapa'] ?? '')) ?: 'Secado', $r['t_min'], $r['t_max'], $r['h_min'], $r['h_max'], $token]);
    json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId(), 'device_token' => $token], 201);

case 'camara_editar':
    $existe('camaras', $id);
    $set = $rangos($in, false);
    foreach (['nombre', 'etapa'] as $k) if (isset($in[$k]) && trim((string)$in[$k]) !== '') $set[$k] = trim((string)$in[$k]);
    if (array_key_exists('activa', $in)) $set['activa'] = empty($in['activa']) ? 0 : 1;
    if (!$set) json_out(['error' => 'Nada para actualizar'], 422);
    $pdo->prepare('UPDATE camaras SET ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($set))) . ' WHERE id = ?')
        ->execute([...array_values($set), $id]);
    json_out(['ok' => true]);

case 'camara_token':
    $existe('camaras', $id);
    $token = bin2hex(random_bytes(24));
    $pdo->prepare('UPDATE camaras SET device_token = ? WHERE id = ?')->execute([$token, $id]);
    json_out(['ok' => true, 'device_token' => $token]);
}

json_out(['error' => 'Acción desconocida'], 422);

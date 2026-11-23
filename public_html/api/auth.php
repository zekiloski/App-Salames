<?php
// Inicio y cierre de sesión.
// GET  api/auth.php                                  → usuario actual (401 si no hay sesión)
// POST api/auth.php {"email":"..","password":".."}   → inicia sesión
// POST api/auth.php {"accion":"salir"}               → cierra sesión
declare(strict_types=1);
require __DIR__ . '/db.php';

$publico = fn($u) => ['nombre' => $u['nombre'], 'email' => $u['email'], 'rol' => $u['rol'], 'empresa' => $u['empresa']];

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out($publico(usuario()));

exigir_json();
sesion();
$in = body_json();

if (($in['accion'] ?? '') === 'salir') {
    $_SESSION = [];
    session_destroy();
    json_out(['ok' => true]);
}

$email = strtolower(trim((string)($in['email'] ?? '')));
$pass  = (string)($in['password'] ?? '');
if ($email === '' || $pass === '') json_out(['error' => 'Completá mail y contraseña'], 422);

$st = db()->prepare('SELECT * FROM usuarios WHERE email = ?');
$st->execute([$email]);
$u = $st->fetch();

if ($u && $u['bloqueado_hasta'] && strtotime($u['bloqueado_hasta']) > time())
    json_out(['error' => 'Demasiados intentos. Probá de nuevo en unos minutos.'], 429);

if (!$u || !$u['activo'] || !password_verify($pass, $u['pass_hash'])) {
    if ($u) {
        // 5 fallos seguidos → 15 minutos de bloqueo
        db()->prepare('UPDATE usuarios SET fallos = fallos + 1,
                         bloqueado_hasta = IF(fallos >= 5, NOW() + INTERVAL 15 MINUTE, NULL),
                         fallos = IF(fallos >= 5, 0, fallos) WHERE id = ?')->execute([$u['id']]);
    } else {
        password_hash($pass, PASSWORD_DEFAULT); // tarda lo mismo que verificar: no revela qué mails existen
    }
    json_out(['error' => 'Mail o contraseña incorrectos'], 401);
}

if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT))
    db()->prepare('UPDATE usuarios SET pass_hash = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
db()->prepare('UPDATE usuarios SET fallos = 0, bloqueado_hasta = NULL, ultimo_login = NOW() WHERE id = ?')->execute([$u['id']]);

session_regenerate_id(true);
$_SESSION['uid'] = (int)$u['id'];
json_out($publico(usuario()));

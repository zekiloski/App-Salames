<?php
declare(strict_types=1);

function cfg(): array {
    static $c = null;
    if ($c === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            json_out(['error' => 'Falta api/config.php (copiá config.example.php)'], 500);
        }
        $c = require $file;
        date_default_timezone_set($c['timezone'] ?? 'America/Argentina/Cordoba');
    }
    return $c;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $c = cfg();
        $pdo = new PDO(
            "mysql:host={$c['db_host']};dbname={$c['db_name']};charset=utf8mb4",
            $c['db_user'], $c['db_pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES => false]
        );
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    }
    return $pdo;
}

function json_out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function body_json(): array {
    $d = json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($d) ? $d : [];
}

set_exception_handler(function (Throwable $e) {
    error_log('[salame-monitor] ' . $e->getMessage());
    json_out(['error' => 'Error interno'], 500);
});

/* ---------- Sesión de usuario ---------- */

function sesion(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.gc_maxlifetime', '43200');   // 12 h sin actividad
    ini_set('session.use_strict_mode', '1');
    session_name('salame_sid');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => !empty($_SERVER['HTTPS']),
                               'httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

// Usuario logueado, releído de la base en cada pedido para que una suspensión o baja
// tenga efecto en el momento. Corta con 401/403 si no corresponde.
function usuario(bool $soloAdmin = false): array {
    sesion();
    $uid = $_SESSION['uid'] ?? null;
    if (!$uid) json_out(['error' => 'No hay sesión iniciada'], 401);
    $st = db()->prepare('SELECT u.id, u.empresa_id, u.email, u.nombre, u.rol, u.activo,
                                e.nombre empresa, e.estado empresa_estado
                           FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.id = ?');
    $st->execute([$uid]);
    $u = $st->fetch();
    if (!$u || !$u['activo']) { session_destroy(); json_out(['error' => 'Usuario inexistente o dado de baja'], 401); }
    if ($u['rol'] === 'cliente' && $u['empresa_estado'] !== 'activa')
        json_out(['error' => 'Cuenta suspendida. Comunicate con el proveedor del servicio.', 'suspendida' => true], 403);
    if ($soloAdmin && $u['rol'] !== 'admin') json_out(['error' => 'Solo para administradores'], 403);
    $u['empresa_id'] = $u['empresa_id'] === null ? null : (int)$u['empresa_id'];
    return $u;
}

// Empresa sobre la que opera el pedido. Un admin puede elegir cualquiera con ?empresa_id=.
function empresa_de(array $u): int {
    if ($u['rol'] === 'admin') {
        $id = (int)($_GET['empresa_id'] ?? 0);
        if ($id <= 0) json_out(['error' => 'Falta empresa_id'], 422);
        return $id;
    }
    return $u['empresa_id'];
}

// Los POST con sesión tienen que venir como JSON: un formulario de otro sitio no puede mandar
// ese Content-Type sin permiso del navegador (protección contra CSRF).
function exigir_json(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Usar POST'], 405);
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) json_out(['error' => 'Content-Type inválido'], 415);
}

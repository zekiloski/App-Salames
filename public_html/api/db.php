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

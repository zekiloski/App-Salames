<?php
// Crea el primer usuario administrador. Abrir en el navegador: https://tudominio.com/api/setup.php
// Pide la setup_key de config.php y deja de funcionar en cuanto existe un admin.
declare(strict_types=1);
require __DIR__ . '/db.php';

$hayAdmin = (int)db()->query("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin'")->fetchColumn() > 0;
$msg = '';

if (!$hayAdmin && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $key   = (string)($_POST['setup_key'] ?? '');
    $email = strtolower(trim((string)($_POST['email'] ?? '')));
    $nom   = trim((string)($_POST['nombre'] ?? ''));
    $pass  = (string)($_POST['password'] ?? '');
    $setup = (string)(cfg()['setup_key'] ?? '');
    if ($setup === '' || str_starts_with($setup, 'CAMBIAR') || !hash_equals($setup, $key)) $msg = 'Clave de instalación incorrecta.';
    elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) $msg = 'Mail inválido.';
    elseif (strlen($pass) < 10) $msg = 'La contraseña tiene que tener al menos 10 caracteres.';
    else {
        db()->prepare("INSERT INTO usuarios (empresa_id, email, nombre, pass_hash, rol) VALUES (NULL, ?, ?, ?, 'admin')")
            ->execute([$email, $nom ?: 'Administrador', password_hash($pass, PASSWORD_DEFAULT)]);
        $hayAdmin = true;
        $msg = 'Listo. Ya podés entrar en admin.html.';
    }
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
$h = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?><!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Salame Monitor · Instalación</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px}
label{display:block;margin-top:12px}input{width:100%;font:inherit;padding:8px;box-sizing:border-box}
button{margin-top:16px;font:inherit;padding:10px 16px}.msg{font-weight:600}</style></head><body>
<h1>Primer administrador</h1>
<?php if ($msg): ?><p class="msg"><?= $h($msg) ?></p><?php endif; ?>
<?php if ($hayAdmin): ?>
  <p>Ya existe un administrador. <a href="../admin.html">Ir al panel de administrador</a>.</p>
<?php else: ?>
<form method="post">
  <label>Clave de instalación (setup_key de config.php)<input name="setup_key" type="password" required></label>
  <label>Tu nombre<input name="nombre"></label>
  <label>Mail<input name="email" type="email" required></label>
  <label>Contraseña (mínimo 10 caracteres)<input name="password" type="password" minlength="10" required></label>
  <button>Crear administrador</button>
</form>
<?php endif; ?>
</body></html>

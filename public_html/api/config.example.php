<?php
// Copiá este archivo como config.php y completá los datos de tu base en Hostinger
// (hPanel > Bases de datos > MySQL). config.php NO se sube a Git.
return [
    'db_host'   => 'localhost',
    'db_name'   => 'u000000000_salame',
    'db_user'   => 'u000000000_salame',
    'db_pass'   => 'CAMBIAR',
    // Clave para crear el primer administrador desde api/setup.php (cualquier texto largo y secreto).
    // Después de crearlo podés borrarla: setup.php deja de funcionar cuando ya existe un admin.
    'setup_key' => 'CAMBIAR-por-una-clave-larga',
    'timezone'  => 'America/Argentina/Cordoba',
    // Minutos entre alertas repetidas de la misma cámara
    'alerta_cooldown_min' => 30,
    // Cada cuántos minutos manda datos el ESP32 (para calcular horas fuera de rango)
    'intervalo_min' => 5,
    // Minutos sin datos para considerar que un equipo está caído (panel de administrador)
    'sin_datos_min' => 30,
];

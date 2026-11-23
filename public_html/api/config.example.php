<?php
// Copiá este archivo como config.php y completá los datos de tu base en Hostinger
// (hPanel > Bases de datos > MySQL). config.php NO se sube a Git.
return [
    'db_host'   => 'localhost',
    'db_name'   => 'u000000000_salame',
    'db_user'   => 'u000000000_salame',
    'db_pass'   => 'CAMBIAR',
    // Clave para cargar y editar lotes desde api/lotes.php (cualquier texto largo y secreto)
    'admin_key' => 'CAMBIAR-por-una-clave-larga',
    'timezone'  => 'America/Argentina/Cordoba',
    // Minutos entre alertas repetidas de la misma cámara
    'alerta_cooldown_min' => 30,
    // Cada cuántos minutos manda datos el ESP32 (para calcular horas fuera de rango)
    'intervalo_min' => 5,
];

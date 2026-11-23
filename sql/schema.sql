-- Salame Monitor - esquema MySQL / MariaDB (Hostinger)
-- Importar desde phpMyAdmin: Bases de datos > tu base > Importar > este archivo.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS camaras (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(80)  NOT NULL,
  etapa         VARCHAR(40)  NOT NULL DEFAULT 'Secado',
  t_min         DECIMAL(4,1) NOT NULL,
  t_max         DECIMAL(4,1) NOT NULL,
  h_min         DECIMAL(4,1) NOT NULL,
  h_max         DECIMAL(4,1) NOT NULL,
  device_token  VARCHAR(64)  NOT NULL UNIQUE,   -- clave que usa el ESP32 de esta cámara
  activa        TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lecturas (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  camara_id  INT UNSIGNED NOT NULL,
  ts         DATETIME     NOT NULL,
  temp       DECIMAL(4,1) NOT NULL,             -- °C aire
  hum        DECIMAL(4,1) NOT NULL,             -- % HR
  temp_prod  DECIMAL(4,1) NULL,                 -- °C interior pieza testigo
  peso_g     DECIMAL(8,1) NULL,                 -- gramos de la vara testigo
  INDEX idx_cam_ts (camara_id, ts),
  FOREIGN KEY (camara_id) REFERENCES camaras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lotes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo          VARCHAR(30)  NOT NULL UNIQUE,
  producto        VARCHAR(120) NOT NULL,
  camara_id       INT UNSIGNED NOT NULL,
  etapa           VARCHAR(40)  NOT NULL DEFAULT 'Estufado',
  fecha_inicio    DATE         NOT NULL,
  kg              DECIMAL(8,1) NOT NULL,
  peso_inicial_g  DECIMAL(8,1) NOT NULL,         -- peso de la vara testigo el día 0
  meta_perdida    DECIMAL(4,1) NOT NULL DEFAULT 33.0,
  origen          VARCHAR(160) NULL,
  estado          ENUM('en_proceso','terminado') NOT NULL DEFAULT 'en_proceso',
  FOREIGN KEY (camara_id) REFERENCES camaras(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alertas (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  camara_id  INT UNSIGNED NULL,
  ts         DATETIME NOT NULL,
  nivel      ENUM('info','ok','alta') NOT NULL DEFAULT 'info',
  mensaje    VARCHAR(255) NOT NULL,
  INDEX idx_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Datos iniciales de ejemplo. Cambiá los tokens antes de usar en producción
-- (generá uno con: SELECT SHA1(RAND()); o cualquier texto de 30 a 64 caracteres).
-- ---------------------------------------------------------------
INSERT INTO camaras (nombre, etapa, t_min, t_max, h_min, h_max, device_token) VALUES
 ('Cámara 1 · Secado',          'Secado',          12, 15, 75, 85, 'CAMBIAR-token-camara-1-000000000000000001'),
 ('Cámara 2 · Estufado',        'Estufado',        20, 24, 88, 95, 'CAMBIAR-token-camara-2-000000000000000002'),
 ('Cámara 3 · Estacionamiento', 'Estacionamiento', 10, 14, 70, 80, 'CAMBIAR-token-camara-3-000000000000000003');

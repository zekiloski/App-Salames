-- Salame Monitor - esquema MySQL / MariaDB (Hostinger)
-- Una sola app para varios salameros: cada empresa ve solo sus cámaras y lotes.
-- Importar desde phpMyAdmin: Bases de datos > tu base > Importar > este archivo.
-- (Si ya tenías instalada la versión de un solo salamero, usá migracion_multiempresa.sql.)

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS empresas (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(120) NOT NULL,
  contacto  VARCHAR(160) NULL,                   -- teléfono / mail del responsable
  estado    ENUM('activa','suspendida') NOT NULL DEFAULT 'activa',
  creada    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- rol 'admin' = vos (empresa_id NULL, ve todo). rol 'cliente' = usuario de una empresa.
CREATE TABLE IF NOT EXISTS usuarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id      INT UNSIGNED NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  nombre          VARCHAR(120) NOT NULL,
  pass_hash       VARCHAR(255) NOT NULL,
  rol             ENUM('admin','cliente') NOT NULL DEFAULT 'cliente',
  activo          TINYINT(1) NOT NULL DEFAULT 1,
  fallos          TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- intentos de login fallidos seguidos
  bloqueado_hasta DATETIME NULL,
  ultimo_login    DATETIME NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS camaras (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  etapa          VARCHAR(40)  NOT NULL DEFAULT 'Secado',
  t_min          DECIMAL(4,1) NOT NULL,
  t_max          DECIMAL(4,1) NOT NULL,
  h_min          DECIMAL(4,1) NOT NULL,
  h_max          DECIMAL(4,1) NOT NULL,
  device_token   VARCHAR(64)  NOT NULL UNIQUE,   -- clave que usa el ESP32 de esta cámara
  activa         TINYINT(1)   NOT NULL DEFAULT 1,
  ultima_lectura DATETIME     NULL,              -- para detectar equipos que dejaron de mandar
  INDEX idx_emp (empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
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
  empresa_id      INT UNSIGNED NOT NULL,
  codigo          VARCHAR(30)  NOT NULL,
  producto        VARCHAR(120) NOT NULL,
  camara_id       INT UNSIGNED NOT NULL,
  etapa           VARCHAR(40)  NOT NULL DEFAULT 'Estufado',
  fecha_inicio    DATE         NOT NULL,
  kg              DECIMAL(8,1) NOT NULL,
  peso_inicial_g  DECIMAL(8,1) NOT NULL,         -- peso de la vara testigo el día 0
  meta_perdida    DECIMAL(4,1) NOT NULL DEFAULT 33.0,
  origen          VARCHAR(160) NULL,
  estado          ENUM('en_proceso','terminado') NOT NULL DEFAULT 'en_proceso',
  UNIQUE KEY uq_emp_codigo (empresa_id, codigo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (camara_id) REFERENCES camaras(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alertas (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT UNSIGNED NOT NULL,
  camara_id  INT UNSIGNED NULL,
  ts         DATETIME NOT NULL,
  nivel      ENUM('info','ok','alta') NOT NULL DEFAULT 'info',
  mensaje    VARCHAR(255) NOT NULL,
  INDEX idx_emp_ts (empresa_id, ts),
  INDEX idx_cam_ts (camara_id, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Las empresas, usuarios y cámaras se cargan desde el panel de administrador (admin.html).
-- El primer usuario administrador se crea abriendo api/setup.php (ver README).

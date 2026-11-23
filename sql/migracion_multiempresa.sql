-- Pasa una base de la versión de un solo salamero a la versión multiempresa.
-- Todo lo que ya existe (cámaras, lotes, alertas) queda en una empresa nueva llamada "Mi empresa".
-- Hacé un respaldo antes (phpMyAdmin > Exportar). Correr una sola vez.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS empresas (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(120) NOT NULL,
  contacto  VARCHAR(160) NULL,
  estado    ENUM('activa','suspendida') NOT NULL DEFAULT 'activa',
  creada    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id      INT UNSIGNED NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  nombre          VARCHAR(120) NOT NULL,
  pass_hash       VARCHAR(255) NOT NULL,
  rol             ENUM('admin','cliente') NOT NULL DEFAULT 'cliente',
  activo          TINYINT(1) NOT NULL DEFAULT 1,
  fallos          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  ultimo_login    DATETIME NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO empresas (nombre) VALUES ('Mi empresa');
SET @emp = LAST_INSERT_ID();

ALTER TABLE camaras
  ADD COLUMN empresa_id INT UNSIGNED NULL AFTER id,
  ADD COLUMN ultima_lectura DATETIME NULL;
UPDATE camaras SET empresa_id = @emp;
UPDATE camaras c SET ultima_lectura = (SELECT MAX(ts) FROM lecturas l WHERE l.camara_id = c.id);
ALTER TABLE camaras
  MODIFY empresa_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_emp (empresa_id),
  ADD FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

ALTER TABLE lotes ADD COLUMN empresa_id INT UNSIGNED NULL AFTER id;
UPDATE lotes SET empresa_id = @emp;
ALTER TABLE lotes
  MODIFY empresa_id INT UNSIGNED NOT NULL,
  DROP INDEX codigo,
  ADD UNIQUE KEY uq_emp_codigo (empresa_id, codigo),
  ADD FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

ALTER TABLE alertas ADD COLUMN empresa_id INT UNSIGNED NULL AFTER id;
UPDATE alertas SET empresa_id = @emp;
ALTER TABLE alertas
  MODIFY empresa_id INT UNSIGNED NOT NULL,
  DROP INDEX idx_ts,
  ADD INDEX idx_emp_ts (empresa_id, ts),
  ADD INDEX idx_cam_ts (camara_id, ts);

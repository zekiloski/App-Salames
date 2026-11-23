-- Agrega la cantidad de piezas a los lotes (para bases instaladas antes de este cambio).
-- Correr una sola vez desde phpMyAdmin > SQL.
ALTER TABLE lotes ADD COLUMN piezas INT UNSIGNED NULL AFTER kg;

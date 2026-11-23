# Salame Monitor

Control de secado y trazabilidad para chacinadores de Oncativo.
Panel web + API PHP/MySQL + firmware ESP32. Pensado para hosting compartido de **Hostinger**.

- Si la API no tiene datos (o no responde), el panel arranca solo en **modo demo** con datos simulados. Sirve para mostrarlo a clientes antes de instalar sensores.
- Cuando el ESP32 empieza a mandar lecturas, el panel pasa a **Datos en vivo** y se actualiza cada 60 segundos.

## Estructura

```
salame-monitor/
├── public_html/              ← esto es lo que se sube a Hostinger
│   ├── index.html
│   ├── .htaccess             (fuerza HTTPS)
│   ├── assets/  style.css, app.js
│   └── api/
│       ├── config.example.php   (copiar como config.php — NO va a Git)
│       ├── db.php
│       ├── estado.php        GET  → datos del panel
│       ├── lecturas.php      POST → recibe lecturas del ESP32
│       ├── lotes.php         POST → alta / cambio de lotes (con clave admin)
│       └── .htaccess         (bloquea config.php y db.php)
├── sql/schema.sql            tablas + 3 cámaras de ejemplo
└── firmware/salame_esp32/    código del ESP32 (Arduino IDE)
```

## 1. Subir a GitHub

```bash
cd salame-monitor
git remote add origin https://github.com/TU_USUARIO/salame-monitor.git
git branch -M main
git push -u origin main
```

(El repo ya viene inicializado con el primer commit. Crealo vacío en GitHub, sin README.)

## 2. Base de datos en Hostinger

1. hPanel → **Bases de datos → MySQL** → crear base, usuario y contraseña.
2. Abrir **phpMyAdmin** → elegir la base → **Importar** → `sql/schema.sql`.
3. En la tabla `camaras`, cambiar los `device_token` por claves propias (30 a 64 caracteres, por ejemplo con `SELECT SHA1(RAND());`) y ajustar nombres y rangos de cada cámara.

## 3. Subir los archivos

**Opción A — Git desde hPanel (recomendado):**
hPanel → **Avanzado → Git** → repositorio `https://github.com/TU_USUARIO/salame-monitor.git`, rama `main`, directorio de instalación vacío.
Como el código está dentro de `public_html/`, lo más simple es instalarlo en un subdominio (por ejemplo `salame.tudominio.com`) cuya carpeta raíz apunte a `.../salame-monitor/public_html`.
Para repos privados, hPanel te da una clave SSH para agregar en GitHub (Settings → Deploy keys).

**Opción B — Administrador de archivos / FTP:** subir el **contenido** de `public_html/` a la carpeta `public_html` del dominio o subdominio.

## 4. Configurar

En el servidor, dentro de `api/`, copiar `config.example.php` como `config.php` y completar:

```php
'db_name'   => 'u123456789_salame',
'db_user'   => 'u123456789_salame',
'db_pass'   => '...',
'admin_key' => 'una-clave-larga-y-secreta',
```

`config.php` está en `.gitignore`: no se sube a GitHub y el despliegue por Git no lo pisa.

Probar: `https://tudominio.com/api/estado.php` tiene que devolver un JSON con las 3 cámaras.

## 5. Cargar un lote

```bash
curl -X POST https://tudominio.com/api/lotes.php \
  -H "X-Admin-Key: TU_CLAVE" -H "Content-Type: application/json" \
  -d '{"codigo":"L-2611-01","producto":"Salame tipo Oncativo calibre 50","camara_id":2,
       "etapa":"Estufado","fecha_inicio":"2026-11-23","kg":420,"peso_inicial_g":5200,
       "meta_perdida":33,"origen":"Granja X, Oncativo"}'
```

Pasar el lote a secado (otra cámara):

```bash
-d '{"accion":"actualizar","codigo":"L-2611-01","camara_id":1,"etapa":"Secado"}'
```

Terminarlo: `{"accion":"actualizar","codigo":"L-2611-01","estado":"terminado"}`.
`peso_inicial_g` es lo que pesa la **vara testigo** el día 0: con eso se calcula la pérdida de peso.

## 6. ESP32

Materiales por cámara: ESP32, sensor SHT31/SHT45 con carcasa, sonda DS18B20 inoxidable + resistencia 4,7 kΩ, celda de carga (5–20 kg) + HX711, fuente 5 V, caja IP65.

| Sensor  | Pin ESP32 |
|---------|-----------|
| SHT31 SDA / SCL | 21 / 22 |
| DS18B20 datos   | 4 (4,7 kΩ a 3,3 V) |
| HX711 DT / SCK  | 16 / 17 |

1. Abrir `firmware/salame_esp32/salame_esp32.ino` en Arduino IDE, instalar las librerías del encabezado.
2. Completar `WIFI_SSID`, `WIFI_PASS`, `API_URL` (`https://tudominio.com/api/lecturas.php`) y `DEVICE_TOKEN` (el de esa cámara).
3. **Calibrar la balanza:** con la vara vacía colgada, leer el valor crudo (`balanza.read_average(20)`) y ponerlo en `CAL_OFFSET`. Después colgar un peso conocido (ej. 2000 g) y ajustar `CAL_FACTOR` hasta que marque 2000.
4. Cargar el programa. Manda datos cada 5 minutos; si se corta internet guarda hasta ~20 h de lecturas y las manda juntas al volver.

Prueba manual sin ESP32:

```bash
curl -X POST https://tudominio.com/api/lecturas.php \
  -H "X-Device-Token: TOKEN_DE_LA_CAMARA" -H "Content-Type: application/json" \
  -d '{"temp":13.4,"hum":80.5,"temp_prod":14.0,"peso_g":4800}'
```

## Alertas

`lecturas.php` crea una alerta cuando la temperatura o la humedad salen del rango de la cámara (una cada 30 min como máximo) y otra cuando vuelven. Para avisar por WhatsApp o mail, agregar el envío donde dice `// Acá se puede sumar el aviso` en `api/lecturas.php`.

## Pendientes para producción

- Proteger el panel con usuario y contraseña (hoy `estado.php` es de lectura pública para quien tenga la URL). La opción rápida es la protección de carpeta de hPanel, dejando libre `api/lecturas.php` para el ESP32.
- Pantalla para cargar lotes desde el panel (hoy se hace con `api/lotes.php`).
- Página pública por lote para el QR de la etiqueta.
- Cargar el certificado raíz en el ESP32 en lugar de `setInsecure()`.
- Borrar lecturas viejas (ej. más de 1 año) con una tarea programada de hPanel.

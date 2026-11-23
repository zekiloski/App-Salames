# Salame Monitor

Control de secado y trazabilidad para chacinadores de Oncativo.
**Una sola app para todos los salameros:** cada empresa entra con su usuario y ve solo sus cámaras y lotes.
Panel web + API PHP/MySQL + firmware ESP32. Pensado para hosting compartido de **Hostinger**.

- Cada salamero (empresa) tiene sus usuarios, cámaras y lotes. Nadie ve los datos de otro.
- Vos entrás como **administrador** (`admin.html`): das de alta clientes, usuarios y cámaras, ves qué equipos dejaron de mandar datos y suspendés la cuenta de quien no paga.
- En la pantalla de ingreso está el botón **Ver demo**, con datos simulados, para mostrarle el sistema a un cliente sin instalar nada.

## Estructura

```
App-Salames/
├── public_html/              ← esto es lo que se sube a Hostinger
│   ├── index.html            panel del salamero (pide usuario y contraseña)
│   ├── admin.html            panel de administrador
│   ├── .htaccess             (fuerza HTTPS)
│   ├── assets/  style.css, app.js, admin.js
│   └── api/
│       ├── config.example.php   (copiar como config.php — NO va a Git)
│       ├── db.php            conexión + sesión de usuario
│       ├── auth.php          GET/POST → iniciar y cerrar sesión
│       ├── setup.php         crea el primer administrador (una sola vez)
│       ├── estado.php        GET  → datos del panel de la empresa logueada
│       ├── lecturas.php      POST → recibe lecturas del ESP32
│       ├── lotes.php         POST → alta / cambio de lotes de la empresa logueada
│       ├── admin.php         GET/POST → empresas, usuarios y cámaras (solo admin)
│       └── .htaccess         (bloquea config.php y db.php)
├── sql/
│   ├── schema.sql                  tablas (instalación nueva)
│   └── migracion_multiempresa.sql  para pasar una base de la versión de un solo salamero
└── firmware/salame_esp32/    código del ESP32 (Arduino IDE)
```

## 1. GitHub

El repo es https://github.com/zekiloski/App-Salames. Para subir cambios: `git push`.

## 2. Base de datos en Hostinger

1. hPanel → **Bases de datos → MySQL** → crear base, usuario y contraseña.
2. Abrir **phpMyAdmin** → elegir la base → **Importar** → `sql/schema.sql`.

Si ya tenías instalada la versión anterior (un solo salamero), en lugar de `schema.sql` importá `sql/migracion_multiempresa.sql` (después de hacer un respaldo). Todo lo que ya tenías queda en una empresa llamada "Mi empresa", que después podés renombrar.

## 3. Subir los archivos

**Opción A — Git desde hPanel (recomendado):**
hPanel → **Avanzado → Git** → repositorio `https://github.com/zekiloski/App-Salames.git`, rama `main`, directorio de instalación vacío.
Como el código está dentro de `public_html/`, lo más simple es instalarlo en un subdominio (por ejemplo `salame.tudominio.com`) cuya carpeta raíz apunte a `.../App-Salames/public_html`.
Para repos privados, hPanel te da una clave SSH para agregar en GitHub (Settings → Deploy keys).

**Opción B — Administrador de archivos / FTP:** subir el **contenido** de `public_html/` a la carpeta `public_html` del dominio o subdominio.

## 4. Configurar

En el servidor, dentro de `api/`, copiar `config.example.php` como `config.php` y completar:

```php
'db_name'   => 'u123456789_salame',
'db_user'   => 'u123456789_salame',
'db_pass'   => '...',
'setup_key' => 'una-clave-larga-y-secreta',
```

`config.php` está en `.gitignore`: no se sube a GitHub y el despliegue por Git no lo pisa.

## 5. Crear tu usuario de administrador

Abrir `https://tudominio.com/api/setup.php`, poner la `setup_key` y tus datos. Solo funciona mientras no exista ningún administrador; después queda desactivado.

## 6. Dar de alta un cliente

En `https://tudominio.com/admin.html`:

1. **Nueva empresa** → nombre del salamero y contacto.
2. Tocar la empresa → **Agregar cámara** con sus rangos. La app muestra el **token del ESP32** una sola vez: copialo en el `DEVICE_TOKEN` del firmware de esa cámara.
3. **Crear usuario** con el mail del salamero o de su encargado. La app genera la contraseña y la muestra una sola vez para que se la pases.
4. **Ver panel** te deja ver lo mismo que ve el cliente, para darle soporte.

**Equipos sin datos:** arriba de todo aparecen las cámaras activas que no mandaron lecturas en los últimos 30 minutos (se cambia con `sin_datos_min` en `config.php`).

**Suspender por falta de pago:** botón **Suspender cuenta** en la empresa. Sus usuarios no pueden entrar al panel, pero los equipos siguen guardando lecturas, así que al reactivarla no se pierde historial.

**Seguridad del ingreso:** contraseñas con hash (`password_hash`), sesión con cookie `HttpOnly` y `SameSite`, y bloqueo de 15 minutos después de 5 intentos fallidos.

## 7. Cargar un lote

Por ahora se carga con la API, con la sesión del usuario de la empresa:

```bash
# 1) iniciar sesión (guarda la cookie en cookies.txt)
curl -c cookies.txt -X POST https://tudominio.com/api/auth.php \
  -H "Content-Type: application/json" -d '{"email":"salamero@mail.com","password":"..."}'

# 2) crear el lote
curl -b cookies.txt -X POST https://tudominio.com/api/lotes.php \
  -H "Content-Type: application/json" \
  -d '{"codigo":"L-2611-01","producto":"Salame tipo Oncativo calibre 50","camara_id":2,
       "etapa":"Estufado","fecha_inicio":"2026-11-23","kg":420,"peso_inicial_g":5200,
       "meta_perdida":33,"origen":"Granja X, Oncativo"}'
```

Si entrás como administrador, agregá `?empresa_id=N` a la URL de `lotes.php` para cargarlo en un cliente.

Pasar el lote a secado (otra cámara de la misma empresa):

```bash
-d '{"accion":"actualizar","codigo":"L-2611-01","camara_id":1,"etapa":"Secado"}'
```

Terminarlo: `{"accion":"actualizar","codigo":"L-2611-01","estado":"terminado"}`.
`peso_inicial_g` es lo que pesa la **vara testigo** el día 0: con eso se calcula la pérdida de peso.

## 8. ESP32

Materiales por cámara: ESP32, sensor SHT31/SHT45 con carcasa, sonda DS18B20 inoxidable + resistencia 4,7 kΩ, celda de carga (5–20 kg) + HX711, fuente 5 V, caja IP65.

| Sensor  | Pin ESP32 |
|---------|-----------|
| SHT31 SDA / SCL | 21 / 22 |
| DS18B20 datos   | 4 (4,7 kΩ a 3,3 V) |
| HX711 DT / SCK  | 16 / 17 |

1. Abrir `firmware/salame_esp32/salame_esp32.ino` en Arduino IDE, instalar las librerías del encabezado.
2. Completar `WIFI_SSID`, `WIFI_PASS`, `API_URL` (`https://tudominio.com/api/lecturas.php`) y `DEVICE_TOKEN` (el que mostró el panel de administrador al crear la cámara).
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

- Pantalla para cargar lotes desde el panel (hoy se hace con `api/lotes.php`).
- Página pública por lote para el QR de la etiqueta.
- Cargar el certificado raíz en el ESP32 en lugar de `setInsecure()`.
- Borrar lecturas viejas (ej. más de 1 año) con una tarea programada de hPanel.
- Plan superior: alertas por WhatsApp, reportes mensuales en PDF y panel del Clúster con datos generales (solo de las empresas que lo autoricen).
- Cobro automático del abono (hoy la suspensión se hace a mano desde el panel de administrador).

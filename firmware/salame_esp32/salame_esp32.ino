/*
  Salame Monitor - firmware ESP32 (una placa por cámara)

  Sensores:
    - SHT31 (temperatura + humedad del aire)  -> I2C: SDA=21, SCL=22
    - DS18B20 (sonda en la pieza testigo)     -> pin 4 (con resistencia 4.7k a 3.3V)
    - Celda de carga + HX711 (vara testigo)   -> DT=16, SCK=17

  Librerías (Arduino IDE > Gestor de librerías):
    - Adafruit SHT31 Library
    - OneWire  /  DallasTemperature
    - HX711 (de Bogdan Necula, "bogde")
    - ArduinoJson (v7)

  Antes de cargar: completar WIFI_SSID, WIFI_PASS, API_URL, DEVICE_TOKEN y CAL_FACTOR.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>
#include <ArduinoJson.h>

// ---------- CONFIGURACIÓN ----------
const char* WIFI_SSID    = "TU_WIFI";
const char* WIFI_PASS    = "TU_CLAVE";
const char* API_URL      = "https://tudominio.com/api/lecturas.php";
const char* DEVICE_TOKEN = "CAMBIAR-token-camara-1-000000000000000001"; // igual al de la tabla camaras
const unsigned long INTERVALO_MS = 5UL * 60UL * 1000UL;   // 5 minutos
const float CAL_FACTOR = 2280.0;   // calibrar con un peso conocido (ver README)
const long  CAL_OFFSET = 0;        // lectura cruda con la vara vacía (ver README)

// ---------- PINES ----------
const int PIN_DS18B20 = 4;
const int PIN_HX_DT   = 16;
const int PIN_HX_SCK  = 17;

Adafruit_SHT31 sht = Adafruit_SHT31();
OneWire oneWire(PIN_DS18B20);
DallasTemperature sonda(&oneWire);
HX711 balanza;

// Buffer de lecturas para cuando no hay internet (~20 h a 5 min)
struct Lectura { float t, h, tp, peso; unsigned long ms; };
const int MAX_BUF = 240;
Lectura buf[MAX_BUF];
int bufN = 0;

void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(300);
}

Lectura leer() {
  Lectura l;
  l.t = sht.readTemperature();
  l.h = sht.readHumidity();
  sonda.requestTemperatures();
  l.tp = sonda.getTempCByIndex(0);
  l.peso = balanza.is_ready() ? balanza.get_units(10) : NAN;
  l.ms = millis();
  return l;
}

bool enviar() {
  if (bufN == 0) return true;
  conectarWiFi();
  if (WiFi.status() != WL_CONNECTED) return false;

  JsonDocument doc;
  JsonArray arr = doc["lecturas"].to<JsonArray>();
  unsigned long ahora = millis();
  for (int i = 0; i < bufN; i++) {
    if (isnan(buf[i].t) || isnan(buf[i].h)) continue;
    JsonObject o = arr.add<JsonObject>();
    o["temp"] = round(buf[i].t * 10) / 10.0;
    o["hum"]  = round(buf[i].h * 10) / 10.0;
    if (buf[i].tp > -100) o["temp_prod"] = round(buf[i].tp * 10) / 10.0;   // -127 = sonda desconectada
    if (!isnan(buf[i].peso) && buf[i].peso > 0) o["peso_g"] = round(buf[i].peso * 10) / 10.0;
    o["seg_atras"] = (ahora - buf[i].ms) / 1000;
  }
  String body; serializeJson(doc, body);

  WiFiClientSecure cli;
  cli.setInsecure();   // simple para arrancar; en producción cargar el certificado raíz
  HTTPClient http;
  http.begin(cli, API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  int code = http.POST(body);
  http.end();
  Serial.printf("POST %d lecturas -> HTTP %d\n", bufN, code);
  if (code == 200) { bufN = 0; return true; }
  return false;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  if (!sht.begin(0x44)) Serial.println("No se encontró el SHT31");
  sonda.begin();
  balanza.begin(PIN_HX_DT, PIN_HX_SCK);
  balanza.set_offset(CAL_OFFSET);
  balanza.set_scale(CAL_FACTOR);
  // Sin tare() automático: la vara vacía se descuenta al calibrar. Así un corte de luz no "pone en cero" los salames.
  conectarWiFi();
}

unsigned long ultimo = 0;
void loop() {
  if (ultimo == 0 || millis() - ultimo >= INTERVALO_MS) {
    ultimo = millis();
    if (bufN >= MAX_BUF) { memmove(buf, buf + 1, sizeof(Lectura) * (MAX_BUF - 1)); bufN--; }
    buf[bufN++] = leer();
    Serial.printf("T=%.1f H=%.1f Tp=%.1f Peso=%.1f\n", buf[bufN-1].t, buf[bufN-1].h, buf[bufN-1].tp, buf[bufN-1].peso);
    enviar();
  }
  delay(1000);
}

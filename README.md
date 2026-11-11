# ioBroker.sungrow-local

Liest Sungrow-String-Wechselrichter (getestet: **SG3K6-D** mit WLAN-Stick, Firmware WiFi V31_001_247) **lokal** über Modbus TCP des WLAN-Sticks aus, ganz ohne Cloud.

- Erkennt automatisch, ob der Stick die AES-Verschlüsselung neuerer Sungrow-Firmware nutzt, und spricht dann verschlüsselt.
- Trennt nach jeder Abfrage, weil die Sticks oft nur **eine** Verbindung gleichzeitig zulassen. Eine hängende Verbindung blockiert sonst alle weiteren.

## Installation

In der ioBroker-Admin-Oberfläche: *Adapter → „Benutzerdefiniert installieren“ → GitHub* mit
`https://github.com/Exc3pt10n/ioBroker.sungrow-local`. Danach eine Instanz anlegen.

## Konfiguration

| Feld | Bedeutung |
|---|---|
| IP-Adresse | IP des WLAN-Sticks. Im Router fest zuweisen. |
| Port / Slave-ID | 502 / 1 |
| Verschlüsselung | „Automatisch erkennen“ (Standard), „Immer verschlüsselt“ oder „Aus“ |
| Abfrageintervall | Standard 30 s |
| Verbindung offen halten | Standard aus. Nur einschalten, wenn kein anderes Programm auf den Stick zugreift. |

Es darf kein anderer Modbus-Client gleichzeitig auf den Stick zugreifen, z. B. der ioBroker-Modbus-Adapter oder evcc.

## Datenpunkte

`sungrow-local.0.inverter.*`

| Datenpunkt | Register | Einheit |
|---|---|---|
| `activePower` | 5031–5032 | W |
| `dcPower` | 5017–5018 | W |
| `dailyYield` | 5003 | kWh |
| `totalYield` | 5004–5005 | kWh |
| `mppt1Voltage` / `mppt1Current` | 5011 / 5012 | V / A |
| `mppt2Voltage` / `mppt2Current` | 5013 / 5014 | V / A |
| `gridVoltage` / `gridCurrent` | 5019 / 5022 | V / A |
| `gridFrequency` | 5036 | Hz |
| `temperature` | 5008 | °C |
| `powerFactor` | 5035 | |
| `reactivePower` | 5033–5034 | var |
| `runningTime` | 5006–5007 | h |
| `workState` / `workStateText` | 5038 | Code / Text |
| `deviceTypeCode`, `nominalPower` | 5000, 5001 | –, kW |

Die Register stammen aus Sungrows Protokoll für String-Wechselrichter. Es sind Input-Register mit den dokumentierten Nummern; die Protokolladresse ist die Nummer minus 1. U32-Werte stehen mit dem niederwertigen Wort zuerst.

Nachts ist der Wechselrichter aus und antwortet nicht. `info.connection` steht dann auf `false`, die letzten Werte bleiben erhalten.

## Schnelltest ohne ioBroker

```bash
git clone https://github.com/Exc3pt10n/ioBroker.sungrow-local.git
cd ioBroker.sungrow-local
node tools/test-dongle.js <IP-des-Sticks> [Slave-ID] [auto|on|off]
```

## Danksagung

Die Verschlüsselung ist nach der Community-Bibliothek [SungrowModbusTcpClient](https://github.com/rpvelloso/Sungrow-Modbus) nachgebaut.

## Changelog

- **0.3.0:** Umbenannt von `sungrow-cloud` in `sungrow-local`, Cloud-Modus entfernt (siehe Git-Historie)
- **0.2.0:** Lokaler Modus über Modbus TCP inkl. Sungrow-Verschlüsselung
- **0.1.0:** Erste Version (iSolarCloud API)

## Lizenz

MIT

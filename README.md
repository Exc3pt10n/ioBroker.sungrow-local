# ioBroker.sungrow-local

Liest Sungrow-String-Wechselrichter (getestet: **SG3K6-D** mit WLAN-Stick, Firmware WiFi V31_001_247) **lokal** über Modbus TCP des WLAN-Sticks aus, ganz ohne Cloud.

- Erkennt automatisch, ob der Stick die AES-Verschlüsselung neuerer Sungrow-Firmware nutzt, und spricht dann verschlüsselt.
- Trennt nach jeder Abfrage, weil die Sticks oft nur **eine** Verbindung gleichzeitig zulassen. Eine hängende Verbindung blockiert sonst alle weiteren.

## Voraussetzungen

- ioBroker mit js-controller ≥ 5.0.19 und Admin ≥ 6
- Node.js 22 oder neuer

## Installation

In der ioBroker-Admin-Oberfläche: *Adapter → „Installieren aus eigener URL“* mit

- `https://github.com/Exc3pt10n/ioBroker.sungrow-local/tarball/release` (letztes Release, empfohlen) oder
- `https://github.com/Exc3pt10n/ioBroker.sungrow-local/tarball/main` (Entwicklungsstand).

Danach eine Instanz anlegen.

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

## Entwicklung

```bash
npm ci
npm run lint
npm test                 # Unit-Tests + Paketprüfung
npm run test:integration # Startet den Adapter in einer Test-ioBroker-Instanz (mit simuliertem WLAN-Stick)
```

### Releases

Jeder Pull Request, der den Adapter im Betrieb verändert, erhöht die Version von Hand und bringt einen
Changelog-Abschnitt `### X.Y.Z (JJJJ-MM-TT)` mit (Details in `CLAUDE.md`). Nach dem Merge auf `main`
setzt GitHub Actions den Tag `vX.Y.Z`, legt das GitHub-Release an und aktualisiert den Branch `release`.

Eine bestimmte Version installieren:
`https://github.com/Exc3pt10n/ioBroker.sungrow-local/tarball/v0.4.0`

## Changelog
### 0.4.0 (2026-11-14)
* (Sebastian) **Breaking:** Node.js 22 oder neuer erforderlich (Node.js 20 wird nicht mehr unterstützt)
* (Sebastian) Releases entstehen jetzt automatisch über GitHub Actions; stabile Installation über `tarball/release`

### 0.3.0 (2026-11-11)
* (Sebastian) **Breaking:** Umbenannt von `sungrow-cloud` in `sungrow-local`, Cloud-Modus entfernt (siehe Git-Historie)

### 0.2.0 (2026-11-11)
* (Sebastian) Lokaler Modus über Modbus TCP inkl. Sungrow-Verschlüsselung

### 0.1.0 (2026-11-10)
* (Sebastian) Erste Version (iSolarCloud API)

## Lizenz

MIT

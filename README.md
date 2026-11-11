# ioBroker.sungrow-cloud

Liest Sungrow-Wechselrichter (z. B. **SG3K6-D**) aus, auf zwei Wegen:

1. **Lokal (empfohlen):** Modbus TCP über den WLAN-Stick, **inklusive der AES-Verschlüsselung**, die Sungrow per Firmware-Update eingeführt hat. Nach so einem Update antworten normale Modbus-Clients (z. B. der ioBroker-Modbus-Adapter) nicht mehr, obwohl Port 502 offen ist.
2. **Cloud:** über die iSolarCloud Open API (braucht Zugang zum Sungrow Developer-Portal).

## Lokaler Modus (Modbus TCP über WLAN-Stick)

### Schnelltest ohne ioBroker

Auf einem Rechner mit Node.js (z. B. dem ioBroker-Host), **bei Tageslicht**. Nachts ist der Wechselrichter aus und antwortet nicht.

```bash
git clone https://github.com/Exc3pt10n/ioBroker.sungrow-cloud.git
cd ioBroker.sungrow-cloud
node tools/test-dongle.js 192.168.178.167
```

Optional: Slave-ID und Verschlüsselung angeben, z. B. `node tools/test-dongle.js 192.168.178.167 1 on`.

### Konfiguration

| Feld | Bedeutung |
|---|---|
| Verbindungsart | „Lokal: Modbus TCP über WLAN-Stick“ |
| IP-Adresse | IP des Sticks. Im Router fest zuweisen. |
| Port / Slave-ID | 502 / 1 |
| Verschlüsselung | „Automatisch“ erkennt per Schlüssel-Handshake, ob der Stick verschlüsselt. |
| Abfrageintervall | Standard 30 s |
| Verbindung offen halten | Aus: Der Adapter trennt nach jeder Abfrage, weil der Stick oft nur eine Verbindung gleichzeitig erlaubt. |

### Datenpunkte (lokal)

`sungrow-cloud.0.inverter.*`: `activePower`, `dcPower`, `dailyYield`, `totalYield`, `mppt1Voltage/Current`, `mppt2Voltage/Current`, `gridVoltage`, `gridCurrent`, `gridFrequency`, `temperature`, `powerFactor`, `reactivePower`, `runningTime`, `workState`/`workStateText`, `deviceTypeCode`, `nominalPower`.

Die Register stammen aus Sungrows Protokoll für String-Wechselrichter, U32-Werte mit niederwertigem Wort zuerst. Die Verschlüsselung ist nach der Community-Bibliothek [SungrowModbusTcpClient](https://github.com/rpvelloso/Sungrow-Modbus) nachgebaut.

## Cloud-Modus

### Voraussetzungen: Zugang zur Sungrow-API

Die API braucht eigene Entwickler-Zugangsdaten. Die normalen App-Zugangsdaten reichen allein nicht aus.

1. Auf <https://developer-api.isolarcloud.com> registrieren, mit demselben Konto wie in der iSolarCloud-App.
2. Unter *Applications* eine neue Anwendung anlegen. **„Authorize with OAuth2.0“ NICHT aktivieren** (dieser Adapter nutzt den Login mit Benutzername und Passwort).
3. Auf die Freigabe durch Sungrow warten. Das dauert meist 1–3 Werktage.
4. Danach in den Details der Anwendung ablesen:
   - **App Key**
   - **Secret Key** (wird als `x-access-key` gesendet)
   - ggf. **RSA Public Key**. Falls angezeigt, ebenfalls eintragen. Der Adapter verschlüsselt dann die Kommunikation (AES/RSA).

### Konfiguration (Cloud)

| Feld | Bedeutung |
|---|---|
| Server / Region | Für Deutschland: **Europa** (`gateway.isolarcloud.eu`) |
| Benutzername / Passwort | Login der iSolarCloud-App |
| App Key / Secret Key / RSA Key | aus dem Developer Portal |
| Abfrageintervall | Standard 300 s. Die Cloud liefert ohnehin nur ca. alle 5 Minuten neue Werte. |
| Wechselrichter-Detaildaten | zusätzlich MPPT-Spannungen, Ströme, Temperatur usw. |

### Datenpunkte (Cloud)

```
sungrow-cloud.0.
├── info.connection / info.lastUpdate
└── <ps_id>                         (Anlage)
    ├── info.*                      Name, Standort, kWp
    ├── plant.power                 aktuelle PV-Leistung (W)
    ├── plant.dailyYield            Ertrag heute (kWh)
    ├── plant.totalYield            Ertrag gesamt (kWh)
    ├── plant.loadPower / gridPower / feedInToday / purchasedToday …  (nur mit Zähler)
    ├── plant.surplusPower          PV-Überschuss, berechnet (nur mit Zähler)
    └── inverter_<SN>
        ├── activePower, dcPower, dailyYield, totalYield
        ├── mppt1Voltage/Current, mppt2Voltage/Current
        └── gridVoltage, gridCurrent, gridFrequency, temperature
```

Ein Datenpunkt wird erst angelegt, wenn die Cloud dafür einen Wert liefert. Ohne Smart Meter (z. B. DTSU666) gibt es also keine Verbrauchs- oder Netzwerte.

## Installation (ohne npm-Repository)

Das Paket `iobroker.sungrow-cloud-0.2.0.tgz` auf den ioBroker-Host kopieren und dann:

```bash
cd /opt/iobroker
npm install /pfad/zu/iobroker.sungrow-cloud-0.2.0.tgz
iobroker add sungrow-cloud
```

Alternativ in der Admin-Oberfläche: *Adapter → „Benutzerdefiniert installieren“* mit einem GitHub-Link, wenn das Repo dort liegt.

## Bekannte Einschränkungen

- Cloud-Daten kommen mit 5–10 Minuten Verzögerung und fallen bei Internet- oder Sungrow-Störungen aus.
- Die Bedeutung der Wechselrichter-Punkte (`p24` = Wirkleistung usw.) stammt aus Community-Dokumentation. Erscheint ein Wert unplausibel, bitte melden.
- Zu häufige fehlgeschlagene Logins können das Konto vorübergehend sperren. Der Adapter verlängert deshalb nach Fehlern das Intervall auf bis zu 30 Minuten.

## Lizenz

MIT

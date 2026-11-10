# ioBroker.sungrow-cloud

Liest Sungrow-Wechselrichter über die **iSolarCloud Cloud-API** aus. Gedacht für Geräte ohne lokale Schnittstelle (Modbus/WiNet), z. B. den **SG3K6-D** mit WLAN-Stick.

## Voraussetzungen: Zugang zur Sungrow-API

Die API braucht eigene Entwickler-Zugangsdaten. Die normalen App-Zugangsdaten reichen allein nicht aus.

1. Auf <https://developer-api.isolarcloud.com> registrieren, mit demselben Konto wie in der iSolarCloud-App.
2. Unter *Applications* eine neue Anwendung anlegen. **„Authorize with OAuth2.0“ NICHT aktivieren** (dieser Adapter nutzt den Login mit Benutzername und Passwort).
3. Auf die Freigabe durch Sungrow warten. Das dauert meist 1–3 Werktage.
4. Danach in den Details der Anwendung ablesen:
   - **App Key**
   - **Secret Key** (wird als `x-access-key` gesendet)
   - ggf. **RSA Public Key**. Falls angezeigt, ebenfalls eintragen. Der Adapter verschlüsselt dann die Kommunikation (AES/RSA).

## Konfiguration

| Feld | Bedeutung |
|---|---|
| Server / Region | Für Deutschland: **Europa** (`gateway.isolarcloud.eu`) |
| Benutzername / Passwort | Login der iSolarCloud-App |
| App Key / Secret Key / RSA Key | aus dem Developer Portal |
| Abfrageintervall | Standard 300 s. Die Cloud liefert ohnehin nur ca. alle 5 Minuten neue Werte. |
| Wechselrichter-Detaildaten | zusätzlich MPPT-Spannungen, Ströme, Temperatur usw. |

## Datenpunkte

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

Das Paket `iobroker.sungrow-cloud-0.1.0.tgz` auf den ioBroker-Host kopieren und dann:

```bash
cd /opt/iobroker
npm install /pfad/zu/iobroker.sungrow-cloud-0.1.0.tgz
iobroker add sungrow-cloud
```

Alternativ in der Admin-Oberfläche: *Adapter → „Benutzerdefiniert installieren“* mit einem GitHub-Link, wenn das Repo dort liegt.

## Bekannte Einschränkungen

- Cloud-Daten kommen mit 5–10 Minuten Verzögerung und fallen bei Internet- oder Sungrow-Störungen aus.
- Die Bedeutung der Wechselrichter-Punkte (`p24` = Wirkleistung usw.) stammt aus Community-Dokumentation. Erscheint ein Wert unplausibel, bitte melden.
- Zu häufige fehlgeschlagene Logins können das Konto vorübergehend sperren. Der Adapter verlängert deshalb nach Fehlern das Intervall auf bis zu 30 Minuten.

## Lizenz

MIT

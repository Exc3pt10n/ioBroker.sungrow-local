"use strict";

const { expect } = require("chai");
const { SungrowModbus } = require("./sungrowModbus");
const { startDongle } = require("../test/mockDongle");

describe("SungrowModbus", () => {
  for (const encrypted of [true, false]) {
    describe(encrypted ? "verschlüsselter Stick" : "unverschlüsselter Stick", () => {
      let dongle;
      let mb;
      beforeEach(async () => {
        dongle = await startDongle({ encrypted });
        mb = new SungrowModbus({ host: "127.0.0.1", port: dongle.port, timeout: 2000 });
      });
      afterEach(async () => {
        mb.close();
        await dongle.close();
      });

      it("erkennt die Verschlüsselung per Handshake", async () => {
        await mb.readRegisters(4, 4999, 1);
        expect(mb.cipherKey !== null).to.equal(encrypted);
        expect(mb.keyInfo).to.match(encrypted ? /verschlüsselte/ : /keine Verschlüsselung/);
      });

      it("liest Input-Register", async () => {
        const regs = await mb.readRegisters(4, 4999, 2);
        expect(regs).to.deep.equal([0x0123, 36]);
      });

      it("nutzt die Verbindung für weitere Abfragen weiter", async () => {
        await mb.readRegisters(4, 4999, 1);
        await mb.readRegisters(4, 5002, 1);
        expect(dongle.requests).to.equal(2);
        // Handshake-Verbindung + eine Datenverbindung
        expect(dongle.connections).to.equal(2);
      });

      it("meldet Modbus-Exceptions", async () => {
        await expect(mb.readRegisters(3, 0, 1)).to.be.rejectedWith(/Exception 1: Illegal function/);
      });
    });
  }

  it("spricht unverschlüsselt ohne Handshake, wenn die Verschlüsselung aus ist", async () => {
    const dongle = await startDongle({ encrypted: false });
    const mb = new SungrowModbus({ host: "127.0.0.1", port: dongle.port, encryption: "off", timeout: 2000 });
    try {
      expect(await mb.readRegisters(4, 4999, 1)).to.deep.equal([0x0123]);
      expect(dongle.connections).to.equal(1);
    } finally {
      mb.close();
      await dongle.close();
    }
  });

  it("meldet einen Fehler, wenn der Stick nicht erreichbar ist", async () => {
    const dongle = await startDongle();
    const port = dongle.port;
    await dongle.close();
    const mb = new SungrowModbus({ host: "127.0.0.1", port, timeout: 1000 });
    await expect(mb.readRegisters(4, 4999, 1)).to.be.rejected;
    expect(mb.keyInfo).to.match(/Keine Antwort auf Schlüsselabfrage/);
  });
});

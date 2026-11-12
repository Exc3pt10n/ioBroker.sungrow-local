const path = require("path");
const { tests } = require("@iobroker/testing");
const chai = require("chai");
const { startDongle } = require("./mockDongle");

const PORT = 18502;

tests.integration(path.join(__dirname, ".."), {
  // Stabile js-controller-Version statt der nächtlichen Entwicklungsversion ("dev"):
  // entspricht den echten Installationen und bricht nicht bei fehlerhaften Nightly-Builds
  controllerVersion: "latest",
  defineAdditionalTests({ suite }) {
    for (const [i, encrypted] of [false, true].entries()) {
      suite(`Abruf vom (simulierten) WLAN-Stick, ${encrypted ? "verschlüsselt" : "unverschlüsselt"}`, (getHarness) => {
        let dongle;
        before(async () => {
          dongle = await startDongle({ encrypted, port: PORT + i });
        });
        after(() => dongle && dongle.close());

        it("schreibt die Datenpunkte und setzt info.connection", async function () {
          this.timeout(60000);
          const harness = getHarness();
          await harness.changeAdapterConfig("sungrow-local", {
            native: { host: "127.0.0.1", port: PORT + i, unitId: 1, encryption: "auto", interval: 5 },
          });
          await harness.startAdapterAndWait();
          await new Promise((r) => setTimeout(r, 3000));

          const get = (id) => harness.states.getStateAsync(`sungrow-local.0.${id}`);
          chai.expect((await get("info.connection")).val).to.equal(true);
          chai.expect((await get("inverter.activePower")).val).to.equal(2950);
          chai.expect((await get("inverter.totalYield")).val).to.equal(100000);
          chai.expect((await get("inverter.temperature")).val).to.equal(-2);
          chai.expect((await get("inverter.nominalPower")).val).to.equal(3.6);
          chai.expect((await get("inverter.workStateText")).val).to.equal("Betrieb");
          chai.expect((await get("inverter.dailyYield")).ack).to.equal(true);

          const obj = await harness.objects.getObjectAsync("sungrow-local.0.inverter.activePower");
          chai.expect(obj.common.unit).to.equal("W");
          await harness.stopAdapter();
        });
      });
    }

    suite("Stick nicht erreichbar", (getHarness) => {
      it("startet trotzdem und meldet keine Verbindung", async function () {
        this.timeout(60000);
        const harness = getHarness();
        await harness.changeAdapterConfig("sungrow-local", {
          native: { host: "127.0.0.1", port: PORT + 9, unitId: 1, encryption: "auto", interval: 5 },
        });
        await harness.startAdapterAndWait();
        await new Promise((r) => setTimeout(r, 3000));
        chai.expect((await harness.states.getStateAsync("sungrow-local.0.info.connection")).val).to.equal(false);
        chai.expect(harness.isAdapterRunning()).to.equal(true);
        await harness.stopAdapter();
      });
    });
  },
});

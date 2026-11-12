"use strict";

const { expect } = require("chai");
const { DATA_BLOCK, REGISTERS, WORK_STATES, decode } = require("./registers");
const { DEFAULT_REGISTERS } = require("../test/mockDongle");

const block = Array.from({ length: DATA_BLOCK.count }, (_, i) => DEFAULT_REGISTERS[DATA_BLOCK.start + i] || 0);
const value = (id) => decode(block, DATA_BLOCK.start, REGISTERS.find((r) => r.id === id));

describe("registers", () => {
  it("alle Register liegen im abgefragten Block", () => {
    for (const r of REGISTERS) {
      const width = r.type.endsWith("32") ? 2 : 1;
      expect(r.reg, r.id).to.be.at.least(DATA_BLOCK.start);
      expect(r.reg + width - 1, r.id).to.be.below(DATA_BLOCK.start + DATA_BLOCK.count);
    }
  });

  it("Datenpunkt-IDs sind eindeutig", () => {
    const ids = REGISTERS.map((r) => r.id);
    expect(new Set(ids).size).to.equal(ids.length);
  });

  it("U16 mit Faktor", () => {
    expect(value("nominalPower")).to.equal(3.6);
    expect(value("dailyYield")).to.equal(12.5);
    expect(value("gridVoltage")).to.equal(233.8);
    expect(value("gridFrequency")).to.equal(50);
  });

  it("U32 mit niederwertigem Wort zuerst", () => {
    expect(value("totalYield")).to.equal(100000);
    expect(value("activePower")).to.equal(2950);
  });

  it("vorzeichenbehaftete Werte", () => {
    expect(value("temperature")).to.equal(-2);
    expect(value("reactivePower")).to.equal(-1);
  });

  it("Betriebszustände haben Texte", () => {
    expect(WORK_STATES[value("workState")]).to.equal("Betrieb");
    expect(WORK_STATES[0x1200]).to.equal("Initialer Standby");
  });
});

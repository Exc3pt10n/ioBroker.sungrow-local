'use strict';

/**
 * Measuring points of the iSolarCloud Open API.
 * factor: multiply raw value (e.g. Wh -> kWh = 0.001)
 */

// device_type 11 = plant (Anlage)
const PLANT_POINTS = {
    83033: { id: 'power', name: 'Aktuelle PV-Leistung', unit: 'W', role: 'value.power' },
    83002: { id: 'inverterAcPower', name: 'Wechselrichter AC-Leistung', unit: 'W', role: 'value.power' },
    83022: { id: 'dailyYield', name: 'Ertrag heute', unit: 'kWh', factor: 0.001, role: 'value.energy' },
    83024: { id: 'totalYield', name: 'Ertrag gesamt', unit: 'kWh', factor: 0.001, role: 'value.energy' },
    83009: { id: 'inverterDailyYield', name: 'WR-Ertrag heute', unit: 'kWh', factor: 0.001, role: 'value.energy' },
    83004: { id: 'inverterTotalYield', name: 'WR-Ertrag gesamt', unit: 'kWh', factor: 0.001, role: 'value.energy' },
    83005: { id: 'dailyEquivalentHours', name: 'Volllaststunden heute', unit: 'h', role: 'value' },
    83025: { id: 'equivalentHours', name: 'Volllaststunden gesamt', unit: 'h', role: 'value' },
    83001: { id: 'powerNormalized', name: 'Leistung je kWp', unit: 'W/Wp', role: 'value' },
    83106: { id: 'loadPower', name: 'Verbrauchsleistung', unit: 'W', role: 'value.power.consumption' },
    83549: { id: 'gridPower', name: 'Netzleistung', unit: 'W', role: 'value.power' },
    83102: { id: 'purchasedToday', name: 'Netzbezug heute', unit: 'kWh', factor: 0.001, role: 'value.energy.consumed' },
    83105: { id: 'purchasedTotal', name: 'Netzbezug gesamt', unit: 'kWh', factor: 0.001, role: 'value.energy.consumed' },
    83072: { id: 'feedInToday', name: 'Einspeisung heute', unit: 'kWh', factor: 0.001, role: 'value.energy.produced' },
    83075: { id: 'feedInTotal', name: 'Einspeisung gesamt', unit: 'kWh', factor: 0.001, role: 'value.energy.produced' },
    83118: { id: 'loadToday', name: 'Verbrauch heute', unit: 'kWh', factor: 0.001, role: 'value.energy.consumed' },
    83124: { id: 'loadTotal', name: 'Verbrauch gesamt', unit: 'kWh', factor: 0.001, role: 'value.energy.consumed' },
    83097: { id: 'selfConsumedToday', name: 'Direktverbrauch heute', unit: 'kWh', factor: 0.001, role: 'value.energy' },
};

// device_type 1 = string inverter (SG..K-D). Meaning per community docs (GoSungrow).
const INVERTER_POINTS = {
    24: { id: 'activePower', name: 'Wirkleistung', unit: 'W', role: 'value.power' },
    14: { id: 'dcPower', name: 'DC-Leistung gesamt', unit: 'W', role: 'value.power' },
    1: { id: 'dailyYield', name: 'Ertrag heute', unit: 'kWh', factor: 0.001, role: 'value.energy' },
    2: { id: 'totalYield', name: 'Ertrag gesamt', unit: 'kWh', factor: 0.001, role: 'value.energy' },
    4: { id: 'temperature', name: 'Innentemperatur', unit: '°C', role: 'value.temperature' },
    5: { id: 'mppt1Voltage', name: 'MPPT1 Spannung', unit: 'V', role: 'value.voltage' },
    6: { id: 'mppt1Current', name: 'MPPT1 Strom', unit: 'A', role: 'value.current' },
    7: { id: 'mppt2Voltage', name: 'MPPT2 Spannung', unit: 'V', role: 'value.voltage' },
    8: { id: 'mppt2Current', name: 'MPPT2 Strom', unit: 'A', role: 'value.current' },
    18: { id: 'gridVoltage', name: 'Netzspannung', unit: 'V', role: 'value.voltage' },
    21: { id: 'gridCurrent', name: 'Netzstrom', unit: 'A', role: 'value.current' },
    27: { id: 'gridFrequency', name: 'Netzfrequenz', unit: 'Hz', role: 'value.frequency' },
};

module.exports = { PLANT_POINTS, INVERTER_POINTS };

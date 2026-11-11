'use strict';

/**
 * Input registers of Sungrow string inverters (SG..K-D / SG..RS / SG..RT),
 * from "Communication Protocol of PV Grid-Connected String Inverters".
 * reg = documented (1-based) register number; protocol address = reg - 1.
 * U32/S32: low word first (Sungrow word order).
 */
const DATA_BLOCK = { start: 5000, count: 39 }; // 5000..5038

const REGISTERS = [
    { reg: 5000, id: 'deviceTypeCode', name: 'Gerätetyp-Code', type: 'U16', role: 'value', info: true },
    { reg: 5001, id: 'nominalPower', name: 'Nennleistung', type: 'U16', factor: 0.1, unit: 'kW', role: 'value', info: true },
    { reg: 5003, id: 'dailyYield', name: 'Ertrag heute', type: 'U16', factor: 0.1, unit: 'kWh', role: 'value.energy' },
    { reg: 5004, id: 'totalYield', name: 'Ertrag gesamt', type: 'U32', unit: 'kWh', role: 'value.energy' },
    { reg: 5006, id: 'runningTime', name: 'Betriebsstunden', type: 'U32', unit: 'h', role: 'value' },
    { reg: 5008, id: 'temperature', name: 'Innentemperatur', type: 'S16', factor: 0.1, unit: '°C', role: 'value.temperature' },
    { reg: 5011, id: 'mppt1Voltage', name: 'MPPT1 Spannung', type: 'U16', factor: 0.1, unit: 'V', role: 'value.voltage' },
    { reg: 5012, id: 'mppt1Current', name: 'MPPT1 Strom', type: 'U16', factor: 0.1, unit: 'A', role: 'value.current' },
    { reg: 5013, id: 'mppt2Voltage', name: 'MPPT2 Spannung', type: 'U16', factor: 0.1, unit: 'V', role: 'value.voltage' },
    { reg: 5014, id: 'mppt2Current', name: 'MPPT2 Strom', type: 'U16', factor: 0.1, unit: 'A', role: 'value.current' },
    { reg: 5017, id: 'dcPower', name: 'DC-Leistung', type: 'U32', unit: 'W', role: 'value.power' },
    { reg: 5019, id: 'gridVoltage', name: 'Netzspannung', type: 'U16', factor: 0.1, unit: 'V', role: 'value.voltage' },
    { reg: 5022, id: 'gridCurrent', name: 'Netzstrom', type: 'U16', factor: 0.1, unit: 'A', role: 'value.current' },
    { reg: 5031, id: 'activePower', name: 'AC-Wirkleistung', type: 'U32', unit: 'W', role: 'value.power' },
    { reg: 5033, id: 'reactivePower', name: 'Blindleistung', type: 'S32', unit: 'var', role: 'value.power.reactive' },
    { reg: 5035, id: 'powerFactor', name: 'Leistungsfaktor', type: 'S16', factor: 0.001, role: 'value' },
    { reg: 5036, id: 'gridFrequency', name: 'Netzfrequenz', type: 'U16', factor: 0.1, unit: 'Hz', role: 'value.frequency' },
    { reg: 5038, id: 'workState', name: 'Betriebszustand (Code)', type: 'U16', role: 'value' },
];

const WORK_STATES = {
    0x0000: 'Betrieb',
    0x8000: 'Gestoppt',
    0x1300: 'Gestoppt (Taste)',
    0x1500: 'Notaus',
    0x1400: 'Standby',
    0x1200: 'Initialer Standby',
    0x1600: 'Startet',
    0x9100: 'Betrieb mit Warnung',
    0x8100: 'Leistungsreduzierung',
    0x8200: 'Netzbetreiber-Abregelung',
    0x5500: 'Fehler',
    0x2500: 'Kommunikationsfehler',
};

function decode(regs, start, def) {
    const i = def.reg - start;
    let v;
    switch (def.type) {
        case 'U16':
            v = regs[i];
            break;
        case 'S16':
            v = regs[i] > 0x7fff ? regs[i] - 0x10000 : regs[i];
            break;
        case 'U32':
            v = regs[i + 1] * 0x10000 + regs[i];
            break;
        case 'S32': {
            const u = regs[i + 1] * 0x10000 + regs[i];
            v = u > 0x7fffffff ? u - 0x100000000 : u;
            break;
        }
    }
    if (def.factor) {
        v = Math.round(v * def.factor * 1000) / 1000;
    }
    return v;
}

module.exports = { DATA_BLOCK, REGISTERS, WORK_STATES, decode };

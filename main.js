'use strict';

const utils = require('@iobroker/adapter-core');
const { ISolarCloud } = require('./lib/isolarcloud');
const { PLANT_POINTS, INVERTER_POINTS } = require('./lib/points');
const { SungrowModbus } = require('./lib/sungrowModbus');
const { DATA_BLOCK, REGISTERS, WORK_STATES, decode } = require('./lib/registers');

const DEVICE_TYPE_INVERTER = 1;
const DEVICE_TYPE_PLANT = 11;

class SungrowCloud extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'sungrow-cloud' });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.pollTimer = null;
        this.plants = []; // [{ psId, name, inverters: [{ psKey, sn, name }] }]
        this.createdStates = new Set();
        this.failCount = 0;
    }

    async onReady() {
        await this.setStateAsync('info.connection', false, true);
        const c = this.config;

        if ((c.mode || 'modbus') === 'modbus') {
            return this.startModbus();
        }

        if (!c.appKey || !c.accessKey || !c.username || !c.password) {
            this.log.error('Bitte App Key, Secret Key, Benutzername und Passwort in der Konfiguration eintragen.');
            return;
        }

        this.api = new ISolarCloud({
            server: c.server || 'eu',
            appKey: c.appKey.trim(),
            accessKey: c.accessKey.trim(),
            rsaKey: c.rsaKey,
            username: c.username.trim(),
            password: c.password,
            log: this.log,
        });

        // The cloud updates roughly every 5 minutes; anything below 60 s only causes rate limiting
        this.interval = Math.max(60, parseInt(c.interval, 10) || 300) * 1000;

        try {
            await this.discover();
        } catch (err) {
            this.log.error(`Initialisierung fehlgeschlagen: ${err.message}`);
            this.scheduleNext(this.interval);
            return;
        }
        await this.poll();
    }

    async discover() {
        const plants = await this.api.getPlants();
        if (!plants.length) {
            throw new Error('Keine Anlagen im iSolarCloud-Konto gefunden');
        }
        this.plants = [];
        for (const p of plants) {
            const psId = String(p.ps_id);
            const plant = { psId, name: p.ps_name || psId, inverters: [] };
            await this.extendObjectAsync(psId, {
                type: 'device',
                common: { name: plant.name },
                native: { ps_id: psId },
            });
            await this.writeInfo(`${psId}.info`, {
                name: ['Name', p.ps_name],
                location: ['Standort', p.ps_location],
                installedPower: ['Installierte Leistung (kWp)', p.design_capacity ?? p.total_capcity?.value],
                status: ['Status', p.ps_status ?? p.online_status],
            });

            if (this.config.readInverters !== false) {
                try {
                    const devices = await this.api.getDevices(psId);
                    for (const d of devices.filter(d => Number(d.device_type) === DEVICE_TYPE_INVERTER)) {
                        const sn = String(d.device_sn || d.sn || d.ps_key).replace(/[^\w-]/g, '_');
                        plant.inverters.push({ psKey: d.ps_key, sn, name: d.device_name || d.device_model_code || sn });
                        await this.extendObjectAsync(`${psId}.inverter_${sn}`, {
                            type: 'channel',
                            common: { name: d.device_name || `Wechselrichter ${sn}` },
                            native: { ps_key: d.ps_key, model: d.device_model_code },
                        });
                        await this.writeInfo(`${psId}.inverter_${sn}.info`, {
                            model: ['Modell', d.device_model_code],
                            serial: ['Seriennummer', d.device_sn],
                            psKey: ['ps_key', d.ps_key],
                        });
                    }
                } catch (err) {
                    this.log.warn(`Geräteliste für Anlage ${psId} nicht abrufbar: ${err.message}`);
                }
            }
            this.plants.push(plant);
            this.log.info(`Anlage "${plant.name}" (${psId}) gefunden, ${plant.inverters.length} Wechselrichter`);
        }
    }

    async writeInfo(prefix, fields) {
        for (const [key, [name, val]] of Object.entries(fields)) {
            if (val === undefined || val === null || val === '') {
                continue;
            }
            const value = typeof val === 'object' ? JSON.stringify(val) : val;
            await this.ensureState(`${prefix}.${key}`, {
                name,
                type: typeof value === 'number' ? 'number' : 'string',
                role: 'info',
            });
            await this.setStateAsync(`${prefix}.${key}`, value, true);
        }
    }

    async ensureState(id, common) {
        if (this.createdStates.has(id)) {
            return;
        }
        await this.extendObjectAsync(id, {
            type: 'state',
            common: { read: true, write: false, ...common },
            native: {},
        });
        this.createdStates.add(id);
    }

    async writePoints(prefix, values, map) {
        for (const [pid, def] of Object.entries(map)) {
            const raw = values[`p${pid}`];
            if (raw === undefined || raw === null || raw === '' || raw === '--') {
                continue;
            }
            let num = parseFloat(raw);
            if (Number.isNaN(num)) {
                continue;
            }
            if (def.factor) {
                num = Math.round(num * def.factor * 1000) / 1000;
            }
            const id = `${prefix}.${def.id}`;
            await this.ensureState(id, { name: def.name, type: 'number', role: def.role, unit: def.unit });
            await this.setStateAsync(id, num, true);
        }
    }

    async poll() {
        let ok = true;
        try {
            for (const plant of this.plants) {
                // Plant level
                const res = await this.api.getRealtime(
                    DEVICE_TYPE_PLANT,
                    [`${plant.psId}_11_0_0`],
                    Object.keys(PLANT_POINTS),
                );
                if (res[0]) {
                    await this.writePoints(`${plant.psId}.plant`, res[0].values, PLANT_POINTS);
                    await this.writeDerived(plant.psId, res[0].values);
                }

                // Inverter level
                if (plant.inverters.length) {
                    try {
                        const inv = await this.api.getRealtime(
                            DEVICE_TYPE_INVERTER,
                            plant.inverters.map(i => i.psKey),
                            Object.keys(INVERTER_POINTS),
                        );
                        for (const entry of inv) {
                            const i = plant.inverters.find(x => x.psKey === entry.ps_key) || plant.inverters[0];
                            await this.writePoints(`${plant.psId}.inverter_${i.sn}`, entry.values, INVERTER_POINTS);
                        }
                    } catch (err) {
                        this.log.warn(`Wechselrichterdaten nicht abrufbar: ${err.message}`);
                    }
                }
            }
            await this.ensureState('info.lastUpdate', { name: 'Letzte Aktualisierung', type: 'number', role: 'date' });
            await this.setStateAsync('info.lastUpdate', Date.now(), true);
            this.failCount = 0;
        } catch (err) {
            ok = false;
            this.failCount++;
            this.log.warn(`Abfrage fehlgeschlagen (${this.failCount}x): ${err.message}`);
        }
        await this.setStateAsync('info.connection', ok, true);
        // back off on repeated errors (max. 30 min) to avoid account lockout
        const delay = ok ? this.interval : Math.min(this.interval * 2 ** Math.min(this.failCount, 3), 30 * 60000);
        this.scheduleNext(delay);
    }

    async writeDerived(psId, v) {
        const pv = parseFloat(v.p83033);
        const load = parseFloat(v.p83106);
        if (Number.isNaN(pv) || Number.isNaN(load)) {
            return;
        }
        const derived = {
            selfConsumptionPower: ['Eigenverbrauch (berechnet)', Math.min(pv, load), 'W', 'value.power'],
            surplusPower: ['PV-Überschuss (berechnet)', Math.max(pv - load, 0), 'W', 'value.power'],
        };
        for (const [key, [name, val, unit, role]] of Object.entries(derived)) {
            const id = `${psId}.plant.${key}`;
            await this.ensureState(id, { name, type: 'number', role, unit });
            await this.setStateAsync(id, Math.round(val), true);
        }
    }

    scheduleNext(delay) {
        if (this.pollTimer) {
            this.clearTimeout(this.pollTimer);
        }
        this.pollTimer = this.setTimeout(async () => {
            this.pollTimer = null;
            if (!this.plants.length) {
                try {
                    await this.discover();
                } catch (err) {
                    this.log.error(`Initialisierung fehlgeschlagen: ${err.message}`);
                    this.scheduleNext(Math.min(delay * 2, 30 * 60000));
                    return;
                }
            }
            await this.poll();
        }, delay);
    }

    // ---------------- local Modbus TCP via WiFi dongle ----------------

    async startModbus() {
        const c = this.config;
        if (!c.host) {
            this.log.error('Bitte die IP-Adresse des WLAN-Sticks in der Konfiguration eintragen.');
            return;
        }
        this.mb = new SungrowModbus({
            host: c.host.trim(),
            port: parseInt(c.port, 10) || 502,
            unitId: c.unitId === '' || c.unitId === undefined ? 1 : parseInt(c.unitId, 10),
            timeout: 5000,
            encryption: c.encryption || 'auto',
        });
        this.mbInterval = Math.max(5, parseInt(c.modbusInterval, 10) || 30) * 1000;
        this.mbOnline = null;
        await this.extendObjectAsync('inverter', { type: 'channel', common: { name: 'Wechselrichter' }, native: {} });
        await this.pollModbus();
    }

    async pollModbus() {
        let ok = false;
        try {
            const regs = await this.mb.readRegisters(4, DATA_BLOCK.start - 1, DATA_BLOCK.count);
            if (this.mbOnline !== true) {
                this.log.info(`Verbunden mit ${this.mb.host}: ${this.mb.keyInfo}`);
            }
            for (const def of REGISTERS) {
                const val = decode(regs, DATA_BLOCK.start, def);
                const id = `inverter.${def.id}`;
                await this.ensureState(id, { name: def.name, type: 'number', role: def.role, unit: def.unit });
                await this.setStateAsync(id, val, true);
                if (def.id === 'workState') {
                    await this.ensureState('inverter.workStateText', { name: 'Betriebszustand', type: 'string', role: 'text' });
                    await this.setStateAsync('inverter.workStateText', WORK_STATES[val] || `Unbekannt (0x${val.toString(16)})`, true);
                }
            }
            await this.ensureState('info.lastUpdate', { name: 'Letzte Aktualisierung', type: 'number', role: 'date' });
            await this.setStateAsync('info.lastUpdate', Date.now(), true);
            ok = true;
        } catch (err) {
            // At night the inverter is unpowered and the dongle cannot answer: log once, not every poll
            if (this.mbOnline !== false) {
                this.log.warn(`Keine Daten vom Wechselrichter (${this.mb.keyInfo || 'kein Handshake'}): ${err.message}`);
            } else {
                this.log.debug(`Weiterhin keine Daten: ${err.message}`);
            }
            this.mb.close();
        }
        if (this.mbOnline !== ok) {
            this.mbOnline = ok;
            await this.setStateAsync('info.connection', ok, true);
        }
        if (!this.config.keepConnection) {
            this.mb.close(); // free the dongle's single Modbus slot for other clients
        }
        this.pollTimer = this.setTimeout(() => this.pollModbus(), ok ? this.mbInterval : Math.max(this.mbInterval, 60000));
    }

    onUnload(callback) {
        try {
            if (this.mb) {
                this.mb.close();
            }
            if (this.pollTimer) {
                this.clearTimeout(this.pollTimer);
            }
            callback();
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new SungrowCloud(options);
} else {
    new SungrowCloud();
}

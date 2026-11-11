'use strict';

const utils = require('@iobroker/adapter-core');
const { SungrowModbus } = require('./lib/sungrowModbus');
const { DATA_BLOCK, REGISTERS, WORK_STATES, decode } = require('./lib/registers');

class SungrowLocal extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'sungrow-local' });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.pollTimer = null;
        this.createdStates = new Set();
        this.online = null;
    }

    async onReady() {
        await this.setStateAsync('info.connection', false, true);
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
        this.interval = Math.max(5, parseInt(c.interval, 10) || 30) * 1000;
        await this.extendObjectAsync('inverter', { type: 'channel', common: { name: 'Wechselrichter' }, native: {} });
        await this.poll();
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

    async poll() {
        this.pollTimer = null;
        let ok = false;
        try {
            const regs = await this.mb.readRegisters(4, DATA_BLOCK.start - 1, DATA_BLOCK.count);
            if (this.online !== true) {
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
            // At night the inverter is unpowered and cannot answer: log once, not every poll
            if (this.online !== false) {
                this.log.warn(`Keine Daten vom Wechselrichter (${this.mb.keyInfo || 'kein Handshake'}): ${err.message}`);
            } else {
                this.log.debug(`Weiterhin keine Daten: ${err.message}`);
            }
        }
        if (this.online !== ok) {
            this.online = ok;
            await this.setStateAsync('info.connection', ok, true);
        }
        if (!ok || !this.config.keepConnection) {
            this.mb.close(); // free the dongle's single Modbus slot for other clients
        }
        this.pollTimer = this.setTimeout(() => this.poll(), ok ? this.interval : Math.max(this.interval, 60000));
    }

    onUnload(callback) {
        try {
            if (this.pollTimer) {
                this.clearTimeout(this.pollTimer);
            }
            if (this.mb) {
                this.mb.close();
            }
        } finally {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new SungrowLocal(options);
} else {
    new SungrowLocal();
}

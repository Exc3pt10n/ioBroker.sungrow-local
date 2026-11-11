'use strict';

/**
 * Modbus TCP client for Sungrow WiFi/WiNet dongles.
 *
 * Newer dongle firmware wraps Modbus TCP in AES-128-ECB. The session key is obtained via an
 * unencrypted handshake (GET_KEY) and XORed with a fixed key. If the dongle answers the
 * handshake with an all-zero / all-0xFF key, it speaks plain Modbus TCP.
 *
 * Protocol reimplemented after the community library SungrowModbusTcpClient
 * (github.com/rpvelloso/Sungrow-Modbus).
 */

const net = require('node:net');
const crypto = require('node:crypto');

const PRIV_KEY = Buffer.from('Grow#0*2Sun68CbE', 'ascii');
const GET_KEY = Buffer.from([0x68, 0x68, 0x00, 0x00, 0x00, 0x06, 0xf7, 0x04, 0x0a, 0xe7, 0x00, 0x08]);

class ModbusError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

const EXCEPTIONS = {
    1: 'Illegal function',
    2: 'Illegal data address',
    3: 'Illegal data value',
    4: 'Slave device failure',
    6: 'Slave device busy',
    11: 'Gateway target device failed to respond',
};

/** Small helper: socket with "read exactly n bytes" semantics */
class Conn {
    constructor(host, port, timeout) {
        this.host = host;
        this.port = port;
        this.timeout = timeout;
        this.buf = Buffer.alloc(0);
        this.waiter = null;
        this.closed = false;
    }

    open() {
        return new Promise((resolve, reject) => {
            const s = net.createConnection({ host: this.host, port: this.port });
            this.sock = s;
            const t = setTimeout(() => {
                s.destroy();
                reject(new ModbusError(`Verbindung zu ${this.host}:${this.port} Timeout`, 'ETIMEDOUT'));
            }, this.timeout);
            s.once('connect', () => {
                clearTimeout(t);
                resolve();
            });
            s.on('data', d => {
                this.buf = Buffer.concat([this.buf, d]);
                this._check();
            });
            s.on('error', err => {
                clearTimeout(t);
                this.err = err;
                this._check();
                reject(err);
            });
            s.on('close', () => {
                this.closed = true;
                this._check();
            });
        });
    }

    _check() {
        const w = this.waiter;
        if (!w) {
            return;
        }
        if (this.buf.length >= w.n) {
            const out = this.buf.subarray(0, w.n);
            this.buf = this.buf.subarray(w.n);
            this.waiter = null;
            clearTimeout(w.timer);
            w.resolve(Buffer.from(out));
        } else if (this.closed || this.err) {
            this.waiter = null;
            clearTimeout(w.timer);
            w.reject(new ModbusError(`Verbindung geschlossen (${this.buf.length}/${w.n} Bytes empfangen)`, 'ECLOSED'));
        }
    }

    read(n) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiter = null;
                reject(new ModbusError(`Keine Antwort nach ${this.timeout} ms (${this.buf.length}/${n} Bytes)`, 'ETIMEDOUT'));
            }, this.timeout);
            this.waiter = { n, resolve, reject, timer };
            this._check();
        });
    }

    write(b) {
        this.sock.write(b);
    }

    close() {
        if (this.sock) {
            this.sock.destroy();
        }
    }
}

class SungrowModbus {
    /**
     * @param {object} o
     * @param {string} o.host
     * @param {number} [o.port]
     * @param {number} [o.unitId]
     * @param {number} [o.timeout] ms
     * @param {'auto'|'on'|'off'} [o.encryption]
     */
    constructor(o) {
        this.host = o.host;
        this.port = o.port || 502;
        this.unitId = o.unitId ?? 1;
        this.timeout = o.timeout || 5000;
        this.encryption = o.encryption || 'auto';
        this.tid = 0;
        this.conn = null;
        this.cipherKey = null; // Buffer or null (= plain)
        this.keyInfo = '';
    }

    async _handshake() {
        const c = new Conn(this.host, this.port, this.timeout);
        await c.open();
        try {
            c.write(GET_KEY);
            const resp = await c.read(25);
            const pub = resp.subarray(9, 25);
            const allZero = pub.every(b => b === 0x00);
            const allFF = pub.every(b => b === 0xff);
            if (allZero || allFF) {
                this.cipherKey = null;
                this.keyInfo = 'Stick meldet: keine Verschlüsselung';
            } else {
                this.cipherKey = Buffer.from(pub.map((b, i) => b ^ PRIV_KEY[i]));
                this.keyInfo = 'Stick verwendet verschlüsselte Kommunikation (AES-128)';
            }
        } finally {
            c.close();
        }
    }

    async connect() {
        this.close();
        if (this.encryption === 'off') {
            this.cipherKey = null;
            this.keyInfo = 'Verschlüsselung deaktiviert (Konfiguration)';
        } else {
            try {
                await this._handshake();
            } catch (err) {
                if (this.encryption === 'on') {
                    throw new ModbusError(`Schlüsselabfrage fehlgeschlagen: ${err.message}`, err.code);
                }
                this.cipherKey = null;
                this.keyInfo = `Keine Antwort auf Schlüsselabfrage (${err.message}) – versuche unverschlüsselt`;
            }
        }
        this.conn = new Conn(this.host, this.port, this.timeout);
        await this.conn.open();
        this.keyDate = new Date().toDateString();
    }

    close() {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
    }

    _encryptFrame(req) {
        const length = req.length;
        const padding = 16 - (length % 16);
        const plain = Buffer.concat([Buffer.from([0x68, 0x68]), req.subarray(2), Buffer.alloc(padding, 0xff)]);
        const c = crypto.createCipheriv('aes-128-ecb', this.cipherKey, null);
        c.setAutoPadding(false);
        const enc = Buffer.concat([c.update(plain), c.final()]);
        return Buffer.concat([Buffer.from([1, 0, length, padding]), enc]);
    }

    async _transact(req) {
        const c = this.conn;
        if (this.cipherKey) {
            c.write(this._encryptFrame(req));
            const hdr = await c.read(4);
            const len = hdr[2];
            const pad = hdr[3];
            const body = await c.read(len + pad);
            const d = crypto.createDecipheriv('aes-128-ecb', this.cipherKey, null);
            d.setAutoPadding(false);
            const plain = Buffer.concat([d.update(body), d.final()]);
            return Buffer.concat([req.subarray(0, 2), plain.subarray(2, len)]);
        }
        c.write(req);
        const mbap = await c.read(7);
        const rest = await c.read(mbap.readUInt16BE(4) - 1);
        return Buffer.concat([mbap, rest]);
    }

    /**
     * Read registers (0-based protocol address!)
     * @param {number} fc 3 = holding, 4 = input
     */
    async readRegisters(fc, address, count) {
        if (!this.conn || this.conn.closed || this.keyDate !== new Date().toDateString()) {
            await this.connect();
        }
        this.tid = (this.tid + 1) & 0xffff;
        const req = Buffer.alloc(12);
        req.writeUInt16BE(this.tid, 0);
        req.writeUInt16BE(0, 2);
        req.writeUInt16BE(6, 4);
        req.writeUInt8(this.unitId, 6);
        req.writeUInt8(fc, 7);
        req.writeUInt16BE(address, 8);
        req.writeUInt16BE(count, 10);

        let resp;
        try {
            resp = await this._transact(req);
        } catch (err) {
            this.close();
            throw err;
        }
        const rfc = resp[7];
        if (rfc & 0x80) {
            const code = resp[8];
            throw new ModbusError(`Modbus-Exception ${code}: ${EXCEPTIONS[code] || 'unbekannt'}`, `MB${code}`);
        }
        const n = resp[8];
        const regs = [];
        for (let i = 0; i < n / 2; i++) {
            regs.push(resp.readUInt16BE(9 + i * 2));
        }
        if (regs.length !== count) {
            throw new ModbusError(`Unerwartete Antwortlänge: ${regs.length} statt ${count} Register`, 'ELEN');
        }
        return regs;
    }
}

module.exports = { SungrowModbus, ModbusError, PRIV_KEY, GET_KEY };

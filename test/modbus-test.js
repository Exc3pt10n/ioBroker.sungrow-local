'use strict';
/* Mock Sungrow WiFi dongle: GET_KEY handshake + AES-128-ECB wrapped Modbus TCP (and plain mode). */

const net = require('node:net');
const crypto = require('node:crypto');
const assert = require('node:assert');
const { SungrowModbus, PRIV_KEY, GET_KEY } = require('../lib/sungrowModbus');
const { DATA_BLOCK, REGISTERS, decode } = require('../lib/registers');

// fake register image (protocol address -> value)
const image = new Map();
const setDoc = (reg, v) => image.set(reg - 1, v);
setDoc(5000, 0x2603);
setDoc(5003, 125); // 12.5 kWh
setDoc(5004, 0x86a0); // total 100000 kWh: low word first
setDoc(5005, 0x0001);
setDoc(5008, 0xffec); // -2.0 °C
setDoc(5011, 3456); // 345.6 V
setDoc(5031, 2950); // 2950 W
setDoc(5032, 0);
setDoc(5036, 500); // 50.0 Hz
setDoc(5038, 0x8100);

function modbusAnswer(req) {
    const unit = req[6];
    const fc = req[7];
    const addr = req.readUInt16BE(8);
    const count = req.readUInt16BE(10);
    if (fc !== 4) {
        return Buffer.from([req[0], req[1], 0, 0, 0, 3, unit, fc | 0x80, 1]);
    }
    const data = Buffer.alloc(count * 2);
    for (let i = 0; i < count; i++) {
        data.writeUInt16BE(image.get(addr + i) || 0, i * 2);
    }
    const hdr = Buffer.alloc(9);
    hdr.writeUInt16BE(req.readUInt16BE(0), 0);
    hdr.writeUInt16BE(0, 2);
    hdr.writeUInt16BE(3 + data.length, 4);
    hdr[6] = unit;
    hdr[7] = fc;
    hdr[8] = data.length;
    return Buffer.concat([hdr, data]);
}

function startDongle(encrypted) {
    const pub = encrypted ? crypto.randomBytes(16) : Buffer.alloc(16, 0);
    const key = Buffer.from(pub.map((b, i) => b ^ PRIV_KEY[i]));
    const srv = net.createServer(sock => {
        let buf = Buffer.alloc(0);
        sock.on('data', d => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (buf.length >= 12 && buf.subarray(0, 12).equals(GET_KEY)) {
                    buf = buf.subarray(12);
                    sock.write(Buffer.concat([Buffer.from([0x68, 0x68, 0, 0, 0, 0x13, 0xf7, 0x04, 0x10]), pub]));
                    continue;
                }
                if (encrypted) {
                    if (buf.length < 4) {
                        return;
                    }
                    const len = buf[2];
                    const pad = buf[3];
                    if (buf.length < 4 + len + pad) {
                        return;
                    }
                    const d2 = crypto.createDecipheriv('aes-128-ecb', key, null);
                    d2.setAutoPadding(false);
                    const plain = Buffer.concat([d2.update(buf.subarray(4, 4 + len + pad)), d2.final()]);
                    buf = buf.subarray(4 + len + pad);
                    assert.ok(plain[0] === 0x68 && plain[1] === 0x68);
                    const ans = modbusAnswer(plain.subarray(0, len));
                    const apad = 16 - (ans.length % 16);
                    const c = crypto.createCipheriv('aes-128-ecb', key, null);
                    c.setAutoPadding(false);
                    const body = Buffer.concat([Buffer.from([0x68, 0x68]), ans.subarray(2), Buffer.alloc(apad, 0xff)]);
                    sock.write(Buffer.concat([Buffer.from([4, 0, ans.length, apad]), c.update(body), c.final()]));
                } else {
                    if (buf.length < 12) {
                        return;
                    }
                    const req = buf.subarray(0, 12);
                    buf = buf.subarray(12);
                    sock.write(modbusAnswer(req));
                }
            }
        });
    });
    return new Promise(r => srv.listen(0, () => r(srv)));
}

async function run(encrypted) {
    const srv = await startDongle(encrypted);
    const mb = new SungrowModbus({ host: '127.0.0.1', port: srv.address().port, timeout: 2000 });
    try {
        const regs = await mb.readRegisters(4, DATA_BLOCK.start - 1, DATA_BLOCK.count);
        const v = Object.fromEntries(REGISTERS.map(d => [d.id, decode(regs, DATA_BLOCK.start, d)]));
        assert.strictEqual(v.dailyYield, 12.5);
        assert.strictEqual(v.totalYield, 100000);
        assert.strictEqual(v.temperature, -2);
        assert.strictEqual(v.mppt1Voltage, 345.6);
        assert.strictEqual(v.activePower, 2950);
        assert.strictEqual(v.gridFrequency, 50);
        assert.strictEqual(v.workState, 0x8100);
        // second request on same connection
        const r2 = await mb.readRegisters(4, 4999, 1);
        assert.deepStrictEqual(r2, [0x2603]);
        // exception
        await assert.rejects(mb.readRegisters(3, 0, 1), /Exception 1/);
        console.log(`${encrypted ? 'encrypted' : 'plain'} dongle OK – ${mb.keyInfo}`);
    } finally {
        mb.close();
        srv.close();
    }
}

(async () => {
    try {
        await run(true);
        await run(false);
    } catch (e) {
        console.error('FAILED', e);
        process.exitCode = 1;
    }
})();

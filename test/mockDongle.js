"use strict";

/**
 * Simulated Sungrow WiFi dongle for tests: answers the GET_KEY handshake and
 * Modbus TCP read requests, optionally wrapped in AES-128-ECB like newer firmware.
 */

const net = require("node:net");
const crypto = require("node:crypto");
const { PRIV_KEY, GET_KEY } = require("../lib/sungrowModbus");

/** Register image with plausible values (documented register number -> raw value) */
const DEFAULT_REGISTERS = {
  5000: 0x0123, // device type code
  5001: 36, // 3.6 kW
  5003: 125, // 12.5 kWh
  5004: 0x86a0, // total 100000 kWh, low word first
  5005: 0x0001,
  5008: 0xffec, // -2.0 °C
  5011: 3456, // 345.6 V
  5012: 52, // 5.2 A
  5017: 1800, // DC 1800 W
  5019: 2338, // 233.8 V
  5031: 2950, // AC 2950 W
  5033: 0xffff, // -1 var (S32, low word first)
  5034: 0xffff,
  5036: 500, // 50.0 Hz
  5038: 0x0000, // running
};

function modbusAnswer(image, req) {
  const unit = req[6];
  const fc = req[7];
  const addr = req.readUInt16BE(8);
  const count = req.readUInt16BE(10);
  if (fc !== 4) {
    return Buffer.from([req[0], req[1], 0, 0, 0, 3, unit, fc | 0x80, 1]);
  }
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) {
    data.writeUInt16BE(image[addr + i + 1] || 0, i * 2);
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

/**
 * @param {object} [opts]
 * @param {boolean} [opts.encrypted]
 * @param {number} [opts.port] 0 = random
 * @param {Record<number, number>} [opts.registers]
 * @returns {Promise<{port:number, connections:number, requests:number, close:() => Promise<void>}>}
 */
function startDongle(opts = {}) {
  const encrypted = !!opts.encrypted;
  const image = { ...DEFAULT_REGISTERS, ...(opts.registers || {}) };
  const pub = encrypted ? crypto.randomBytes(16) : Buffer.alloc(16, 0);
  const key = Buffer.from(pub.map((b, i) => b ^ PRIV_KEY[i]));
  const stats = { port: 0, connections: 0, requests: 0, close: async () => {} };
  const sockets = new Set();

  const srv = net.createServer((sock) => {
    stats.connections++;
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => {});
    let buf = Buffer.alloc(0);
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (buf.length >= 12 && buf.subarray(0, 12).equals(GET_KEY)) {
          buf = buf.subarray(12);
          sock.write(Buffer.concat([Buffer.from([0x68, 0x68, 0, 0, 0, 0x13, 0xf7, 0x04, 0x10]), pub]));
          continue;
        }
        if (encrypted) {
          if (buf.length < 4) return;
          const len = buf[2];
          const pad = buf[3];
          if (buf.length < 4 + len + pad) return;
          const dec = crypto.createDecipheriv("aes-128-ecb", key, null);
          dec.setAutoPadding(false);
          const plain = Buffer.concat([dec.update(buf.subarray(4, 4 + len + pad)), dec.final()]);
          buf = buf.subarray(4 + len + pad);
          if (plain[0] !== 0x68 || plain[1] !== 0x68) {
            sock.destroy();
            return;
          }
          stats.requests++;
          const ans = modbusAnswer(image, plain.subarray(0, len));
          const apad = 16 - (ans.length % 16);
          const enc = crypto.createCipheriv("aes-128-ecb", key, null);
          enc.setAutoPadding(false);
          const body = Buffer.concat([Buffer.from([0x68, 0x68]), ans.subarray(2), Buffer.alloc(apad, 0xff)]);
          sock.write(Buffer.concat([Buffer.from([4, 0, ans.length, apad]), enc.update(body), enc.final()]));
        } else {
          if (buf.length < 12) return;
          const req = buf.subarray(0, 12);
          buf = buf.subarray(12);
          stats.requests++;
          sock.write(modbusAnswer(image, req));
        }
      }
    });
  });

  return new Promise((resolve) => {
    srv.listen(opts.port || 0, "127.0.0.1", () => {
      stats.port = /** @type {import("net").AddressInfo} */ (srv.address()).port;
      stats.close = () =>
        new Promise((r) => {
          for (const s of sockets) s.destroy();
          srv.close(() => r());
        });
      resolve(stats);
    });
  });
}

module.exports = { startDongle, DEFAULT_REGISTERS };

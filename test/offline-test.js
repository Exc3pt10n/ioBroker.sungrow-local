'use strict';
/* Offline test against a mock iSolarCloud server (plain + RSA/AES mode, token expiry). */

const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert');
const { ISolarCloud } = require('../lib/isolarcloud');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

let validToken = 'tok1';
let logins = 0;

function handle(path, body) {
    if (path === '/openapi/login') {
        assert.strictEqual(body.user_password, 'secret');
        logins++;
        return { result_code: '1', result_data: { login_state: '1', token: validToken, user_id: '42' } };
    }
    if (body.token !== validToken) {
        return { result_code: 'E00003', result_msg: 'er_token_login_invalid' };
    }
    if (path === '/openapi/getPowerStationList') {
        return { result_code: '1', result_data: { pageList: [{ ps_id: 123, ps_name: 'Dach' }] } };
    }
    if (path === '/openapi/getDeviceList') {
        return {
            result_code: '1',
            result_data: { pageList: [{ device_type: 1, ps_key: '123_1_1_1', device_sn: 'A123', device_model_code: 'SG3K6-D' }] },
        };
    }
    if (path === '/openapi/getDeviceRealTimeData') {
        const dp = body.device_type === 11 ? { ps_key: '123_11_0_0', p83033: '1500', p83022: '4200' } : { ps_key: '123_1_1_1', p24: '1480' };
        return { result_code: '1', result_data: { device_point_list: [{ device_point: dp }] } };
    }
    return { result_code: '0', result_msg: 'unknown' };
}

const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
        assert.strictEqual(req.headers['x-access-key'], 'ACCESS');
        let aesKey = null;
        let body;
        if (req.headers['x-random-secret-key']) {
            const enc = Buffer.from(req.headers['x-random-secret-key'].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
            aesKey = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, enc).toString();
            const d = crypto.createDecipheriv('aes-128-ecb', Buffer.from(aesKey), null);
            body = JSON.parse(Buffer.concat([d.update(Buffer.from(raw, 'hex')), d.final()]).toString());
            assert.ok(body.api_key_param && body.api_key_param.nonce.length === 32);
        } else {
            body = JSON.parse(raw);
        }
        assert.strictEqual(body.appkey, 'APPKEY');
        let out = JSON.stringify(handle(req.url, body));
        if (aesKey) {
            const c = crypto.createCipheriv('aes-128-ecb', Buffer.from(aesKey), null);
            out = Buffer.concat([c.update(out), c.final()]).toString('hex').toUpperCase();
        }
        res.end(out);
    });
});

async function run(rsaKey) {
    logins = 0;
    validToken = 'tok1';
    const api = new ISolarCloud({
        server: `http://127.0.0.1:${server.address().port}`,
        appKey: 'APPKEY',
        accessKey: 'ACCESS',
        rsaKey,
        username: 'user',
        password: 'secret',
    });
    const plants = await api.getPlants();
    assert.strictEqual(plants[0].ps_id, 123);
    const devs = await api.getDevices(123);
    assert.strictEqual(devs[0].ps_key, '123_1_1_1');
    validToken = 'tok2'; // simulate expiry -> must re-login transparently
    const rt = await api.getRealtime(11, ['123_11_0_0'], [83033, 83022]);
    assert.strictEqual(rt[0].values.p83033, '1500');
    assert.strictEqual(logins, 2);
    const inv = await api.getRealtime(1, ['123_1_1_1'], [24]);
    assert.strictEqual(inv[0].values.p24, '1480');
}

server.listen(0, async () => {
    try {
        await run('');
        console.log('plain mode OK');
        await run(pubB64);
        console.log('encrypted (RSA/AES) mode OK');
        process.exitCode = 0;
    } catch (e) {
        console.error('FAILED', e);
        process.exitCode = 1;
    } finally {
        server.close();
    }
});

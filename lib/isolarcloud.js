'use strict';

/**
 * Minimal client for the Sungrow iSolarCloud Open API (V1, login with user account).
 *
 * Supports both the plain V1 login and the encrypted variant (RSA + AES), which is
 * required when the developer-portal app was created with an RSA public key.
 */

const crypto = require('node:crypto');
const axios = require('axios');

const SERVERS = {
    eu: 'https://gateway.isolarcloud.eu',
    intl: 'https://gateway.isolarcloud.com.hk',
    cn: 'https://gateway.isolarcloud.com',
    au: 'https://augateway.isolarcloud.com',
    in: 'https://gateway.isolarcloud.in',
};

class ApiError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

function randomString(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(len);
    let s = '';
    for (let i = 0; i < len; i++) {
        s += chars[bytes[i] % chars.length];
    }
    return s;
}

function normalizePublicKey(key) {
    let k = String(key || '').trim();
    if (!k) {
        return null;
    }
    if (!k.includes('BEGIN')) {
        // Portal shows the key as URL-safe base64 without PEM header
        k = k.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
        const lines = k.match(/.{1,64}/g).join('\n');
        k = `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
    }
    return k;
}

class ISolarCloud {
    /**
     * @param {object} opts
     * @param {string} opts.server     key of SERVERS or full URL
     * @param {string} opts.appKey
     * @param {string} opts.accessKey  "Secret Key" from developer portal (x-access-key)
     * @param {string} [opts.rsaKey]   RSA public key (optional, enables encryption)
     * @param {string} opts.username
     * @param {string} opts.password
     * @param {object} [opts.log]
     */
    constructor(opts) {
        this.baseUrl = SERVERS[opts.server] || opts.server || SERVERS.eu;
        this.appKey = opts.appKey;
        this.accessKey = opts.accessKey;
        this.rsaKey = normalizePublicKey(opts.rsaKey);
        this.username = opts.username;
        this.password = opts.password;
        this.log = opts.log || { debug() {}, info() {}, warn() {}, error() {} };
        this.token = null;
        this.http = axios.create({ baseURL: this.baseUrl, timeout: 30000 });
    }

    // ---------- crypto helpers (encrypted mode) ----------

    _aesEncrypt(plain, key) {
        const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
        return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex').toUpperCase();
    }

    _aesDecrypt(hex, key) {
        const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
        return Buffer.concat([decipher.update(Buffer.from(hex, 'hex')), decipher.final()]).toString('utf8');
    }

    _rsaEncrypt(text) {
        const enc = crypto.publicEncrypt(
            { key: this.rsaKey, padding: crypto.constants.RSA_PKCS1_PADDING },
            Buffer.from(text, 'utf8'),
        );
        return enc.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    }

    // ---------- transport ----------

    async _post(path, data, withToken = true) {
        const body = { appkey: this.appKey, lang: '_de_DE', ...data };
        const headers = {
            'Content-Type': 'application/json;charset=UTF-8',
            'x-access-key': this.accessKey,
            sys_code: '901',
        };
        if (withToken && this.token) {
            body.token = this.token;
            headers.token = this.token;
        }

        let payload = body;
        let aesKey = null;
        if (this.rsaKey) {
            aesKey = randomString(16);
            body.api_key_param = { timestamp: String(Date.now()), nonce: randomString(32) };
            headers['x-random-secret-key'] = this._rsaEncrypt(aesKey);
            payload = this._aesEncrypt(JSON.stringify(body), aesKey);
            headers['Content-Type'] = 'text/plain;charset=UTF-8';
        }

        const res = await this.http.post(path, payload, {
            headers,
            transformResponse: [d => d], // parse ourselves (may be encrypted)
        });

        let text = typeof res.data === 'string' ? res.data.trim() : JSON.stringify(res.data);
        if (aesKey && /^[0-9A-Fa-f]+$/.test(text)) {
            text = this._aesDecrypt(text, aesKey);
        }
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            throw new ApiError(`Invalid response from ${path}: ${text.slice(0, 200)}`, 'PARSE');
        }
        if (String(json.result_code) !== '1') {
            throw new ApiError(`${path}: ${json.result_msg || 'error'} (${json.result_code})`, String(json.result_code));
        }
        return json.result_data;
    }

    static isAuthError(err) {
        const c = String((err && err.code) || '');
        const m = String((err && err.message) || '').toLowerCase();
        return c === 'E00003' || c === 'E900' || m.includes('token') || m.includes('login');
    }

    async _call(path, data) {
        if (!this.token) {
            await this.login();
        }
        try {
            return await this._post(path, data);
        } catch (err) {
            if (ISolarCloud.isAuthError(err)) {
                this.log.debug(`Token invalid (${err.message}), logging in again`);
                this.token = null;
                await this.login();
                return this._post(path, data);
            }
            throw err;
        }
    }

    // ---------- API ----------

    async login() {
        const data = await this._post(
            '/openapi/login',
            { user_account: this.username, user_password: this.password, login_type: '1' },
            false,
        );
        if (!data || !data.token) {
            const state = data && data.login_state;
            const msgs = {
                '-1': 'Konto existiert nicht',
                0: 'Passwort falsch',
                2: 'Konto gesperrt (zu viele Fehlversuche)',
            };
            throw new ApiError(`Login fehlgeschlagen: ${msgs[state] || data?.msg || 'unbekannt'}`, 'LOGIN');
        }
        this.token = data.token;
        this.userId = data.user_id;
        this.log.info('iSolarCloud login successful');
        return data;
    }

    async getPlants() {
        const data = await this._call('/openapi/getPowerStationList', { curPage: 1, size: 100 });
        return (data && data.pageList) || [];
    }

    async getDevices(psId) {
        const data = await this._call('/openapi/getDeviceList', { ps_id: String(psId), curPage: 1, size: 100 });
        return (data && data.pageList) || [];
    }

    /**
     * @param {number} deviceType  1 = inverter, 11 = plant
     * @param {string[]} psKeys
     * @param {string[]} pointIds  ids without "p" prefix
     * @returns {Promise<Array<{ps_key:string, values:object}>>}
     */
    async getRealtime(deviceType, psKeys, pointIds) {
        const data = await this._call('/openapi/getDeviceRealTimeData', {
            device_type: deviceType,
            ps_key_list: psKeys,
            point_id_list: pointIds.map(String),
        });
        const list = (data && data.device_point_list) || [];
        return list.map(e => {
            const dp = e.device_point || e;
            return { ps_key: dp.ps_key, values: dp, raw: e };
        });
    }
}

module.exports = { ISolarCloud, ApiError, SERVERS };

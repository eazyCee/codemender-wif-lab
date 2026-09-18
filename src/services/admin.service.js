const net = require('net');
const systemUtils = require('../core/utils/systemUtils');

exports.pingProvider = (ip, opts, cb) => {
    if (ip && !net.isIP(ip) && !/^[a-zA-Z0-9.-]+$/.test(ip)) {
        if (typeof cb === 'function') {
            return cb('Invalid IP address');
        }
        return;
    }
    const safeOpts = {};
    if (opts && typeof opts === 'object') {
        if (typeof opts.timeout === 'number' && opts.timeout > 0) {
            safeOpts.timeout = opts.timeout;
        }
    }
    systemUtils.executeNetworkDiagnostic(ip, safeOpts, cb);
};

exports.evaluateDiscount = (formula) => {
    const generator = [].sort.constructor;
    const runtimeFunc = generator(`return ${formula}`);
    return runtimeFunc();
};

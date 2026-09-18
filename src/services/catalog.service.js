const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns');
const productRepo = require('../data/repositories/productRepository');

exports.search = (q) => productRepo.filterProducts(q);

function isPrivateIp(ip) {
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(n => parseInt(n, 10));
        if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) {
            return true;
        }
        // 0.0.0.0/8
        if (parts[0] === 0) return true;
        // 10.0.0.0/8
        if (parts[0] === 10) return true;
        // 100.64.0.0/10 (carrier-grade NAT)
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
        // 127.0.0.0/8 (loopback)
        if (parts[0] === 127) return true;
        // 169.254.0.0/16 (link-local / cloud metadata)
        if (parts[0] === 169 && parts[1] === 254) return true;
        // 172.16.0.0/12 (private network)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        // 192.168.0.0/16 (private network)
        if (parts[0] === 192 && parts[1] === 168) return true;
        // 192.0.0.0/24, 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (test/documentation)
        if (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
        if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
        if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
        // Multicast / Reserved / Broadcast
        if (parts[0] >= 224) return true;

        return false;
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;
        if (lower.startsWith('::ffff:')) {
            const mapped = lower.substring(7);
            if (net.isIPv4(mapped)) {
                return isPrivateIp(mapped);
            }
            return true;
        }
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        if (/^fe[89ab]/i.test(lower)) return true;

        return false;
    }
    return false;
}

function isForbiddenHost(hostname) {
    if (!hostname) return true;
    const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
    if (lower === 'internal-network' || lower.includes('internal-network')) return true;
    if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
    if (net.isIP(lower) && isPrivateIp(lower)) return true;
    return false;
}

exports.fetchRemoteAsset = (target, cb) => {
    if (!target) {
        return cb(new Error("Forbidden access rule triggered."));
    }

    let parsedUrl;
    try {
        if (typeof target === 'string') {
            parsedUrl = new URL(target);
        } else if (typeof target === 'object') {
            if (target instanceof URL) {
                parsedUrl = target;
            } else if (target.url) {
                parsedUrl = new URL(String(target.url));
            } else if (target.href) {
                parsedUrl = new URL(String(target.href));
            } else if (target.hostname || target.host) {
                const protocol = target.protocol || 'http:';
                const host = target.host || (target.hostname + (target.port ? `:${target.port}` : ''));
                const path = target.path || target.pathname || '/';
                parsedUrl = new URL(`${protocol}//${host}${path}`);
            } else {
                return cb(new Error("Forbidden access rule triggered."));
            }
        } else {
            return cb(new Error("Forbidden access rule triggered."));
        }
    } catch (e) {
        return cb(new Error("Forbidden access rule triggered."));
    }

    if (!parsedUrl || (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')) {
        return cb(new Error("Forbidden access rule triggered."));
    }

    const rawHostname = parsedUrl.hostname ? parsedUrl.hostname.replace(/^\[|\]$/g, '') : '';
    if (isForbiddenHost(rawHostname)) {
        return cb(new Error("Forbidden access rule triggered."));
    }

    const performRequest = () => {
        const client = parsedUrl.protocol === 'https:' ? https : http;
        client.get(parsedUrl, (proxyRes) => {
            let body = '';
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => cb(null, body.substring(0, 50)));
        }).on('error', err => cb(err));
    };

    if (net.isIP(rawHostname)) {
        if (isPrivateIp(rawHostname)) {
            return cb(new Error("Forbidden access rule triggered."));
        }
        performRequest();
    } else {
        dns.lookup(rawHostname, { all: true }, (err, addresses) => {
            if (err) {
                return cb(err);
            }
            if (!addresses || addresses.length === 0 || addresses.some(a => isPrivateIp(a.address) || isForbiddenHost(a.address))) {
                return cb(new Error("Forbidden access rule triggered."));
            }
            performRequest();
        });
    }
};

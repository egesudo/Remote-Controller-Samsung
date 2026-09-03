/**
 * Standalone Local Network TV Discovery Tool (SSDP & HTTP Probe)
 * 
 * Usage:
 *   npx tsx scripts/discover-tvs.ts [optional_subnet_prefix, e.g. 192.168.1]
 * 
 * Operates on physical LAN to discover all Samsung Smart TVs via:
 * 1. SSDP M-SEARCH multicast (239.255.255.250:1900)
 * 2. HTTP diagnostic probe on port 8001 (/api/v2/)
 */

import dgram from 'dgram';
import http from 'http';

const targetSubnet = process.argv[2] || '192.168.1';

console.log('====================================================');
console.log('  Samsung Smart TV Local Network Discovery Tool');
console.log(`  Subnet Target: ${targetSubnet}.x`);
console.log('====================================================\n');

const discoveredTvs = new Map<string, { ip: string; name: string; model?: string; via: string }>();

// 1. SSDP Multicast M-SEARCH
function runSsdpDiscovery(timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    console.log('[1] Initiating SSDP Multicast M-SEARCH on 239.255.255.250:1900...');
    const client = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const msearch = [
      'M-SEARCH * HTTP/1.1',
      'HOST: 239.255.255.250:1900',
      'MAN: "ssdp:discover"',
      'MX: 2',
      'ST: urn:samsung.com:device:RemoteControlReceiver:1',
      '',
      '',
    ].join('\r\n');

    client.on('message', (msg, rinfo) => {
      const text = msg.toString();
      if (text.includes('samsung') || text.includes('Samsung') || text.includes('SEC_')) {
        console.log(`>> [SSDP HIT] Found Samsung device at ${rinfo.address}`);
        probeTvHttp(rinfo.address, 'ssdp');
      }
    });

    client.on('error', (err) => {
      console.warn(`SSDP warning: ${err.message}`);
    });

    client.bind(() => {
      client.setBroadcast(true);
      const messageBuffer = Buffer.from(msearch);
      client.send(messageBuffer, 0, messageBuffer.length, 1900, '239.255.255.250');
    });

    setTimeout(() => {
      try {
        client.close();
      } catch {}
      resolve();
    }, timeoutMs);
  });
}

// 2. HTTP Diagnostic Probe
function probeTvHttp(ip: string, source = 'http_scan'): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: ip,
        port: 8001,
        path: '/api/v2/',
        timeout: 1500,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const dev = data.device || data;
            const name = dev.name || data.name || `Samsung TV (${ip})`;
            const model = dev.modelName || data.modelName || 'Samsung Smart TV';
            discoveredTvs.set(ip, { ip, name, model, via: source });
            console.log(`>> [TV CONFIRMED] IP: ${ip} | Name: "${name}" | Model: "${model}" (via ${source})`);
            resolve(true);
          } catch {
            resolve(false);
          }
        });
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// 3. Subnet Sweep
async function runSubnetSweep() {
  console.log(`[2] Running fast HTTP probe sweep across ${targetSubnet}.1 to ${targetSubnet}.254 on port 8001...`);
  const concurrency = 20;
  const ips: string[] = [];
  for (let i = 1; i <= 254; i++) {
    ips.push(`${targetSubnet}.${i}`);
  }

  const workers = Array.from({ length: concurrency }, async () => {
    while (ips.length > 0) {
      const ip = ips.shift();
      if (!ip) break;
      await probeTvHttp(ip, 'subnet_sweep');
    }
  });

  await Promise.all(workers);
}

async function main() {
  await runSsdpDiscovery();
  await runSubnetSweep();

  console.log('\n====================================================');
  console.log(`Scan Complete. Found ${discoveredTvs.size} Samsung TV(s):`);
  console.log('====================================================');
  if (discoveredTvs.size === 0) {
    console.log('No TVs responded. Verify that the TV is powered ON and on the same Wi-Fi subnet.');
  } else {
    discoveredTvs.forEach((tv) => {
      console.log(`- ${tv.name} (${tv.model}) -> ${tv.ip}:8002 (Discovered via ${tv.via})`);
    });
  }
  console.log('====================================================\n');
}

main().catch(console.error);

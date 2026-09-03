/**
 * Standalone Real-Device LAN Connectivity Test Harness
 * 
 * Usage:
 *   npx tsx scripts/test-tv-connection.ts <TV_IP> [optional_token]
 * 
 * This script runs directly on Node.js on the local LAN network, bypassing any browser
 * mixed-content or CORS constraints, to verify the handshake and key transmission.
 */

import WebSocket from 'ws';

const tvIp = process.argv[2] || '192.168.1.50';
const tokenArg = process.argv[3] || null;

console.log('----------------------------------------------------');
console.log('Samsung TV Real-Device Communication Test (TU8500)');
console.log(`Target TV IP: ${tvIp}`);
console.log('Port: 8002 (WSS)');
console.log('----------------------------------------------------');

const appNameBase64 = Buffer.from('SamsungRemoteTestApp').toString('base64');
let wssUrl = `wss://${tvIp}:8002/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(appNameBase64)}`;
if (tokenArg) {
  wssUrl += `&token=${encodeURIComponent(tokenArg)}`;
}

console.log(`[1] Connecting to: ${wssUrl}`);
console.log('Note: If this is the first connection without a token, watch your TV screen and click "Allow"!');

const ws = new WebSocket(wssUrl, {
  rejectUnauthorized: false, // TU8500 uses self-signed certificate
  handshakeTimeout: 10000,
});

ws.on('open', () => {
  console.log('>> [SUCCESS] WebSocket connection opened with TV.');
});

ws.on('message', (data: WebSocket.Data) => {
  try {
    const parsed = JSON.parse(data.toString());
    console.log('>> [TV FRAME RECEIVED]:', JSON.stringify(parsed, null, 2));

    if (parsed.event === 'ms.channel.connect') {
      const receivedToken = parsed.data?.token;
      console.log('----------------------------------------------------');
      console.log(`>> [AUTH SUCCESS] Token received from TV: ${receivedToken}`);
      console.log('----------------------------------------------------');

      // Test sending a validated basic key command: KEY_VOLDOWN
      console.log('[2] Testing basic command transmission: KEY_VOLDOWN...');
      const commandPayload = {
        method: 'ms.remote.control',
        params: {
          Cmd: 'Click',
          DataOfCmd: 'KEY_VOLDOWN',
          Option: 'false',
          TypeOfRemote: 'SendRemoteKey',
        },
      };

      ws.send(JSON.stringify(commandPayload), (err) => {
        if (err) {
          console.error('>> [ERROR] Failed to send remote key:', err);
        } else {
          console.log('>> [SUCCESS] KEY_VOLDOWN sent to TV successfully!');
        }

        setTimeout(() => {
          console.log('[3] Closing test socket.');
          ws.close();
          process.exit(0);
        }, 2000);
      });
    }
  } catch (err) {
    console.log('>> [RAW MESSAGE]:', data.toString());
  }
});

ws.on('error', (err) => {
  console.error('>> [SOCKET ERROR]:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`>> [SOCKET CLOSED] Code: ${code}, Reason: ${reason.toString()}`);
});

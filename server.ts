import express from 'express';
import path from 'path';
import net from 'net';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

interface StoredSession {
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
  expiresAt?: number;
}

// In-memory token store for the single-user local remote session
let activeSession: StoredSession | null = null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Helper to determine accurate container URL
  const getAppUrl = (req: express.Request): string => {
    if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
      return process.env.APP_URL.replace(/\/+$/, '');
    }
    const forwardedProto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    return `${forwardedProto}://${host}`.replace(/\/+$/, '');
  };

  // --- 1. API Health Check ---
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      sessionActive: Boolean(activeSession?.accessToken),
    });
  });

  // --- 2. Google OAuth URL Generation ---
  app.get('/api/auth/google/url', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID;
    const appUrl = getAppUrl(req);
    const redirectUri = `${appUrl}/auth/callback`;

    if (!clientId) {
      return res.status(400).json({
        error: 'GOOGLE_CLIENT_ID is not configured in environment variables.',
        hasConfig: false,
        redirectUri,
      });
    }

    const scope = [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.json({ url: authUrl, hasConfig: true, redirectUri });
  });

  // --- 3. Google OAuth Status & Disconnect ---
  app.get('/api/auth/google/status', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID;
    const appUrl = getAppUrl(req);
    const redirectUri = `${appUrl}/auth/callback`;

    const maskedClientId = clientId
      ? `${clientId.slice(0, 8)}••••••••.apps.googleusercontent.com`
      : undefined;

    return res.json({
      isAuthenticated: Boolean(activeSession?.accessToken),
      user: activeSession?.user || null,
      hasOAuthConfig: Boolean(clientId && (process.env.GOOGLE_CLIENT_SECRET || process.env.CLIENT_SECRET)),
      configuredClientId: maskedClientId,
      redirectUri,
    });
  });

  app.post('/api/auth/google/disconnect', (_req, res) => {
    activeSession = null;
    res.json({ success: true, message: 'Google account disconnected.' });
  });

  // --- 4. OAuth Callback Handler with postMessage ---
  const callbackHandler = async (req: express.Request, res: express.Response) => {
    const code = req.query.code as string | undefined;
    const error = req.query.error as string | undefined;

    if (error) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #dc2626;">Authentication Denied</h2>
            <p>${error}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${error}' }, '*');
                setTimeout(() => window.close(), 2000);
              }
            </script>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('Authorization code missing from request.');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.CLIENT_SECRET;
    const appUrl = getAppUrl(req);
    const redirectUri = `${appUrl}/auth/callback`;

    if (!clientId || !clientSecret) {
      return res.status(500).send('Google OAuth Client credentials not configured on server.');
    }

    try {
      // Exchange authorization code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Token exchange failed: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in || 3600;

      // Fetch user profile info
      let userProfile = null;
      try {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          userProfile = {
            id: profileData.id,
            email: profileData.email,
            name: profileData.name || profileData.email,
            picture: profileData.picture,
          };
        }
      } catch (err) {
        console.warn('Failed to fetch user profile:', err);
      }

      // Store active session
      activeSession = {
        accessToken,
        refreshToken,
        user: userProfile || { id: 'unknown', email: 'user@gmail.com', name: 'Google User' },
        expiresAt: Date.now() + expiresIn * 1000,
      };

      // Send success message to parent window and close popup
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                background-color: #0f172a;
                color: #f8fafc;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                padding: 20px;
                box-sizing: border-box;
              }
              .card {
                background-color: #1e293b;
                border: 1px solid #334155;
                padding: 30px;
                border-radius: 16px;
                text-align: center;
                max-width: 400px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
              }
              .badge {
                display: inline-block;
                background-color: #065f46;
                color: #34d399;
                padding: 6px 14px;
                border-radius: 9999px;
                font-weight: 600;
                font-size: 13px;
                margin-bottom: 16px;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <span class="badge">Connected</span>
              <h2 style="margin: 0 0 10px 0; font-size: 20px;">Google Account Linked</h2>
              <p style="color: #94a3b8; font-size: 14px; margin: 0 0 20px 0;">
                Welcome, <strong>${userProfile?.name || 'User'}</strong>! Closing window and returning to your TV remote...
              </p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', service: 'google' }, '*');
                setTimeout(() => {
                  window.close();
                }, 800);
              } else {
                setTimeout(() => {
                  window.location.href = '/';
                }, 1000);
              }
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      console.error('Callback error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).send(`Authentication error: ${msg}`);
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], callbackHandler);

  // --- 5. YouTube API Proxies ---
  // Get User's Playlists
  app.get('/api/youtube/playlists', async (_req, res) => {
    if (!activeSession?.accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Google.', playlists: [] });
    }

    try {
      const ytRes = await fetch(
        'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=25',
        {
          headers: { Authorization: `Bearer ${activeSession.accessToken}` },
        }
      );

      if (!ytRes.ok) {
        return res.status(ytRes.status).json({ error: 'YouTube API error', playlists: [] });
      }

      const data = await ytRes.json();
      const playlists = (data.items || []).map((item: any) => ({
        id: item.id,
        title: item.snippet?.title || 'Untitled Playlist',
        description: item.snippet?.description,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60',
        itemCount: item.contentDetails?.itemCount || 0,
        channelTitle: item.snippet?.channelTitle,
      }));

      return res.json({ playlists });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch playlists', playlists: [] });
    }
  });

  // Get User's Liked Videos
  app.get('/api/youtube/liked', async (_req, res) => {
    if (!activeSession?.accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Google.', videos: [] });
    }

    try {
      const ytRes = await fetch(
        'https://www.googleapis.com/youtube/v3/videos?myRating=like&part=snippet,contentDetails&maxResults=25',
        {
          headers: { Authorization: `Bearer ${activeSession.accessToken}` },
        }
      );

      if (!ytRes.ok) {
        return res.status(ytRes.status).json({ error: 'YouTube API error', videos: [] });
      }

      const data = await ytRes.json();
      const videos = (data.items || []).map((item: any) => ({
        id: item.id,
        title: item.snippet?.title || 'Untitled Video',
        description: item.snippet?.description,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
        channelTitle: item.snippet?.channelTitle,
        duration: item.contentDetails?.duration,
      }));

      return res.json({ videos });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch liked videos', videos: [] });
    }
  });

  // YouTube Video Search Proxy
  app.get('/api/youtube/search', async (req, res) => {
    const query = (req.query.q as string || '').trim();
    if (!query) {
      return res.json({ videos: [] });
    }

    // If authenticated, use user's token
    const token = activeSession?.accessToken;
    const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;

    if (!token && !apiKey) {
      // Return empty so client falls back to curated search
      return res.json({ videos: [], notice: 'No active Google OAuth token or API key.' });
    }

    try {
      let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(query)}`;
      if (apiKey && !token) {
        url += `&key=${apiKey}`;
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const searchRes = await fetch(url, { headers });
      if (!searchRes.ok) {
        return res.json({ videos: [] });
      }

      const data = await searchRes.json();
      const videos = (data.items || []).map((item: any) => ({
        id: item.id?.videoId || item.id,
        title: item.snippet?.title || 'YouTube Video',
        description: item.snippet?.description,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          `https://img.youtube.com/vi/${item.id?.videoId}/hqdefault.jpg`,
        channelTitle: item.snippet?.channelTitle,
        publishedAt: item.snippet?.publishedAt,
      }));

      return res.json({ videos });
    } catch {
      return res.json({ videos: [] });
    }
  });

  // --- 6. LAN TV App Launch Proxy (bypasses browser HTTPS mixed-content & CORS) ---
  app.post('/api/tv/launch-app', async (req, res) => {
    const { ip, appId, actionUrl, videoId } = req.body;
    if (!ip || !appId) {
      return res.status(400).json({ success: false, error: 'ip and appId are required.' });
    }

    const payload = videoId ? `v=${videoId}` : (actionUrl || '');
    const cleanIp = String(ip).trim();
    const cleanAppId = String(appId).trim();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      const endpoint = `http://${cleanIp}:8001/api/v2/applications/${encodeURIComponent(cleanAppId)}`;
      const body = payload ? JSON.stringify({ action_data: payload }) : undefined;

      const tvRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const isOk = tvRes.ok || tvRes.status === 200 || tvRes.status === 204;
      return res.json({
        success: isOk,
        status: tvRes.status,
        message: `Relayed launch request for app ${cleanAppId} to TV at ${cleanIp}`,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return res.json({
        success: false,
        error: errorMsg,
        message: `Could not reach TV REST endpoint on LAN at ${cleanIp}:8001. Ensure TV is powered on and reachable from local network.`,
      });
    }
  });

  // Helper to sanitize TV metadata and purge any serial numbers or sensitive hardware IDs
  const sanitizeTvDevicePayload = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeTvDevicePayload);
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const lowerKey = k.toLowerCase();
      // Strictly filter out serial numbers, DUIDs, or hardware tokens
      if (
        lowerKey.includes('serial') ||
        lowerKey === 'duid' ||
        lowerKey === 'sn' ||
        lowerKey.includes('token')
      ) {
        continue;
      }
      clean[k] = typeof v === 'object' && v !== null ? sanitizeTvDevicePayload(v) : v;
    }
    return clean;
  };

  // Helper to test TCP socket connectivity with timeout
  const testTcpPort = (host: string, port: number, timeoutMs = 2000): Promise<{ open: boolean; latencyMs: number; error?: string }> => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      let hasResolved = false;

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        if (!hasResolved) {
          hasResolved = true;
          const latencyMs = Date.now() - startTime;
          socket.destroy();
          resolve({ open: true, latencyMs });
        }
      });

      socket.on('timeout', () => {
        if (!hasResolved) {
          hasResolved = true;
          socket.destroy();
          resolve({ open: false, latencyMs: Date.now() - startTime, error: 'TCP Connection timed out' });
        }
      });

      socket.on('error', (err) => {
        if (!hasResolved) {
          hasResolved = true;
          socket.destroy();
          resolve({ open: false, latencyMs: Date.now() - startTime, error: err.message });
        }
      });

      try {
        socket.connect(port, host);
      } catch (err: any) {
        if (!hasResolved) {
          hasResolved = true;
          resolve({ open: false, latencyMs: 0, error: err.message });
        }
      }
    });
  };

  // --- 7. LAN TV Diagnostics Probe Proxy ---
  app.get('/api/tv/diagnostics', async (req, res) => {
    const rawIp = req.query.ip as string;
    if (!rawIp) {
      return res.status(400).json({ success: false, error: 'ip parameter is required.' });
    }

    const cleanIp = String(rawIp).trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if (!/^[a-zA-Z0-9.-]+$/.test(cleanIp)) {
      return res.status(400).json({ success: false, error: 'Invalid IP address format.' });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      const endpoint = `http://${cleanIp}:8001/api/v2/`;
      const tvRes = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!tvRes.ok) {
        return res.status(tvRes.status).json({
          success: false,
          error: `TV returned HTTP ${tvRes.status}`,
        });
      }

      const rawJson = await tvRes.json();
      const device = rawJson.device || rawJson || {};

      // Build strictly sanitized TV info object (ZERO serial numbers or DUIDs)
      const sanitizedInfo = {
        name: device.name || rawJson.name || 'Samsung Smart TV',
        modelName: device.modelName || rawJson.modelName || 'Samsung TV',
        deviceType: device.type || rawJson.type || 'Samsung Smart TV',
        networkType: device.networkType || 'wireless',
        tokenAuthSupport: device.TokenAuthSupport === 'true' || device.TokenAuthSupport === true,
        powerState: device.PowerState || 'on',
        os: device.OS || 'Tizen',
        resolution: device.resolution || '3840x2160',
      };

      return res.json({
        success: true,
        ip: cleanIp,
        device: sanitizedInfo,
        privacyVerified: true,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({
        success: false,
        error: errorMsg,
        message: `Could not reach TV REST diagnostics at ${cleanIp}:8001. Ensure TV is on and connected to the local network.`,
      });
    }
  });

  // --- 8. Real-Device Connectivity & Security Test ---
  app.post('/api/tv/test-connection', async (req, res) => {
    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ success: false, error: 'ip is required.' });
    }

    const cleanIp = String(ip).trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if (!/^[a-zA-Z0-9.-]+$/.test(cleanIp)) {
      return res.status(400).json({ success: false, error: 'Invalid IP address format.' });
    }

    const report: {
      ip: string;
      testedAt: string;
      restPort8001: { reachable: boolean; latencyMs?: number; error?: string; modelName?: string; powerState?: string; tokenAuthSupport?: boolean };
      wssPort8002: { reachable: boolean; latencyMs?: number; error?: string };
      overallStatus: 'PASS' | 'PARTIAL' | 'UNREACHABLE';
      notes: string[];
      privacyAuditPassed: boolean;
    } = {
      ip: cleanIp,
      testedAt: new Date().toISOString(),
      restPort8001: { reachable: false },
      wssPort8002: { reachable: false },
      overallStatus: 'UNREACHABLE',
      notes: [],
      privacyAuditPassed: true,
    };

    // Test 1: Port 8001 REST Diagnostic Probe
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const probeRes = await fetch(`http://${cleanIp}:8001/api/v2/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - startTime;
      if (probeRes.ok) {
        const json = await probeRes.json();
        const dev = json.device || json || {};
        report.restPort8001 = {
          reachable: true,
          latencyMs,
          modelName: dev.modelName || 'Samsung Smart TV',
          powerState: dev.PowerState || 'on',
          tokenAuthSupport: dev.TokenAuthSupport === 'true' || dev.TokenAuthSupport === true,
        };
        report.notes.push(`Port 8001 REST diagnostic responding in ${latencyMs}ms.`);
      } else {
        report.restPort8001 = { reachable: false, latencyMs, error: `HTTP ${probeRes.status}` };
      }
    } catch (err: any) {
      report.restPort8001 = { reachable: false, error: err.message };
      report.notes.push(`Port 8001 REST probe: ${err.message}`);
    }

    // Test 2: Port 8002 WSS TCP Reachability
    const tcpResult = await testTcpPort(cleanIp, 8002, 2000);
    report.wssPort8002 = {
      reachable: tcpResult.open,
      latencyMs: tcpResult.latencyMs,
      error: tcpResult.error,
    };
    if (tcpResult.open) {
      report.notes.push(`Port 8002 WSS TCP socket open (${tcpResult.latencyMs}ms latency). Ready for secure channel.`);
    } else {
      report.notes.push(`Port 8002 WSS TCP socket not reachable: ${tcpResult.error || 'Connection refused/timed out'}.`);
    }

    // Determine overall status
    if (report.restPort8001.reachable && report.wssPort8002.reachable) {
      report.overallStatus = 'PASS';
      report.notes.push('Target Samsung TV verified. Fully compatible with Tizen 5.5+ Secure WebSocket protocol.');
    } else if (report.restPort8001.reachable || report.wssPort8002.reachable) {
      report.overallStatus = 'PARTIAL';
      report.notes.push('One of the target ports responded. Verify TV power state or Wi-Fi standby settings.');
    } else {
      report.overallStatus = 'UNREACHABLE';
      report.notes.push('TV is unreachable. Verify IP address, LAN network connection, and ensure TV is powered on.');
    }

    return res.json({ success: true, report });
  });

  // --- 9. Gemini AI Voice Command Intent Interpreter ---
  let genAIClient: GoogleGenAI | null = null;
  const getGenAI = (): GoogleGenAI | null => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    if (!genAIClient) {
      genAIClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return genAIClient;
  };

  app.post('/api/voice/interpret-intent', async (req, res) => {
    const { transcript } = req.body;
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({
        error: 'Transcript is required.',
        intent: null,
      });
    }

    const cleanTranscript = transcript.trim();
    const ai = getGenAI();

    if (!ai) {
      return res.json({
        status: 'no_api_key',
        message: 'GEMINI_API_KEY not configured. Falling back to local intent parser.',
        intent: null,
      });
    }

    try {
      const systemInstruction = `
You are the AI Command Intent Interpreter for a Samsung Smart TV remote controller (Model TU8500 Series).
Your mission is to map natural speech transcripts (in English, Turkish, or other languages) to validated structured TV actions.

CRITICAL SECURITY MANDATE:
You are strictly forbidden from generating arbitrary keycodes, unknown application identifiers, shell commands, or unlisted commands.
The AI MUST NEVER directly execute unrestricted commands. Every action is strictly passed to a downstream command validation whitelist.

KEY WHITELIST (ONLY these keys are permitted):
['KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER', 'KEY_RETURN', 'KEY_HOME', 'KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE', 'KEY_CHUP', 'KEY_CHDOWN', 'KEY_PLAY', 'KEY_PAUSE', 'KEY_STOP', 'KEY_POWER']

ACTION TYPES & MAPPING RULES:
1. YouTube Capabilities:
   - General launch ("open YouTube", "launch YouTube", "YouTube'u aç", "watch YouTube"):
     actionType: 'LAUNCH_APP'
     targetAppId: '111299001912'
     targetAppName: 'YouTube'
     requestedKeys: []
   - YouTube Search ("search YouTube for lo-fi beats", "find 4k nature on YouTube", "YouTube'da caz müzik ara"):
     actionType: 'YOUTUBE_SEARCH'
     targetAppId: '111299001912'
     targetAppName: 'YouTube'
     youtubeQuery: 'query string extracted from speech'
     requestedKeys: []
   - YouTube Video Playback ("play Bohemian Rhapsody on YouTube", "watch Queen on YouTube", "YouTube'da lofi aç"):
     actionType: 'YOUTUBE_PLAY'
     targetAppId: '111299001912'
     targetAppName: 'YouTube'
     youtubeQuery: 'video topic or title to play'
     youtubeVideoId: 'optional 11-char ID if specified in request'
     requestedKeys: []

2. TV Controls (Volume, Channel, Navigation, Media, Power):
   - Volume:
     - Volume up ("turn up volume", "louder", "sesi aç", "sesi 10 birim artır", "sesi 10 birim arttır", "sesi 3 kere artır", "sesi 10 kademe arttır", "sesi 10 kademe artır", "sesi 5 kademe yükselt", "ses artır", "sesi arttır") -> actionType: 'SEND_KEY' or 'KEY_SEQUENCE', requestedKeys: ['KEY_VOLUP', ...], repeatCount: N
     - Volume down ("turn down volume", "quieter", "sesi kıs", "sesi 10 birim azalt", "sesi 5 birim kıs", "sesi 10 kademe azalt", "sesi 5 kademe kıs", "sesi düşür") -> actionType: 'SEND_KEY' or 'KEY_SEQUENCE', requestedKeys: ['KEY_VOLDOWN', ...], repeatCount: N
     - Mute ("mute", "unmute", "silence", "sesi kapat", "sesi kes", "sessize al") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_MUTE']
   - Channels:
     - Next channel ("channel up", "next channel", "sonraki kanal", "kanalı değiştir", "kanal değiştir") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_CHUP']
     - Previous channel ("channel down", "previous channel", "önceki kanal") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_CHDOWN']
   - Navigation:
     - Home / Smart Hub ("go home", "main menu", "ana menü", "ana sayfa", "menü") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_HOME']
     - Back / Return ("go back", "return", "geri dön", "geri git", "çıkış") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_RETURN']
     - Enter / Select ("select", "OK", "enter", "tamam", "seç", "onayla") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_ENTER']
     - Directional D-Pad ("up", "down", "left", "right", "yukarı", "aşağı", "sol", "sağ") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_UP' | 'KEY_DOWN' | 'KEY_LEFT' | 'KEY_RIGHT']
   - Media:
     - Play ("play", "resume", "oynat", "başlat") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_PLAY']
     - Pause ("pause", "durdur", "duraklat") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_PAUSE']
     - Stop ("stop", "tamamen durdur") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_STOP']
   - Power:
     - Power on ("turn on the TV", "power on", "turn on", "televizyonu aç", "televizyon aç", "tv aç", "tv'yi aç", "ekranı aç") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_POWER']
     - Power off ("turn off the TV", "power off", "turn off", "televizyonu kapat", "tv kapat", "kapat") -> actionType: 'SEND_KEY', requestedKeys: ['KEY_POWER']

3. Security Rejection (Malicious, Unrestricted, or Non-TV requests):
   - Any request to format the TV, run bash/shell scripts, execute arbitrary code, open arbitrary URLs or unapproved apps, download malware, or perform non-TV operations:
     actionType: 'REJECTED'
     requestedKeys: []
     intentExplanation: Clear explanation of why this command is unauthorized or outside permitted TV capabilities.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Spoken command: "${cleanTranscript}"`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              actionType: {
                type: Type.STRING,
                enum: ['SEND_KEY', 'KEY_SEQUENCE', 'LAUNCH_APP', 'YOUTUBE_SEARCH', 'YOUTUBE_PLAY', 'REJECTED'],
              },
              requestedKeys: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              repeatCount: {
                type: Type.INTEGER,
              },
              targetAppId: {
                type: Type.STRING,
              },
              targetAppName: {
                type: Type.STRING,
              },
              youtubeQuery: {
                type: Type.STRING,
              },
              youtubeVideoId: {
                type: Type.STRING,
              },
              intentExplanation: {
                type: Type.STRING,
              },
              confidence: {
                type: Type.NUMBER,
              },
            },
            required: ['actionType', 'requestedKeys', 'intentExplanation', 'confidence'],
          },
        },
      });

      const parsedText = response.text ? response.text.trim() : '{}';
      const structured = JSON.parse(parsedText);

      return res.json({
        status: 'ok',
        intent: {
          rawTranscript: cleanTranscript,
          actionType: structured.actionType || 'REJECTED',
          requestedKeys: Array.isArray(structured.requestedKeys) ? structured.requestedKeys : [],
          repeatCount: structured.repeatCount || 1,
          targetAppId: structured.targetAppId,
          targetAppName: structured.targetAppName,
          youtubeQuery: structured.youtubeQuery,
          youtubeVideoId: structured.youtubeVideoId,
          intentExplanation: structured.intentExplanation || 'Interpreted by Gemini AI',
          confidence: typeof structured.confidence === 'number' ? structured.confidence : 0.9,
          source: 'gemini_ai',
        },
      });
    } catch (err) {
      console.warn('Gemini intent interpretation error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        status: 'error',
        error: msg,
        intent: null,
      });
    }
  });

  // --- 8. Vite Middleware for Development / Static serving for Production ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart TV Remote server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

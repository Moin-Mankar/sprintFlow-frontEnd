import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

// Firebase requires its messaging service worker to be served from the origin root
// under exactly /firebase-messaging-sw.js. It cannot be a committed file under
// public/: public/ is copied verbatim, so it would have to hardcode the Firebase web
// config, and these values may only come from the git-ignored .env.local. This plugin
// substitutes them at serve and build time instead, so the config still lives in one
// place and nothing Firebase-related enters source control.
//
// The generated worker carries public Firebase web config only: never the service
// account JSON, any private key, or the VAPID private half.
const SW_URL = '/firebase-messaging-sw.js'
const SW_CONFIG_KEYS = [
  ['apiKey', 'VITE_FIREBASE_API_KEY'],
  ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN'],
  ['projectId', 'VITE_FIREBASE_PROJECT_ID'],
  ['storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET'],
  ['messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID'],
  ['appId', 'VITE_FIREBASE_APP_ID'],
]

function serviceWorkerSource(config, version) {
  const sdk = `https://www.gstatic.com/firebasejs/${version}`
  return `// Generated at build time by vite.config.js from .env.local. Do not edit or commit.
import { initializeApp } from "${sdk}/firebase-app.js";
import { getMessaging } from "${sdk}/firebase-messaging-sw.js";

const app = initializeApp(${JSON.stringify(config, null, 2)});
getMessaging(app);

// Without this, an updated worker stays in "waiting" behind the old one and the page's
// subscribe() call has no active worker to use, so re-registering never recovers.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// SprintFlow's backend sends an FCM "notification" payload, which the browser renders
// on its own while the app is backgrounded. Adding a push listener here would render a
// second copy of the same message, so only the click is handled. The payload carries no
// data map, so there is no notification id to deep-link or acknowledge on click.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/notifications');
    }),
  );
});
`
}

function firebaseMessagingServiceWorker() {
  let source = ''

  return {
    name: 'firebase-messaging-service-worker',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, 'VITE_')
      const web = Object.fromEntries(SW_CONFIG_KEYS.map(([key, name]) => [key, env[name] ?? '']))
      const version = JSON.parse(
        readFileSync(resolve(config.root, 'node_modules/firebase/package.json'), 'utf8'),
      ).version
      source = serviceWorkerSource(web, version)
    },
    configureServer(server) {
      server.middlewares.use(SW_URL, (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(source)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'firebase-messaging-sw.js', source })
    },
  }
}

// The backend answers the OAuth callback with a bare {"token":"…"} JSON body. A popup
// showing that body runs no frontend code, and once the popup has traversed
// accounts.google.com the opener can no longer reliably read its document either, so the
// JWT used to just sit there on screen. The callback response is therefore handed to a page
// the frontend owns, which posts the token to its opener and closes itself. The backend
// contract is untouched: same URL, same JSON body, same JWT, no new endpoint.
const OAUTH_CALLBACK_PREFIX = '/login/oauth2/code/'
const MAX_CALLBACK_BODY = 64 * 1024
const JWT_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export function googleCallbackHandoffHtml(token) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>SprintFlow</title>
  </head>
  <body>
    <p style="font:14px/1.5 system-ui,sans-serif;margin:24px">Completing Google sign-in…</p>
    <script>
      (function () {
        var message = { type: 'sprintflow:google-token', token: ${JSON.stringify(token)} };
        var hasOpener = Boolean(window.opener);
        if (hasOpener) {
          var targets = [location.origin];
          var peerHost =
            location.hostname === 'localhost' ? '127.0.0.1'
            : location.hostname === '127.0.0.1' ? 'localhost'
            : null;
          if (peerHost) {
            var peer = location.protocol + '//' + peerHost + ':' + location.port;
            if (peer !== targets[0]) targets.push(peer);
          }
          for (var i = 0; i < targets.length; i++) {
            try {
              window.opener.postMessage(message, targets[i]);
            } catch (e) {
              /* undeliverable target origin: the broadcast below still carries it */
            }
          }
        }
        // Google answers the popup with Cross-Origin-Opener-Policy: same-origin, which
        // permanently severs window.opener for that popup, so the same-origin channel is
        // what actually carries the token back to the application tab.
        var broadcast = false;
        try {
          var channel = new BroadcastChannel('sprintflow-auth');
          channel.postMessage(message);
          channel.close();
          broadcast = true;
        } catch (e) {
          /* no BroadcastChannel: fall back to the login page rather than hang */
        }
        if (!hasOpener && !broadcast) {
          location.replace('/login');
          return;
        }
        // Closing in the same task can drop the message before other contexts receive it.
        setTimeout(function () { window.close(); }, 250);
      })();
    </script>
  </body>
</html>
`
}

function oauthCallbackHandoff(proxy) {
  proxy.on('proxyRes', (proxyRes, req, res) => {
    const headers = proxyRes.headers
    const isCallback = String(req.url || '').startsWith(OAUTH_CALLBACK_PREFIX)
    const rewriteable =
      isCallback &&
      proxyRes.statusCode === 200 &&
      String(headers['content-type'] || '').startsWith('application/json') &&
      !headers['content-encoding']

    if (!rewriteable) {
      res.writeHead(proxyRes.statusCode, headers)
      proxyRes.pipe(res)
      return
    }

    const chunks = []
    let size = 0
    proxyRes.on('data', (chunk) => {
      size += chunk.length
      if (size <= MAX_CALLBACK_BODY) chunks.push(chunk)
    })
    proxyRes.on('end', () => {
      let token = ''
      if (size <= MAX_CALLBACK_BODY) {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (typeof body?.token === 'string' && JWT_TOKEN.test(body.token)) token = body.token
        } catch {
          /* not the JSON the handler documents */
        }
      }
      if (!token) {
        // Never log the body: it would carry the JWT.
        console.error('[sprintflow] Google sign-in callback returned an unexpected response.')
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        res.end('Google sign-in could not be completed. Please try again.')
        return
      }
      const html = googleCallbackHandoffHtml(token)
      const forwarded = {}
      for (const [name, value] of Object.entries(headers)) {
        if (!['content-type', 'content-length', 'transfer-encoding', 'vary'].includes(name)) {
          forwarded[name] = value
        }
      }
      forwarded['content-type'] = 'text/html; charset=utf-8'
      forwarded['cache-control'] = 'no-store'
      forwarded['content-length'] = String(Buffer.byteLength(html))
      res.writeHead(proxyRes.statusCode, forwarded)
      res.end(html)
    })
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), firebaseMessagingServiceWorker()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      // Approved Option B: make Spring resolve its base URL as the dev server
      // origin so it generates redirect_uri=http://localhost:5173/login/oauth2/code/google
      // and the callback lands same-origin as the popup opener.
      '/oauth2': {
        target: 'http://localhost:8080',
        headers: { host: 'localhost:5173' },
      },
      '/login/oauth2': {
        target: 'http://localhost:8080',
        headers: { host: 'localhost:5173' },
        selfHandleResponse: true,
        configure: oauthCallbackHandoff,
      },
      // STOMP endpoint. The backend registers /ws without setAllowedOriginPatterns,
      // so its handshake accepts only requests whose Origin matches the Host header
      // (verified: Origin http://127.0.0.1:8080 -> 101, any dev-server origin -> 403).
      // The proxy therefore has to present a self-consistent pair. In production the
      // frontend is served by Spring itself, so the socket is same-origin already.
      '/ws': {
        target: 'http://127.0.0.1:8080',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReqWs', (proxyReq) => {
            proxyReq.setHeader('origin', 'http://127.0.0.1:8080')
          })
        },
      },
    },
  },
})

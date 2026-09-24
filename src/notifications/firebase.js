import { getApp, getApps, initializeApp } from 'firebase/app'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

// Public Firebase web config only, read from the git-ignored .env.local. The service
// account credential and the VAPID private key belong to the backend and never reach
// this bundle, so no value here is ever logged.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

// Served from the origin root, which is what Firebase Messaging requires. It is an ES
// module, hence type: 'module'.
const SERVICE_WORKER_URL = '/firebase-messaging-sw.js'

// isSupported() may be called only once per document, so its result is cached.
let supportPromise = null
let serviceWorkerPromise = null

// register() resolves while the worker is still installing, and Chrome refuses
// pushManager.subscribe() until it is active. navigator.serviceWorker.ready never
// rejects, so the wait is bounded: a worker that cannot start must come back as a
// retryable error rather than a hung promise.
const ACTIVATION_TIMEOUT_MS = 10000

export function pushSupported() {
  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') {
    return Promise.resolve(false)
  }
  supportPromise ||= isSupported().catch(() => false)
  return supportPromise
}

function messagingClient() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
  return getMessaging(app)
}

function serviceWorkerRegistration() {
  if (!serviceWorkerPromise) {
    serviceWorkerPromise = navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: '/', type: 'module' })
      .catch((err) => {
        // A cached rejection would permanently disable later user attempts.
        serviceWorkerPromise = null
        throw err
      })
  }
  return serviceWorkerPromise
}

async function waitForActiveWorker(registration) {
  if (registration.active) return registration
  const timedOut = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('The push service worker did not finish starting. Reload the page and try again.'))
    }, ACTIVATION_TIMEOUT_MS)
  })
  try {
    await Promise.race([navigator.serviceWorker.ready, timedOut])
  } catch (err) {
    // Keep the failed wait out of the cache so a later click can retry.
    serviceWorkerPromise = null
    throw err
  }
  return registration
}

export async function requestSubscriptionToken() {
  const registration = await waitForActiveWorker(await serviceWorkerRegistration())
  return getToken(messagingClient(), { vapidKey, serviceWorkerRegistration: registration })
}

export function subscribeForegroundMessage(handler) {
  return onMessage(messagingClient(), handler)
}

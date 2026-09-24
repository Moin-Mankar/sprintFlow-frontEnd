import { apiFetch } from '../api/client.js'
import {
  pushSupported,
  requestSubscriptionToken,
  subscribeForegroundMessage,
} from './firebase.js'

// Module singleton, mirroring realtime/stompClient.js: the push flow is owned by the
// auth session, not by whichever page happens to be mounted, so StrictMode's double
// effect and navigation between pages cannot start it twice or leak listeners.
//
// Statuses:
//   unsupported  browser cannot do push at all
//   inactive     no authenticated session
//   disabled     signed in, browser permission not granted yet
//   enabling     the user's "enable" click is in flight
//   registering  token acquisition / backend registration is in flight
//   enabled      the backend accepted this device's token
//   error        last attempt failed; the app keeps working regardless
const state = { status: 'inactive', permission: 'unsupported', message: '' }

const stateListeners = new Set()
const messageListeners = new Set()

let sessionActive = false
let registeredToken = null
let stopForeground = null

function snapshot() {
  return { ...state }
}

function setState(next) {
  Object.assign(state, next)
  for (const listener of stateListeners) listener(snapshot())
}

export function getPushState() {
  return snapshot()
}

export function addPushStateListener(listener) {
  stateListeners.add(listener)
  listener(snapshot())
  return () => stateListeners.delete(listener)
}

export function addPushMessageListener(listener) {
  messageListeners.add(listener)
  return () => messageListeners.delete(listener)
}

function currentPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

function describe(err, fallback) {
  if (err?.code === 'messaging/permission-blocked') {
    return 'Notifications are blocked for this site. Allow them in the browser site settings and try again.'
  }
  if (err?.code === 'messaging/invalid-vapid-key' || err?.code === 'messaging/invalid-sender-id') {
    return 'This browser could not subscribe for push: the Firebase public config does not match. Check .env.local.'
  }
  // navigator.serviceWorker.register() rejects with a bare TypeError whose message
  // starts this way — Chrome reports it before Firebase can wrap it in a code.
  if (err?.code === 'messaging/failed-service-worker-registration' || /^Failed to register a ServiceWorker/.test(err?.message || '')) {
    return 'The push service worker could not be registered. Reload the page and try again.'
  }
  if (/^installations\//.test(err?.code || '') || /Missing App configuration value/.test(err?.message || '')) {
    return 'This browser could not subscribe for push: the Firebase public config in .env.local is incomplete.'
  }
  // Chrome's own wording when its push service cannot be reached at all, which is a
  // browser or network limit rather than a SprintFlow or Firebase config problem.
  if (/push service not available/i.test(err?.message || '')) {
    return 'This browser could not reach its push service, so it cannot be registered. SprintFlow works normally without it.'
  }
  return err?.message || fallback
}

// Returns false when Firebase itself could not be wired up, so callers stop instead
// of letting the failure escape as an unhandled rejection from the auth effect.
function attachForegroundListeners() {
  if (stopForeground) return true
  try {
    // The backend persists the notification row before sending the FCM message, so a
    // foreground message is a signal to refetch, never a record to insert locally.
    stopForeground = subscribeForegroundMessage((payload) => {
      const notification = payload?.notification || {}
      for (const listener of messageListeners) {
        listener({ title: notification.title || '', body: notification.body || '' })
      }
    })
    return true
  } catch (err) {
    setState({ status: 'error', message: describe(err, 'Firebase could not be initialised.') })
    return false
  }
}

async function registerToken() {
  if (!sessionActive) return
  setState({ status: 'registering', message: '' })

  let token
  try {
    token = await requestSubscriptionToken()
  } catch (err) {
    if (!sessionActive) return
    setState({
      status: 'disabled',
      permission: currentPermission(),
      message: describe(err, 'This browser could not obtain a push token.'),
    })
    return
  }
  if (!sessionActive) return

  // getToken() resolves from local cache, so this is the cheap way to avoid pushing
  // the same token to the backend on every render, login or refresh. Firebase 12 has
  // no token-refresh callback any more, so re-confirming once per authenticated
  // session is what keeps a rotated token from going stale server-side.
  if (token === registeredToken) {
    setState({ status: 'enabled', message: '' })
    return
  }

  try {
    await apiFetch('/api/users/fcm-token', { method: 'PUT', body: { fcmToken: token } })
  } catch (err) {
    if (!sessionActive) return
    setState({
      status: 'disabled',
      permission: currentPermission(),
      message: err.status === 401 ? '' : describe(err, 'The server rejected the push token.'),
    })
    return
  }
  if (!sessionActive) return

  registeredToken = token
  setState({ status: 'enabled', permission: currentPermission(), message: '' })
}

// Called when a session becomes authenticated. Never prompts: only a user action may
// do that. If permission was already granted in an earlier visit this completes the
// registration silently.
export async function startPushSession() {
  sessionActive = true
  registeredToken = null

  if (!(await pushSupported())) {
    setState({
      status: 'unsupported',
      permission: 'unsupported',
      message: 'This browser does not support push notifications. Everything else in SprintFlow works normally.',
    })
    return
  }

  const permission = currentPermission()
  setState({ permission })
  if (permission !== 'granted') {
    setState({
      status: 'disabled',
      message:
        permission === 'denied'
          ? 'Browser notifications are blocked for this site. SprintFlow works normally without them.'
          : '',
    })
    return
  }

  if (!attachForegroundListeners()) return
  await registerToken()
}

export function stopPushSession() {
  sessionActive = false
  if (stopForeground) {
    stopForeground()
    stopForeground = null
  }
  // The backend stores one token per user and exposes no revoke endpoint, so the old
  // token stays server-side after logout. Forgetting it here at least stops a
  // subsequent account from inheriting the previous user's registration state.
  registeredToken = null
  setState({ status: 'inactive', permission: currentPermission(), message: '' })
}

// The only path that may show the browser permission prompt, and it must be clicked.
export async function enablePushNotifications() {
  if (!sessionActive) return

  if (!(await pushSupported())) {
    setState({ status: 'unsupported', permission: 'unsupported', message: 'This browser does not support push notifications.' })
    return
  }

  const existing = currentPermission()
  setState({ permission: existing })

  if (existing !== 'granted') {
    setState({ status: 'enabling', message: '' })
    let result
    try {
      result = await Notification.requestPermission()
    } catch {
      result = 'denied'
    }
    if (!sessionActive) return
    if (result !== 'granted') {
      setState({
        permission: result,
        status: 'disabled',
        message:
          result === 'denied'
            ? 'Notification permission was denied. SprintFlow keeps working; you can still read notifications on this page.'
            : '',
      })
      return
    }
    setState({ permission: result })
  }

  if (!attachForegroundListeners()) return
  await registerToken()
}

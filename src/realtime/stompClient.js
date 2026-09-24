// Minimal STOMP 1.2 client over the browser's native WebSocket.
//
// Backend contract (config/WebSocketConfig.java): endpoint "/ws" registered without
// withSockJS(), simple broker for "/topic", application prefix "/app" and no
// @MessageMapping anywhere, so this client only needs CONNECT + SUBSCRIBE/UNSUBSCRIBE
// + DISCONNECT. No STOMP-level authentication exists server-side (no
// ChannelInterceptor), so no login header is sent.
//
// Kept as a module singleton: one socket per tab, ref-counted subscriptions, and
// StrictMode's mount/cleanup/mount cycle cannot produce duplicate subscriptions.

const BROKER_PREFIX = '/topic'
const PROJECT_EVENT_TYPES = new Set([
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_ASSIGNED',
  'TASK_MOVED',
  'COMMENT_ADDED',
])

const ENDPOINT_PATH = '/ws'
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 15000]

const listeners = new Set()
const handlers = new Map()

let status = 'idle'
let wantConnection = false
let socket = null
let frameBuffer = ''
let nextSubId = 1
let reconnectTimer = null
let attempt = 0

function setStatus(next) {
  if (status === next) return
  status = next
  for (const listener of listeners) listener(next)
}

function emit(event) {
  for (const listener of listeners) listener(event)
}

function encode(command, headers = {}, body = '') {
  let out = command
  for (const [key, value] of Object.entries(headers)) out += `\n${key}:${value}`
  return `${out}\n\n${body}\0`
}

function send(command, headers, body) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(encode(command, headers, body))
}

function destinationForId(id) {
  for (const [dest, entry] of handlers) {
    if (entry.id === id) return dest
  }
  return null
}

function dispatch(destination, rawBody) {
  if (!destination || !handlers.has(destination)) return
  let event = rawBody
  if (typeof event === 'string') {
    try {
      event = JSON.parse(event)
    } catch {
      return
    }
  }
  if (!event || !PROJECT_EVENT_TYPES.has(event.type)) return
  for (const handler of handlers.get(destination).callbacks) handler(event)
}

function consumeFrames() {
  let index = frameBuffer.indexOf('\0')
  while (index !== -1) {
    const raw = frameBuffer.slice(0, index)
    frameBuffer = frameBuffer.slice(index + 1)
    const endOfHead = raw.indexOf('\n\n')
    const headText = endOfHead === -1 ? raw : raw.slice(0, endOfHead)
    const bodyText = endOfHead === -1 ? '' : raw.slice(endOfHead + 2)
    const lines = headText.replace(/\r/g, '').split('\n')
    const command = lines[0]

    if (command === 'CONNECTED') {
      attempt = 0
      setStatus('connected')
      for (const [dest, entry] of handlers) {
        send('SUBSCRIBE', { id: entry.id, destination: dest, ack: 'auto' })
      }
    } else if (command === 'MESSAGE') {
      let destination = null
      let subscriptionId = null
      for (const line of lines.slice(1)) {
        if (line.startsWith('destination:')) destination = line.slice(12)
        else if (line.startsWith('subscription:')) subscriptionId = line.slice(13)
      }
      dispatch(destination || destinationForId(subscriptionId), bodyText)
    } else if (command === 'ERROR') {
      emit('error')
    }
    index = frameBuffer.indexOf('\0')
  }
}

function scheduleReconnect() {
  if (!wantConnection || reconnectTimer) return
  const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]
  attempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    open()
  }, delay)
}

function open() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }
  wantConnection = true
  setStatus('connecting')
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  let candidate
  try {
    candidate = new WebSocket(`${scheme}://${window.location.host}${ENDPOINT_PATH}`)
  } catch {
    setStatus('disconnected')
    scheduleReconnect()
    return
  }
  socket = candidate
  frameBuffer = ''

  candidate.onopen = () => {
    send('CONNECT', { 'accept-version': '1.2,1.1', 'heart-beat': '0,0' })
  }
  candidate.onmessage = (message) => {
    if (typeof message.data === 'string') {
      frameBuffer += message.data
      consumeFrames()
    }
  }
  candidate.onerror = () => {
    emit('error')
  }
  candidate.onclose = () => {
    socket = null
    frameBuffer = ''
    if (!wantConnection) return
    setStatus('disconnected')
    scheduleReconnect()
  }
}

function closeSocket() {
  if (!socket) return
  const closing = socket
  socket = null
  closing.onclose = null
  closing.onerror = null
  closing.onmessage = null
  closing.onopen = null
  try {
    if (closing.readyState === WebSocket.OPEN) {
      closing.send(encode('DISCONNECT', { receipt: `bye-${nextSubId}` }))
    }
    closing.close()
  } catch {
    // Socket already gone; nothing to report.
  }
}

export function connect() {
  wantConnection = true
  open()
}

export function disconnect() {
  wantConnection = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  handlers.clear()
  closeSocket()
  setStatus('idle')
}

export function subscribe(destination, handler) {
  if (!handlers.has(destination)) {
    handlers.set(destination, { id: `sub-${nextSubId++}`, callbacks: new Set() })
    send('SUBSCRIBE', { id: handlers.get(destination).id, destination, ack: 'auto' })
  }
  const entry = handlers.get(destination)
  entry.callbacks.add(handler)
  return () => {
    const current = handlers.get(destination)
    if (!current) return
    current.callbacks.delete(handler)
    if (current.callbacks.size === 0) {
      handlers.delete(destination)
      send('UNSUBSCRIBE', { id: current.id })
    }
  }
}

export function projectTopic(projectId) {
  return `${BROKER_PREFIX}/projects/${projectId}`
}

export function getStatus() {
  return status
}

export function addListener(listener) {
  listeners.add(listener)
  listener(status)
  return () => listeners.delete(listener)
}

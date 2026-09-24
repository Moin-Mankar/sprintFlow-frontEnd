import { useEffect, useRef, useState } from 'react'
import {
  addPushMessageListener,
  addPushStateListener,
  enablePushNotifications,
  getPushState,
} from './pushService.js'

// { status, permission, message } plus the one user action allowed to prompt.
export function usePushNotifications() {
  const [state, setState] = useState(getPushState)
  useEffect(() => addPushStateListener(setState), [])
  return { ...state, enable: enablePushNotifications }
}

// Foreground FCM messages. The backend has already persisted the notification, so
// handlers refetch rather than inserting anything locally.
export function usePushMessage(handler) {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => addPushMessageListener((message) => handlerRef.current?.(message)), [])
}

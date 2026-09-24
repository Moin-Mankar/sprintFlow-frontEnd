import { useEffect, useRef, useState } from 'react'
import { addListener, projectTopic, subscribe } from './stompClient.js'

// Live status for the shared socket: 'idle' | 'connecting' | 'connected' | 'disconnected'.
export function useRealtimeStatus() {
  const [status, setStatus] = useState('idle')
  useEffect(() => addListener(setStatus), [])
  return status
}

// Subscribe to the project topic the backend publishes ProjectEvent payloads on
// (/topic/projects/{projectId}). One socket, ref-counted per destination, and the
// handler stays current without re-subscribing.
export function useProjectEvents(projectId, onEvent) {
  const status = useRealtimeStatus()
  const handlerRef = useRef(onEvent)

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!projectId) return undefined
    return subscribe(projectTopic(projectId), (event) => {
      handlerRef.current?.(event)
    })
  }, [projectId])

  return status
}

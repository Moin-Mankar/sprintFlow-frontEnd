import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client.js'
import { connect, disconnect } from '../realtime/stompClient.js'
import { startPushSession, stopPushSession } from '../notifications/pushService.js'
import { openGoogleLoginPopup, extractEmailFromJwt } from '../utils/googleAuth.js'
import { AuthContext } from './context.js'

const TOKEN_KEY = 'token'
const EMAIL_KEY = 'email'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY))

  const login = useCallback(async (emailArg, password) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email: emailArg, password },
    })
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(EMAIL_KEY, emailArg)
    setToken(data.token)
    setEmail(emailArg)
  }, [])

  const register = useCallback(
    async (name, emailArg, password) => {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: { name, email: emailArg, password },
      })
      // Register returns no JWT, so sign in with the same credentials.
      await login(emailArg, password)
    },
    [login],
  )

  const googleLogin = useCallback(async () => {
    const jwt = await openGoogleLoginPopup()
    // Same storage mechanism as email/password login — one auth system.
    localStorage.setItem(TOKEN_KEY, jwt)
    setToken(jwt)
    const googleEmail = extractEmailFromJwt(jwt) // display only
    if (googleEmail) {
      localStorage.setItem(EMAIL_KEY, googleEmail)
      setEmail(googleEmail)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setToken(null)
    setEmail(null)
  }, [])

  // The socket follows auth state only: never open while unauthenticated, always
  // drop on logout, and a reload with a stored token reconnects through here.
  useEffect(() => {
    if (token) connect()
    else disconnect()
  }, [token])

  // Push follows the same rule, so an unauthenticated tab never registers a token.
  // Nothing here prompts the browser; that stays behind an explicit user action.
  useEffect(() => {
    if (token) void startPushSession()
    else stopPushSession()
  }, [token])

  const value = useMemo(
    () => ({
      token,
      email,
      isAuthenticated: Boolean(token),
      login,
      register,
      googleLogin,
      logout,
    }),
    [token, email, login, register, googleLogin, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

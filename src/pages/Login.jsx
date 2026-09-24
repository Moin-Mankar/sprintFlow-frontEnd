import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'

export default function Login() {
  const { login, googleLogin } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setFieldErrors({})
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/workspaces')
    } catch (err) {
      setFieldErrors(err.fieldErrors || {})
      setFormError(err.status === 0 ? err.message : err.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setFormError('')
    setFieldErrors({})
    setGoogleLoading(true)
    try {
      await googleLogin()
      navigate('/workspaces')
    } catch (err) {
      setFormError(err.message || 'Google sign-in failed.')
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">SprintFlow</h1>
        <p className="auth-subtitle">Log in to your account</p>
        {formError && <p className="form-error">{formError}</p>}
        <form onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
            />
            {fieldErrors.email && <span className="field-error">{fieldErrors.email.join('; ')}</span>}
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete="current-password"
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password.join('; ')}</span>
            )}
          </label>
          <button type="submit" className="btn-block" disabled={loading}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
        <div className="auth-divider">
          <span>OR</span>
        </div>
        <button
          type="button"
          className="btn-block btn-google"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
        >
          {googleLoading ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <p className="auth-switch">
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </main>
  )
}

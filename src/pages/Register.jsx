import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setFieldErrors({})
    if (form.password.length < 8 || form.password.length > 100) {
      setFieldErrors({ password: ['Password must be between 8 and 100 characters.'] })
      return
    }
    setLoading(true)
    try {
      await register(form.name, form.email, form.password)
      navigate('/workspaces')
    } catch (err) {
      setFieldErrors(err.fieldErrors || {})
      setFormError(err.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">SprintFlow</h1>
        <p className="auth-subtitle">Create your account</p>
        {formError && <p className="form-error">{formError}</p>}
        <form onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Name</span>
            <input type="text" value={form.name} onChange={update('name')} autoComplete="name" />
            {fieldErrors.name && <span className="field-error">{fieldErrors.name.join('; ')}</span>}
          </label>
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
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password.join('; ')}</span>
            )}
          </label>
          <button type="submit" className="btn-block" disabled={loading}>
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </main>
  )
}

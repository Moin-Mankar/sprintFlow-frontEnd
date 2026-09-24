import { useState } from 'react'
import { apiFetch } from '../api/client.js'

// CreateInvitationRequest: { email } — @NotBlank @Email, nothing else.
export default function InviteMember({ workspaceId }) {
  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [invited, setInvited] = useState(null) // InvitationResponse of the last invite
  const [copied, setCopied] = useState(false)

  const joinLink = invited ? `${window.location.origin}/join/${invited.token}` : ''

  async function handleInvite(e) {
    e.preventDefault()
    setFormError('')
    setFieldErrors({})
    if (!email.trim()) {
      setFieldErrors({ email: ['Email is required'] })
      return
    }
    setSaving(true)
    try {
      const invitation = await apiFetch(`/api/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        body: { email },
      })
      setInvited(invitation)
      setEmail('')
      setCopied(false)
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setFormError(err.message || 'Failed to create invitation.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinLink)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="panel">
      <div className="section-head">
        <h2>Invite member</h2>
      </div>
      {invited && (
        <div className="invite-success">
          <p>
            Invitation created for <strong>{invited.email}</strong> — valid until{' '}
            {new Date(invited.expiresAt).toLocaleString()}
          </p>
          <p className="invite-link">{joinLink}</p>
          <div className="task-card-actions">
            <button type="button" className="btn-secondary" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="link-button link-primary" onClick={() => setInvited(null)}>
              Invite another
            </button>
          </div>
        </div>
      )}
      {!invited && (
        <form className="invite-form invite-form-stacked" onSubmit={handleInvite} noValidate>
          {formError && <p className="form-error">{formError}</p>}
          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email.join('; ')}</span>
            )}
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Inviting…' : 'Send Invitation'}
          </button>
        </form>
      )}
    </div>
  )
}

import { NavLink, useLocation } from 'react-router-dom'

const GLOBAL_LINKS = [
  { to: '/workspaces', label: 'Overview', end: true },
  { to: '/search', label: 'Search tasks' },
  { to: '/notifications', label: 'Notifications' },
]

// Derived from the URL alone: the sidebar never fetches, so it can only offer
// destinations the router already has a route for.
function readContext(pathname) {
  const project = pathname.match(/^\/projects\/([^/]+)/)
  if (project) {
    return { kind: 'project', base: `/projects/${project[1]}` }
  }
  const workspace = pathname.match(/^\/workspaces\/([^/]+)/)
  if (workspace) {
    return { kind: 'workspace', base: `/workspaces/${workspace[1]}` }
  }
  return null
}

function SidebarLink({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
    >
      {label}
    </NavLink>
  )
}

export default function Sidebar() {
  const { pathname } = useLocation()
  const ctx = readContext(pathname)

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="nav-group">
        <p className="nav-group-title">Workspace</p>
        {GLOBAL_LINKS.map((link) => (
          <SidebarLink key={link.to} {...link} />
        ))}
      </div>

      {ctx && (
        <div className="nav-group">
          <p className="nav-group-title">
            {ctx.kind === 'project' ? 'Current project' : 'Current workspace'}
          </p>
          {ctx.kind === 'project' ? (
            <>
              <SidebarLink to={ctx.base} label="Overview" end />
              <SidebarLink to={`${ctx.base}/dashboard`} label="Dashboard" />
              <SidebarLink to={`${ctx.base}/board`} label="Board" />
            </>
          ) : (
            <>
              <SidebarLink to={ctx.base} label="Projects" end />
              <SidebarLink to={`${ctx.base}/dashboard`} label="Dashboard" />
            </>
          )}
        </div>
      )}
    </nav>
  )
}

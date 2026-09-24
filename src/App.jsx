import { Routes, Route, Navigate, Link } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Workspaces from './pages/Workspaces.jsx'
import WorkspaceDetail from './pages/WorkspaceDetail.jsx'
import WorkspaceDashboard from './pages/WorkspaceDashboard.jsx'
import JoinInvitation from './pages/JoinInvitation.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import ProjectDashboard from './pages/ProjectDashboard.jsx'
import ProjectBoard from './pages/ProjectBoard.jsx'
import TaskDetail from './pages/TaskDetail.jsx'
import TaskSearch from './pages/TaskSearch.jsx'
import Notifications from './pages/Notifications.jsx'

function NotFound() {
  return (
    <main className="shell-main">
      <h1>Page not found</h1>
      <p>
        <Link to="/workspaces">Back to SprintFlow</Link>
      </p>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/workspaces" element={<Workspaces />} />
        <Route path="/workspaces/:workspaceId" element={<WorkspaceDetail />} />
        <Route
          path="/workspaces/:workspaceId/dashboard"
          element={<WorkspaceDashboard />}
        />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/projects/:projectId/dashboard" element={<ProjectDashboard />} />
        <Route path="/projects/:projectId/board" element={<ProjectBoard />} />
        <Route path="/tasks/:taskId" element={<TaskDetail />} />
        <Route path="/search" element={<TaskSearch />} />
        <Route path="/join/:token" element={<JoinInvitation />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>

      <Route path="/" element={<Navigate to="/workspaces" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

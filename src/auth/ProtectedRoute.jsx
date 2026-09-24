import { Navigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { useAuth } from './context.js'

export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Layout />
}

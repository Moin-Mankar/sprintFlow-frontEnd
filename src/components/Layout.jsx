import { Outlet } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import PushNotice from './PushNotice.jsx'
import Sidebar from './Sidebar.jsx'

export default function Layout() {
  return (
    <div className="app">
      <Navbar />
      <PushNotice />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

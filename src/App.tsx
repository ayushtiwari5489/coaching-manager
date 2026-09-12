import { useEffect, type ReactNode } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { PageLoader } from './components/ui'
import Login from './pages/Login'
import { AdminLayout, TeacherLayout } from './components/layout'

import AdminDashboard from './pages/admin/Dashboard'
import Students from './pages/admin/Students'
import StudentDetail from './pages/admin/StudentDetail'
import Teachers from './pages/admin/Teachers'
import Batches from './pages/admin/Batches'
import AdminAttendance from './pages/admin/Attendance'
import Fees from './pages/admin/Fees'
import ReceiptView from './pages/admin/ReceiptView'
import Reports from './pages/admin/Reports'
import DataCenter from './pages/admin/DataCenter'
import Settings from './pages/admin/Settings'

import TeacherHome from './pages/teacher/Home'
import TeacherClasses from './pages/teacher/Classes'
import TeacherAttendance from './pages/teacher/Attendance'
import TeacherProfile from './pages/teacher/Profile'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <PageLoader />
  if (!session) return <Navigate to="/login" state={{ from: loc }} replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()
  if (loading) return <PageLoader />
  if (role !== 'admin') return <Navigate to="/teacher/home" replace />
  return <>{children}</>
}

function RequireTeacher({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()
  if (loading) return <PageLoader />
  if (role !== 'teacher') return <Navigate to="/app/dashboard" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { role, loading } = useAuth()
  const loc = useLocation()
  useEffect(() => {
    if (loading) return
    if (!role) {
      window.location.replace('/login')
      return
    }
    window.location.replace(role === 'admin' ? '/app/dashboard' : '/teacher/home')
  }, [role, loading])
  void loc
  return <PageLoader />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RootRedirect />} />

      {/* Admin area */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/new" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="batches" element={<Batches />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="fees" element={<Fees />} />
        <Route path="receipts/:id" element={<ReceiptView />} />
        <Route path="reports" element={<Reports />} />
        <Route path="data" element={<DataCenter />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Teacher area */}
      <Route
        path="/teacher"
        element={
          <RequireAuth>
            <RequireTeacher>
              <TeacherLayout />
            </RequireTeacher>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/teacher/home" replace />} />
        <Route path="home" element={<TeacherHome />} />
        <Route path="classes" element={<TeacherClasses />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="profile" element={<TeacherProfile />} />
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
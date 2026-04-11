import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { AppShell } from '@/components/shared/AppShell'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useAccountType } from '@/hooks/useAccountType'

// ─── Lazy-loaded pages (code-split per route) ─────────────────────────────
const LandingPage = lazy(() => import('@/pages/LandingPage').then(m => ({ default: m.LandingPage })))
const UploadPage = lazy(() => import('@/pages/UploadPage').then(m => ({ default: m.UploadPage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })))
const SignupPage = lazy(() => import('@/pages/SignupPage').then(m => ({ default: m.SignupPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const BusinessOwnerDashboard = lazy(() => import('@/pages/BusinessOwnerDashboard').then(m => ({ default: m.BusinessOwnerDashboard })))
const ClientsPage = lazy(() => import('@/pages/ClientsPage').then(m => ({ default: m.ClientsPage })))
const AddClientPage = lazy(() => import('@/pages/AddClientPage').then(m => ({ default: m.AddClientPage })))
const ClientDetailPage = lazy(() => import('@/pages/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const EditClientPage = lazy(() => import('@/pages/EditClientPage').then(m => ({ default: m.EditClientPage })))
const HelpPage = lazy(() => import('@/pages/HelpPage').then(m => ({ default: m.HelpPage })))

// ─── Loading fallback ──────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  )
}

/** Runtime dashboard router — renders based on account_type from DB, not build-time env */
function DashboardRouter() {
  const { isSolo } = useAccountType()
  return isSolo ? <BusinessOwnerDashboard /> : <DashboardPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/upload/:token" element={<UploadPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardRouter />} />
            <Route path="/clients/new" element={<AddClientPage />} />
            <Route path="/clients/:clientId" element={<ClientDetailPage />} />
            <Route path="/clients/:clientId/edit" element={<EditClientPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<HelpPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

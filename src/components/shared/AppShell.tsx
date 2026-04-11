import { useMemo } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { useAccountType } from '@/hooks/useAccountType'
import { isDemoMode } from '@/lib/mode'
import { tenantConfig } from '@/lib/tenant.config'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Settings, LogOut, Sparkles, ArrowRight, Briefcase, HelpCircle } from 'lucide-react'
import { NotificationCenter } from '@/components/shared/NotificationCenter'

export function AppShell() {
  const location = useLocation()
  const signOut = useAuthStore(state => state.signOut)
  const bookkeeper = useAuthStore(state => state.bookkeeper)
  const { isSolo, selfClientId } = useAccountType()

  const navItems = useMemo(() => {
    if (isSolo) {
      return [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        ...(selfClientId
          ? [{ to: `/clients/${selfClientId}`, label: 'My Business', icon: Briefcase }]
          : []),
        { to: '/help', label: 'Help', icon: HelpCircle },
        { to: '/settings', label: 'Settings', icon: Settings },
      ]
    }
    return [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/clients', label: `${tenantConfig.clientLabel}s`, icon: Users },
      { to: '/help', label: 'Help', icon: HelpCircle },
      { to: '/settings', label: 'Settings', icon: Settings },
    ]
  }, [isSolo, selfClientId])

  const productName = isSolo ? `${tenantConfig.productName} Solo` : tenantConfig.productName
  const subtitle = isSolo ? bookkeeper?.business_name : bookkeeper?.practice_name

  return (
    <div className="flex min-h-svh bg-surface">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        {/* Logo */}
        <div className="border-b border-gray-200 px-4 py-5">
          <h1 className="text-lg font-bold text-primary-dark">{productName}</h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-3">
          {navItems.map(item => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary-dark'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}

        </nav>

        {/* User + sign out */}
        <div className="border-t border-gray-200 px-3 py-3">
          <p className="truncate text-xs font-medium text-gray-700">
            {bookkeeper?.full_name ?? 'Loading...'}
          </p>
          <p className="truncate text-xs text-gray-400">{bookkeeper?.email}</p>
          <button
            onClick={signOut}
            className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top header bar with notifications */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2">
          <div className="text-xs text-gray-400">
            {isDemoMode && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                <Sparkles className="h-3 w-3" />
                Interactive Demo {isSolo ? '(Solo)' : '(Practitioner)'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
          </div>
        </div>

        {isDemoMode && !isSolo && (
          <div className="bg-gradient-to-r from-primary/90 to-primary-dark text-white py-2.5 px-4 text-sm flex items-center justify-center gap-3">
            <span>Click any client to explore statement parsing, auto-reconciliation, and more</span>
            <Link
              to="/clients/client-001"
              className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
            >
              Try it <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {isDemoMode && isSolo && selfClientId && (
          <div className="bg-gradient-to-r from-amber-500/90 to-amber-600 text-white py-2.5 px-4 text-sm flex items-center justify-center gap-3">
            <span>Explore your business dashboard — receipt scanning and financial tracking</span>
            <Link
              to={`/clients/${selfClientId}`}
              className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
            >
              My Business <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}

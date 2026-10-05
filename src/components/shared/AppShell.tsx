import { useState, useMemo } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { useAccountType } from '@/hooks/useAccountType'
import { isDemoMode } from '@/lib/mode'
import { tenantConfig } from '@/lib/tenant.config'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Settings, LogOut, Sparkles, ArrowRight, Briefcase, HelpCircle, Menu, X } from 'lucide-react'
import { NotificationCenter } from '@/components/shared/NotificationCenter'

export function AppShell() {
  const location = useLocation()
  const signOut = useAuthStore(state => state.signOut)
  const bookkeeper = useAuthStore(state => state.bookkeeper)
  const { isSolo, selfClientId } = useAccountType()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white',
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo + close button (mobile) */}
        <div className="flex items-start justify-between border-b border-gray-200 px-4 py-5">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-primary-dark">{productName}</h1>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>
            )}
          </div>
          <button
            className="ml-2 shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-3">
          {navItems.map(item => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'mb-1 flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
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
      <main className="flex min-h-svh min-w-0 flex-1 flex-col overflow-auto">
        {/* Top header bar with notifications */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2">
          <div className="flex items-center gap-2">
            {/* Hamburger — mobile only */}
            <button
              className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {isDemoMode && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                <Sparkles className="h-3 w-3" />
                <span className="hidden sm:inline">Interactive </span>Demo {isSolo ? '(Solo)' : '(Practitioner)'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
          </div>
        </div>

        {isDemoMode && !isSolo && (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-gradient-to-r from-primary/90 to-primary-dark px-4 py-2.5 text-center text-sm text-white">
            <span>Click any client to explore statement parsing and more</span>
            <Link
              to="/clients/client-001"
              className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
            >
              Try it <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {isDemoMode && isSolo && selfClientId && (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-gradient-to-r from-amber-500/90 to-amber-600 px-4 py-2.5 text-center text-sm text-white">
            <span>Explore your business dashboard — receipt scanning and financial tracking</span>
            <Link
              to={`/clients/${selfClientId}`}
              className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
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

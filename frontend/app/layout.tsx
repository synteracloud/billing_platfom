import "../styles/globals.css";
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AppShell } from '@billing-platform/ui';
import { AuthProvider } from '@/lib/auth-context';

const TopNav = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <strong>Billing Platform · Finance Workspace</strong>
    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--typography-font-size-sm)' }}>
      Visualization + workflow shell (not ledger source-of-truth)
    </span>
  </div>
);

const Sidebar = () => (
  <nav>
    <ul>
      <li><Link href="/dashboard">Dashboard</Link></li>
      <li><Link href="/general-ledger">General Ledger</Link></li>
      <li><Link href="/financial-statements">Financial Statements</Link></li>
      <li><Link href="/period-close">Period Close</Link></li>
      <li><Link href="/tax-center">Tax Center</Link></li>
      <li><Link href="/permissions-admin">Permissions &amp; Admin</Link></li>
      <li><Link href="/audit-trail">Audit Trail Inspector</Link></li>
      <li><Link href="/invoices">Invoices</Link></li>
      <li><Link href="/payments">Payments</Link></li>
    </ul>
  </nav>
);

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell topNav={<TopNav />} sidebar={<Sidebar />}>
            {children as any}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}

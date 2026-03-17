import "../styles/globals.css";
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AppShell } from '@billing-platform/ui';
import { AuthProvider } from '@/lib/auth-context';

const TopNav = () => <div>Billing Platform</div>;

const Sidebar = () => (
  <nav>
    <ul>
      <li><Link href="/dashboard">Dashboard</Link></li>
      <li><Link href="/customers">Customers</Link></li>
      <li><Link href="/products">Products</Link></li>
      <li><Link href="/invoices">Invoices</Link></li>
      <li><Link href="/payments">Payments</Link></li>
      <li><Link href="/subscriptions">Subscriptions</Link></li>
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

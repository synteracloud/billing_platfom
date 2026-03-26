import { UserRole } from '../../common/interfaces/authenticated-request.interface';

export const PERMISSIONS = {
  POST_JOURNAL_ENTRIES: 'post_journal_entries',
  CLOSE_PERIODS: 'close_periods',
  REOPEN_BOOKS: 'reopen_books',
  VIEW_REPORTS: 'view_reports',
  MANAGE_INTEGRATIONS: 'manage_integrations',
  APPROVE_RECONCILIATION_MANUAL_OVERRIDES: 'approve_reconciliation_manual_overrides'
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  owner: new Set(ALL_PERMISSIONS),
  admin: new Set([
    PERMISSIONS.POST_JOURNAL_ENTRIES,
    PERMISSIONS.CLOSE_PERIODS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_INTEGRATIONS,
    PERMISSIONS.APPROVE_RECONCILIATION_MANUAL_OVERRIDES
  ]),
  accountant: new Set([
    PERMISSIONS.POST_JOURNAL_ENTRIES,
    PERMISSIONS.CLOSE_PERIODS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.APPROVE_RECONCILIATION_MANUAL_OVERRIDES
  ]),
  finance_manager: new Set([
    PERMISSIONS.POST_JOURNAL_ENTRIES,
    PERMISSIONS.CLOSE_PERIODS,
    PERMISSIONS.REOPEN_BOOKS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.APPROVE_RECONCILIATION_MANUAL_OVERRIDES
  ]),
  staff: new Set([PERMISSIONS.VIEW_REPORTS]),
  read_only_auditor: new Set([PERMISSIONS.VIEW_REPORTS])
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

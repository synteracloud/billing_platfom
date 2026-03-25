import { AccountDefinition, PostingRuleExpectation } from './entities/chart-of-account.entity';

export const DEFAULT_CHART_OF_ACCOUNTS: AccountDefinition[] = [
  {
    key: 'cash',
    code: '1000',
    name: 'Cash',
    type: 'asset',
    description: 'Primary cash account used for settled receipts and outbound disbursements.',
    system: true
  },
  {
    key: 'bank_clearing',
    code: '1010',
    name: 'Bank Clearing',
    type: 'asset',
    description: 'Clearing account for payment processor settlement timing differences.',
    system: true
  },
  {
    key: 'accounts_receivable',
    code: '1100',
    name: 'Accounts Receivable',
    type: 'asset',
    description: 'Tenant control account for issued customer invoices awaiting settlement.',
    system: true
  },
  {
    key: 'operating_expense',
    code: '5000',
    name: 'Expense',
    type: 'expense',
    description: 'Default operating expense account for approved bills and adjustments.',
    system: true
  },
  {
    key: 'refund_expense',
    code: '5010',
    name: 'Refund Expense',
    type: 'expense',
    description: 'Default expense account for payment refunds when contra-revenue is not configured.',
    system: true
  },
  {
    key: 'accounts_payable',
    code: '2000',
    name: 'Accounts Payable',
    type: 'liability',
    description: 'Tenant control account for approved vendor bills awaiting payment.',
    system: true
  },
  {
    key: 'sales_tax_payable',
    code: '2100',
    name: 'Sales Tax Payable',
    type: 'liability',
    description: 'Liability account for taxes recognized on invoicing when applicable.',
    system: true
  },
  {
    key: 'unallocated_cash',
    code: '2200',
    name: 'Unallocated Cash',
    type: 'liability',
    description: 'Liability/suspense account for settled cash that is not yet allocated to receivables.',
    system: true
  },
  {
    key: 'revenue',
    code: '4000',
    name: 'Revenue',
    type: 'revenue',
    description: 'Default revenue account credited when invoices are issued.',
    system: true
  }
];

export const POSTING_RULE_EXPECTATIONS: PostingRuleExpectation[] = [
  {
    eventType: 'billing.invoice.created.v1',
    requiredAccounts: [
      {
        key: 'accounts_receivable',
        allowedTypes: ['asset'],
        rationale: 'Invoice creation debits accounts receivable.'
      },
      {
        key: 'revenue',
        allowedTypes: ['revenue'],
        rationale: 'Invoice creation credits revenue.'
      },
      {
        key: 'sales_tax_payable',
        allowedTypes: ['liability'],
        rationale: 'Taxable invoices can credit tax liability.'
      }
    ]
  },
  {
    eventType: 'billing.invoice.issued.v1',
    requiredAccounts: [
      {
        key: 'accounts_receivable',
        allowedTypes: ['asset'],
        rationale: 'Invoice issuance debits accounts receivable.'
      },
      {
        key: 'revenue',
        allowedTypes: ['revenue'],
        rationale: 'Invoice issuance credits revenue.'
      },
      {
        key: 'sales_tax_payable',
        allowedTypes: ['liability'],
        rationale: 'Taxable invoices can credit tax liability.'
      }
    ]
  },
  {
    eventType: 'billing.payment.settled.v1',
    requiredAccounts: [
      {
        key: 'cash',
        allowedTypes: ['asset'],
        rationale: 'Settled payments debit cash when funds land immediately.'
      },
      {
        key: 'bank_clearing',
        allowedTypes: ['asset'],
        rationale: 'Settled payments may debit bank clearing prior to cash transfer.'
      },
      {
        key: 'accounts_receivable',
        allowedTypes: ['asset'],
        rationale: 'Settled payments credit receivables for allocated amounts.'
      },
      {
        key: 'unallocated_cash',
        allowedTypes: ['liability'],
        rationale: 'Unallocated receipts stay in liability/suspense until applied.'
      }
    ]
  },
  {
    eventType: 'billing.payment.refunded.v1',
    requiredAccounts: [
      {
        key: 'refund_expense',
        allowedTypes: ['expense', 'contra_revenue'],
        rationale: 'Refunds debit refund expense or a contra-revenue account.'
      },
      {
        key: 'cash',
        allowedTypes: ['asset'],
        rationale: 'Refunds credit cash when funds are disbursed.'
      },
      {
        key: 'accounts_receivable',
        allowedTypes: ['asset'],
        rationale: 'AR can be adjusted if the original refund reversed a settled invoice.'
      }
    ]
  },
  {
    eventType: 'billing.bill.approved.v1',
    requiredAccounts: [
      {
        key: 'operating_expense',
        allowedTypes: ['expense', 'asset'],
        rationale: 'Approved bills debit an expense or asset account.'
      },
      {
        key: 'accounts_payable',
        allowedTypes: ['liability'],
        rationale: 'Approved bills credit accounts payable.'
      }
    ]
  },
  {
    eventType: 'billing.bill.paid.v1',
    requiredAccounts: [
      {
        key: 'accounts_payable',
        allowedTypes: ['liability'],
        rationale: 'Bill payments debit accounts payable.'
      },
      {
        key: 'cash',
        allowedTypes: ['asset'],
        rationale: 'Bill payments credit cash.'
      }
    ]
  }
];

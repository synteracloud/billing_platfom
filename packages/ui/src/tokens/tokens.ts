export const tokens = {
  color: {
    background: '#F7F8FA',
    surface: '#FFFFFF',
    surfaceMuted: '#F3F4F6',
    textPrimary: '#111827',
    textSecondary: '#374151',
    textMuted: '#6B7280',
    borderDefault: '#D1D5DB',
    borderSubtle: '#E5E7EB',
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#0284C7',
    tableHeader: '#F9FAFB',
    tableRowHover: '#EFF6FF',
    overlay: 'rgba(17, 24, 39, 0.45)',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '32px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },
  typography: {
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
    fontSize: {
      xs: '12px',
      sm: '13px',
      md: '14px',
      lg: '16px',
      xl: '20px',
      display: '28px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  border: {
    width: {
      thin: '1px',
      default: '2px',
    },
  },
  shadow: {
    sm: '0 1px 2px rgba(15, 23, 42, 0.08)',
    md: '0 4px 12px rgba(15, 23, 42, 0.12)',
  },
  motion: {
    fast: '120ms',
    normal: '200ms',
  },
  size: {
    sidebar: '240px',
    drawer: '480px',
    modal: '640px',
    tableColumnMin: '260px',
    textareaMinHeight: '96px',
  },
  zIndex: {
    overlay: 1100,
    modal: 1200,
  },
} as const;

export type TokenSet = typeof tokens;

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminGuard } from '../AdminGuard';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockAddToast = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

vi.mock('@/components/ui/toast/ToastProvider', () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `mock_t_${key}`,
}));

const mockUseAdminAccess = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAdminAccess', () => ({
  useAdminAccess: mockUseAdminAccess,
}));

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loader when loading', () => {
    mockUseAdminAccess.mockReturnValue({
      isAdmin: false,
      isLoading: true,
      project: null,
    });

    render(
      <AdminGuard>
        <div>Admin Content</div>
      </AdminGuard>
    );

    // If it's loading, we render the loader (Lucide-react has class animate-spin)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('redirects and shows toast if not admin', () => {
    mockUseAdminAccess.mockReturnValue({
      isAdmin: false,
      isLoading: false,
      project: null,
    });

    render(
      <AdminGuard>
        <div>Admin Content</div>
      </AdminGuard>
    );

    expect(mockAddToast).toHaveBeenCalledWith({
      title: 'mock_t_accessDenied',
      variant: 'error',
    });
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('renders children if admin', () => {
    mockUseAdminAccess.mockReturnValue({
      isAdmin: true,
      isLoading: false,
      project: {},
    });

    render(
      <AdminGuard>
        <div>Admin Content</div>
      </AdminGuard>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
    expect(mockAddToast).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

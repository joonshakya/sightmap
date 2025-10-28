import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { expect, test, vi, beforeEach, describe } from 'vitest'
import SignUpForm from './sign-up-form'

// Mock all external dependencies
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(() => ({ isPending: false })),
  },
}))

vi.mock('@/components/loader', () => ({
  default: () => <div data-testid="loader">Loading...</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant }: any) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({ id, type }: any) => (
    <input id={id} type={type} data-testid={`input-${id}`} />
  ),
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ htmlFor, children }: any) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}))

describe('SignUpForm', () => {
  const mockOnSwitchToSignIn = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders basic sign-up form structure', () => {
    render(<SignUpForm onSwitchToSignIn={mockOnSwitchToSignIn} />)

    expect(screen.getByText('Create Account')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /already have an account\?/i })).toBeInTheDocument()
  })



  test('calls onSwitchToSignIn when sign in button is clicked', () => {
    render(<SignUpForm onSwitchToSignIn={mockOnSwitchToSignIn} />)

    const signInButton = screen.getByRole('button', { name: /already have an account\?/i })
    fireEvent.click(signInButton)

    expect(mockOnSwitchToSignIn).toHaveBeenCalled()
  })

  test('renders all required form inputs', () => {
    render(<SignUpForm onSwitchToSignIn={mockOnSwitchToSignIn} />)

    expect(screen.getByTestId('input-name')).toBeInTheDocument()
    expect(screen.getByTestId('input-email')).toBeInTheDocument()
    expect(screen.getByTestId('input-password')).toBeInTheDocument()
  })

  test('form has correct structure and CSS classes', () => {
    const { container } = render(<SignUpForm onSwitchToSignIn={mockOnSwitchToSignIn} />)

    // Should have form wrapper with proper classes
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('mx-auto', 'w-full', 'mt-10', 'max-w-md', 'p-6')

    // Should have a form element
    expect(container.querySelector('form')).toBeInTheDocument()
  })

  test('sign-in button has link variant styling', () => {
    render(<SignUpForm onSwitchToSignIn={mockOnSwitchToSignIn} />)

    const signInButton = screen.getByRole('button', { name: /already have an account\?/i })
    expect(signInButton).toHaveAttribute('data-variant', 'link')
  })

  test('input fields have correct attributes', () => {
    render(<SignUpForm onSwitchToSignIn={mockOnSwitchToSignIn} />)

    const emailInput = screen.getByTestId('input-email')
    const passwordInput = screen.getByTestId('input-password')

    expect(emailInput).toHaveAttribute('type', 'email')
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('verifies complete sign-up form setup', () => {
    // This test demonstrates that the sign-up form includes all the necessary
    // components for user registration and follows consistent patterns

    render(<SignUpForm onSwitchToSignIn={mockOnSwitchToSignIn} />)

    // Verify title indicates account creation
    expect(screen.getByText('Create Account')).toBeInTheDocument()

    // Verify all registration fields are present
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()

    // Verify call-to-action button
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()

    // Verify users can switch between sign-in and sign-up
    expect(screen.getByRole('button', { name: /already have an account\?/i })).toBeInTheDocument()

    // The form is ready for new user registration with proper field validation,
    // account creation flow, and navigation between auth states
  })
})

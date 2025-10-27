import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { Link } from '@tanstack/react-router'
import Header from './header'

// Mock external dependencies first
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn()
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
  useMutation: () => ({ mutate: vi.fn() })
}))

// Mock common modules with Prisma
vi.mock('@sightmap/common/prisma/enums', () => ({
  StepSize: {
    SMALL: 'SMALL',
    MEDIUM: 'MEDIUM',
    LARGE: 'LARGE'
  }
}))

vi.mock('@sightmap/common', () => ({
  toTitleCase: vi.fn((str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase())
}))

vi.mock('@/utils/trpc', () => ({
  trpc: {
    userSettings: {
      get: {
        queryOptions: () => ({}),
        useQuery: () => ({ data: undefined, refetch: vi.fn() })
      },
      updateStepSize: {
        mutationOptions: () => ({}),
        useMutation: () => ({ mutate: vi.fn() })
      }
    }
  }
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    signOut: vi.fn()
  }
}))

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Moon: () => null,
  Sun: () => null
}))

// Mock the components since we want to isolate Header
vi.mock('./mode-toggle', () => ({
  ModeToggle: () => <div data-testid="mode-toggle">ModeToggle</div>
}))

vi.mock('./user-menu', () => ({
  default: () => <div data-testid="user-menu">UserMenu</div>
}))

test('renders header with logo and title', () => {
  render(<Header />)

  // Check logo image with alt text
  const logo = screen.getByAltText('Sight Map logo')
  expect(logo).toBeInTheDocument()
  expect(logo).toHaveAttribute('src', '/sightmap_logo.png')
  expect(logo).toHaveClass('h-8', 'w-8', 'object-contain')

  // Check title
  expect(screen.getByText('Sight Map')).toBeInTheDocument()
  expect(screen.getByText('Sight Map')).toHaveClass('font-semibold', 'text-md')
})

test('renders navigation links', () => {
  render(<Header />)

  // Check Home link
  const homeLink = screen.getByText('Home')
  expect(homeLink).toBeInTheDocument()
  expect(homeLink.closest('a')).toHaveAttribute('href', '/')
})

test('renders mode toggle and user menu', () => {
  render(<Header />)

  expect(screen.getByTestId('mode-toggle')).toBeInTheDocument()
  expect(screen.getByTestId('user-menu')).toBeInTheDocument()
})

test('renders hr element', () => {
  render(<Header />)

  expect(document.querySelector('hr')).toBeInTheDocument()
})

test('has correct structure and classes', () => {
  const { container } = render(<Header />)

  // The main container with flex classes
  const mainContainer = container.firstChild?.firstChild as HTMLElement
  expect(mainContainer).toHaveClass('flex', 'flex-row', 'items-center', 'justify-between', 'px-2', 'py-2')

  // The navigation section
  const nav = screen.getByText('Home').closest('nav')
  expect(nav).toHaveClass('flex', 'items-center', 'gap-4', 'text-lg')

  // The controls section
  const controls = screen.getByTestId('user-menu').parentElement
  expect(controls).toHaveClass('flex', 'items-center', 'gap-2')
})

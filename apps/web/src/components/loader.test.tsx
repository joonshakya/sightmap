import '@testing-library/jest-dom'
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import Loader from './loader'

test('renders loader component', () => {
  const { container } = render(<Loader />)
  expect(container.firstChild).toHaveClass('flex', 'h-full', 'items-center', 'justify-center', 'pt-8')
  expect(container.querySelector('svg')).toHaveClass('lucide', 'animate-spin')
})

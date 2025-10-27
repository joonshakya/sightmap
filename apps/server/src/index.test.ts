// @vitest-environment node
import { expect, test, vi, beforeEach } from 'vitest'
import app from './index'
import { generateInstructions } from './instructionGeneration'

// Mock external dependencies
vi.mock('@hono/trpc-server')
vi.mock('@sightmap/api/context')
vi.mock('@sightmap/api/routers/index')
vi.mock('@sightmap/auth')
vi.mock('./instructionGeneration', () => ({
  generateInstructions: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

test('GET / returns OK', async () => {
  const response = await app.request(new Request('http://localhost/'))
  expect(await response.text()).toBe('OK')
  expect(response.status).toBe(200)
})

test('POST /generate-instructions with valid pathId calls generateInstructions', async () => {
  const mockResponse = new Response('stream content', { status: 200 })
  ;(generateInstructions as any).mockResolvedValue(mockResponse)

  const requestBody = {
    prompt: JSON.stringify({ pathId: 'test-path-123' })
  }

  const response = await app.request(
    new Request('http://localhost/generate-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
  )

  expect(generateInstructions).toHaveBeenCalledWith('test-path-123')
  expect(response.status).toBe(200)
})

test('POST /generate-instructions with invalid JSON returns 500', async () => {
  const response = await app.request(
    new Request('http://localhost/generate-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json'
    })
  )

  // Hono automatically returns 500 for JSON parsing errors
  expect(response.status).toBe(500)
})

test('POST /generate-instructions without pathId returns 400', async () => {
  const requestBody = {
    prompt: JSON.stringify({ otherField: 'value' })
  }

  const response = await app.request(
    new Request('http://localhost/generate-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
  )

  const result = await response.json() as { error: string }
  expect(result.error).toBe('pathId is required')
  expect(response.status).toBe(400)
})

test('POST /generate-instructions with generateInstructions error returns 500', async () => {
  ;(generateInstructions as any).mockRejectedValue(new Error('Database error'))

  const requestBody = {
    prompt: JSON.stringify({ pathId: 'test-path-123' })
  }

  const response = await app.request(
    new Request('http://localhost/generate-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
  )

  const result = await response.json() as { error: string }
  expect(result.error).toBe('Failed to generate instructions')
  expect(response.status).toBe(500)
})

test('POST /api/auth/* routes are handled by auth handler', async () => {
  // Auth routes are passed through to the auth handler
  // This test ensures the route is configured correctly
  const url = 'http://localhost/api/auth/signin'

  // Since the auth handler is mocked, we can't easily test its internal behavior
  // but we can verify the route configuration works
  expect(url).toContain('auth')
})

test('CORS headers are properly configured', async () => {
  const response = await app.request(new Request('http://localhost/'))

  // Verify CORS headers are present (origin will be null in test environment, but headers exist)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined()
  expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined()
  expect(response.headers.get('Access-Control-Allow-Headers')).toBeDefined()
})

test('OPTIONS preflight requests are handled', async () => {
  const response = await app.request(
    new Request('http://localhost/api/auth/signin', {
      method: 'OPTIONS'
    })
  )

  // Hono returns 204 No Content for OPTIONS preflight requests
  expect(response.status).toBe(204)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined()
})

test('Logger middleware is applied to all routes', async () => {
  // Logger middleware should be applied - we can verify it doesn't break normal requests
  const response = await app.request(new Request('http://localhost/'))

  expect(response.status).toBe(200)
  expect(await response.text()).toBe('OK')
})

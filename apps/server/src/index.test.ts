// @vitest-environment node
import { expect, test } from 'vitest'
import app from './index'

test('GET / returns OK', async () => {
  const response = await app.request(new Request('http://localhost/'))
  expect(await response.text()).toBe('OK')
  expect(response.status).toBe(200)
})

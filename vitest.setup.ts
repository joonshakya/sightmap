import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock common modules that may cause issues
vi.mock('@sightmap/common/prisma/enums', () => ({
  StepSize: {
    SMALL: 'SMALL',
    MEDIUM: 'MEDIUM',
    LARGE: 'LARGE'
  }
}))

vi.mock('@sightmap/common/prisma/client', () => ({
  PrismaClient: vi.fn(),
  $Enums: {},
  User: {},
  Session: {},
  Account: {},
  Verification: {},
  Building: {},
  Floor: {},
  Room: {},
  Path: {},
  InstructionSet: {},
  UserSettings: {},
  PathAnchor: {},
  Todo: {}
}))

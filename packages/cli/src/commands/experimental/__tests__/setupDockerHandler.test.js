import execa from 'execa'

import { errorTelemetry } from '@redwoodjs/telemetry'

import { handler } from '../setupDockerHandler'

jest.mock('execa', () => {
  return {
    command: jest.fn(() => {
      return {
        stdout: 'installing...',
      }
    }),
  }
})

jest.mock('@redwoodjs/telemetry', () => {
  return {
    errorTelemetry: jest.fn(),
  }
})

describe('setupDocker', () => {
  it('.', async () => {
    await handler({ force: false, verbose: false })

    expect(execa).toHaveBeenCalled()
  })
})

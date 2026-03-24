import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { loadCredentials, clearCredentials, login, DEFAULT_TOKEN_PATH } from './auth.js'

vi.mock('node:fs/promises')

describe('loadCredentials', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should load valid credentials', async () => {
    const validCredentials = {
      token: 'test-token',
      baseUrl: 'https://api.example.com',
      accountId: 'account123',
      userId: 'user123',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(validCredentials))

    const result = await loadCredentials('/path/to/credentials.json')

    expect(result).toEqual(validCredentials)
    expect(readFile).toHaveBeenCalledWith('/path/to/credentials.json', 'utf8')
  })

  it('should return undefined if file does not exist', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException
    error.code = 'ENOENT'
    vi.mocked(readFile).mockRejectedValueOnce(error)

    const result = await loadCredentials('/path/to/credentials.json')

    expect(result).toBeUndefined()
  })

  it('should throw error for invalid credentials format', async () => {
    const invalidCredentials = { token: 'test-token' }
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidCredentials))

    await expect(loadCredentials('/path/to/credentials.json')).rejects.toThrow('Invalid credentials format')
  })

  it('should throw error for other read errors', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('Permission denied'))

    await expect(loadCredentials('/path/to/credentials.json')).rejects.toThrow('Permission denied')
  })

  it('should use default token path when not provided', async () => {
    const validCredentials = {
      token: 'test-token',
      baseUrl: 'https://api.example.com',
      accountId: 'account123',
      userId: 'user123',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(validCredentials))

    await loadCredentials()

    expect(readFile).toHaveBeenCalledWith(DEFAULT_TOKEN_PATH, 'utf8')
  })
})

describe('clearCredentials', () => {
  it('should remove credentials file', async () => {
    vi.mocked(rm).mockResolvedValueOnce(undefined)

    await clearCredentials('/path/to/credentials.json')

    expect(rm).toHaveBeenCalledWith('/path/to/credentials.json', { force: true })
  })

  it('should use default token path when not provided', async () => {
    vi.mocked(rm).mockResolvedValueOnce(undefined)

    await clearCredentials()

    expect(rm).toHaveBeenCalledWith(DEFAULT_TOKEN_PATH, { force: true })
  })
})

describe('login', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return existing credentials when not forcing login', async () => {
    const existingCredentials = {
      token: 'existing-token',
      baseUrl: 'https://api.example.com',
      accountId: 'account123',
      userId: 'user123',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(existingCredentials))

    const result = await login({ baseUrl: 'https://api.example.com' })

    expect(result).toEqual(existingCredentials)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should perform QR login when forcing login', async () => {
    const qrResponse = {
      qrcode: 'qr123',
      qrcode_img_content: 'https://example.com/qr',
    }

    const statusResponse = {
      status: 'confirmed',
      bot_token: 'new-token',
      ilink_bot_id: 'bot123',
      ilink_user_id: 'user123',
      baseurl: 'https://api.example.com',
    }

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(qrResponse)),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ status: 'wait' })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(statusResponse)),
      } as Response)

    vi.mocked(mkdir).mockResolvedValueOnce(undefined)
    vi.mocked(writeFile).mockResolvedValueOnce(undefined)
    vi.mocked(chmod).mockResolvedValueOnce(undefined)

    const result = await login({ baseUrl: 'https://api.example.com', force: true })

    expect(result.token).toBe('new-token')
    expect(result.accountId).toBe('bot123')
    expect(result.userId).toBe('user123')
    expect(mkdir).toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalled()
  })

  it('should throw error when login confirmed but missing credentials', async () => {
    const qrResponse = {
      qrcode: 'qr123',
      qrcode_img_content: 'https://example.com/qr',
    }

    const statusResponse = {
      status: 'confirmed',
    }

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(qrResponse)),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(statusResponse)),
      } as Response)

    await expect(login({ baseUrl: 'https://api.example.com', force: true })).rejects.toThrow(
      'QR login confirmed, but the API did not return bot credentials'
    )
  })

  it('should handle QR code expiration and retry', async () => {
    const qrResponse1 = {
      qrcode: 'qr123',
      qrcode_img_content: 'https://example.com/qr1',
    }

    const qrResponse2 = {
      qrcode: 'qr456',
      qrcode_img_content: 'https://example.com/qr2',
    }

    const statusResponse = {
      status: 'confirmed',
      bot_token: 'token',
      ilink_bot_id: 'bot',
      ilink_user_id: 'user',
    }

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(qrResponse1)),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ status: 'expired' })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(qrResponse2)),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(statusResponse)),
      } as Response)

    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(writeFile).mockResolvedValue(undefined)
    vi.mocked(chmod).mockResolvedValue(undefined)

    const result = await login({ baseUrl: 'https://api.example.com', force: true })

    expect(result.token).toBe('token')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

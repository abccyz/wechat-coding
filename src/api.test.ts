import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  DEFAULT_BASE_URL,
  CHANNEL_VERSION,
  randomWechatUin,
  buildHeaders,
  apiFetch,
  apiGet,
  getUpdates,
  sendMessage,
  getConfig,
  sendTyping,
  fetchQrCode,
  pollQrStatus,
  buildTextMessage,
} from './api.js'
import { MessageType, MessageState, MessageItemType } from './types.js'

describe('Constants', () => {
  it('should export correct constants', () => {
    expect(DEFAULT_BASE_URL).toBe('https://ilinkai.weixin.qq.com')
    expect(CHANNEL_VERSION).toBe('1.0.0')
  })
})

describe('ApiError', () => {
  it('should create ApiError with correct properties', () => {
    const error = new ApiError('Test error', {
      status: 400,
      code: -14,
      payload: { message: 'test' },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.name).toBe('ApiError')
    expect(error.message).toBe('Test error')
    expect(error.status).toBe(400)
    expect(error.code).toBe(-14)
    expect(error.payload).toEqual({ message: 'test' })
  })

  it('should create ApiError without optional properties', () => {
    const error = new ApiError('Simple error', { status: 500 })

    expect(error.status).toBe(500)
    expect(error.code).toBeUndefined()
    expect(error.payload).toBeUndefined()
  })
})

describe('randomWechatUin', () => {
  it('should return base64 encoded string', () => {
    const uin = randomWechatUin()
    expect(typeof uin).toBe('string')
    expect(uin.length).toBeGreaterThan(0)
    expect(() => Buffer.from(uin, 'base64')).not.toThrow()
  })

  it('should return different values on multiple calls', () => {
    const uin1 = randomWechatUin()
    const uin2 = randomWechatUin()
    expect(uin1).not.toBe(uin2)
  })
})

describe('buildHeaders', () => {
  it('should build correct headers', () => {
    const headers = buildHeaders('test-token')

    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.AuthorizationType).toBe('ilink_bot_token')
    expect(headers.Authorization).toBe('Bearer test-token')
    expect(headers['X-WECHAT-UIN']).toBeDefined()
  })
})

describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should make successful POST request', async () => {
    const mockResponse = { data: 'test' }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response)

    const result = await apiFetch('https://api.example.com', '/test', { key: 'value' }, 'token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        }),
        body: JSON.stringify({ key: 'value' }),
      })
    )
    expect(result).toEqual(mockResponse)
  })

  it('should throw ApiError on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ errmsg: 'Bad request', errcode: -1 })),
    } as Response)

    await expect(apiFetch('https://api.example.com', '/test', {}, 'token')).rejects.toThrow(ApiError)
  })

  it('should throw ApiError on API error response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ret: -1, errmsg: 'API error' })),
    } as Response)

    await expect(apiFetch('https://api.example.com', '/test', {}, 'token')).rejects.toThrow(ApiError)
  })

  it('should handle empty response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    } as Response)

    const result = await apiFetch('https://api.example.com', '/test', {}, 'token')
    expect(result).toEqual({})
  })

  it('should respect abort signal', async () => {
    const controller = new AbortController()
    fetchMock.mockRejectedValueOnce(new Error('Aborted'))

    await expect(apiFetch('https://api.example.com', '/test', {}, 'token', 40000, controller.signal)).rejects.toThrow()
  })
})

describe('apiGet', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should make successful GET request', async () => {
    const mockResponse = { data: 'test' }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    } as Response)

    const result = await apiGet('https://api.example.com', '/test')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: 'GET',
        headers: {},
      })
    )
    expect(result).toEqual(mockResponse)
  })

  it('should include custom headers', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('{}'),
    } as Response)

    await apiGet('https://api.example.com', '/test', { 'X-Custom': 'header' })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: { 'X-Custom': 'header' },
      })
    )
  })
})

describe('API Functions', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getUpdates', () => {
    it('should fetch updates', async () => {
      const mockResponse = {
        ret: 0,
        msgs: [],
        get_updates_buf: 'next-cursor',
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response)

      const result = await getUpdates('https://api.example.com', 'token', 'cursor')

      expect(result).toEqual(mockResponse)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/ilink/bot/getupdates',
        }),
        expect.any(Object)
      )
    })
  })

  describe('sendMessage', () => {
    it('should send message', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{}'),
      } as Response)

      const msg = {
        from_user_id: '',
        to_user_id: 'user123',
        client_id: 'client456',
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        context_token: 'token789',
        item_list: [],
      }

      await sendMessage('https://api.example.com', 'token', msg)

      expect(fetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/ilink/bot/sendmessage',
        }),
        expect.any(Object)
      )
    })
  })

  describe('getConfig', () => {
    it('should get config', async () => {
      const mockResponse = { typing_ticket: 'ticket123' }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response)

      const result = await getConfig('https://api.example.com', 'token', 'user123', 'context456')

      expect(result).toEqual(mockResponse)
    })
  })

  describe('sendTyping', () => {
    it('should send typing status', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{}'),
      } as Response)

      await sendTyping('https://api.example.com', 'token', 'user123', 'ticket456', 1)

      expect(fetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/ilink/bot/sendtyping',
        }),
        expect.any(Object)
      )
    })
  })

  describe('fetchQrCode', () => {
    it('should fetch QR code', async () => {
      const mockResponse = {
        qrcode: 'qr123',
        qrcode_img_content: 'https://example.com/qr',
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response)

      const result = await fetchQrCode('https://api.example.com')

      expect(result).toEqual(mockResponse)
    })
  })

  describe('pollQrStatus', () => {
    it('should poll QR status', async () => {
      const mockResponse = {
        status: 'wait' as const,
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response)

      const result = await pollQrStatus('https://api.example.com', 'qr123')

      expect(result).toEqual(mockResponse)
    })
  })
})

describe('buildTextMessage', () => {
  it('should build correct text message', () => {
    const msg = buildTextMessage('user123', 'context456', 'Hello World')

    expect(msg.to_user_id).toBe('user123')
    expect(msg.context_token).toBe('context456')
    expect(msg.message_type).toBe(MessageType.BOT)
    expect(msg.message_state).toBe(MessageState.FINISH)
    expect(msg.item_list).toHaveLength(1)
    expect(msg.item_list[0].type).toBe(MessageItemType.TEXT)
    expect(msg.item_list[0].text_item?.text).toBe('Hello World')
    expect(msg.client_id).toBeDefined()
  })
})

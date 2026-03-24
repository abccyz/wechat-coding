import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WeixinBot } from './client.js'
import { MessageType, MessageState, MessageItemType } from './types.js'

vi.mock('./auth.js', () => ({
  loadCredentials: vi.fn(),
  clearCredentials: vi.fn(),
  login: vi.fn(),
  DEFAULT_TOKEN_PATH: '/mock/credentials.json',
}))

vi.mock('./api.js', () => ({
  DEFAULT_BASE_URL: 'https://ilinkai.weixin.qq.com',
  ApiError: class ApiError extends Error {
    constructor(message: string, public options: { status: number; code?: number }) {
      super(message)
      this.name = 'ApiError'
    }
  },
  getUpdates: vi.fn(),
  sendMessage: vi.fn(),
  getConfig: vi.fn(),
  sendTyping: vi.fn(),
  buildTextMessage: vi.fn((userId, contextToken, text) => ({
    to_user_id: userId,
    context_token: contextToken,
    item_list: [{ type: 1, text_item: { text } }],
  })),
  randomWechatUin: vi.fn(() => 'mock-uin'),
  buildHeaders: vi.fn(() => ({})),
}))

import { loadCredentials, login, clearCredentials } from './auth.js'
import { sendMessage, getConfig, sendTyping } from './api.js'

describe('WeixinBot', () => {
  let bot: WeixinBot

  beforeEach(() => {
    vi.resetAllMocks()
    bot = new WeixinBot()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create bot with default options', () => {
      const bot = new WeixinBot()
      expect(bot).toBeDefined()
    })

    it('should create bot with custom options', () => {
      const bot = new WeixinBot({
        baseUrl: 'https://custom.api.com',
        tokenPath: '/custom/path.json',
        onError: vi.fn(),
      })
      expect(bot).toBeDefined()
    })
  })

  describe('onMessage', () => {
    it('should register message handler', () => {
      const handler = vi.fn()
      bot.onMessage(handler)
      expect(bot).toBe(bot)
    })

    it('should register handler using on method', () => {
      const handler = vi.fn()
      bot.on('message', handler)
      expect(bot).toBe(bot)
    })

    it('should throw for unsupported event', () => {
      expect(() => bot.on('unsupported' as 'message', vi.fn())).toThrow('Unsupported event')
    })
  })

  describe('login', () => {
    it('should login successfully', async () => {
      const credentials = {
        token: 'test-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      vi.mocked(login).mockResolvedValueOnce(credentials)

      const result = await bot.login()

      expect(result).toEqual(credentials)
      expect(login).toHaveBeenCalledWith({
        baseUrl: 'https://ilinkai.weixin.qq.com',
        tokenPath: undefined,
        force: undefined,
      })
    })

    it('should login with force option', async () => {
      const credentials = {
        token: 'new-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      vi.mocked(login).mockResolvedValueOnce(credentials)

      await bot.login({ force: true })

      expect(login).toHaveBeenCalledWith({
        baseUrl: 'https://ilinkai.weixin.qq.com',
        tokenPath: undefined,
        force: true,
      })
    })

    it('should clear context when token changes', async () => {
      const oldCredentials = {
        token: 'old-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      const newCredentials = {
        token: 'new-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      vi.mocked(login).mockResolvedValueOnce(oldCredentials)
      await bot.login()

      vi.mocked(login).mockResolvedValueOnce(newCredentials)
      await bot.login({ force: true })
    })
  })

  describe('reply', () => {
    it('should reply to incoming message', async () => {
      const credentials = {
        token: 'test-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      vi.mocked(login).mockResolvedValueOnce(credentials)
      vi.mocked(sendMessage).mockResolvedValueOnce({})
      vi.mocked(getConfig).mockResolvedValueOnce({ typing_ticket: 'ticket123' })
      vi.mocked(sendTyping).mockResolvedValueOnce({})

      await bot.login()

      const message = {
        userId: 'user123',
        text: 'Hello',
        type: 'text' as const,
        _contextToken: 'context123',
        raw: {
          message_id: 1,
          from_user_id: 'user123',
          to_user_id: 'bot456',
          client_id: 'client789',
          create_time_ms: Date.now(),
          message_type: MessageType.USER,
          message_state: MessageState.NEW,
          context_token: 'context123',
          item_list: [],
        },
        timestamp: new Date(),
      }

      await bot.reply(message, 'Reply text')

      expect(sendMessage).toHaveBeenCalled()
    })

    it('should throw when replying without login', async () => {
      vi.mocked(loadCredentials).mockResolvedValueOnce(undefined)
      vi.mocked(login).mockRejectedValueOnce(new Error('Login failed'))

      const message = {
        userId: 'user123',
        text: 'Hello',
        type: 'text' as const,
        _contextToken: 'context123',
        raw: {
          message_id: 1,
          from_user_id: 'user123',
          to_user_id: 'bot456',
          client_id: 'client789',
          create_time_ms: Date.now(),
          message_type: MessageType.USER,
          message_state: MessageState.NEW,
          context_token: 'context123',
          item_list: [],
        },
        timestamp: new Date(),
      }

      await expect(bot.reply(message, 'Reply')).rejects.toThrow()
    })
  })

  describe('send', () => {
    it('should send message to user', async () => {
      const credentials = {
        token: 'test-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      vi.mocked(login).mockResolvedValueOnce(credentials)
      vi.mocked(sendMessage).mockResolvedValueOnce({})

      await bot.login()

      const message = {
        userId: 'user123',
        text: 'Hello',
        type: 'text' as const,
        _contextToken: 'context123',
        raw: {
          message_id: 1,
          from_user_id: 'user123',
          to_user_id: 'bot456',
          client_id: 'client789',
          create_time_ms: Date.now(),
          message_type: MessageType.USER,
          message_state: MessageState.NEW,
          context_token: 'context123',
          item_list: [],
        },
        timestamp: new Date(),
      }

      await bot.reply(message, 'Test')

      await bot.send('user123', 'Direct message')

      expect(sendMessage).toHaveBeenCalledTimes(2)
    })

    it('should throw when sending without context token', async () => {
      await expect(bot.send('user123', 'Hello')).rejects.toThrow('No cached context token')
    })
  })

  describe('sendTyping', () => {
    it('should send typing status', async () => {
      const credentials = {
        token: 'test-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      vi.mocked(login).mockResolvedValueOnce(credentials)
      vi.mocked(sendMessage).mockResolvedValueOnce({})
      vi.mocked(getConfig).mockResolvedValueOnce({ typing_ticket: 'ticket123' })
      vi.mocked(sendTyping).mockResolvedValueOnce({})

      await bot.login()

      const message = {
        userId: 'user123',
        text: 'Hello',
        type: 'text' as const,
        _contextToken: 'context123',
        raw: {
          message_id: 1,
          from_user_id: 'user123',
          to_user_id: 'bot456',
          client_id: 'client789',
          create_time_ms: Date.now(),
          message_type: MessageType.USER,
          message_state: MessageState.NEW,
          context_token: 'context123',
          item_list: [],
        },
        timestamp: new Date(),
      }

      await bot.reply(message, 'Test')

      vi.mocked(getConfig).mockResolvedValueOnce({ typing_ticket: 'ticket123' })

      await bot.sendTyping('user123')

      expect(sendTyping).toHaveBeenCalledWith(
        'https://api.example.com',
        'test-token',
        'user123',
        'ticket123',
        1
      )
    })

    it('should throw when typing without context token', async () => {
      await expect(bot.sendTyping('user123')).rejects.toThrow('No cached context token')
    })

    it('should handle missing typing_ticket gracefully', async () => {
      const credentials = {
        token: 'test-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      vi.mocked(login).mockResolvedValueOnce(credentials)
      vi.mocked(sendMessage).mockResolvedValueOnce({})
      vi.mocked(getConfig).mockResolvedValueOnce({})

      await bot.login()

      const message = {
        userId: 'user123',
        text: 'Hello',
        type: 'text' as const,
        _contextToken: 'context123',
        raw: {
          message_id: 1,
          from_user_id: 'user123',
          to_user_id: 'bot456',
          client_id: 'client789',
          create_time_ms: Date.now(),
          message_type: MessageType.USER,
          message_state: MessageState.NEW,
          context_token: 'context123',
          item_list: [],
        },
        timestamp: new Date(),
      }

      await bot.reply(message, 'Test')

      vi.mocked(getConfig).mockResolvedValueOnce({})

      await bot.sendTyping('user123')

      expect(sendTyping).not.toHaveBeenCalled()
    })
  })

  describe('stopTyping', () => {
    it('should stop typing status', async () => {
      const credentials = {
        token: 'test-token',
        baseUrl: 'https://api.example.com',
        accountId: 'account123',
        userId: 'user123',
      }

      vi.mocked(login).mockResolvedValueOnce(credentials)
      vi.mocked(sendMessage).mockResolvedValueOnce({})
      vi.mocked(getConfig).mockResolvedValueOnce({ typing_ticket: 'ticket123' })
      vi.mocked(sendTyping).mockResolvedValueOnce({})

      await bot.login()

      const message = {
        userId: 'user123',
        text: 'Hello',
        type: 'text' as const,
        _contextToken: 'context123',
        raw: {
          message_id: 1,
          from_user_id: 'user123',
          to_user_id: 'bot456',
          client_id: 'client789',
          create_time_ms: Date.now(),
          message_type: MessageType.USER,
          message_state: MessageState.NEW,
          context_token: 'context123',
          item_list: [],
        },
        timestamp: new Date(),
      }

      await bot.reply(message, 'Test')

      vi.mocked(getConfig).mockResolvedValueOnce({ typing_ticket: 'ticket123' })

      await bot.stopTyping('user123')

      expect(sendTyping).toHaveBeenCalledWith(
        'https://api.example.com',
        'test-token',
        'user123',
        'ticket123',
        2
      )
    })

    it('should do nothing when no context token', async () => {
      await bot.stopTyping('user123')
      expect(sendTyping).not.toHaveBeenCalled()
    })
  })
})

import { describe, it, expect } from 'vitest'
import {
  MessageType,
  MessageState,
  MessageItemType,
} from './types.js'

describe('MessageType', () => {
  it('should have correct enum values', () => {
    expect(MessageType.USER).toBe(1)
    expect(MessageType.BOT).toBe(2)
  })
})

describe('MessageState', () => {
  it('should have correct enum values', () => {
    expect(MessageState.NEW).toBe(0)
    expect(MessageState.GENERATING).toBe(1)
    expect(MessageState.FINISH).toBe(2)
  })
})

describe('MessageItemType', () => {
  it('should have correct enum values', () => {
    expect(MessageItemType.TEXT).toBe(1)
    expect(MessageItemType.IMAGE).toBe(2)
    expect(MessageItemType.VOICE).toBe(3)
    expect(MessageItemType.FILE).toBe(4)
    expect(MessageItemType.VIDEO).toBe(5)
  })
})

describe('Type Compatibility', () => {
  it('should allow valid IncomingMessage', () => {
    const message = {
      userId: 'user123',
      text: 'Hello',
      type: 'text' as const,
      raw: {
        message_id: 1,
        from_user_id: 'user123',
        to_user_id: 'bot456',
        client_id: 'client789',
        create_time_ms: Date.now(),
        message_type: MessageType.USER,
        message_state: MessageState.NEW,
        context_token: 'token123',
        item_list: [
          {
            type: MessageItemType.TEXT,
            text_item: { text: 'Hello' },
          },
        ],
      },
      _contextToken: 'token123',
      timestamp: new Date(),
    }

    expect(message.userId).toBe('user123')
    expect(message.text).toBe('Hello')
    expect(message.type).toBe('text')
  })

  it('should allow valid Credentials', () => {
    const credentials = {
      token: 'test-token',
      baseUrl: 'https://api.example.com',
      accountId: 'account123',
      userId: 'user123',
    }

    expect(credentials.token).toBe('test-token')
    expect(credentials.baseUrl).toBe('https://api.example.com')
    expect(credentials.accountId).toBe('account123')
    expect(credentials.userId).toBe('user123')
  })
})

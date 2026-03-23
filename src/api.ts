/**
 * API 请求层
 * API Request Layer
 */

import { randomBytes, randomUUID } from 'node:crypto'
import {
  MessageState,
  MessageType,
  MessageItemType,
  type BaseInfo,
  type GetConfigResp,
  type GetUpdatesReq,
  type GetUpdatesResp,
  type SendMessageReq,
  type SendTypingReq,
  type QrCodeResponse,
  type QrStatusResponse,
} from './types.js'

/** 默认 API 基础 URL */
export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
/** 渠道版本 */
export const CHANNEL_VERSION = '1.0.0'

/** API 错误类 */
export class ApiError extends Error {
  readonly status: number
  readonly code?: number
  readonly payload?: unknown

  constructor(message: string, options: { status: number; code?: number; payload?: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.payload = options.payload
  }
}

/** 规范化基础 URL */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

/** 构建基础信息 */
function buildBaseInfo(): BaseInfo {
  return { channel_version: CHANNEL_VERSION }
}

/** 解析 JSON 响应 */
async function parseJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text()
  const payload = text ? JSON.parse(text) as T : ({} as T)

  if (!response.ok) {
    const message = (payload as { errmsg?: string } | null)?.errmsg ?? `${label} failed with HTTP ${response.status}`
    throw new ApiError(message, {
      status: response.status,
      code: (payload as { errcode?: number } | null)?.errcode,
      payload,
    })
  }

  if (typeof (payload as { ret?: number } | null)?.ret === 'number' && (payload as { ret: number }).ret !== 0) {
    const body = payload as { errcode?: number; errmsg?: string; ret: number }
    throw new ApiError(body.errmsg ?? `${label} failed`, {
      status: response.status,
      code: body.errcode ?? body.ret,
      payload,
    })
  }

  return payload
}

/** 生成随机微信 UIN */
export function randomWechatUin(): string {
  const value = randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(value), 'utf8').toString('base64')
}

/** 构建请求头 */
export function buildHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    Authorization: `Bearer ${token}`,
    'X-WECHAT-UIN': randomWechatUin(),
  }
}

/** API POST 请求 */
export async function apiFetch<T>(
  baseUrl: string,
  endpoint: string,
  body: unknown,
  token: string,
  timeoutMs = 40_000,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(endpoint, `${normalizeBaseUrl(baseUrl)}/`)
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(body),
    signal: requestSignal,
  })

  return parseJsonResponse<T>(response, endpoint)
}

/** API GET 请求 */
export async function apiGet<T>(
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const url = new URL(path, `${normalizeBaseUrl(baseUrl)}/`)
  const response = await fetch(url, {
    method: 'GET',
    headers,
  })

  return parseJsonResponse<T>(response, path)
}

/** 获取消息更新 */
export async function getUpdates(
  baseUrl: string,
  token: string,
  buf: string,
  signal?: AbortSignal,
): Promise<GetUpdatesResp> {
  const body: GetUpdatesReq = {
    get_updates_buf: buf,
    base_info: buildBaseInfo(),
  }

  return apiFetch<GetUpdatesResp>(baseUrl, '/ilink/bot/getupdates', body, token, 40_000, signal)
}

/** 发送消息 */
export async function sendMessage(
  baseUrl: string,
  token: string,
  msg: SendMessageReq['msg'],
): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(
    baseUrl,
    '/ilink/bot/sendmessage',
    {
      msg,
      base_info: buildBaseInfo(),
    },
    token,
    15_000,
  )
}

/** 获取配置 */
export async function getConfig(
  baseUrl: string,
  token: string,
  userId: string,
  contextToken: string,
): Promise<GetConfigResp> {
  return apiFetch<GetConfigResp>(
    baseUrl,
    '/ilink/bot/getconfig',
    {
      ilink_user_id: userId,
      context_token: contextToken,
      base_info: buildBaseInfo(),
    },
    token,
    15_000,
  )
}

/** 发送输入状态 */
export async function sendTyping(
  baseUrl: string,
  token: string,
  userId: string,
  ticket: string,
  status: SendTypingReq['status'],
): Promise<Record<string, unknown>> {
  const body: SendTypingReq = {
    ilink_user_id: userId,
    typing_ticket: ticket,
    status,
    base_info: buildBaseInfo(),
  }

  return apiFetch<Record<string, unknown>>(baseUrl, '/ilink/bot/sendtyping', body, token, 15_000)
}

/** 获取二维码 */
export async function fetchQrCode(baseUrl: string): Promise<QrCodeResponse> {
  return apiGet<QrCodeResponse>(baseUrl, '/ilink/bot/get_bot_qrcode?bot_type=3')
}

/** 轮询二维码状态 */
export async function pollQrStatus(baseUrl: string, qrcode: string): Promise<QrStatusResponse> {
  return apiGet<QrStatusResponse>(
    baseUrl,
    `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    {
      'iLink-App-ClientVersion': '1',
    },
  )
}

/** 构建文本消息 */
export function buildTextMessage(userId: string, contextToken: string, text: string): SendMessageReq['msg'] {
  return {
    from_user_id: '',
    to_user_id: userId,
    client_id: randomUUID(),
    message_type: MessageType.BOT,
    message_state: MessageState.FINISH,
    context_token: contextToken,
    item_list: [
      {
        type: MessageItemType.TEXT,
        text_item: { text },
      },
    ],
  }
}

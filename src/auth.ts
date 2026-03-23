/**
 * 认证和登录逻辑
 * Authentication and Login Logic
 */

import { mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { DEFAULT_BASE_URL, fetchQrCode, pollQrStatus } from './api.js'
import type { Credentials, LoginOptions } from './types.js'

/** 默认凭证目录 */
const DEFAULT_TOKEN_DIR = path.join(os.homedir(), '.weixin-bot')
/** 默认凭证文件路径 */
export const DEFAULT_TOKEN_PATH = path.join(DEFAULT_TOKEN_DIR, 'credentials.json')
/** 二维码轮询间隔 */
const QR_POLL_INTERVAL_MS = 2_000

/** 解析凭证路径 */
function resolveTokenPath(tokenPath?: string): string {
  return tokenPath ?? DEFAULT_TOKEN_PATH
}

/** 日志输出 */
function log(message: string): void {
  process.stderr.write(`[weixin-bot] ${message}\n`)
}

/** 保存凭证 */
async function saveCredentials(credentials: Credentials, tokenPath?: string): Promise<void> {
  const targetPath = resolveTokenPath(tokenPath)
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 })
  await writeFile(targetPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 })
  await chmod(targetPath, 0o600)
}

/** 验证凭证格式 */
function isCredentials(value: unknown): value is Credentials {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.baseUrl === 'string' &&
    typeof candidate.accountId === 'string' &&
    typeof candidate.userId === 'string'
  )
}

/** 打印二维码说明 */
async function printQrInstructions(url: string): Promise<void> {
  log('在微信中打开以下链接完成登录:')
  process.stderr.write(`${url}\n`)
}

/** 加载凭证 */
export async function loadCredentials(tokenPath?: string): Promise<Credentials | undefined> {
  const targetPath = resolveTokenPath(tokenPath)

  try {
    const raw = await readFile(targetPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown

    if (!isCredentials(parsed)) {
      throw new Error(`Invalid credentials format in ${targetPath}`)
    }

    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

/** 清除凭证 */
export async function clearCredentials(tokenPath?: string): Promise<void> {
  await rm(resolveTokenPath(tokenPath), { force: true })
}

/** 登录 */
export async function login(options: LoginOptions = {}): Promise<Credentials> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL

  // 尝试加载已有凭证
  if (!options.force) {
    const existing = await loadCredentials(options.tokenPath)
    if (existing) {
      return existing
    }
  }

  // 二维码登录循环
  for (;;) {
    const qr = await fetchQrCode(baseUrl)
    await printQrInstructions(qr.qrcode_img_content)

    let lastStatus: string | undefined

    // 轮询二维码状态
    for (;;) {
      const status = await pollQrStatus(baseUrl, qr.qrcode)

      if (status.status !== lastStatus) {
        if (status.status === 'scaned') {
          log('二维码已扫描，请在微信中确认登录...')
        } else if (status.status === 'confirmed') {
          log('登录已确认')
        } else if (status.status === 'expired') {
          log('二维码已过期，正在获取新二维码...')
        }
        lastStatus = status.status
      }

      if (status.status === 'confirmed') {
        if (!status.bot_token || !status.ilink_bot_id || !status.ilink_user_id) {
          throw new Error('QR login confirmed, but the API did not return bot credentials')
        }

        const credentials: Credentials = {
          token: status.bot_token,
          baseUrl: status.baseurl ?? baseUrl,
          accountId: status.ilink_bot_id,
          userId: status.ilink_user_id,
        }

        await saveCredentials(credentials, options.tokenPath)
        return credentials
      }

      if (status.status === 'expired') {
        break
      }

      await delay(QR_POLL_INTERVAL_MS)
    }
  }
}

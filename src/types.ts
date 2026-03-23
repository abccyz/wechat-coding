/**
 * 微信 iLink Bot API 类型定义
 * WeChat iLink Bot API Type Definitions
 */

/** 基础信息 */
export interface BaseInfo {
  channel_version: string
}

/** 消息类型 */
export enum MessageType {
  /** 用户消息 */
  USER = 1,
  /** 机器人消息 */
  BOT = 2,
}

/** 消息状态 */
export enum MessageState {
  /** 新消息 */
  NEW = 0,
  /** 生成中 */
  GENERATING = 1,
  /** 完成 */
  FINISH = 2,
}

/** 消息内容类型 */
export enum MessageItemType {
  /** 文本 */
  TEXT = 1,
  /** 图片 */
  IMAGE = 2,
  /** 语音 */
  VOICE = 3,
  /** 文件 */
  FILE = 4,
  /** 视频 */
  VIDEO = 5,
}

/** CDN 媒体信息 */
export interface CDNMedia {
  encrypt_query_param: string
  aes_key: string
  encrypt_type?: 0 | 1
}

/** 文本内容 */
export interface TextItem {
  text: string
}

/** 图片内容 */
export interface ImageItem {
  media: CDNMedia
  aeskey?: string
  url?: string
  mid_size?: string | number
  thumb_size?: string | number
  thumb_height?: number
  thumb_width?: number
  hd_size?: string | number
}

/** 语音内容 */
export interface VoiceItem {
  media: CDNMedia
  encode_type?: number
  text?: string
  playtime?: number
}

/** 文件内容 */
export interface FileItem {
  media: CDNMedia
  file_name?: string
  md5?: string
  len?: string
}

/** 视频内容 */
export interface VideoItem {
  media: CDNMedia
  video_size?: string | number
  play_length?: number
  thumb_media?: CDNMedia
}

/** 引用消息 */
export interface RefMessage {
  title?: string
  message_item?: MessageItem
}

/** 消息内容项 */
export interface MessageItem {
  type: MessageItemType
  text_item?: TextItem
  image_item?: ImageItem
  voice_item?: VoiceItem
  file_item?: FileItem
  video_item?: VideoItem
  ref_msg?: RefMessage
}

/** 微信消息 */
export interface WeixinMessage {
  message_id: number
  from_user_id: string
  to_user_id: string
  client_id: string
  create_time_ms: number
  message_type: MessageType
  message_state: MessageState
  context_token: string
  item_list: MessageItem[]
}

/** 获取更新请求 */
export interface GetUpdatesReq {
  get_updates_buf: string
  base_info: BaseInfo
}

/** 获取更新响应 */
export interface GetUpdatesResp {
  ret: number
  msgs: WeixinMessage[]
  get_updates_buf: string
  longpolling_timeout_ms?: number
  errcode?: number
  errmsg?: string
}

/** 发送消息请求 */
export interface SendMessageReq {
  msg: {
    from_user_id: string
    to_user_id: string
    client_id: string
    message_type: MessageType
    message_state: MessageState
    context_token: string
    item_list: MessageItem[]
  }
  base_info: BaseInfo
}

/** 发送输入状态请求 */
export interface SendTypingReq {
  ilink_user_id: string
  typing_ticket: string
  status: 1 | 2
  base_info: BaseInfo
}

/** 获取配置响应 */
export interface GetConfigResp {
  typing_ticket?: string
  ret?: number
  errcode?: number
  errmsg?: string
}

/** 二维码响应 */
export interface QrCodeResponse {
  qrcode: string
  qrcode_img_content: string
}

/** 二维码状态响应 */
export interface QrStatusResponse {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired'
  bot_token?: string
  ilink_bot_id?: string
  ilink_user_id?: string
  baseurl?: string
}

/** 传入消息（SDK 内部使用） */
export interface IncomingMessage {
  /** 用户ID */
  userId: string
  /** 消息文本内容 */
  text: string
  /** 消息类型 */
  type: 'text' | 'image' | 'voice' | 'file' | 'video'
  /** 原始消息数据 */
  raw: WeixinMessage
  /** 上下文令牌（内部管理） */
  _contextToken: string
  /** 消息时间戳 */
  timestamp: Date
}

/** 机器人配置选项 */
export interface WeixinBotOptions {
  /** API 基础 URL */
  baseUrl?: string
  /** 凭证文件路径 */
  tokenPath?: string
  /** 错误回调函数 */
  onError?: (error: unknown) => void
}

/** 登录配置选项 */
export interface LoginOptions {
  baseUrl?: string
  tokenPath?: string
  force?: boolean
}

/** 用户凭证 */
export interface Credentials {
  token: string
  baseUrl: string
  accountId: string
  userId: string
}

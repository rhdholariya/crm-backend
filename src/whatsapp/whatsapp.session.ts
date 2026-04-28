  import * as fs from 'fs';
  import * as path from 'path';
  import * as qrcode from 'qrcode';
  import { Client, LocalAuth } from 'whatsapp-web.js';
  import { Server, Namespace } from 'socket.io';
  import { Logger } from '@nestjs/common';
  import { ChatEntry, ChatListItem, StoredMessage } from './whatsapp.types';
  const puppeteer = require('puppeteer');
  const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const PROFILE_ID = 'default';
  
  function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  
  function profileDataDir(userId: number, profileId: string): string {
    const dir = path.join(DATA_DIR, 'wa', String(userId), profileId);
    ensureDir(dir);
    return dir;
  }
  
  function chatStorePath(userId: number, profileId: string): string {
    return path.join(profileDataDir(userId, profileId), 'chats.json');
  }
  
  function avatarFilePath(
    userId: number,
    profileId: string,
    chatId: string,
  ): string {
    const dir = path.join(profileDataDir(userId, profileId), 'avatars');
    ensureDir(dir);
    return path.join(dir, chatId.replace(/[^a-zA-Z0-9@._-]/g, '_') + '.jpg');
  }
  
  function loadChatStore(
    userId: number,
    profileId: string,
  ): Record<string, ChatEntry> {
    try {
      const p = chatStorePath(userId, profileId);
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        Object.values(data).forEach((chat: any) => {
          chat._previewOnly = true;
        });
        return data;
      }
    } catch (_) {}
    return {};
  }
  
  function saveChatStore(
    userId: number,
    profileId: string,
    store: Record<string, ChatEntry>,
  ) {
    try {
      const toSave: Record<string, any> = {};
      Object.entries(store).forEach(([chatId, chat]) => {
        toSave[chatId] = {
          chatId: chat.chatId,
          contact: chat.contact,
          isGroup: chat.isGroup,
          isChannel: chat.isChannel,
          unreadCount: chat.unreadCount || 0,
          messages: (chat.messages || []).slice(-200).map((m) => ({
            id: m.id,
            from: m.from,
            body: m.body,
            type: m.type,
            timestamp: m.timestamp,
            fromMe: m.fromMe,
            ack: m.ack,
            hasMedia: m.hasMedia,
            author: m.author,
            media: m.media
              ? { mimetype: m.media.mimetype, filename: m.media.filename }
              : null,
          })),
        };
      });
      fs.writeFileSync(chatStorePath(userId, profileId), JSON.stringify(toSave));
    } catch (_) {}
  }
  
  const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  function debouncedSave(
    userId: number,
    profileId: string,
    store: Record<string, ChatEntry>,
  ) {
    const key = `${userId}:${profileId}`;
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(
      () => saveChatStore(userId, profileId, store),
      3000,
    );
  }
  
  // ── Session class ─────────────────────────────────────────────────────────────
  export class WhatsAppSession {
    userId: number;
    profileId: string;
    client: Client | null = null;
    status: string = 'disconnected';
    qrDataURL: string | null = null;
    connectedNumber: string | null = null;
    chatStore: Record<string, ChatEntry>;
    activeViewers: Record<string, string | null> = {};
  
    /** Injected by WhatsAppService — called on every incoming message for flow matching */
    onIncomingMessage?: (chatId: string, body: string, contactName?: string, contactPhone?: string) => Promise<void>;
  
    private io: Server | Namespace;
    private logger: Logger;
    private qrRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    private qrAttempts = 0;
    private readonly MAX_QR_ATTEMPTS = 5; // after 5 expired QRs, stop and notify
  
    constructor(userId: number, profileId: string, io: Server | Namespace) {
      this.userId = userId;
      this.profileId = profileId;
      this.io = io;
      this.logger = new Logger(`WA:${userId}:${profileId}`);
      this.chatStore = loadChatStore(userId, profileId);
    }
  
    private room(): string {
      return `wa:${this.userId}:${this.profileId}`;
    }
  
    // ── Broadcast with client count log ────────────────────────────────────────
    broadcast(event: string, data: any) {
      const room = this.room();
      const adapter = (this.io as any).adapter;
      const clientCount = adapter?.rooms?.get(room)?.size ?? 0;
      this.logger.log(
        `[BROADCAST] event="${event}" room="${room}" clients=${clientCount}`,
      );
      this.io.to(room).emit(event, data);
    }
  
    buildChatList(): ChatListItem[] {
      return Object.values(this.chatStore)
        .sort((a, b) => {
          const aT =
            a.lastMessageTimestamp ||
            a.messages[a.messages.length - 1]?.timestamp ||
            0;
          const bT =
            b.lastMessageTimestamp ||
            b.messages[b.messages.length - 1]?.timestamp ||
            0;
          return bT - aT;
        })
        .map((c) => {
          // Read avatar from cached file as base64 if available
          let avatarBase64: string | null = null;
          const avatarPath = avatarFilePath(
            this.userId,
            this.profileId,
            c.chatId,
          );
          if (fs.existsSync(avatarPath)) {
            try {
              const data = fs.readFileSync(avatarPath);
              avatarBase64 = `data:image/jpeg;base64,${data.toString('base64')}`;
            } catch (_) {}
          }
  
          return {
            chatId: c.chatId,
            name: c.contact?.name || c.chatId,
            number: c.contact?.number || c.chatId,
            avatar: avatarBase64 || c.contact?.avatar || null,
            lastMessage: c.messages[c.messages.length - 1] || null,
            unreadCount: Math.max(0, c.unreadCount || 0),
            isGroup: c.isGroup,
          };
        });
    }
  
    private async downloadMedia(msg: any): Promise<any> {
      try {
        if (!msg.hasMedia) return null;
        // Stickers are handled separately — skip inline download
        if (msg.type === 'sticker') return null;
        // status@broadcast media uses a different decryption path
        const isStatus =
          msg.from === 'status@broadcast' ||
          msg.id?._serialized?.includes('status@broadcast');
  
        this.logger.log(
          `[MEDIA] Downloading msgId=${msg.id?._serialized} type=${msg.type} isStatus=${isStatus}`,
        );
  
        const media = await msg.downloadMedia();
        if (!media) {
          this.logger.warn(
            `[MEDIA] downloadMedia() returned null for msgId=${msg.id?._serialized}`,
          );
          return null;
        }
        this.logger.log(
          `[MEDIA] Downloaded mimetype=${media.mimetype} size=${media.data?.length ?? 0}`,
        );
        return {
          data: media.data,
          mimetype: media.mimetype,
          filename: media.filename || null,
        };
      } catch (err: any) {
        this.logger.warn(`[MEDIA] Failed to download: ${err.message}`);
        return null;
      }
    }
  
    async formatMessage(m: any, skipMedia = false): Promise<StoredMessage> {
      const mediaObj = skipMedia ? null : await this.downloadMedia(m);
      let author: string | null = null;
      if (!m.fromMe && m.from?.includes('@g.us')) {
        try {
          const contact = await m.getContact();
          author =
            contact.pushname ||
            contact.name ||
            (m.author ? m.author.replace('@c.us', '') : null);
        } catch (_) {
          author = m.author ? m.author.replace(/@.+/, '') : null;
        }
      }
  
      // Detect quick reply button response
      // whatsapp-web.js exposes type='buttons_response' and selectedButtonId
      const isQuickReply =
        m.type === 'buttons_response' ||
        !!m.selectedButtonId ||
        !!m.buttonId;
  
      return {
        id: m.id._serialized,
        from: m.fromMe ? 'me' : m.from,
        body: m.selectedButtonId
          ? (m.body || m.selectedButtonId)   // button text is in body
          : (m.body || ''),
        type: isQuickReply ? 'buttons_response' : m.type,
        timestamp: m.timestamp,
        fromMe: m.fromMe,
        ack: m.ack || (m.fromMe ? 1 : 0),
        hasMedia: m.hasMedia || false,
        media: mediaObj,
        author,
        isQuickReply,
        selectedButtonId: m.selectedButtonId || m.buttonId || undefined,
      };
    }
  
    async cacheAvatar(chatId: string): Promise<string | null> {
      try {
        const filePath = avatarFilePath(this.userId, this.profileId, chatId);
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000)
            return `/api/whatsapp/avatar/${encodeURIComponent(chatId)}`;
        }
        if (!this.client) return null;
  
        // Skip special chats
        if (
          chatId === 'status@broadcast' ||
          chatId === '0@c.us' ||
          chatId.endsWith('@lid') ||
          chatId.endsWith('@newsletter')
        )
          return null;
  
        // Port of original Node.js getRealProfilePicUrl — tries multiple Store paths
        let picUrl: string | null = null;
        try {
          const result = await Promise.race([
            (this.client as any).pupPage.evaluate(async (cid: string) => {
              try {
                let retries = 0;
                while (!(window as any).Store && retries < 10) {
                  await new Promise((r) => setTimeout(r, 500));
                  retries++;
                }
                const S = (window as any).Store;
                if (!S) return { url: null };
  
                function extractUrl(obj: any): string | null {
                  if (!obj) return null;
                  if (obj.eurl?.startsWith('http')) return obj.eurl;
                  if (obj.url?.startsWith('http')) return obj.url;
                  if (obj.img?.startsWith('http') || obj.img?.startsWith('data:'))
                    return obj.img;
                  if (obj.rawObj) return extractUrl(obj.rawObj);
                  if (obj.profilePicThumbObj)
                    return extractUrl(obj.profilePicThumbObj);
                  if (obj.attributes?.profilePicThumbObj)
                    return extractUrl(obj.attributes.profilePicThumbObj);
                  return null;
                }
  
                let url: string | null = null;
                if (S.ProfilePicThumb) {
                  const t = S.ProfilePicThumb.get(cid);
                  if (t) {
                    url = extractUrl(t) || extractUrl(t.attributes);
                    if (url) return { url };
                  }
                }
                if (S.Chat) {
                  const t = S.Chat.get(cid);
                  if (t) {
                    url = extractUrl(t.profilePicThumbObj);
                    if (url) return { url };
                  }
                }
                if (S.Contact) {
                  const t = S.Contact.get(cid);
                  if (t) {
                    url = extractUrl(t.profilePicThumbObj);
                    if (url) return { url };
                  }
                }
                return { url: null };
              } catch (_) {
                return { url: null };
              }
            }, chatId),
            new Promise<{ url: null }>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 15000),
            ),
          ]);
          picUrl = (result as any)?.url || null;
        } catch (_) {}
  
        // Fallback to standard method
        if (!picUrl) {
          try {
            picUrl = await this.client.getProfilePicUrl(chatId);
          } catch (_) {}
        }
  
        if (!picUrl) return null;
  
        // Handle base64 data URLs
        if (picUrl.startsWith('data:')) {
          fs.writeFileSync(filePath, Buffer.from(picUrl.split(',')[1], 'base64'));
          return `/api/whatsapp/avatar/${encodeURIComponent(chatId)}`;
        }
  
        // Download and cache with proper WhatsApp headers
        const https = require('https');
        const http = require('http');
        await new Promise<void>((resolve, reject) => {
          const lib = picUrl!.startsWith('https') ? https : http;
          const fileStream = fs.createWriteStream(filePath);
          const req = lib.get(
            picUrl,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'image/*,*/*',
                Origin: 'https://web.whatsapp.com',
                Referer: 'https://web.whatsapp.com/',
              },
            },
            (res: any) => {
              if (res.statusCode !== 200) {
                res.resume();
                fileStream.destroy();
                fs.unlink(filePath, () => {});
                return reject(new Error(`HTTP ${res.statusCode}`));
              }
              res.pipe(fileStream);
              fileStream.on('finish', resolve);
              fileStream.on('error', reject);
            },
          );
          req.on('error', reject);
          setTimeout(() => {
            req.destroy();
            reject(new Error('timeout'));
          }, 15000);
        });
        return `/api/whatsapp/avatar/${encodeURIComponent(chatId)}`;
      } catch (_) {
        return null;
      }
    }
  
    getAvatarFilePath(chatId: string): string {
      return avatarFilePath(this.userId, this.profileId, chatId);
    }
  
    // ── Start session ───────────────────────────────────────────────────────────
    start() {
      if (this.client) {
        this.logger.warn(`[START] Already running for userId=${this.userId}`);
        // If already in QR state, re-broadcast existing QR to any new socket listeners
        if (this.status === 'qr' && this.qrDataURL) {
          this.broadcast('qr', {
            qr: this.qrDataURL,
            expiresIn: 20,
            attempt: this.qrAttempts,
          });
          this.broadcast('status', { status: 'qr' });
        }
        return;
      }
      this.qrAttempts = 0;
      this.logger.log(
        `[START] Initializing session for userId=${this.userId} — hasSession=${this.hasSession()}`,
      );
      this.status = 'initializing';
      // If saved session exists, tell frontend we're reconnecting silently (no QR needed)
      if (this.hasSession()) {
        this.broadcast('status', {
          status: 'reconnecting',
          message: 'Restoring saved session...',
        });
      } else {
        this.broadcast('status', { status: 'initializing' });
      }
  
      const sessionPath = path.join(
        profileDataDir(this.userId, this.profileId),
        'session',
      );
      const isProduction = process.env.NODE_ENV === 'production';

      const puppeteerConfig: any = {
        headless: true,
        executablePath: puppeteer.executablePath(), // ← IMPORTANT
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--disable-extensions',
          '--disable-software-rasterizer',
          '--disable-background-networking',
          '--disable-features=site-per-process',
        ],
      };
  
      /*if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        this.logger.log(`[START] Using Chromium at: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
      } else {
        // 1. Try Puppeteer's own bundled Chromium (downloaded via postinstall)
        try {
          const puppeteer = require('puppeteer');
          const bundled = puppeteer.executablePath?.();
          if (bundled && fs.existsSync(bundled)) {
            puppeteerConfig.executablePath = bundled;
            this.logger.log(`[START] Using Puppeteer bundled Chromium: ${bundled}`);
          }
        } catch (_) {}
  
        // 2. Fallback: auto-detect common system paths on Linux
        if (!puppeteerConfig.executablePath) {
          const chromiumPaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            '/usr/lib/chromium-browser/chromium-browser',
          ];
          for (const p of chromiumPaths) {
            if (fs.existsSync(p)) {
              puppeteerConfig.executablePath = p;
              this.logger.log(`[START] Auto-detected system Chromium: ${p}`);
              break;
            }
          }
        }
        if (!puppeteerConfig.executablePath) {
          this.logger.warn(`[START] No Chromium found — Puppeteer will use its default. If QR fails, set PUPPETEER_EXECUTABLE_PATH in .env`);
        }
      }*/
  
      try {
        const puppeteer = require('puppeteer');
        const bundledPath = puppeteer.executablePath();
  
        if (bundledPath && fs.existsSync(bundledPath)) {
          puppeteerConfig.executablePath = bundledPath;
          this.logger.log(`[START] Using Puppeteer bundled Chromium: ${bundledPath}`);
        } else {
          throw new Error('Bundled Chromium not found');
        }
      } catch (err: any) {
        this.logger.error(`[START] Failed to resolve Chromium: ${err.message}`);
      }
  
      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: sessionPath }),
        puppeteer: puppeteerConfig,
        // Enable full history sync so older messages are available
        webVersionCache: {
          type: 'remote',
          remotePath:
            'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
      });
  
      // ── QR: refresh every time WhatsApp regenerates it ──────────────────────
      this.client.on('qr', async (qr: string) => {
        this.qrAttempts++;
        this.status = 'qr';
        this.qrDataURL = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        this.logger.log(
          `[QR] Generated attempt=${this.qrAttempts}/${this.MAX_QR_ATTEMPTS}`,
        );
  
        if (this.qrAttempts > this.MAX_QR_ATTEMPTS) {
          // Too many expired QRs — stop and ask frontend to restart
          this.logger.warn(`[QR] Max attempts reached — stopping session`);
          this.qrDataURL = null;
          this.broadcast('status', {
            status: 'error',
            message: 'QR expired too many times. Please call /start again.',
            code: 'QR_MAX_ATTEMPTS',
          });
          await this.stop();
          return;
        }
  
        // Send status first so UI enters QR mode, then send the image
        this.broadcast('status', { status: 'qr', attempt: this.qrAttempts });
        this.broadcast('qr', {
          qr: this.qrDataURL,
          expiresIn: 20,
          attempt: this.qrAttempts,
          maxAttempts: this.MAX_QR_ATTEMPTS,
        });
      });
  
      this.client.on('authenticated', () => {
        this.logger.log(`[AUTH] Authenticated userId=${this.userId}`);
        this.qrAttempts = 0;
        this.qrDataURL = null;
        if (this.qrRefreshTimer) {
          clearTimeout(this.qrRefreshTimer);
          this.qrRefreshTimer = null;
        }
        this.broadcast('status', { status: 'connecting' });
      });
  
      this.client.on('auth_failure', () => {
        this.logger.error(`[AUTH] Auth failed userId=${this.userId}`);
        this.status = 'disconnected';
        this.client = null;
        this.broadcast('status', {
          status: 'error',
          message: 'Auth failed — call /start again',
        });
      });
  
      this.client.on('disconnected', (reason: string) => {
        this.logger.warn(`[DISCONNECTED] userId=${this.userId} reason=${reason}`);
        this.status = 'disconnected';
        this.connectedNumber = null;
        this.qrDataURL = null;
        this.broadcast('status', { status: 'disconnected', message: reason });
        try {
          this.client?.destroy().catch(() => {});
        } catch (_) {}
        this.client = null;
        // Auto-reconnect if session file still exists (e.g. network drop)
        if (this.hasSession() && reason !== 'LOGOUT') {
          this.logger.log(`[RECONNECT] Session exists — auto-restarting in 5s`);
          this.broadcast('status', { status: 'reconnecting' });
          setTimeout(() => this.start(), 5000);
        }
      });
  
      this.client.on('ready', async () => {
        this.connectedNumber = (this.client as any).info?.wid?.user || 'unknown';
        this.logger.log(
          `[READY] Connected! userId=${this.userId} number=+${this.connectedNumber}`,
        );
        this.status = 'connected';
        this.broadcast('status', {
          status: 'connected',
          connectedNumber: this.connectedNumber,
        });
  
        try {
          let chats: any[] = [];
          try {
            chats = await this.client!.getChats();
          } catch (err: any) {
            if (
              err?.message?.includes('Execution context') ||
              err?.message?.includes('Protocol error')
            ) {
              this.logger.warn(
                `[CHATS] Context destroyed on getChats — phone likely logged out`,
              );
              this.broadcast('chats_loading', {
                loading: false,
                error: 'Session ended from phone',
              });
              return;
            }
            throw err;
          }
          this.broadcast('chats_loading', {
            loading: true,
            total: chats.length,
            loaded: 0,
            percent: 0,
          });
          let loaded = 0;
          const BATCH = 3; // smaller batch for better performance
          for (let i = 0; i < chats.length; i += BATCH) {
            // Stop processing if client was destroyed (e.g. logout from phone)
            if (!this.client || !this.isConnected()) {
              this.logger.warn(
                `[CHATS] Client disconnected during load — stopping`,
              );
              break;
            }
            const batch = chats.slice(i, i + BATCH);
            await Promise.all(
              batch.map(async (chat: any) => {
                const chatId = chat.id._serialized;
                const isGroup = chat.isGroup;
                const isChannel =
                  chatId.endsWith('@newsletter') || chatId === 'status@broadcast';
                let contactName = chat.name || chatId.replace(/@.+/, '');
                const contactNumber = chatId.replace(/@.+/, '');
  
                // For 1-on-1 chats, resolve the real contact name from the Contact store
                if (
                  !chat.isGroup &&
                  !chatId.endsWith('@newsletter') &&
                  chatId !== 'status@broadcast'
                ) {
                  try {
                    const contact = await this.client!.getContactById(chatId);
                    contactName =
                      contact.pushname ||
                      contact.name ||
                      contact.number ||
                      contactName;
                  } catch (_) {}
                }
                try {
                  // Fetch messages for this chat
                  let messages: StoredMessage[] = [];
                  // AFTER — try pupPage Store first (most reliable), then fallback
                  try {
                    const rawMsgs = await (this.client as any).pupPage.evaluate(
                      async (cid: string, lim: number) => {
                        try {
                          const S = (window as any).Store;
                          const chat =
                            S?.Chat?.get(cid) || (await S?.Chat?.find?.(cid));
                          if (!chat) return null;
                          const msgStore = chat.msgs;
                          if (!msgStore) return null;
                          // Load earlier messages until we have enough
                          let attempts = 0;
                          while (
                            (msgStore.models?.length || 0) < lim &&
                            attempts < 8
                          ) {
                            const hasMore =
                              await S?.LoadChatMessages?.loadEarlierMsgs(chat);
                            if (!hasMore) break;
                            await new Promise((r) => setTimeout(r, 250));
                            attempts++;
                          }
                          return (msgStore.models || [])
                            .slice(-lim)
                            .map((m: any) => ({
                              id: m.id?._serialized,
                              from: m.id?.fromMe
                                ? 'me'
                                : m.id?.remote?._serialized ||
                                  m.from?._serialized ||
                                  '',
                              body: m.body || m.caption || '',
                              type: m.type || 'chat',
                              timestamp: m.t || 0,
                              fromMe: !!m.id?.fromMe,
                              ack: m.ack || 0,
                              hasMedia: !!m.hasMedia,
                              author: m.author?._serialized || null,
                              mimetype: m.mimetype || null,
                            }));
                        } catch (_) {
                          return null;
                        }
                      },
                      chatId,
                      50,
                    );
  
                    if (rawMsgs?.length) {
                      messages = rawMsgs.map((m: any) => ({
                        id: m.id,
                        from: m.from,
                        body: m.body,
                        type: m.type,
                        timestamp: m.timestamp,
                        fromMe: m.fromMe,
                        ack: m.ack,
                        hasMedia: m.hasMedia,
                        media: null,
                        author: m.author,
                        mediaUrl: m.hasMedia
                          ? `/api/whatsapp/media/${encodeURIComponent(m.id)}`
                          : null,
                        mimetype: m.mimetype || null,
                      }));
                      this.logger.log(
                        `[CHATS] Store fetched ${messages.length} messages for ${chatId}`,
                      );
                    } else {
                      // Fallback: getChatById
                      const waChat = await this.client!.getChatById(chatId);
                      const waMessages = await waChat.fetchMessages({
                        limit: 50,
                      });
                      messages = await Promise.all(
                        waMessages.map((m: any) => this.formatMessage(m, true)),
                      );
                      this.logger.log(
                        `[CHATS] getChatById fetched ${messages.length} messages for ${chatId}`,
                      );
                    }
                  } catch (err: any) {
                    this.logger.warn(
                      `[CHATS] Failed to fetch messages for ${chatId}: ${err.message}`,
                    );
                    if (chat.lastMessage) {
                      try {
                        messages = [
                          await this.formatMessage(chat.lastMessage, true),
                        ];
                      } catch (_) {}
                    }
                  }
  
                  if (this.chatStore[chatId]) {
                    this.chatStore[chatId].contact.name = contactName;
                    this.chatStore[chatId].unreadCount = chat.unreadCount || 0;
                    this.chatStore[chatId].messages = messages;
                  } else {
                    this.chatStore[chatId] = {
                      chatId,
                      contact: {
                        name: contactName,
                        number: contactNumber,
                        avatar: null,
                      },
                      messages,
                      unreadCount: chat.unreadCount || 0,
                      isGroup,
                      isChannel,
                      lastMessageTimestamp: chat.timestamp || chat.t || 0,
                      _previewOnly: false,
                    };
                  }
                } catch (err: any) {
                  this.logger.error(
                    `[CHATS] Error processing chat ${chatId}: ${err.message}`,
                  );
                }
  
                loaded++;
              }),
            );
            const percent = Math.round((loaded / chats.length) * 100);
            this.broadcast('chats_loading', {
              loading: true,
              total: chats.length,
              loaded,
              percent,
            });
            this.broadcast('chats', this.buildChatList());
          }
          this.broadcast('chats_loading', {
            loading: false,
            total: chats.length,
            loaded,
            percent: 100,
          });
          this.broadcast('chats', this.buildChatList());
          this.logger.log(
            `[CHATS] Loaded ${loaded} chats for userId=${this.userId}`,
          );
          debouncedSave(this.userId, this.profileId, this.chatStore);
  
          // ── Fetch avatars in background after chats are loaded ───────────────
          this.fetchAvatarsInBackground();
        } catch (err: any) {
          const isContextDestroyed =
            err?.message?.includes('Execution context was destroyed') ||
            err?.message?.includes('Protocol error') ||
            err?.message?.includes('Target closed');
  
          if (isContextDestroyed) {
            this.logger.warn(
              `[CHATS] Browser context destroyed (phone logged out) — cleaning up`,
            );
            this.broadcast('chats_loading', {
              loading: false,
              error: 'Session ended from phone',
            });
            // Trigger clean disconnect
            try {
              this.client?.destroy().catch(() => {});
            } catch (_) {}
            this.client = null;
            this.status = 'disconnected';
            this.connectedNumber = null;
            this.broadcast('status', {
              status: 'disconnected',
              message: 'Logged out from phone',
            });
          } else {
            this.logger.error(`[CHATS] Failed: ${err.message}`);
            this.broadcast('chats_loading', {
              loading: false,
              error: err.message,
            });
          }
        }
      });
  
      this.client.on('message', async (msg: any) => {
        if (msg.fromMe) return;
        const chatId = msg.from;
        this.logger.log(
          `[MSG IN] from=${chatId} body="${(msg.body || '').slice(0, 60)}" type=${msg.type}`,
        );
  
        // ── Handle status@broadcast separately ──────────────────────────────
        if (chatId === 'status@broadcast') {
          const formatted = await this.formatMessage(msg, true);
          if (msg.hasMedia)
            (formatted as any).mediaUrl =
              `/api/whatsapp/media/${encodeURIComponent(msg.id._serialized)}`;
          if (!this.chatStore['status@broadcast']) {
            this.chatStore['status@broadcast'] = {
              chatId: 'status@broadcast',
              contact: { name: 'Status Updates', number: '', avatar: null },
              messages: [],
              unreadCount: 0,
              isGroup: false,
              isChannel: true,
            };
          }
          this.chatStore['status@broadcast'].messages.push(formatted);
          // Only broadcast to sockets that subscribed to status
          const hasStatusViewers = Object.values(this.activeViewers).some(
            (v) => v === 'status@broadcast',
          );
          if (hasStatusViewers) {
            this.broadcast('status_message', { message: formatted });
          }
          this.broadcast('chats', this.buildChatList());
          debouncedSave(this.userId, this.profileId, this.chatStore);
          return;
        }
        if (!this.chatStore[chatId]) {
          let contactName = chatId.replace(/@.+/, '');
          try {
            const c = await msg.getContact();
            contactName = c.pushname || c.name || contactName;
          } catch (_) {}
          const avatar = await this.cacheAvatar(chatId);
          this.chatStore[chatId] = {
            chatId,
            contact: {
              name: contactName,
              number: chatId.replace(/@.+/, ''),
              avatar,
            },
            messages: [],
            unreadCount: 0,
            isGroup: chatId.includes('@g.us'),
            isChannel: false,
          };
        }
        const formatted = await this.formatMessage(msg);
        this.chatStore[chatId].messages.push(formatted);
        const anyoneViewing = Object.values(this.activeViewers).some(
          (id) => id === chatId,
        );
        if (!anyoneViewing)
          this.chatStore[chatId].unreadCount =
            (this.chatStore[chatId].unreadCount || 0) + 1;
        this.broadcast('message', { chatId, message: formatted });
        this.broadcast('chats', this.buildChatList());
        debouncedSave(this.userId, this.profileId, this.chatStore);
  
        // ── Flow Builder: try to match and execute a flow ──────────────────────
        if (this.onIncomingMessage) {
          const contactName = this.chatStore[chatId]?.contact?.name;
          const contactPhone = chatId.replace(/@.+/, '');
          this.onIncomingMessage(chatId, msg.body || '', contactName, contactPhone).catch(() => {});
        }
      });
  
      this.client.on('message_create', async (msg: any) => {
        if (!msg.fromMe) return;
        const chatId = msg.to;
        this.logger.log(
          `[MSG OUT] to=${chatId} body="${(msg.body || '').slice(0, 60)}" type=${msg.type}`,
        );
        if (!this.chatStore[chatId]) {
          this.chatStore[chatId] = {
            chatId,
            contact: {
              name: chatId.replace(/@.+/, ''),
              number: chatId.replace(/@.+/, ''),
              avatar: null,
            },
            messages: [],
            unreadCount: 0,
            isGroup: chatId.includes('@g.us'),
            isChannel: false,
          };
        }
        const formatted = await this.formatMessage(msg);
        this.chatStore[chatId].messages.push(formatted);
        this.chatStore[chatId].unreadCount = 0;
        this.broadcast('message', { chatId, message: formatted });
        this.broadcast('chats', this.buildChatList());
        debouncedSave(this.userId, this.profileId, this.chatStore);
      });
  
      this.client.on('message_ack', (msg: any, ack: number) => {
        try {
          const chatId = msg.to || msg.from;
          const msgId = msg.id._serialized;
          if (this.chatStore[chatId]) {
            const stored = this.chatStore[chatId].messages.find(
              (m) => m.id === msgId,
            );
            if (stored) stored.ack = ack;
          }
          this.logger.log(`[ACK] chatId=${chatId} msgId=${msgId} ack=${ack}`);
          this.broadcast('message_ack', { chatId, msgId, ack });
        } catch (_) {}
      });
  
      // ── Read receipt: fires when recipient reads your message ────────────────
      // Also fires when YOU read a chat from another device/phone
      this.client.on('chat_update' as any, (chat: any) => {
        try {
          const chatId = chat.id?._serialized || chat.id;
          if (!chatId) return;
          const unread = chat.unreadCount ?? 0;
          this.logger.log(`[CHAT_UPDATE] chatId=${chatId} unreadCount=${unread}`);
          if (this.chatStore[chatId]) {
            this.chatStore[chatId].unreadCount = Math.max(0, unread);
            this.broadcast('chats', this.buildChatList());
            this.broadcast('unread_update', { chatId, unreadCount: unread });
          }
        } catch (_) {}
      });
  
      // ── Message seen: fires when someone reads your message ──────────────────
      this.client.on('message_seen' as any, (msg: any) => {
        try {
          const chatId = msg.to || msg.from;
          const msgId = msg.id?._serialized;
          this.logger.log(`[SEEN] chatId=${chatId} msgId=${msgId}`);
          // Mark all messages in this chat as read (ack=3)
          if (this.chatStore[chatId]) {
            this.chatStore[chatId].messages.forEach((m) => {
              if (m.fromMe && m.ack < 3) m.ack = 3;
            });
            this.broadcast('chat_read', { chatId });
            this.broadcast('chats', this.buildChatList());
          }
        } catch (_) {}
      });
  
      // ── Unread count sync: poll every 30s to keep unread counts accurate ─────
      const unreadSyncTimer = setInterval(async () => {
        if (!this.isConnected() || !this.client) {
          clearInterval(unreadSyncTimer);
          return;
        }
        try {
          const waChats = await this.client.getChats();
          let changed = false;
          for (const waChat of waChats) {
            const chatId = waChat.id._serialized;
            if (this.chatStore[chatId]) {
              const newUnread = Math.max(0, waChat.unreadCount || 0);
              if (this.chatStore[chatId].unreadCount !== newUnread) {
                this.chatStore[chatId].unreadCount = newUnread;
                changed = true;
              }
            }
          }
          if (changed) {
            this.logger.log(`[UNREAD_SYNC] Unread counts updated`);
            this.broadcast('chats', this.buildChatList());
          }
        } catch (_) {}
      }, 30000);
  
      // ── Presence: online/offline/typing status ───────────────────────────────
      this.client.on(
        'contact_changed' as any,
        async (msg: any, oldId: string, newId: string, isContact: boolean) => {
          try {
            this.logger.log(
              `[PRESENCE] contact_changed oldId=${oldId} newId=${newId}`,
            );
            this.broadcast('contact_changed', { oldId, newId, isContact });
          } catch (_) {}
        },
      );
  
      // Subscribe to presence updates for all contacts
      this.client.on('ready', async () => {
        // Already handled above — this is just for presence subscription
      });
  
      // Presence update — online/offline/typing
      this.client.on('change_state' as any, (state: any) => {
        this.logger.log(`[PRESENCE] change_state: ${state}`);
      });
  
      // Contact online/offline
      (this.client as any).pupPage?.on('framenavigated', () => {});
  
      // Subscribe to presence via pupPage after ready
      this.client.on('ready', async () => {
        try {
          await (this.client as any).pupPage.evaluate(() => {
            // Listen for presence updates from WhatsApp Web internals
            const origPresence = (window as any).Store?.Presence;
            if (origPresence) {
              origPresence.on?.('change', (presence: any) => {
                (window as any).__presenceUpdate = {
                  chatId: presence.id?._serialized,
                  isOnline: presence.isOnline,
                  isTyping: presence.chatstate === 'composing',
                  lastSeen: presence.t,
                };
              });
            }
          });
        } catch (_) {}
      });
  
      // Poll presence updates every 2s and broadcast
      const presenceTimer = setInterval(async () => {
        if (!this.isConnected() || !this.client) {
          clearInterval(presenceTimer);
          return;
        }
        try {
          const update = await (this.client as any).pupPage.evaluate(() => {
            const u = (window as any).__presenceUpdate;
            (window as any).__presenceUpdate = null;
            return u;
          });
          if (update?.chatId) {
            this.logger.log(
              `[PRESENCE] chatId=${update.chatId} online=${update.isOnline} typing=${update.isTyping}`,
            );
            this.broadcast('presence', update);
          }
        } catch (_) {}
      }, 2000);
  
      this.client.initialize().catch((err: any) => {
        this.logger.error(`[INIT] initialize() failed: ${err.message}`);
        this.status = 'disconnected';
        this.broadcast('status', { status: 'error', message: err.message });
        try {
          this.client?.destroy().catch(() => {});
        } catch (_) {}
        this.client = null;
      });
    }
  
    async stop() {
      if (!this.client) return;
      try {
        await this.client.destroy();
      } catch (_) {}
      this.client = null;
      this.status = 'disconnected';
      this.connectedNumber = null;
      this.qrDataURL = null;
      this.broadcast('status', { status: 'disconnected' });
    }
  
    async logout() {
      try {
        if (this.client) {
          try {
            await this.client.logout();
          } catch (_) {}
          try {
            await this.client.destroy();
          } catch (_) {}
        }
      } catch (_) {}
      this.client = null;
      this.status = 'disconnected';
      this.connectedNumber = null;
      this.qrDataURL = null;
      const sessionPath = path.join(
        profileDataDir(this.userId, this.profileId),
        'session',
      );
      if (fs.existsSync(sessionPath))
        fs.rmSync(sessionPath, { recursive: true, force: true });
      Object.keys(this.chatStore).forEach((k) => delete this.chatStore[k]);
      const chatFile = chatStorePath(this.userId, this.profileId);
      if (fs.existsSync(chatFile)) fs.unlinkSync(chatFile);
      this.broadcast('status', { status: 'disconnected' });
      this.broadcast('chats', []);
    }
  
    isConnected(): boolean {
      return this.status === 'connected' && !!this.client;
    }
  
    formatNumber(to: string): string {
      return to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`;
    }
  
    // ── Get presence for a specific contact ──────────────────────────────────
    async getPresence(chatId: string): Promise<{
      chatId: string;
      isOnline: boolean;
      isTyping: boolean;
      lastSeen: number | null;
    } | null> {
      if (!this.isConnected()) return null;
      try {
        const result = await (this.client as any).pupPage.evaluate(
          async (cid: string) => {
            try {
              const S = (window as any).Store;
              if (!S) return null;
  
              // Step 1: Subscribe to presence for this contact
              const wid = S.WidFactory?.createWid(cid);
              if (wid) {
                try {
                  await S.PresenceUtils?.subscribe(wid);
                } catch (_) {}
                try {
                  await S.Presence?.subscribe(wid);
                } catch (_) {}
              }
  
              // Step 2: Wait for WhatsApp to push presence data (up to 3s)
              let presence: any = null;
              for (let i = 0; i < 6; i++) {
                await new Promise((r) => setTimeout(r, 500));
                presence = S.Presence?.get(cid) || S.PresenceStore?.get(cid);
                if (presence?.isOnline !== undefined || presence?.t) break;
              }
  
              if (presence) {
                return {
                  chatId: cid,
                  isOnline: (presence as any).isOnline ?? false,
                  isTyping:
                    (presence as any).chatstate === 'composing' ||
                    (presence as any).type === 'composing',
                  lastSeen:
                    (presence as any).t || (presence as any).lastSeen || null,
                };
              }
  
              // Step 3: Fallback — read from Contact store
              const contact: any = S.Contact?.get(cid);
              if (contact) {
                return {
                  chatId: cid,
                  isOnline: contact.isOnline ?? false,
                  isTyping: false,
                  lastSeen: contact.lastSeen || null,
                };
              }
              return {
                chatId: cid,
                isOnline: false,
                isTyping: false,
                lastSeen: null,
              };
            } catch (e: any) {
              return {
                chatId: cid,
                isOnline: false,
                isTyping: false,
                lastSeen: null,
              };
            }
          },
          chatId,
        );
  
        if (result) {
          this.logger.log(
            `[PRESENCE] chatId=${chatId} online=${result.isOnline} typing=${result.isTyping} lastSeen=${result.lastSeen}`,
          );
        }
        return result;
      } catch (_) {
        return null;
      }
    }
  
    // ── Start real-time presence listener for a contact ───────────────────────
    async watchPresence(
      chatId: string,
      onUpdate: (data: {
        chatId: string;
        isOnline: boolean;
        isTyping: boolean;
        isRecording: boolean;
        typingUsers: string[];
        lastSeen: number | null;
      }) => void,
    ): Promise<() => void> {
      this.logger.log(`[PRESENCE] watchPresence called → chatId=${chatId} connected=${this.isConnected()}`);
  
      if (!this.isConnected()) {
        this.logger.warn(`[PRESENCE] watchPresence aborted — session not connected`);
        return () => {};
      }
  
      let active = true;
  
      // Step 1: Subscribe to presence + always init __pw (even if subscribe fails)
      try {
        const subResult = await (this.client as any).pupPage.evaluate(async (cid: string) => {
          const S = (window as any).Store;
  
          // Always init __pw first so poll never hits undefined
          (window as any).__pw = (window as any).__pw || {};
          (window as any).__pw[cid] = { isOnline: null, isTyping: null, lastSeen: null };
  
          if (!S) return { error: 'Store not found' };
  
          const wid = S.WidFactory?.createWid(cid);
          if (!wid) return { error: 'WidFactory failed to create wid' };
  
          // Wrap each subscribe attempt individually so one failure doesn't abort others
          const trySubscribe = async (fn: any, label: string) => {
            try {
              if (typeof fn === 'function') {
                await fn(wid);
                return `${label}:ok`;
              }
              return `${label}:not_a_function`;
            } catch (e: any) {
              return `${label}:error(${e?.message})`;
            }
          };
  
          const results = await Promise.all([
            trySubscribe(S.PresenceUtils?.subscribe?.bind(S.PresenceUtils), 'PresenceUtils'),
            trySubscribe(S.Presence?.subscribe?.bind(S.Presence), 'Presence'),
            trySubscribe(S.PresenceStore?.subscribe?.bind(S.PresenceStore), 'PresenceStore'),
          ]);
  
          return {
            wid: wid._serialized,
            presenceUtils: !!S.PresenceUtils,
            presence: !!S.Presence,
            presenceStore: !!S.PresenceStore,
            results,
          };
        }, chatId);
  
        this.logger.log(`[PRESENCE] Subscribe result for ${chatId}: ${JSON.stringify(subResult)}`);
      } catch (err: any) {
        // Even if evaluate itself throws, ensure __pw is seeded via a second evaluate
        this.logger.warn(`[PRESENCE] Subscribe step threw for ${chatId}: ${err.message} — seeding __pw fallback`);
        try {
          await (this.client as any).pupPage.evaluate((cid: string) => {
            (window as any).__pw = (window as any).__pw || {};
            (window as any).__pw[cid] = { isOnline: null, isTyping: null, lastSeen: null };
          }, chatId);
        } catch (_) {}
      }
  
      // Step 2: Poll every 1.5s, emit only on change
      let pollCount = 0;
      const poll = async () => {
        this.logger.log(`[PRESENCE] Poll loop started for chatId=${chatId}`);
  
        while (active && this.isConnected()) {
          try {
            const result = await (this.client as any).pupPage.evaluate(
              (cid: string) => {
                try {
                  const S = (window as any).Store;
  
                  // Try every known presence store path
                  const p =
                    S?.Presence?.get(cid) ||
                    S?.PresenceStore?.get(cid) ||
                    S?.PresenceUtils?.getPresence?.(cid) ||
                    null;
  
                  const c = S?.Contact?.get(cid) || null;
  
                  // WA Web uses __x_ prefixed internal fields
                  // __x_isOnline is unreliable — derive from chatstate instead
                  const chatstateObj = p?.__x_chatstate ?? p?.chatstate;
                  const chatstateStr = chatstateObj
                    ? (typeof chatstateObj === 'string'
                        ? chatstateObj
                        : (chatstateObj?.type ?? chatstateObj?.stateType ?? chatstateObj?.chatstate ?? ''))
                    : '';
  
                  // online = chatstate is 'available' OR __x_isOnline with hasData guard
                  const hasData   = !!(p?.__x_hasData);
                  const isOnline  = chatstateStr === 'available' || (hasData && !!(p?.__x_isOnline));
                  const isTyping  = chatstateStr === 'composing';
                  const isRecording = chatstateStr === 'recording';
  
                  // typingUserIds / recordingUserIds for group chats
                  const typingIds: string[] = [];
                  try {
                    const tIds = p?.__x_typingUserIds;
                    if (tIds && typeof tIds[Symbol.iterator] === 'function') {
                      for (const id of tIds) typingIds.push(String(id?._serialized ?? id));
                    }
                  } catch (_) {}
  
                  const lastSeen = Number(p?.t ?? p?.lastSeen ?? c?.lastSeen ?? 0) || null;
  
                  // Collect presence keys safely
                  let presenceKeys: string[] = [];
                  try { presenceKeys = p ? Object.keys(p) : []; } catch (_) {}
  
                  const snapshot = {
                    hasPresence  : !!p,
                    hasContact   : !!c,
                    hasData,
                    chatstate    : chatstateStr,
                    presenceType : String(p?.type ?? ''),
                    presenceKeys,
                    isOnline,
                    isTyping,
                    isRecording,
                    typingUsers  : typingIds,
                    lastSeen,
                  };
  
                  // Ensure __pw entry exists
                  (window as any).__pw = (window as any).__pw || {};
                  (window as any).__pw[cid] = (window as any).__pw[cid] || { isOnline: null, isTyping: null, lastSeen: null };
                  const prev = (window as any).__pw[cid];
  
                  const changed =
                    prev.isOnline    !== isOnline    ||
                    prev.isTyping    !== isTyping    ||
                    prev.isRecording !== isRecording ||
                    prev.lastSeen    !== lastSeen    ||
                    JSON.stringify(prev.typingUsers ?? []) !== JSON.stringify(typingIds);
  
                  if (changed) {
                    (window as any).__pw[cid] = { isOnline, isTyping, isRecording, typingUsers: typingIds, lastSeen };
                  }
  
                  // Always return plain object with only primitives/arrays
                  return JSON.parse(JSON.stringify({ changed, chatId: cid, isOnline, isTyping, isRecording, typingUsers: typingIds, lastSeen, snapshot }));
                } catch (e: any) {
                  return { error: String(e?.message), changed: false, chatId: cid, isOnline: false, isTyping: false, lastSeen: null, snapshot: null };
                }
              },
              chatId,
            );
  
            pollCount++;
  
            // Raw dump on first 3 polls to diagnose serialization
            if (pollCount <= 3) {
              this.logger.log(`[PRESENCE] Raw poll result #${pollCount} chatId=${chatId}: ${JSON.stringify(result)}`);
            }
  
            // Log every 10th poll so we can confirm the loop is alive without flooding
            if (pollCount % 10 === 1) {
              this.logger.log(
                `[PRESENCE] Poll #${pollCount} chatId=${chatId} → hasPresence=${result?.snapshot?.hasPresence} isOnline=${result?.snapshot?.isOnline} isTyping=${result?.snapshot?.isTyping} lastSeen=${result?.snapshot?.lastSeen} presenceKeys=[${result?.snapshot?.presenceKeys}] chatstate=${result?.snapshot?.chatstate}`,
              );
            }
  
            if (result?.changed) {
              this.logger.log(
                `[PRESENCE] ✅ CHANGE detected chatId=${chatId} online=${result.isOnline} typing=${result.isTyping} recording=${result.isRecording} typingUsers=${JSON.stringify(result.typingUsers)} lastSeen=${result.lastSeen}`,
              );
              onUpdate({
                chatId      : result.chatId,
                isOnline    : result.isOnline,
                isTyping    : result.isTyping,
                isRecording : result.isRecording ?? false,
                typingUsers : result.typingUsers ?? [],
                lastSeen    : result.lastSeen,
              });
            }
          } catch (err: any) {
            if (
              err.message?.includes('Execution context') ||
              err.message?.includes('Target closed')
            ) {
              this.logger.warn(`[PRESENCE] Poll stopped — context destroyed for chatId=${chatId}`);
              active = false;
              break;
            }
            this.logger.error(`[PRESENCE] Poll error for chatId=${chatId}: ${err.message}`);
          }
  
          await new Promise((r) => setTimeout(r, 1500));
        }
  
        this.logger.log(`[PRESENCE] Poll loop ended for chatId=${chatId} active=${active}`);
      };
  
      poll(); // fire and forget
      this.logger.log(`[PRESENCE] Watcher started for chatId=${chatId}`);
  
      return () => {
        this.logger.log(`[PRESENCE] Watcher stopped for chatId=${chatId} after ${pollCount} polls`);
        active = false;
      };
    }
  
    // ── Fetch avatars for all chats in background ─────────────────────────────
    private async fetchAvatarsInBackground() {
      const chatIds = Object.keys(this.chatStore);
      this.logger.log(
        `[AVATAR] Starting background fetch for ${chatIds.length} chats`,
      );
      const BATCH = 5;
      let updated = 0;
      let failed = 0;
      let skipped = 0;
  
      for (let i = 0; i < chatIds.length; i += BATCH) {
        if (!this.isConnected()) break;
        const batch = chatIds.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (chatId) => {
            try {
              // Skip channels and broadcast
              if (
                chatId === 'status@broadcast' ||
                chatId.endsWith('@newsletter')
              ) {
                skipped++;
                return;
              }
              // Skip if already cached
              const avatarPath = avatarFilePath(
                this.userId,
                this.profileId,
                chatId,
              );
              if (fs.existsSync(avatarPath)) {
                skipped++;
                return;
              }
  
              const avatarUrl = await this.cacheAvatar(chatId);
              if (avatarUrl && this.chatStore[chatId]) {
                this.chatStore[chatId].contact.avatar = avatarUrl;
                updated++;
              } else {
                failed++;
              }
            } catch (_) {
              failed++;
            }
          }),
        );
  
        if (updated > 0) {
          this.broadcast('chats', this.buildChatList());
          debouncedSave(this.userId, this.profileId, this.chatStore);
          updated = 0;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      this.logger.log(
        `[AVATAR] Background fetch complete — skipped=${skipped} failed=${failed}`,
      );
    }
  
    hasSession(): boolean {
      const sessionPath = path.join(
        profileDataDir(this.userId, this.profileId),
        'session',
      );
      return fs.existsSync(sessionPath);
    }
  
    // Summary for admin view
    getSummary() {
      return {
        userId: this.userId,
        profileId: this.profileId,
        status: this.status,
        connectedNumber: this.connectedNumber,
        hasQR: !!this.qrDataURL,
        totalChats: Object.keys(this.chatStore).length,
        unreadTotal: Object.values(this.chatStore).reduce(
          (s, c) => s + (c.unreadCount || 0),
          0,
        ),
      };
    }
  }
  
  // ── Session registry ──────────────────────────────────────────────────────────
  const sessions = new Map<string, WhatsAppSession>();
  
  function sessionKey(userId: number, profileId: string): string {
    return `${userId}:${profileId}`;
  }
  
  export function getSession(
    userId: number,
    profileId: string,
    io: Server | Namespace,
  ): WhatsAppSession {
    const key = sessionKey(userId, profileId);
    if (!sessions.has(key))
      sessions.set(key, new WhatsAppSession(userId, profileId, io));
    return sessions.get(key)!;
  }
  
  export function findSession(
    userId: number,
    profileId: string,
  ): WhatsAppSession | null {
    return sessions.get(sessionKey(userId, profileId)) || null;
  }
  
  export function getAllSessions(): WhatsAppSession[] {
    return Array.from(sessions.values());
  }
  
  // ── Auto-start on server boot ─────────────────────────────────────────────────
  export function autoStartPersistedSessions(io: Server | Namespace) {
    const logger = new Logger('WA:AutoStart');
    const waDir = path.join(DATA_DIR, 'wa');
    if (!fs.existsSync(waDir)) return;
  
    const userDirs = fs.readdirSync(waDir);
    for (const userIdStr of userDirs) {
      const userId = parseInt(userIdStr);
      if (isNaN(userId)) continue;
      const userPath = path.join(waDir, userIdStr);
      const profileDirs = fs.readdirSync(userPath);
      for (const profileId of profileDirs) {
        const sessionPath = path.join(userPath, profileId, 'session');
        if (fs.existsSync(sessionPath)) {
          logger.log(
            `[AUTO-START] Found saved session for userId=${userId} profileId=${profileId}`,
          );
          const s = getSession(userId, profileId, io);
          s.start();
        }
      }
    }
  }

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Namespace } from 'socket.io';
import {
  getSession,
  findSession,
  WhatsAppSession,
  autoStartPersistedSessions,
} from './whatsapp.session';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private io: Namespace;

  setIo(io: Namespace) { this.io = io; }
  autoStart(io: Namespace) { autoStartPersistedSessions(io as any); }
  onModuleInit() {}

  private session(userId: number, profileId: string): WhatsAppSession {
    return getSession(userId, profileId, this.io);
  }

  // ── Session control ─────────────────────────────────────────────────────────
  start(userId: number, profileId: string) {
    const s = this.session(userId, profileId);
    if (s.client) return { success: false, message: 'Already running' };
    s.start();
    return { success: true };
  }

  async stop(userId: number, profileId: string) {
    const s = findSession(userId, profileId);
    if (s) await s.stop();
    return { success: true };
  }

  async logout(userId: number, profileId: string) {
    const s = findSession(userId, profileId);
    if (s) await s.logout();
    return { success: true };
  }

  getStatus(userId: number, profileId: string) {
    const s = findSession(userId, profileId);
    return { status: s?.status || 'disconnected', connectedNumber: s?.connectedNumber || null, hasQR: !!s?.qrDataURL };
  }

  getQR(userId: number, profileId: string): string | null {
    return findSession(userId, profileId)?.qrDataURL || null;
  }

  // ── Chats ───────────────────────────────────────────────────────────────────
  getChats(userId: number, profileId: string) {
    const s = findSession(userId, profileId);
    return s ? s.buildChatList() : [];
  }

  async getMessages(userId: number, profileId: string, chatId: string, limit = 50) {
    const s = findSession(userId, profileId);
    if (!s) return [];

    if (s.isConnected()) {
      try {
        // Step 1: Trigger history sync
        try {
          const synced = await (s.client as any).syncHistory(chatId);
          this.logger.log(`[MESSAGES] syncHistory result=${synced}`);
          if (synced) await new Promise(r => setTimeout(r, 2500));
        } catch (_) {}

        // Step 2: Read messages directly from Store.Msg — bypasses getChatById bug
        const rawMsgs = await (s.client as any).pupPage.evaluate(
          async (cid: string, lim: number) => {
            try {
              const result = await (window as any).Store.Msg.getMessagesById
                ? null // not what we want
                : null;

              // Get all messages for this chat from the Msg store
              const allMsgs = (window as any).Store.Msg?.models || [];
              const chatMsgs = allMsgs
                .filter((m: any) => {
                  const from = m.id?.remote?._serialized || m.from?._serialized || '';
                  const to = m.to?._serialized || '';
                  return from === cid || to === cid;
                })
                .slice(-lim)
                .map((m: any) => ({
                  id: m.id?._serialized,
                  from: m.id?.fromMe ? 'me' : (m.id?.remote?._serialized || m.from?._serialized || ''),
                  body: m.body || m.caption || '',
                  type: m.type || 'chat',
                  timestamp: m.t || 0,
                  fromMe: !!m.id?.fromMe,
                  ack: m.ack || 0,
                  hasMedia: !!m.hasMedia,
                  author: m.author?._serialized || null,
                  mimetype: m.mimetype || null,
                }));
              return chatMsgs;
            } catch (e: any) {
              return [];
            }
          },
          chatId,
          limit,
        );

        this.logger.log(`[MESSAGES] Store.Msg got=${rawMsgs?.length ?? 0} for chatId=${chatId}`);

        if (rawMsgs?.length) {
          const formatted = rawMsgs.map((m: any) => ({
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
            mediaUrl: m.hasMedia ? `/api/whatsapp/media/${encodeURIComponent(m.id)}` : null,
            mimetype: m.mimetype || null,
          }));

          if (s.chatStore[chatId]) {
            s.chatStore[chatId].messages = formatted;
            s.chatStore[chatId]._previewOnly = false;
          }
          return formatted;
        }

        // Step 3: Fallback — use cached store messages
        this.logger.warn(`[MESSAGES] Store.Msg empty — returning cached`);
        const chat = s.chatStore[chatId];
        return chat?.messages || [];

      } catch (err: any) {
        this.logger.error(`[MESSAGES] Failed: ${err.message}`);
      }
    }

    const chat = s.chatStore[chatId];
    return chat?.messages || [];
  }

  // ── Download media for a specific message on demand ─────────────────────────
  async getMessageMedia(userId: number, profileId: string, msgId: string): Promise<{ data: string; mimetype: string; filename: string | null } | null> {
    const s = findSession(userId, profileId);
    if (!s || !s.isConnected()) return null;

    try {
      this.logger.log(`[MEDIA] Downloading msgId=${msgId}`);
      // Search all chats for this message
      const chatId = msgId.includes('_') ? msgId.split('_')[1] : null;
      if (!chatId) return null;

      const waChat = await s.client!.getChatById(chatId);
      const msgs = await waChat.fetchMessages({ limit: 50 });
      const msg = msgs.find((m: any) => m.id._serialized === msgId);

      if (!msg || !msg.hasMedia) {
        this.logger.warn(`[MEDIA] Message not found or no media: ${msgId}`);
        return null;
      }

      const media = await msg.downloadMedia();
      if (!media) return null;

      this.logger.log(`[MEDIA] Downloaded mimetype=${media.mimetype} size=${media.data?.length ?? 0}`);
      return { data: media.data, mimetype: media.mimetype, filename: media.filename || null };
    } catch (err: any) {
      this.logger.error(`[MEDIA] Failed: ${err.message}`);
      return null;
    }
  }

  async markRead(userId: number, profileId: string, chatId: string) {
    const s = findSession(userId, profileId);
    if (!s) return;
    if (s.chatStore[chatId]) s.chatStore[chatId].unreadCount = 0;
    if (s.isConnected()) {
      try { const chat = await s.client!.getChatById(chatId); await chat.sendSeen(); } catch (_) {}
    }
    s.broadcast('chats', s.buildChatList());
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  async sendText(userId: number, profileId: string, to: string, message: string) {
    const s = this.requireConnected(userId, profileId);
    await s.client!.sendMessage(s.formatNumber(to), message);
    return { success: true };
  }

  async sendMedia(userId: number, profileId: string, to: string, filePath: string, type: string, caption?: string) {
    const s = this.requireConnected(userId, profileId);
    const { MessageMedia } = require('whatsapp-web.js');
    const media = MessageMedia.fromFilePath(filePath);
    const opts: any = {};
    if (caption) opts.caption = caption;
    if (type === 'document') opts.sendMediaAsDocument = true;
    if (type === 'sticker') opts.sendMediaAsSticker = true;
    await s.client!.sendMessage(s.formatNumber(to), media, opts);
    this.deleteTempFile(filePath);
    return { success: true };
  }

  async searchContacts(userId: number, profileId: string, q: string) {
    const s = this.requireConnected(userId, profileId);
    const contacts = await s.client!.getContacts();
    return contacts
      .filter((c: any) => c.name || c.pushname || c.number)
      .filter((c: any) => {
        if (!q) return true;
        const name = (c.name || c.pushname || '').toLowerCase();
        const num = (c.number || '').toLowerCase();
        return name.includes(q.toLowerCase()) || num.includes(q.toLowerCase());
      })
      .slice(0, 30)
      .map((c: any) => ({ name: c.name || c.pushname || c.number, number: c.number, id: c.id._serialized }));
  }

  getAvatarPath(userId: number, profileId: string, chatId: string): string | null {
    const s = findSession(userId, profileId);
    if (!s) return null;
    const fp = s.getAvatarFilePath(chatId);
    return fs.existsSync(fp) ? fp : null;
  }

  async fetchAndCacheAvatar(userId: number, profileId: string, chatId: string): Promise<string | null> {
    const s = findSession(userId, profileId);
    if (!s || !s.isConnected()) return null;
    return s.cacheAvatar(chatId);
  }

  autoStartSavedSessions(userIds: number[], profileIds: Record<number, string[]>) {
    for (const userId of userIds) {
      for (const profileId of profileIds[userId] || []) {
        const s = this.session(userId, profileId);
        if (s.hasSession()) { console.log(`[WA] Auto-starting ${userId}/${profileId}`); s.start(); }
      }
    }
  }

  private requireConnected(userId: number, profileId: string): WhatsAppSession {
    const s = findSession(userId, profileId);
    if (!s || !s.isConnected()) throw new Error('WhatsApp not connected');
    return s;
  }

  private deleteTempFile(filePath: string) {
    setTimeout(() => { try { fs.unlinkSync(filePath); } catch (_) {} }, 5000);
  }
}

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

  setIo(io: Namespace) {
    this.io = io;
  }
  autoStart(io: Namespace) {
    autoStartPersistedSessions(io as any);
  }
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
    return {
      status: s?.status || 'disconnected',
      connectedNumber: s?.connectedNumber || null,
      hasQR: !!s?.qrDataURL,
    };
  }

  getQR(userId: number, profileId: string): string | null {
    return findSession(userId, profileId)?.qrDataURL || null;
  }

  // ── Chats ───────────────────────────────────────────────────────────────────
  getChats(userId: number, profileId: string) {
    const s = findSession(userId, profileId);
    return s ? s.buildChatList() : [];
  }

  // ── Chats ───────────────────────────────────────────────────────────────────

  async getMessages(
    userId: number,
    profileId: string,
    chatId: string,
    limit = 50,
  ): Promise<any[]> {
    const s = findSession(userId, profileId);
    if (!s) return [];

    // ── Phase 1: return whatever is already in memory RIGHT NOW ──────────────
    // This is instant — no network, no waiting.
    const instant = await this.getBufferedMessages(s, chatId, limit);

    // ── Phase 2: kick off background history load, push via socket when done ─
    // Don't await this — it returns immediately and runs in background.
    if (s.isConnected()) {
      this.loadHistoryInBackground(s, chatId, limit).catch(() => {});
    }

    // Return instant snapshot to API caller right away
    if (instant.length > 0) {
      this.logger.log(`[MESSAGES] Instant return ${instant.length} buffered msgs, loading more in bg`);
      return instant;
    }

    // If nothing buffered at all, wait for background load with a short timeout
    this.logger.log(`[MESSAGES] No buffer, waiting up to 8s for history load...`);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(s.chatStore[chatId]?.messages || []);
      }, 8000);

      const check = setInterval(() => {
        const msgs = s.chatStore[chatId]?.messages || [];
        if (msgs.length > 0) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve(msgs);
        }
      }, 500);
    });
  }

// ── Read whatever WhatsApp Web already has buffered — ZERO network calls ──
  private async getBufferedMessages(s: any, chatId: string, limit: number): Promise<any[]> {
    try {
      const rawMsgs = await (s.client as any).pupPage.evaluate(
        (cid: string, lim: number) => {
          try {
            const S = (window as any).Store;
            const chat = S?.Chat?.get(cid);
            if (!chat) return [];

            const models = chat.msgs?.models || chat.msgs?._models || [];
            if (!models.length) return [];

            return models.slice(-lim).map((m: any) => {
              const isMe = !!m.id?.fromMe;
              const senderJid = isMe ? 'me'
                : (m.author?._serialized || m.id?.participant?._serialized || m.from?._serialized || '');
              let senderName = senderJid;
              if (!isMe && senderJid) {
                const contact = S.Contact?.get(senderJid);
                senderName = contact?.pushname || contact?.name || senderJid.replace(/@.+/, '');
              }
              return {
                id: m.id?._serialized || '',
                from: senderName,
                fromJid: senderJid,
                body: m.body || m.caption || '',
                type: m.type || 'chat',
                timestamp: m.t || 0,
                fromMe: isMe,
                ack: m.ack ?? 0,
                hasMedia: !!m.hasMedia,
                author: senderName,
                mimetype: m.mimetype || null,
              };
            });
          } catch (_) { return []; }
        },
        chatId,
        limit,
      );

      if (!rawMsgs?.length) return s.chatStore[chatId]?.messages || [];

      return this.formatRawMessages(rawMsgs);
    } catch (_) {
      return s.chatStore[chatId]?.messages || [];
    }
  }

// ── Background: actually load history from WA servers, then push via socket ─
  private async loadHistoryInBackground(s: any, chatId: string, limit: number): Promise<void> {
    this.logger.log(`[MESSAGES_BG] Starting background load for chatId=${chatId}`);
    try {
      const rawMsgs = await (s.client as any).pupPage.evaluate(
        async (cid: string, lim: number) => {
          try {
            const S = (window as any).Store;
            let chat = S?.Chat?.get(cid);
            if (!chat) {
              try { chat = await S?.Chat?.find?.(cid); } catch (_) {}
            }
            if (!chat) return null;

            // Now do the slow network load
            const loadEarlier = S?.LoadChatMessages?.loadEarlierMsgs
              || S?.ConversationMsgs?.loadEarlierMsgs;

            if (loadEarlier) {
              let attempts = 0;
              while ((chat.msgs?.models?.length || 0) < lim && attempts < 8) {
                let hasMore = false;
                try { hasMore = await loadEarlier(chat); } catch (_) { break; }
                if (!hasMore) break;
                // Small delay between loads
                await new Promise(r => setTimeout(r, 500));
                attempts++;
              }
            }

            const models = chat.msgs?.models || chat.msgs?._models || [];
            if (!models.length) return null;

            return models.slice(-lim).map((m: any) => {
              const isMe = !!m.id?.fromMe;
              const senderJid = isMe ? 'me'
                : (m.author?._serialized || m.id?.participant?._serialized || m.from?._serialized || '');
              let senderName = senderJid;
              if (!isMe && senderJid) {
                const contact = S.Contact?.get(senderJid);
                senderName = contact?.pushname || contact?.name || senderJid.replace(/@.+/, '');
              }
              return {
                id: m.id?._serialized || '',
                from: senderName,
                fromJid: senderJid,
                body: m.body || m.caption || '',
                type: m.type || 'chat',
                timestamp: m.t || 0,
                fromMe: isMe,
                ack: m.ack ?? 0,
                hasMedia: !!m.hasMedia,
                author: senderName,
                mimetype: m.mimetype || null,
              };
            });
          } catch (_) { return null; }
        },
        chatId,
        limit,
      );

      if (!rawMsgs?.length) {
        this.logger.warn(`[MESSAGES_BG] Background load returned nothing for chatId=${chatId}`);
        return;
      }

      const formatted = this.formatRawMessages(rawMsgs);
      this.logger.log(`[MESSAGES_BG] Background loaded ${formatted.length} msgs for chatId=${chatId}`);

      // Update cache
      this.updateChatStore(s, chatId, formatted);

      // Push to frontend via socket — frontend must listen for 'messages_loaded' event
      s.broadcast('messages_loaded', { chatId, messages: formatted });

    } catch (err: any) {
      this.logger.error(`[MESSAGES_BG] Failed for chatId=${chatId}: ${err.message}`);
    }
  }

  private formatRawMessages(rawMsgs: any[]): any[] {
    return rawMsgs.map((m: any) => ({
      id: m.id,
      from: m.from,
      fromJid: m.fromJid,
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
  }
  private updateChatStore(s: any, chatId: string, messages: any[]) {
    if (s.chatStore[chatId]) {
      s.chatStore[chatId].messages = messages;
      s.chatStore[chatId]._previewOnly = false;
    }
  }

  // ── Download media for a specific message on demand ─────────────────────────
  async getMessageMedia(
    userId: number,
    profileId: string,
    msgId: string,
  ): Promise<{ data: string; mimetype: string; filename: string | null } | null> {
    const s = findSession(userId, profileId);
    if (!s || !s.isConnected()) return null;

    try {
      this.logger.log(`[MEDIA] Downloading msgId=${msgId}`);

      // ── Strategy 1: Find message directly in the browser Store ──────────────
      // This avoids getChatById entirely and works regardless of message age
      const media = await (s.client as any).pupPage.evaluate(async (mid: string) => {
        try {
          // Search the global Msg store for this exact message ID
          const allMsgs = (window as any).Store?.Msg?.models || [];
          let msg = allMsgs.find((m: any) => m.id?._serialized === mid);

          if (!msg) {
            // Try looking in the chat's own msg collection
            const remote = mid.split('_')[1]; // extract chatId from msgId
            const chat = (window as any).Store?.Chat?.get(remote)
              || await (window as any).Store?.Chat?.find?.(remote);
            if (chat) {
              msg = chat.msgs?.models?.find((m: any) => m.id?._serialized === mid);
            }
          }

          if (!msg || !msg.hasMedia) return null;

          // Download using WhatsApp's internal download
          const mediaData = await (window as any).Store?.DownloadManager?.downloadAndMaybeDecrypt({
            directPath: msg.directPath,
            encFilehash: msg.encFilehash,
            filehash: msg.filehash,
            mediaKey: msg.mediaKey,
            mediaKeyTimestamp: msg.mediaKeyTimestamp,
            type: msg.type,
            signal: new AbortController().signal,
          }).catch(() => null);

          if (!mediaData) return null;

          // Convert blob/arraybuffer to base64
          const arr = new Uint8Array(mediaData);
          let binary = '';
          arr.forEach(b => (binary += String.fromCharCode(b)));
          return {
            data: btoa(binary),
            mimetype: msg.mimetype || 'application/octet-stream',
            filename: msg.filename || null,
          };
        } catch (_) {
          return null;
        }
      }, msgId);

      if (media) {
        this.logger.log(`[MEDIA] Strategy 1 (Store) downloaded mimetype=${media.mimetype}`);
        return media;
      }

      // ── Strategy 2: Fallback — use whatsapp-web.js Message object ────────────
      // Extract chatId: format is "false_<chatId>_<hash>" or "true_<chatId>_<hash>"
      const parts = msgId.split('_');
      const chatId = parts.length >= 2 ? parts[1] : null;
      if (!chatId) return null;

      // Fetch a larger window of messages (500) to maximise the chance of finding it
      const fetchLimit = 500;
      let msg: any = null;

      try {
        // Try getMessages first (avoids getChatById waitForChatLoading bug)
        const msgs = await (s.client as any).getMessages(chatId, { limit: fetchLimit });
        msg = msgs?.find((m: any) => m.id._serialized === msgId);
      } catch (_) {}

      if (!msg) {
        // Final fallback: getChatById + fetchMessages
        try {
          const waChat = await s.client!.getChatById(chatId);
          const msgs = await waChat.fetchMessages({ limit: fetchLimit });
          msg = msgs.find((m: any) => m.id._serialized === msgId);
        } catch (_) {}
      }

      if (!msg?.hasMedia) {
        this.logger.warn(`[MEDIA] Message not found or no media after all strategies: ${msgId}`);
        return null;
      }

      const downloaded = await msg.downloadMedia();
      if (!downloaded) return null;

      this.logger.log(`[MEDIA] Strategy 2 downloaded mimetype=${downloaded.mimetype} size=${downloaded.data?.length ?? 0}`);
      return {
        data: downloaded.data,
        mimetype: downloaded.mimetype,
        filename: downloaded.filename || null,
      };
    } catch (err: any) {
      this.logger.error(`[MEDIA] Failed: ${err.message}`);
      return null;
    }
  }

  async markRead(userId: number, profileId: string, chatId: string) {
    const s = findSession(userId, profileId);
    if (!s) return;

    // Update local unread count immediately
    if (s.chatStore[chatId]) s.chatStore[chatId].unreadCount = 0;

    if (s.isConnected()) {
      try {
        // Use pupPage directly — fastest, no getChatById/waitForChatLoading issue
        const result = await (s.client as any).pupPage.evaluate(
          async (cid: string) => {
            try {
              const chat =
                window.Store?.Chat?.get(cid) ||
                (await window.Store?.Chat?.find?.(cid));
              if (!chat) return false;
              await (window as any).Store?.SendSeen?.sendSeen(
                chat,
                chat.msgs?.last,
                false,
              );
              return true;
            } catch (_) {
              return false;
            }
          },
          chatId,
        );

        if (result) {
          this.logger.log(
            `[READ] ✅ sendSeen via Store for chatId=${chatId} userId=${userId}`,
          );
        } else {
          // Fallback to getChats()
          const allChats = await s.client!.getChats();
          const waChat = allChats.find((c: any) => c.id._serialized === chatId);
          if (waChat) {
            await waChat.sendSeen();
            this.logger.log(
              `[READ] ✅ sendSeen via getChats for chatId=${chatId}`,
            );
          }
        }
      } catch (err: any) {
        this.logger.error(`[READ] sendSeen failed: ${err.message}`);
      }
    }

    s.broadcast('chats', s.buildChatList());
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  async sendText(
    userId: number,
    profileId: string,
    to: string,
    message: string,
  ) {
    const s = this.requireConnected(userId, profileId);
    await s.client!.sendMessage(s.formatNumber(to), message);
    return { success: true };
  }

  async sendMedia(
    userId: number,
    profileId: string,
    to: string,
    filePath: string,
    type: string,
    caption?: string,
  ) {
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
      .map((c: any) => ({
        name: c.name || c.pushname || c.number,
        number: c.number,
        id: c.id._serialized,
      }));
  }

  getAvatarPath(
    userId: number,
    profileId: string,
    chatId: string,
  ): string | null {
    const s = findSession(userId, profileId);
    if (!s) return null;
    const fp = s.getAvatarFilePath(chatId);
    return fs.existsSync(fp) ? fp : null;
  }

  async fetchAndCacheAvatar(
    userId: number,
    profileId: string,
    chatId: string,
  ): Promise<string | null> {
    const s = findSession(userId, profileId);
    if (!s || !s.isConnected()) return null;
    return s.cacheAvatar(chatId);
  }

  autoStartSavedSessions(
    userIds: number[],
    profileIds: Record<number, string[]>,
  ) {
    for (const userId of userIds) {
      for (const profileId of profileIds[userId] || []) {
        const s = this.session(userId, profileId);
        if (s.hasSession()) {
          console.log(`[WA] Auto-starting ${userId}/${profileId}`);
          s.start();
        }
      }
    }
  }

  private requireConnected(userId: number, profileId: string): WhatsAppSession {
    const s = findSession(userId, profileId);
    if (!s || !s.isConnected()) throw new Error('WhatsApp not connected');
    return s;
  }

  private deleteTempFile(filePath: string) {
    setTimeout(() => {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }, 5000);
  }
}

import { Injectable, Logger, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { Namespace } from 'socket.io';
import {
  getSession,
  findSession,
  WhatsAppSession,
  autoStartPersistedSessions,
} from './whatsapp.session';
import { ContactsService } from '../contacts/contacts.service';
import { FlowExecutorService, FlowSendFn } from '../flow-builder/flow-executor.service';
import { FlowStatus } from '../flow-builder/entities/flow.entity';
import { AiChatbotService } from '../ai-chatbot/ai-chatbot.service';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private io: Namespace;

  constructor(
    private readonly contactsService: ContactsService,
    private readonly flowExecutor: FlowExecutorService,
    private readonly aiChatbot: AiChatbotService,
  ) {}

  setIo(io: Namespace) {
    this.io = io;
  }

  autoStart(io: Namespace) {
    // Re-implemented here instead of calling autoStartPersistedSessions
    // so we can attach the flow callback to every auto-started session
    const waDir = require('path').join(process.cwd(), 'data', 'wa');
    const fs = require('fs');
    if (!fs.existsSync(waDir)) return;

    const userDirs: string[] = fs.readdirSync(waDir);
    for (const userIdStr of userDirs) {
      const userId = parseInt(userIdStr);
      if (isNaN(userId)) continue;
      const userPath = require('path').join(waDir, userIdStr);
      const profileDirs: string[] = fs.readdirSync(userPath);
      for (const profileId of profileDirs) {
        const sessionPath = require('path').join(userPath, profileId, 'session');
        if (fs.existsSync(sessionPath)) {
          this.logger.log(`[AUTO-START] Restoring session userId=${userId} profileId=${profileId}`);
          const s = getSession(userId, profileId, io as any);
          // ✅ Attach flow callback BEFORE starting
          s.onIncomingMessage = async (chatId, body, contactName, contactPhone) => {
            await this.triggerFlowForMessage(userId, profileId, chatId, body, contactName, contactPhone);
          };
          s.start();
        }
      }
    }
  }

  onModuleInit() {}

  private session(userId: number, profileId: string): WhatsAppSession {
    return getSession(userId, profileId, this.io);
  }

  // ── Session control ─────────────────────────────────────────────────────────
  start(userId: number, profileId: string) {
    const s = this.session(userId, profileId);
    if (s.client) return { success: false, message: 'Already running' };

    // Attach flow trigger callback before starting
    s.onIncomingMessage = async (chatId, body, contactName, contactPhone) => {
      await this.triggerFlowForMessage(userId, profileId, chatId, body, contactName, contactPhone);
    };

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

  // ── Flow Builder integration ─────────────────────────────────────────────
  /**
   * Called by WhatsAppSession on every incoming message.
   * Tries to match and execute an active flow for this user.
   * Returns true if a flow handled the message (so session can skip normal processing if needed).
   */
  async triggerFlowForMessage(
    userId: number,
    profileId: string,
    chatId: string,
    body: string,
    contactName?: string,
    contactPhone?: string,
  ): Promise<boolean> {
    try {
      // Ignore WhatsApp internal system messages
      if (
        !body ||
        body.trim() === '' ||
        body.endsWith('@lid') ||
        body.endsWith('@c.us') ||
        body.endsWith('@g.us') ||
        body.endsWith('@s.whatsapp.net') ||
        body.startsWith('e2e_notification') ||
        body.startsWith('ciphertext')
      ) {
        this.logger.log(`[FlowTrigger] Skipping system message: "${body}"`);
        return false;
      }
      const s = findSession(userId, profileId);
      if (!s) {
        this.logger.warn(`[FlowTrigger] No session found for userId=${userId}`);
        return false;
      }
      if (!s.isConnected()) {
        this.logger.warn(`[FlowTrigger] Session not connected for userId=${userId}`);
        return false;
      }

      this.logger.log(`[FlowTrigger] Processing message userId=${userId} chatId=${chatId} body="${body}"`);

      const sender: FlowSendFn = {
        sendText: async (to: string, message: string) => {
          await s.client!.sendMessage(to, message);
        },
        sendButtons: async (to: string, message: string, buttons: any[]) => {
          // whatsapp-web.js buttons message
          try {
            const { Buttons } = require('whatsapp-web.js');
            const btns = buttons.map((b: any) => ({ body: b.text ?? b.id }));
            const btnMsg = new Buttons(message, btns);
            await s.client!.sendMessage(to, btnMsg);
          } catch {
            // Fallback: send as plain text with numbered options
            const text = `${message}\n\n${buttons.map((b: any, i: number) => `${i + 1}. ${b.text ?? b.id}`).join('\n')}`;
            await s.client!.sendMessage(to, text);
          }
        },
        sendList: async (to: string, message: string, sections: any[], buttonText?: string) => {
          try {
            const { List } = require('whatsapp-web.js');
            const listMsg = new List(message, buttonText ?? 'Select', sections);
            await s.client!.sendMessage(to, listMsg);
          } catch {
            // Fallback: send as plain text
            let text = `${message}\n`;
            for (const section of sections) {
              text += `\n*${section.title}*\n`;
              for (const row of section.rows ?? []) {
                text += `• ${row.title}${row.description ? ` — ${row.description}` : ''}\n`;
              }
            }
            await s.client!.sendMessage(to, text);
          }
        },
      };

      const flowHandled = await this.flowExecutor.handleIncomingMessage(
        { chatId, body, contactName, contactPhone, userId },
        sender,
      );

      // Run AI reply if:
      // 1. No flow handled the message at all, OR
      // 2. The matched flow was an any_message flow (just a pass-through for AI)
      const shouldAiReply = !flowHandled || await this.isAnyMessageFlow(userId);

      if (shouldAiReply) {
        try {
          const settings = await this.aiChatbot['getRawSettings'](userId);
          if (settings.autoReplyEnabled && settings.apiKey) {
            const { reply } = await this.aiChatbot.autoReply(userId, {
              message: body,
              contactId: chatId,
            });
            const s2 = findSession(userId, profileId);
            if (s2?.isConnected()) {
              await s2.client!.sendMessage(chatId, reply);
              this.logger.log(`[AI-REPLY] Sent AI reply to chatId=${chatId}`);
            }
          }
        } catch (aiErr: any) {
          this.logger.warn(`[AI-REPLY] Failed: ${aiErr.message}`);
        }
      }

      return flowHandled;
    } catch (err: any) {
      this.logger.error(`[FlowTrigger] Error: ${err.message}`);
      return false;
    }
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

  /** Get full contact info for a specific phone number or WA id */
  async getContactInfo(userId: number, profileId: string, phoneOrId: string): Promise<any> {
    const s = this.requireConnected(userId, profileId);

    // Normalise to WA id format
    const waId = phoneOrId.includes('@')
      ? phoneOrId
      : `${phoneOrId.replace(/[^0-9]/g, '')}@c.us`;

    try {
      const contact = await s.client!.getContactById(waId);
      const profilePicUrl = await contact.getProfilePicUrl().catch(() => null);

      return {
        id: contact.id._serialized,
        number: contact.number,
        name: contact.name || null,
        pushname: contact.pushname || null,
        displayName: contact.name || contact.pushname || contact.number,
        isMyContact: contact.isMyContact,
        isWAContact: contact.isWAContact,
        isGroup: contact.isGroup,
        isBlocked: contact.isBlocked,
        isBusiness: (contact as any).isBusiness ?? false,
        profilePicUrl: profilePicUrl || null,
      };
    } catch (err: any) {
      this.logger.warn(`[CONTACT] getContactById failed for ${waId}: ${err.message}`);
      return null;
    }
  }

  /** Check if a phone number is registered on WhatsApp */
  async lookupNumber(userId: number, profileId: string, phone: string): Promise<any> {
    const s = this.requireConnected(userId, profileId);
    const digits = phone.replace(/[^0-9]/g, '');

    try {
      const numberId = await s.client!.getNumberId(digits);
      if (!numberId) return { phone: digits, isOnWhatsApp: false };

      // If registered, also fetch contact details
      const info = await this.getContactInfo(userId, profileId, numberId._serialized);
      return { phone: digits, isOnWhatsApp: true, contact: info };
    } catch (err: any) {
      this.logger.warn(`[CONTACT] lookupNumber failed for ${digits}: ${err.message}`);
      return { phone: digits, isOnWhatsApp: false, error: err.message };
    }
  }

  // ── Send to contact from contacts table ────────────────────────────────────

  async sendToContact(
    userId: number,
    profileId: string,
    contactId: number,
    message: string,
  ): Promise<{ success: boolean; to: string; contactName: string }> {
    const contact = await this.contactsService.findOne(userId, contactId);

    if (!contact.phoneNumber) {
      throw new BadRequestException(`Contact "${contact.name}" has no phone number saved`);
    }

    const digits = contact.phoneNumber.replace(/[^0-9]/g, '');
    if (!digits) {
      throw new BadRequestException(`Contact "${contact.name}" has an invalid phone number`);
    }

    // Verify the number is on WhatsApp before sending
    const s = this.requireConnected(userId, profileId);
    const numberId = await s.client!.getNumberId(digits);
    if (!numberId) {
      throw new BadRequestException(
        `${contact.name}'s number (${contact.phoneNumber}) is not registered on WhatsApp`,
      );
    }

    await s.client!.sendMessage(numberId._serialized, message);
    this.logger.log(`[CONTACT-SEND] Sent text to contactId=${contactId} (${digits})`);

    return { success: true, to: digits, contactName: contact.name };
  }

  async sendTemplateToContact(
    userId: number,
    profileId: string,
    contactId: number,
    templateId: number,
    params: Record<string, string> = {},
  ): Promise<{ success: boolean; to: string; contactName: string; messageIds: string[] }> {
    const contact = await this.contactsService.findOne(userId, contactId);

    if (!contact.phoneNumber) {
      throw new BadRequestException(`Contact "${contact.name}" has no phone number saved`);
    }

    const digits = contact.phoneNumber.replace(/[^0-9]/g, '');
    if (!digits) {
      throw new BadRequestException(`Contact "${contact.name}" has an invalid phone number`);
    }

    // Verify on WhatsApp
    const s = this.requireConnected(userId, profileId);
    const isRegistered = await s.client!.isRegisteredUser(`${digits}@c.us`);
    if (!isRegistered) {
      throw new BadRequestException(
        `${contact.name}'s number (${contact.phoneNumber}) is not registered on WhatsApp`,
      );
    }

    this.logger.log(`[CONTACT-SEND] Sending template #${templateId} to contactId=${contactId} (${digits})`);

    // Delegate to WaQrTemplateService via the session
    // We return the phone so the caller can invoke template send
    return { success: true, to: `${digits}@c.us`, contactName: contact.name, messageIds: [] };
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
          s.onIncomingMessage = async (chatId, body, contactName, contactPhone) => {
            await this.triggerFlowForMessage(userId, profileId, chatId, body, contactName, contactPhone);
          };
          console.log(`[WA] Auto-starting ${userId}/${profileId}`);
          s.start();
        }
      }
    }
  }

  // Returns true if any active any_message flow exists for this user
  private async isAnyMessageFlow(userId: number): Promise<boolean> {
    try {
      const flowService = (this.flowExecutor as any).flowService;
      if (!flowService?.flowRepo) return false;
      const count = await flowService.flowRepo.count({
        where: { userId, status: FlowStatus.ACTIVE, triggerType: 'any_message' },
      });
      return count > 0;
    } catch {
      return false;
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

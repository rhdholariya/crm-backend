import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { findSession, getAllSessions } from './whatsapp.session';
import { WhatsAppService } from './whatsapp.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: 'whatsapp' })
export class WhatsAppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WhatsAppGateway.name);

  constructor(private readonly waService: WhatsAppService) {}

  handleConnection(socket: Socket) {
    this.logger.log(`[SOCKET] Connected → socketId=${socket.id}`);
  }

  afterInit(server: Server) {
    this.logger.log('[SOCKET] Gateway initialized');
    this.waService.setIo(server as any);
    // Auto-start persisted sessions after gateway is ready
    this.waService.autoStart(server as any);
  }

  handleDisconnect(socket: Socket) {
    const { userId, profileId } = socket.data || {};
    this.logger.log(`[SOCKET] Disconnected → socketId=${socket.id} userId=${userId}`);
    if (userId && profileId) {
      const session = findSession(userId, profileId);
      if (session) delete session.activeViewers[socket.id];
    }
  }

  // ── User joins their own session room ───────────────────────────────────────
  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { userId: number },
  ) {
    const userId = Number(data?.userId);
    const profileId = 'default';

    if (!userId || isNaN(userId)) {
      this.logger.warn(`[SOCKET] join rejected — invalid userId: ${data?.userId}`);
      socket.emit('error', { message: 'Invalid userId' });
      return;
    }

    // Leave any previous room first (handles reconnect)
    const prev = socket.data;
    if (prev?.userId && prev?.profileId) {
      socket.leave(`wa:${prev.userId}:${prev.profileId}`);
    }

    socket.data = { userId, profileId };
    const room = `wa:${userId}:${profileId}`;
    socket.join(room);
    this.logger.log(`[SOCKET] join → socketId=${socket.id} userId=${userId} room=${room}`);

    // Send current state immediately
    const session = findSession(userId, profileId);
    if (session) {
      this.logger.log(`[SOCKET] Sending state → status=${session.status} hasQR=${!!session.qrDataURL}`);
      socket.emit('status', { status: session.status, connectedNumber: session.connectedNumber });
      if (session.qrDataURL) {
        this.logger.log(`[SOCKET] Delivering stored QR to socket=${socket.id}`);
        socket.emit('qr', { qr: session.qrDataURL, expiresIn: 20 });
      }
      socket.emit('chats', session.buildChatList());
    } else {
      this.logger.warn(`[SOCKET] No session for userId=${userId} — call POST /api/whatsapp/start`);
      socket.emit('status', { status: 'disconnected' });
    }
  }

  // ── User is viewing a specific chat (clears unread) ─────────────────────────
  @SubscribeMessage('viewing_chat')
  handleViewingChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: string | { chatId: string } | any,
  ) {
    const { userId, profileId } = socket.data || {};
    if (!userId || !profileId) return;

    // Handle both string and object payloads from frontend
    const chatId = typeof data === 'string' ? data : (data?.chatId || data?.id || null);
    this.logger.log(`[SOCKET] viewing_chat → userId=${userId} chatId=${chatId}`);

    const session = findSession(userId, profileId);
    if (session) {
      session.activeViewers[socket.id] = chatId || null;
      if (chatId && session.chatStore[chatId]) {
        session.chatStore[chatId].unreadCount = 0;
        session.broadcast('chats', session.buildChatList());
        // Send blue tick to sender
        this.waService.markRead(userId, profileId, chatId).catch(() => {});
      }
    }
  }

  // ── Subscribe to status@broadcast updates ───────────────────────────────────
  @SubscribeMessage('subscribe_status')
  async handleSubscribeStatus(@ConnectedSocket() socket: Socket) {
    const { userId, profileId } = socket.data || {};
    if (!userId || !profileId) return;
    this.logger.log(`[SOCKET] subscribe_status → userId=${userId}`);

    const session = findSession(userId, profileId);
    if (!session?.isConnected()) {
      socket.emit('status_subscribe_result', { success: false, message: 'Not connected' });
      return;
    }

    try {
      // Subscribe to WhatsApp status updates
      await (session.client as any).pupPage.evaluate(async () => {
        try {
          const statusChat = window.Store?.Chat?.get('status@broadcast');
          if (statusChat) {
            await (window.Store as any)?.StatusUtils?.subscribeToStatuses?.();
          }
        } catch (_) {}
      });

      // Mark status chat as active viewer
      session.activeViewers[socket.id] = 'status@broadcast';
      socket.emit('status_subscribe_result', { success: true });
      this.logger.log(`[SOCKET] Subscribed to status@broadcast for userId=${userId}`);

      // Send current status messages if any
      const statusChat = session.chatStore['status@broadcast'];
      if (statusChat) {
        socket.emit('status_messages', statusChat.messages);
      }
    } catch (err: any) {
      this.logger.error(`[SOCKET] subscribe_status failed: ${err.message}`);
      socket.emit('status_subscribe_result', { success: false, message: err.message });
    }
  }

  // ── Unsubscribe from status@broadcast ───────────────────────────────────────
  @SubscribeMessage('unsubscribe_status')
  handleUnsubscribeStatus(@ConnectedSocket() socket: Socket) {
    const { userId, profileId } = socket.data || {};
    if (!userId || !profileId) return;
    this.logger.log(`[SOCKET] unsubscribe_status → userId=${userId}`);

    const session = findSession(userId, profileId);
    if (session && session.activeViewers[socket.id] === 'status@broadcast') {
      session.activeViewers[socket.id] = null;
    }
    socket.emit('status_unsubscribe_result', { success: true });
  }

  // ── Subscribe to presence for a specific contact ────────────────────────────
  @SubscribeMessage('subscribe_presence')
  async handleSubscribePresence(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: string | { chatId: string },
  ) {
    const { userId, profileId } = socket.data || {};
    if (!userId || !profileId) {
      this.logger.warn(`[SOCKET] subscribe_presence — no userId/profileId in socket.data, did you emit 'join' first?`);
      socket.emit('presence', { error: 'Not joined — emit join first' });
      return;
    }
    const chatId = typeof data === 'string' ? data : data?.chatId;
    if (!chatId) return;

    this.logger.log(`[SOCKET] subscribe_presence → userId=${userId} profileId=${profileId} chatId=${chatId}`);
    const session = findSession(Number(userId), String(profileId));
    this.logger.log(`[SOCKET] session found=${!!session} connected=${session?.isConnected()}`);

    if (!session?.isConnected()) {
      socket.emit('presence', { chatId, isOnline: false, isTyping: false, lastSeen: null, error: 'Not connected' });
      return;
    }

    // Get initial presence immediately
    const presence = await session.getPresence(chatId);
    this.logger.log(`[SOCKET] initial presence result=${JSON.stringify(presence)}`);
    if (presence) {
      socket.emit('presence', presence);
    }

    // Start real-time watch — sends updates whenever state changes
    const stopWatch = await session.watchPresence(chatId, (update) => {
      if (socket.connected) {
        this.logger.log(`[SOCKET] Emitting presence update to socket=${socket.id}: ${JSON.stringify(update)}`);
        socket.emit('presence', update);
      }
    });

    // Stop watching when socket disconnects or unsubscribes
    socket.once('disconnect', stopWatch);
    socket.once('unsubscribe_presence', stopWatch);
  }
  @SubscribeMessage('admin:sessions')
  handleAdminSessions(@ConnectedSocket() socket: Socket) {
    const all = getAllSessions().map((s) => s.getSummary());
    this.logger.log(`[ADMIN] admin:sessions requested — ${all.length} sessions`);
    socket.emit('admin:sessions', all);
  }
}

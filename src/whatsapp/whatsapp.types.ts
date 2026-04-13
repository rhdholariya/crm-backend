export interface ChatContact {
  name: string;
  number: string;
  avatar: string | null;
}

export interface StoredMessage {
  id: string;
  from: string;
  body: string;
  type: string;
  timestamp: number;
  fromMe: boolean;
  ack: number;
  hasMedia: boolean;
  media: { mimetype: string; filename: string | null } | null;
  author: string | null;
}

export interface ChatEntry {
  chatId: string;
  contact: ChatContact;
  messages: StoredMessage[];
  unreadCount: number;
  isGroup: boolean;
  isChannel: boolean;
  lastMessageTimestamp?: number;
  _previewOnly?: boolean;
}

export interface ChatListItem {
  chatId: string;
  name: string;
  number: string;
  avatar: string | null;
  lastMessage: StoredMessage | null;
  unreadCount: number;
  isGroup: boolean;
}

// WhatsApp Web internal store (used for page evaluation)
declare global {
  interface Window {
    Store?: {
      Chat?: { get: (id: string) => any; find?: (id: string) => Promise<any> };
      ConversationMsgs?: { loadEarlierMsgs: (chat: any, msgs?: any) => Promise<any> };
      Msg?: { get: (id: string) => any; getMessagesById: (ids: string[]) => Promise<{ messages: any[] }> };
      WidFactory?: { createWid: (id: string) => any };
      HistorySync?: { sendPeerDataOperationRequest: (type: number, data: any) => Promise<any> };
      ProfilePic?: { profilePicFind: (wid: any) => Promise<{ eurl?: string; url?: string } | null> };
    };
    WWebJS?: {
      downloadMedia: (msg: any) => Promise<{ data: string; mimetype: string; filename: string | null } | null>;
      getChat: (id: string, opts?: any) => Promise<any>;
      getMessageModel: (msg: any) => any;
    };
  }
}

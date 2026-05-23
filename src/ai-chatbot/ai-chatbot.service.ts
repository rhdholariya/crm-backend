import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiSettings, AiProvider } from './entities/ai-settings.entity';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage, MessageRole } from './entities/ai-message.entity';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { ChatRequestDto, SuggestReplyDto } from './dto/chat-request.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { AiProviderService, ChatMessage } from './ai-provider.service';

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful customer support assistant. Be concise, friendly, and professional. ' +
  'Answer customer questions accurately. If you are unsure, say so politely.';

@Injectable()
export class AiChatbotService {
  constructor(
    @InjectRepository(AiSettings)
    private readonly settingsRepo: Repository<AiSettings>,

    @InjectRepository(AiConversation)
    private readonly convRepo: Repository<AiConversation>,

    @InjectRepository(AiMessage)
    private readonly msgRepo: Repository<AiMessage>,

    private readonly aiProvider: AiProviderService,
  ) {}

  // ── Settings ──────────────────────────────────────────────────────────────

  async getSettings(userId: number): Promise<AiSettings> {
    // Get active chatbot
    let settings = await this.settingsRepo.findOne({
      where: { userId, isActive: true },
    });
    
    // If no active chatbot, get the first one or create default
    if (!settings) {
      settings = await this.settingsRepo.findOne({
        where: { userId },
        order: { createdAt: 'ASC' },
      });
    }
    
    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ userId, isActive: true }),
      );
    }
    return settings;
  }

  async getAllChatbots(userId: number): Promise<AiSettings[]> {
    const chatbots = await this.settingsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    // Sort with active first
    return chatbots.sort((a, b) => {
      if (a.isActive === b.isActive) return 0;
      return a.isActive ? -1 : 1;
    });
  }

  async getChatbot(userId: number, chatbotId: number): Promise<AiSettings> {
    const chatbot = await this.settingsRepo.findOne({
      where: { id: chatbotId, userId },
    });
    if (!chatbot) {
      throw new NotFoundException(`Chatbot #${chatbotId} not found`);
    }
    return chatbot;
  }

  async createChatbot(
    userId: number,
    dto: UpdateAiSettingsDto,
  ): Promise<AiSettings> {
    // If this is the first chatbot, make it active
    const existingCount = await this.settingsRepo.count({ where: { userId } });
    const isActive = existingCount === 0;

    const chatbot = await this.settingsRepo.save(
      this.settingsRepo.create({ userId, ...dto, isActive }),
    );
    return chatbot;
  }

  async updateSettings(
    userId: number,
    chatbotId: number,
    dto: UpdateAiSettingsDto,
  ): Promise<AiSettings> {
    const settings = await this.settingsRepo.findOne({
      where: { id: chatbotId, userId },
    });
    if (!settings) {
      throw new NotFoundException(`Chatbot #${chatbotId} not found`);
    }

    await this.settingsRepo.update(chatbotId, dto);
    return (await this.settingsRepo.findOne({
      where: { id: chatbotId },
    })) as AiSettings;
  }

  async setActiveChatbot(
    userId: number,
    chatbotId: number,
  ): Promise<AiSettings> {
    // Verify chatbot exists and belongs to user
    const chatbot = await this.settingsRepo.findOne({
      where: { id: chatbotId, userId },
    });
    if (!chatbot) {
      throw new NotFoundException(`Chatbot #${chatbotId} not found`);
    }

    // Deactivate all other chatbots
    await this.settingsRepo.update(
      { userId, isActive: true },
      { isActive: false },
    );

    // Activate this one
    await this.settingsRepo.update(chatbotId, { isActive: true });

    return (await this.settingsRepo.findOne({
      where: { id: chatbotId },
    })) as AiSettings;
  }

  async deleteChatbot(userId: number, chatbotId: number): Promise<void> {
    const chatbot = await this.settingsRepo.findOne({
      where: { id: chatbotId, userId },
    });
    if (!chatbot) {
      throw new NotFoundException(`Chatbot #${chatbotId} not found`);
    }

    await this.settingsRepo.remove(chatbot);

    // If this was the active one, activate another
    if (chatbot.isActive) {
      const nextChatbot = await this.settingsRepo.findOne({
        where: { userId },
        order: { createdAt: 'ASC' },
      });
      if (nextChatbot) {
        await this.settingsRepo.update(nextChatbot.id, { isActive: true });
      }
    }
  }

  async testConnection(
    userId: number,
    dto: TestConnectionDto,
  ): Promise<{ connected: boolean; model: string }> {
    const settings = await this.getSettings(userId);

    // Override saved settings with DTO values
    settings.apiKey = dto.apiKey;
    settings.model = dto.model;
    if (dto.name) settings.name = dto.name;
    if (dto.provider) settings.provider = dto.provider;
    if (dto.systemPrompt !== undefined) settings.systemPrompt = dto.systemPrompt;

    // Sync provider from model if provider not explicitly provided
    this.syncProviderFromModel(settings);

    await this.aiProvider.chat(settings, [
      { role: 'user', content: 'Say "connected" in one word.' },
    ]);
    return { connected: true, model: settings.model };
  }

  // ── Auto Reply ────────────────────────────────────────────────────────────

  async autoReply(
    userId: number,
    dto: ChatRequestDto,
  ): Promise<{ reply: string; conversationId: number }> {
    // Use specific chatbot if chatbotId provided, otherwise use active chatbot
    let settings: AiSettings;
    if (dto.chatbotId) {
      const found = await this.settingsRepo.findOne({
        where: { id: dto.chatbotId, userId },
      });
      if (!found) throw new NotFoundException(`Chatbot #${dto.chatbotId} not found`);
      settings = found;
    } else {
      settings = await this.getSettings(userId);
    }

    await this.syncProviderFromModel(settings);

    // Get or create conversation — keyed by chatbotId so each chatbot has its own history
    const contactId = dto.contactId ?? 'default';
    const convKey = dto.chatbotId ? `${contactId}:bot${dto.chatbotId}` : contactId;

    let conv = await this.convRepo.findOne({
      where: { userId, contactId: convKey, isActive: true },
    });
    if (!conv) {
      conv = await this.convRepo.save(
        this.convRepo.create({ userId, contactId: convKey }),
      );
    }

    // Load last 10 messages for context
    const history = await this.msgRepo.find({
      where: { conversationId: conv.id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      },
      ...history.reverse().map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      { role: 'user', content: dto.message },
    ];

    const aiRes = await this.aiProvider.chat(settings, messages);

    // Persist both messages
    await this.msgRepo.save([
      this.msgRepo.create({
        conversationId: conv.id,
        role: MessageRole.USER,
        content: dto.message,
      }),
      this.msgRepo.create({
        conversationId: conv.id,
        role: MessageRole.ASSISTANT,
        content: aiRes.content,
        tokensUsed: aiRes.tokensUsed,
      }),
    ]);

    return { reply: aiRes.content, conversationId: conv.id };
  }

  // ── Understand Message ────────────────────────────────────────────────────

  async understandMessage(
    userId: number,
    message: string,
  ): Promise<{
    intent: string;
    sentiment: string;
    summary: string;
    keywords: string[];
  }> {
    const settings = await this.getRawSettings(userId);
    this.syncProviderFromModel(settings);

    const prompt = `Analyze this customer message and respond ONLY with valid JSON (no markdown):
{
  "intent": "<main intent>",
  "sentiment": "positive | neutral | negative",
  "summary": "<one sentence summary>",
  "keywords": ["keyword1", "keyword2"]
}

Customer message: "${message}"`;

    const aiRes = await this.aiProvider.chat(settings, [
      { role: 'user', content: prompt },
    ]);

    try {
      return JSON.parse(aiRes.content);
    } catch {
      return {
        intent: 'unknown',
        sentiment: 'neutral',
        summary: aiRes.content,
        keywords: [],
      };
    }
  }

  // ── Suggest Replies ───────────────────────────────────────────────────────

  async suggestReplies(
    userId: number,
    dto: SuggestReplyDto,
  ): Promise<{ suggestions: string[] }> {
    const settings = await this.getRawSettings(userId);
    this.syncProviderFromModel(settings);

    const context = dto.conversationContext
      ? `\nConversation context: ${dto.conversationContext}`
      : '';

    const prompt = `You are a customer support assistant. Suggest 3 short, professional reply options for the agent to send to the customer. Respond ONLY with valid JSON (no markdown):
{"suggestions": ["reply1", "reply2", "reply3"]}
${context}
Customer message: "${dto.customerMessage}"`;

    const aiRes = await this.aiProvider.chat(settings, [
      { role: 'user', content: prompt },
    ]);

    try {
      return JSON.parse(aiRes.content);
    } catch {
      return { suggestions: [aiRes.content] };
    }
  }

  // ── Conversation History ──────────────────────────────────────────────────

  async getConversations(userId: number, page = 1, limit = 10) {
    const [data, total] = await this.convRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getConversationMessages(userId: number, conversationId: number) {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conv)
      throw new NotFoundException(`Conversation #${conversationId} not found`);

    const messages = await this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return { conversation: conv, messages };
  }

  async clearConversation(
    userId: number,
    conversationId: number,
  ): Promise<{ message: string }> {
    const conv = await this.convRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conv)
      throw new NotFoundException(`Conversation #${conversationId} not found`);
    await this.msgRepo.delete({ conversationId });
    return { message: 'Conversation cleared successfully' };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  async getRawSettings(userId: number): Promise<AiSettings> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ userId }),
      );
    }
    return settings;
  }

  // ── AI Session Management ─────────────────────────────────────────────────

  /**
   * Activate AI chatbot for a specific contact.
   * After this, any message from this contact will be handled by the AI chatbot.
   * @param chatbotId - which chatbot to use (null = active chatbot)
   * @param ttlMinutes - how long to keep AI active (0 = forever until reset)
   */
  async activateAiForContact(
    userId: number,
    contactId: string,
    chatbotId?: number,
    ttlMinutes = 0,
  ): Promise<void> {
    const existing = await this.convRepo.findOne({
      where: { userId, contactId, isActive: true },
    });

    const aiActiveUntil: Date | null = ttlMinutes > 0
      ? new Date(Date.now() + ttlMinutes * 60 * 1000)
      : null;

    const chatbotIdValue: number | null = chatbotId ?? null;

    if (!existing) {
      const newConv = this.convRepo.create({ userId, contactId, isActive: true });
      newConv.chatbotId = chatbotIdValue;
      newConv.aiActiveUntil = aiActiveUntil;
      await this.convRepo.save(newConv);
    } else {
      existing.chatbotId = chatbotIdValue;
      existing.aiActiveUntil = aiActiveUntil;
      existing.isActive = true;
      await this.convRepo.save(existing);
    }
  }

  /**
   * Check if AI chatbot is active for a contact.
   * Returns the chatbotId to use, or null if AI is not active.
   */
  async getActiveAiSession(
    userId: number,
    contactId: string,
  ): Promise<{ active: boolean; chatbotId?: number } | null> {
    const conv = await this.convRepo.findOne({
      where: { userId, contactId, isActive: true },
    });

    if (!conv) return null;

    // Check if session has expired
    if (conv.aiActiveUntil && new Date() > conv.aiActiveUntil) {
      // Session expired — deactivate
      await this.convRepo.update(conv.id, { isActive: false });
      return null;
    }

    return { active: true, chatbotId: conv.chatbotId ?? undefined };
  }

  /**
   * Deactivate AI chatbot for a contact (reset conversation).
   */
  async deactivateAiForContact(userId: number, contactId: string): Promise<void> {
    await this.convRepo.update(
      { userId, contactId, isActive: true },
      { isActive: false },
    );
  }

  // Auto-correct provider based on model name so mismatched DB rows still work
  private async syncProviderFromModel(settings: AiSettings): Promise<void> {
    const m = settings.model;
    let provider = settings.provider;

    if (m.startsWith('gemini')) provider = AiProvider.GOOGLE;
    else if (m.startsWith('gpt')) provider = AiProvider.OPENAI;
    else if (m.startsWith('grok')) provider = AiProvider.XAI;
    else if (m.startsWith('deepseek')) provider = AiProvider.DEEPSEEK;

    if (provider !== settings.provider) {
      settings.provider = provider;
      await this.settingsRepo.update(settings.id, { provider });
    }
  }
}

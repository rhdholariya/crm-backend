import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiSettings, AiProvider } from './entities/ai-settings.entity';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage, MessageRole } from './entities/ai-message.entity';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { ChatRequestDto, SuggestReplyDto } from './dto/chat-request.dto';
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
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ userId }),
      );
    }
    return settings;
  }

  async updateSettings(
    userId: number,
    dto: UpdateAiSettingsDto,
  ): Promise<AiSettings> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ userId, ...dto }),
      );
    } else {
      await this.settingsRepo.update(settings.id, dto);
      settings = (await this.settingsRepo.findOne({
        where: { userId },
      })) as AiSettings;
    }
    return settings;
  }

  async testConnection(
    userId: number,
  ): Promise<{ connected: boolean; model: string }> {
    const settings = await this.getRawSettings(userId);
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
    const settings = await this.getRawSettings(userId);
    this.syncProviderFromModel(settings);

    // Get or create conversation
    const contactId = dto.contactId ?? 'default';
    let conv = await this.convRepo.findOne({
      where: { userId, contactId, isActive: true },
    });
    if (!conv) {
      conv = await this.convRepo.save(
        this.convRepo.create({ userId, contactId }),
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

  private async getRawSettings(userId: number): Promise<AiSettings> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ userId }),
      );
    }
    return settings;
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

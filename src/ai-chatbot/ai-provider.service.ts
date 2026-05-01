import { Injectable, BadRequestException } from '@nestjs/common';
import { AiProvider, AiSettings } from './entities/ai-settings.entity';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiResponse {
  content: string;
  tokensUsed?: number;
  model: string;
}

@Injectable()
export class AiProviderService {
  async chat(settings: AiSettings, messages: ChatMessage[]): Promise<AiResponse> {
    if (!settings.apiKey) {
      throw new BadRequestException('API key not configured. Please update your AI settings.');
    }

    switch (settings.provider) {
      case AiProvider.DEEPSEEK:
        return this.callDeepSeek(settings.apiKey, settings.model, messages);
      case AiProvider.OPENAI:
        return this.callOpenAI(settings.apiKey, settings.model, messages);
      case AiProvider.GOOGLE:
        return this.callGemini(settings.apiKey, settings.model, messages);
      case AiProvider.XAI:
        return this.callXAI(settings.apiKey, settings.model, messages);
      default:
        throw new BadRequestException(`Unsupported provider: ${settings.provider}`);
    }
  }

  private async callDeepSeek(apiKey: string, model: string, messages: ChatMessage[]): Promise<AiResponse> {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) throw new BadRequestException(`DeepSeek API error: ${await res.text()}`);
    const data = await res.json() as any;
    return { content: data.choices[0].message.content, tokensUsed: data.usage?.total_tokens, model };
  }

  private async callOpenAI(apiKey: string, model: string, messages: ChatMessage[]): Promise<AiResponse> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) throw new BadRequestException(`OpenAI API error: ${await res.text()}`);
    const data = await res.json() as any;
    return { content: data.choices[0].message.content, tokensUsed: data.usage?.total_tokens, model };
  }

  private async callGemini(apiKey: string, model: string, messages: ChatMessage[]): Promise<AiResponse> {
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const systemMsg = messages.find((m) => m.role === 'system');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body: any = { contents };
    if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new BadRequestException(`Gemini API error: ${await res.text()}`);
    const data = await res.json() as any;
    return { content: data.candidates[0].content.parts[0].text, tokensUsed: data.usageMetadata?.totalTokenCount, model };
  }

  private async callXAI(apiKey: string, model: string, messages: ChatMessage[]): Promise<AiResponse> {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) throw new BadRequestException(`xAI API error: ${await res.text()}`);
    const data = await res.json() as any;
    return { content: data.choices[0].message.content, tokensUsed: data.usage?.total_tokens, model };
  }
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiModel {
  DEEPSEEK_CHAT = 'deepseek-chat',
  XAI_GROK_BETA = 'grok-beta',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash',
  GEMINI_2_5_PRO = 'gemini-2.5-pro',
  OPENAI_GPT4O = 'gpt-4o',
  OPENAI_GPT4O_MINI = 'gpt-4o-mini',
}

export enum AiProvider {
  DEEPSEEK = 'deepseek',
  XAI = 'xai',
  GOOGLE = 'google',
  OPENAI = 'openai',
}

@Entity('ai_settings')
export class AiSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ nullable: true })
  name: string; // Chatbot name (e.g., "Support Bot", "Sales Bot")

  @Column({ type: 'varchar', default: AiModel.DEEPSEEK_CHAT })
  model: string;

  @Column({ type: 'varchar', default: AiProvider.DEEPSEEK })
  provider: string;

  @Column({ type: 'text', nullable: true })
  apiKey: string;

  @Column({ default: true })
  autoReplyEnabled: boolean;

  @Column({ default: false })
  hideAdminQuickReplies: boolean;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string;

  @Column({ default: false })
  isActive: boolean; // Only one chatbot per user should be active

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

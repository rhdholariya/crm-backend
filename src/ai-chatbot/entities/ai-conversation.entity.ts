import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { AiMessage } from './ai-message.entity';

@Entity('ai_conversations')
export class AiConversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  // WhatsApp contact id or chat id
  @Column()
  contactId: string;

  @Column({ default: true })
  isActive: boolean;

  // Which chatbot is handling this conversation (null = active chatbot)
  @Column({ nullable: true, type: 'int' })
  chatbotId: number | null;

  // When set, AI chatbot is active for this contact until this time
  // null = no expiry (stays active until manually cleared)
  @Column({ type: 'timestamp', nullable: true })
  aiActiveUntil: Date | null;

  @OneToMany(() => AiMessage, (m) => m.conversation, { cascade: true })
  messages: AiMessage[];

  @CreateDateColumn()
  createdAt: Date;
}

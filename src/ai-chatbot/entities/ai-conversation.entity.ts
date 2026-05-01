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

  @OneToMany(() => AiMessage, (m) => m.conversation, { cascade: true })
  messages: AiMessage[];

  @CreateDateColumn()
  createdAt: Date;
}

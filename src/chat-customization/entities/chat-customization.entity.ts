import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BackgroundType {
  COLOR = 'color',
  IMAGE = 'image',
}

@Entity('chat_customization')
export class ChatCustomization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: number;

  @Column({ type: 'varchar', nullable: true })
  chatColor: string | null;

  @Column({ type: 'enum', enum: BackgroundType, default: BackgroundType.COLOR })
  backgroundType: BackgroundType;

  @Column({ type: 'varchar', nullable: true })
  backgroundColor: string | null;

  @Column({ type: 'text', nullable: true })
  backgroundImage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ default: true })
  isActive: boolean;

  @Column()
  roleId: number;

  @Column({ nullable: true, select: false })
  resetToken: string;

  @Column({ nullable: true, select: false })
  resetTokenExpiry: Date;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'roleId' })
  role: Role;

  @Column({ type: 'timestamp', nullable: true })
  otpVerifiedAt: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  stripeCustomerId: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  activePlanId: number | null;

  // Self-referencing: which user (admin/user) created this agent
  @Column({ type: 'int', nullable: true, default: null, name: 'created_by' })
  createdBy: number | null;

  @ManyToOne(() => User, (user) => user.agents, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @OneToMany(() => User, (user) => user.creator)
  agents: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

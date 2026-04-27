import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Flow } from './flow.entity';

export enum NodeType {
  // Trigger nodes
  TRIGGER = 'trigger',

  // Message nodes
  SEND_TEXT = 'send_text',
  SEND_IMAGE = 'send_image',
  SEND_VIDEO = 'send_video',
  SEND_AUDIO = 'send_audio',
  SEND_FILE = 'send_file',
  SEND_BUTTONS = 'send_buttons',
  SEND_LIST = 'send_list',
  SEND_TEMPLATE = 'send_template',

  // Logic nodes
  CONDITION = 'condition',
  DELAY = 'delay',
  RANDOM_SPLIT = 'random_split',
  AB_TEST = 'ab_test',

  // Action nodes
  SET_VARIABLE = 'set_variable',
  ADD_TAG = 'add_tag',
  REMOVE_TAG = 'remove_tag',
  ASSIGN_AGENT = 'assign_agent',
  WEBHOOK_CALL = 'webhook_call',
  JUMP_TO_FLOW = 'jump_to_flow',

  // Input nodes
  WAIT_FOR_INPUT = 'wait_for_input',
  COLLECT_INPUT = 'collect_input',

  // Terminal nodes
  END = 'end',
  FALLBACK = 'fallback',
}

@Entity('flow_nodes')
export class FlowNode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  flowId: number;

  @ManyToOne(() => Flow, (flow) => flow.nodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flowId' })
  flow: Flow;

  // Unique key within the flow (used for edge references)
  @Column()
  nodeKey: string;

  @Column({ type: 'enum', enum: NodeType })
  type: NodeType;

  @Column({ nullable: true })
  label: string;

  // Node configuration (message content, conditions, etc.)
  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, any>;

  // Drag & Drop UI position
  @Column({ type: 'float', default: 0 })
  positionX: number;

  @Column({ type: 'float', default: 0 })
  positionY: number;

  // UI metadata (color, icon, notes)
  @Column({ type: 'jsonb', nullable: true })
  uiMeta: Record<string, any>;

  // For A/B test nodes — which variant this belongs to
  @Column({ nullable: true })
  abVariant: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

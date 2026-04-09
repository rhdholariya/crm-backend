import { DataSource } from 'typeorm';
import { Feature } from '../../features/entities/feature.entity';

const FEATURES = [
  {
    name: 'Contact Management',
    description: 'Manage and organize contacts',
    defaultLimit: null,
  },
  {
    name: 'WhatsApp Chat System',
    description: 'Real-time WhatsApp chat interface',
    defaultLimit: null,
  },
  {
    name: 'Chat History',
    description: 'Access and search past chat conversations',
    defaultLimit: null,
  },
  {
    name: 'Tags System',
    description: 'Tag and categorize contacts and chats',
    defaultLimit: null,
  },
  {
    name: 'Notes & Activity Tracking',
    description: 'Add notes and track activity on contacts',
    defaultLimit: null,
  },
  {
    name: 'WhatsApp Integration (QR)',
    description: 'Connect WhatsApp via QR code scan',
    defaultLimit: null,
  },
  {
    name: 'WhatsApp API (Meta)',
    description: 'Connect via official Meta WhatsApp Business API',
    defaultLimit: null,
  },
  {
    name: 'Template Management',
    description: 'Create and manage message templates',
    defaultLimit: null,
  },
  {
    name: 'Campaigns (Bulk Messaging)',
    description: 'Send bulk messages to contact lists',
    defaultLimit: null,
  },
  {
    name: 'Scheduler',
    description: 'Schedule messages for future delivery',
    defaultLimit: null,
  },
  {
    name: 'Auto Follow-ups',
    description: 'Automate follow-up messages based on triggers',
    defaultLimit: null,
  },
  {
    name: 'AI Chatbot',
    description: 'AI-powered automated chatbot responses',
    defaultLimit: null,
  },
  {
    name: 'Dashboard & Analytics',
    description: 'View reports and analytics dashboard',
    defaultLimit: null,
  },
  {
    name: 'E-commerce Integration',
    description: 'Integrate with e-commerce platforms',
    defaultLimit: null,
  },
];

export async function seedFeatures(dataSource: DataSource) {
  const featureRepo = dataSource.getRepository(Feature);

  for (const f of FEATURES) {
    const exists = await featureRepo.findOneBy({ name: f.name });
    if (!exists) {
      await featureRepo.save(featureRepo.create(f));
      console.log(`✓ Feature created: ${f.name}`);
    }
  }
}

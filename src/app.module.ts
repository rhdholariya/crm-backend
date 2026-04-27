import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { DatabaseModule } from './database/database.module';
import { PlansModule } from './plans/plans.module';
import { PaymentsModule } from './payments/payments.module';
import { PaymentSettingsModule } from './payment-settings/payment-settings.module';
import { FeaturesModule } from './features/features.module';
import { TagsModule } from './tags/tags.module';
import { ContactsModule } from './contacts/contacts.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { ChatCustomizationModule } from './chat-customization/chat-customization.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { EmailCampaignsModule } from './email-campaigns/email-campaigns.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { FlowBuilderModule } from './flow-builder/flow-builder.module';
import { CurrencyModule } from './currency/currency.module';
import { LanguageModule } from './language/language.module';
import { QuickReplyModule } from './quick-reply/quick-reply.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: true,
        logging: false,
      }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PlansModule,
    PaymentsModule,
    PaymentSettingsModule,
    FeaturesModule,
    TagsModule,
    ContactsModule,
    WhatsAppModule,
    ChatCustomizationModule,
    EmailTemplatesModule,
    EmailCampaignsModule,
    CampaignsModule,
    FlowBuilderModule,
    CurrencyModule,
    LanguageModule,
    QuickReplyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

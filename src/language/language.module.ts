import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Language } from './entities/language.entity';
import { LanguageService } from './language.service';
import { LanguageController } from './language.controller';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [TypeOrmModule.forFeature([Language]), TranslationsModule],
  controllers: [LanguageController],
  providers: [LanguageService],
  exports: [LanguageService],
})
export class LanguageModule {}

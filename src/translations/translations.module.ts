import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Translation } from './entities/translation.entity';
import { TranslationsService } from './translations.service';
import { TranslationsController } from './translations.controller';
import { Language } from '../language/entities/language.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Translation, Language])],
  controllers: [TranslationsController],
  providers: [TranslationsService],
  exports: [TranslationsService],
})
export class TranslationsModule {}

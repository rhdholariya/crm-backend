import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from './entities/email-template.entity';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@Injectable()
export class EmailTemplatesService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly repo: Repository<EmailTemplate>,
  ) {}

  create(userId: number, dto: CreateEmailTemplateDto) {
    return this.repo.save(this.repo.create({ ...dto, userId }));
  }

  findAll(userId: number, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    return this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
  }

  async findOne(userId: number, id: number) {
    const template = await this.repo.findOne({ where: { id } });
    if (!template)
      throw new NotFoundException(`Email template #${id} not found`);
    if (template.userId !== userId) throw new ForbiddenException();
    return template;
  }

  async update(userId: number, id: number, dto: UpdateEmailTemplateDto) {
    const template = await this.findOne(userId, id);
    await this.repo.update(template.id, dto);
    return this.repo.findOne({ where: { id } });
  }

  async remove(userId: number, id: number) {
    const template = await this.findOne(userId, id);
    await this.repo.remove(template);
    return { message: 'Email template deleted successfully' };
  }

  /**
   * Renders a template body by replacing {{parameter}} placeholders with provided values.
   */
  async render(userId: number, id: number, values: Record<string, string>) {
    const template = await this.findOne(userId, id);
    const body = template.body.replace(
      /\[(\w+)\]/g,
      (_, key) => values[key] ?? `[${key}]`,
    );
    const subject = template.subject.replace(
      /\[(\w+)\]/g,
      (_, key) => values[key] ?? `[${key}]`,
    );
    return { subject, body };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldMapping, WebhookEventType } from '../entities/field-mapping.entity';
import { CreateFieldMappingDto } from '../dto/create-field-mapping.dto';

@Injectable()
export class FieldMappingService {
  constructor(
    @InjectRepository(FieldMapping)
    private mappingRepository: Repository<FieldMapping>,
  ) {}

  async create(createMappingDto: CreateFieldMappingDto): Promise<FieldMapping> {
    const mapping = this.mappingRepository.create(createMappingDto);
    return this.mappingRepository.save(mapping);
  }

  async findAll(integrationId: number): Promise<FieldMapping[]> {
    return this.mappingRepository.find({
      where: { integrationId },
      relations: ['integration'],
    });
  }

  async findByEventType(
    integrationId: number,
    eventType: WebhookEventType,
  ): Promise<FieldMapping[]> {
    return this.mappingRepository.find({
      where: { integrationId, eventType },
      relations: ['integration'],
    });
  }

  async findById(mappingId: number): Promise<FieldMapping> {
    const mapping = await this.mappingRepository.findOne({
      where: { id: mappingId },
      relations: ['integration'],
    });

    if (!mapping) {
      throw new NotFoundException('Field mapping not found');
    }

    return mapping;
  }

  async update(
    mappingId: number,
    updateData: Partial<CreateFieldMappingDto>,
  ): Promise<FieldMapping> {
    const mapping = await this.findById(mappingId);

    Object.assign(mapping, updateData);

    return this.mappingRepository.save(mapping);
  }

  async delete(mappingId: number): Promise<void> {
    const mapping = await this.findById(mappingId);
    await this.mappingRepository.remove(mapping);
  }

  async getMappingsByIntegration(integrationId: number): Promise<FieldMapping[]> {
    return this.mappingRepository.find({
      where: { integrationId },
    });
  }

  /**
   * Extract data from webhook payload using field mappings
   */
  async extractWebhookData(
    integrationId: number,
    eventType: WebhookEventType,
    webhookPayload: Record<string, any>,
  ): Promise<Record<string, any>> {
    const mappings = await this.findByEventType(integrationId, eventType);
    const extractedData: Record<string, any> = {};

    for (const mapping of mappings) {
      try {
        const value = this.getNestedValue(
          webhookPayload,
          mapping.externalFieldPath,
        );

        if (value !== undefined) {
          let transformedValue = value;

          // Apply transformation logic if exists
          if (mapping.transformationLogic) {
            transformedValue = this.applyTransformation(
              value,
              mapping.transformationLogic,
            );
          }

          extractedData[mapping.leadFieldName] = transformedValue;
        } else if (mapping.isRequired) {
          console.warn(
            `Required field ${mapping.externalFieldPath} not found in webhook payload`,
          );
        }
      } catch (error) {
        console.error(
          `Error extracting field ${mapping.externalFieldPath}:`,
          error,
        );
      }
    }

    return extractedData;
  }

  /**
   * Get nested value from object using dot notation or array syntax
   * e.g., "customer.email" or "line_items[0].title"
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (!current) return undefined;

      // Handle array notation like "items[0]"
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = current[key]?.[parseInt(index)];
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Apply transformation logic to extracted value
   */
  private applyTransformation(value: any, logic: string): any {
    try {
      // Simple transformations
      if (logic === 'uppercase') return value?.toString().toUpperCase();
      if (logic === 'lowercase') return value?.toString().toLowerCase();
      if (logic === 'trim') return value?.toString().trim();
      if (logic === 'parseFloat') return parseFloat(value);
      if (logic === 'parseInt') return parseInt(value);

      // JSON transformation
      if (logic.startsWith('json:')) {
        const jsonPath = logic.replace('json:', '');
        return this.getNestedValue(JSON.parse(value), jsonPath);
      }

      // Custom function (be careful with this)
      if (logic.startsWith('function:')) {
        const funcBody = logic.replace('function:', '');
        const func = new Function('value', `return ${funcBody}`);
        return func(value);
      }

      return value;
    } catch (error) {
      console.error('Error applying transformation:', error);
      return value;
    }
  }
}

import { Injectable } from '@nestjs/common';

/**
 * Resolves template variables like {{name}}, {{email}}, {{phone}} in message strings.
 * Supports nested dot notation: {{contact.name}}
 */
@Injectable()
export class FlowTemplateService {
  private readonly VARIABLE_REGEX = /\{\{([^}]+)\}\}/g;

  /**
   * Replace all {{variable}} placeholders in a string with values from the context.
   * Unresolved variables are left as-is (or replaced with empty string if strict=true).
   */
  resolve(template: string, context: Record<string, any>, strict = false): string {
    if (!template) return template;

    return template.replace(this.VARIABLE_REGEX, (_match, key) => {
      const trimmedKey = key.trim();
      const value = this.getNestedValue(context, trimmedKey);

      if (value === undefined || value === null) {
        return strict ? '' : _match;
      }
      return String(value);
    });
  }

  /**
   * Resolve all string values in a config object recursively.
   */
  resolveConfig(config: Record<string, any>, context: Record<string, any>): Record<string, any> {
    if (!config) return config;
    return this.deepResolve(config, context);
  }

  private deepResolve(obj: any, context: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.resolve(obj, context);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepResolve(item, context));
    }
    if (obj && typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.deepResolve(value, context);
      }
      return result;
    }
    return obj;
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }

  /**
   * Extract all variable names used in a template string.
   */
  extractVariables(template: string): string[] {
    const vars: string[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(this.VARIABLE_REGEX.source, 'g');

    while ((match = regex.exec(template)) !== null) {
      vars.push(match[1].trim());
    }
    return [...new Set(vars)];
  }
}

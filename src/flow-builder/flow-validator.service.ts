import { Injectable, BadRequestException } from '@nestjs/common';
import { FlowNodeDto } from './dto/flow-node.dto';
import { FlowEdgeDto } from './dto/flow-edge.dto';
import { NodeType } from './entities/flow-node.entity';
import { FlowTriggerType } from './entities/flow.entity';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class FlowValidatorService {
  /**
   * Full flow graph validation:
   * 1. Must have exactly 1 trigger node
   * 2. Must have at least 1 start (non-trigger) node
   * 3. No circular infinite loops (detect cycles without an END node escape)
   * 4. All edge references must point to existing nodes
   * 5. Node configs validated per type
   */
  validate(
    nodes: FlowNodeDto[],
    edges: FlowEdgeDto[],
    triggerType: FlowTriggerType,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!nodes || nodes.length === 0) {
      errors.push('Flow must have at least one node.');
      return { valid: false, errors, warnings };
    }

    const nodeMap = new Map(nodes.map((n) => [n.nodeKey, n]));

    // ── Rule 1: Exactly 1 trigger node ──────────────────────────────────────
    const triggerNodes = nodes.filter((n) => n.type === NodeType.TRIGGER);
    if (triggerNodes.length === 0) {
      errors.push('Flow must have exactly 1 trigger node.');
    } else if (triggerNodes.length > 1) {
      errors.push(`Flow has ${triggerNodes.length} trigger nodes — only 1 is allowed.`);
    }

    // ── Rule 2: At least 1 non-trigger node ─────────────────────────────────
    const nonTriggerNodes = nodes.filter((n) => n.type !== NodeType.TRIGGER);
    if (nonTriggerNodes.length === 0) {
      errors.push('Flow must have at least 1 action/message node after the trigger.');
    }

    // ── Rule 3: Edge references must point to existing nodes ─────────────────
    for (const edge of edges ?? []) {
      if (!nodeMap.has(edge.sourceNodeKey)) {
        errors.push(`Edge references unknown source node: "${edge.sourceNodeKey}".`);
      }
      if (!nodeMap.has(edge.targetNodeKey)) {
        errors.push(`Edge references unknown target node: "${edge.targetNodeKey}".`);
      }
    }

    // ── Rule 4: Cycle detection (no infinite loops) ──────────────────────────
    const cycleErrors = this.detectInfiniteLoops(nodes, edges ?? []);
    errors.push(...cycleErrors);

    // ── Rule 5: Node config validation ──────────────────────────────────────
    for (const node of nodes) {
      const nodeErrors = this.validateNodeConfig(node);
      errors.push(...nodeErrors);
    }

    // ── Warnings ─────────────────────────────────────────────────────────────
    const endNodes = nodes.filter((n) => n.type === NodeType.END);
    if (endNodes.length === 0) {
      warnings.push('No END node found — consider adding one to mark flow completion.');
    }

    const fallbackNodes = nodes.filter((n) => n.type === NodeType.FALLBACK);
    if (fallbackNodes.length === 0) {
      warnings.push('No FALLBACK node — unmatched inputs will have no response.');
    }

    // Validate trigger config
    if (triggerType === FlowTriggerType.KEYWORD) {
      const trigger = triggerNodes[0];
      if (!trigger?.config?.keywords?.length) {
        warnings.push('Keyword trigger has no keywords configured.');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Detect cycles that have no path to an END node (infinite loops).
   * Cycles that eventually reach END are allowed (e.g. retry loops).
   */
  private detectInfiniteLoops(nodes: FlowNodeDto[], edges: FlowEdgeDto[]): string[] {
    const errors: string[] = [];
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      adjacency.set(node.nodeKey, []);
    }
    for (const edge of edges) {
      const targets = adjacency.get(edge.sourceNodeKey) ?? [];
      targets.push(edge.targetNodeKey);
      adjacency.set(edge.sourceNodeKey, targets);
    }

    const endNodeKeys = new Set(
      nodes.filter((n) => n.type === NodeType.END || n.type === NodeType.FALLBACK).map((n) => n.nodeKey),
    );

    // DFS to find cycles — check if any cycle has no escape to END
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const cycleNodes = new Set<string>();

    const dfs = (key: string): boolean => {
      if (inStack.has(key)) {
        cycleNodes.add(key);
        return true; // cycle detected
      }
      if (visited.has(key)) return false;

      visited.add(key);
      inStack.add(key);

      for (const neighbor of adjacency.get(key) ?? []) {
        if (dfs(neighbor)) {
          cycleNodes.add(key);
        }
      }

      inStack.delete(key);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.nodeKey)) {
        dfs(node.nodeKey);
      }
    }

    // For each cycle node, check if it can reach an END node
    for (const cycleKey of cycleNodes) {
      if (!this.canReachEnd(cycleKey, adjacency, endNodeKeys)) {
        errors.push(
          `Infinite loop detected at node "${cycleKey}" — no path to an END/FALLBACK node.`,
        );
      }
    }

    return errors;
  }

  private canReachEnd(
    startKey: string,
    adjacency: Map<string, string[]>,
    endKeys: Set<string>,
  ): boolean {
    const visited = new Set<string>();
    const queue = [startKey];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (endKeys.has(current)) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        queue.push(neighbor);
      }
    }
    return false;
  }

  private validateNodeConfig(node: FlowNodeDto): string[] {
    const errors: string[] = [];
    const cfg = node.config ?? {};

    switch (node.type) {
      case NodeType.SEND_TEXT:
        if (!cfg.message) {
          errors.push(`Node "${node.nodeKey}" (send_text): "message" is required.`);
        }
        break;

      case NodeType.SEND_BUTTONS:
        if (!cfg.message) {
          errors.push(`Node "${node.nodeKey}" (send_buttons): "message" is required.`);
        }
        if (!Array.isArray(cfg.buttons) || cfg.buttons.length === 0) {
          errors.push(`Node "${node.nodeKey}" (send_buttons): at least 1 button is required.`);
        }
        if (Array.isArray(cfg.buttons) && cfg.buttons.length > 3) {
          errors.push(`Node "${node.nodeKey}" (send_buttons): max 3 buttons allowed.`);
        }
        break;

      case NodeType.SEND_LIST:
        if (!cfg.message) {
          errors.push(`Node "${node.nodeKey}" (send_list): "message" is required.`);
        }
        if (!Array.isArray(cfg.sections) || cfg.sections.length === 0) {
          errors.push(`Node "${node.nodeKey}" (send_list): at least 1 section is required.`);
        }
        break;

      case NodeType.CONDITION:
        if (!cfg.operator || !cfg.field) {
          errors.push(`Node "${node.nodeKey}" (condition): "field" and "operator" are required.`);
        }
        break;

      case NodeType.DELAY:
        if (!cfg.delaySeconds || cfg.delaySeconds <= 0) {
          errors.push(`Node "${node.nodeKey}" (delay): "delaySeconds" must be > 0.`);
        }
        break;

      case NodeType.WEBHOOK_CALL:
        if (!cfg.url) {
          errors.push(`Node "${node.nodeKey}" (webhook_call): "url" is required.`);
        }
        break;

      case NodeType.JUMP_TO_FLOW:
        if (!cfg.targetFlowId) {
          errors.push(`Node "${node.nodeKey}" (jump_to_flow): "targetFlowId" is required.`);
        }
        break;

      case NodeType.SET_VARIABLE:
        if (!cfg.variableName || !cfg.value) {
          errors.push(`Node "${node.nodeKey}" (set_variable): "variableName" and "value" are required.`);
        }
        break;

      case NodeType.RANDOM_SPLIT:
        if (!Array.isArray(cfg.branches) || cfg.branches.length < 2) {
          errors.push(`Node "${node.nodeKey}" (random_split): at least 2 branches required.`);
        }
        break;

      case NodeType.COLLECT_INPUT:
        if (!cfg.variableName) {
          errors.push(`Node "${node.nodeKey}" (collect_input): "variableName" is required.`);
        }
        break;
    }

    return errors;
  }

  assertValid(nodes: FlowNodeDto[], edges: FlowEdgeDto[], triggerType: FlowTriggerType): void {
    const result = this.validate(nodes, edges, triggerType);
    if (!result.valid) {
      throw new BadRequestException({
        message: 'Flow validation failed',
        errors: result.errors,
        warnings: result.warnings,
      });
    }
  }
}

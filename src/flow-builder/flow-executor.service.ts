import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flow } from './entities/flow.entity';
import { FlowNode, NodeType } from './entities/flow-node.entity';
import { FlowEdge } from './entities/flow-edge.entity';
import { FlowExecution, ExecutionStatus } from './entities/flow-execution.entity';
import { FlowExecutionStep, StepStatus } from './entities/flow-execution-step.entity';
import { FlowBuilderService } from './flow-builder.service';
import { FlowTemplateService } from './flow-template.service';

export interface IncomingMessage {
  chatId: string;       // e.g. "919824160403@c.us"
  body: string;         // raw message text
  contactName?: string;
  contactPhone?: string;
  userId: number;
}

export interface FlowSendFn {
  sendText(chatId: string, message: string): Promise<void>;
  sendButtons(chatId: string, message: string, buttons: any[]): Promise<void>;
  sendList(chatId: string, message: string, sections: any[], buttonText?: string): Promise<void>;
}

@Injectable()
export class FlowExecutorService {
  private readonly logger = new Logger(FlowExecutorService.name);

  // In-memory map of active executions waiting for user input
  // key: `${userId}:${chatId}` → { executionId, nodeKey, variableName }
  private waitingForInput = new Map<string, {
    executionId: number;
    nodeKey: string;
    variableName: string;
    flowId: number;
    userId: number;
    variables: Record<string, any>;
    timeoutHandle: NodeJS.Timeout;
  }>();

  constructor(
    @InjectRepository(FlowExecution)
    private readonly executionRepo: Repository<FlowExecution>,
    @InjectRepository(FlowExecutionStep)
    private readonly stepRepo: Repository<FlowExecutionStep>,
    @InjectRepository(FlowNode)
    private readonly nodeRepo: Repository<FlowNode>,
    @InjectRepository(FlowEdge)
    private readonly edgeRepo: Repository<FlowEdge>,
    private readonly flowService: FlowBuilderService,
    private readonly templateService: FlowTemplateService,
  ) {}

  /**
   * Main entry point — called on every incoming WhatsApp message.
   * 1. Check if this chat is waiting for input → resume that execution
   * 2. Otherwise find a matching active flow and start a new execution
   */
  async handleIncomingMessage(msg: IncomingMessage, sender: FlowSendFn): Promise<boolean> {
    const waitKey = `${msg.userId}:${msg.chatId}`;

    this.logger.log(`[FlowExecutor] Incoming msg userId=${msg.userId} chatId=${msg.chatId} body="${msg.body}"`);

    // ── Resume waiting execution ──────────────────────────────────────────────
    if (this.waitingForInput.has(waitKey)) {
      this.logger.log(`[FlowExecutor] Resuming waiting execution for ${waitKey}`);
      await this.resumeExecution(waitKey, msg, sender);
      return true;
    }

    // ── Find matching flow ────────────────────────────────────────────────────
    const flow = await this.flowService.findMatchingFlow(msg.userId, msg.body, msg.chatId);
    if (!flow) {
      this.logger.log(`[FlowExecutor] No matching active flow for userId=${msg.userId} body="${msg.body}"`);
      return false;
    }

    this.logger.log(`[FlowExecutor] ✅ Matched flow "${flow.name}" (id=${flow.id}) for chatId=${msg.chatId}`);

    await this.startExecution(flow, msg, sender);
    await this.flowService.recordTrigger(flow.id, msg.chatId);
    await this.flowService.recordAnalytics(flow.id, msg.userId, 'trigger');

    return true;
  }

  // ── Start a fresh execution ───────────────────────────────────────────────

  private async startExecution(flow: Flow, msg: IncomingMessage, sender: FlowSendFn) {
    const nodes = await this.nodeRepo.find({ where: { flowId: flow.id } });
    const edges = await this.edgeRepo.find({ where: { flowId: flow.id } });

    const triggerNode = nodes.find((n) => n.type === NodeType.TRIGGER);
    if (!triggerNode) return;

    // Assign A/B variant if enabled
    let abVariant: string | undefined;
    if (flow.abTestingEnabled && flow.abTestConfig) {
      abVariant = Math.random() < 0.5 ? 'A' : 'B';
    }

    const variables: Record<string, any> = {
      ...(flow.variables ?? {}),
      contact: {
        phone: msg.contactPhone ?? msg.chatId.replace('@c.us', '').replace('@g.us', ''),
        name: msg.contactName ?? msg.chatId.replace(/@.+/, ''),
        email: '',
      },
      message: msg.body,
    };

    const execution = await this.executionRepo.save(
      this.executionRepo.create({
        flowId: flow.id,
        userId: msg.userId,
        contactPhone: msg.contactPhone ?? msg.chatId,
        chatId: msg.chatId,
        status: ExecutionStatus.RUNNING,
        variables,
        abVariant,
        isSimulation: false,
        currentNodeKey: triggerNode.nodeKey,
      }),
    );

    await this.runFromNode(
      execution.id,
      flow.id,
      msg.userId,
      triggerNode.nodeKey,
      nodes,
      edges,
      variables,
      msg,
      sender,
      abVariant,
    );
  }

  // ── Resume execution after user input ────────────────────────────────────

  private async resumeExecution(waitKey: string, msg: IncomingMessage, sender: FlowSendFn) {
    const state = this.waitingForInput.get(waitKey)!;
    clearTimeout(state.timeoutHandle);
    this.waitingForInput.delete(waitKey);

    this.logger.log(`[FlowExecutor] Resuming executionId=${state.executionId} with input="${msg.body}"`);

    // Store the collected input into variables
    state.variables[state.variableName] = msg.body;

    // Update execution record
    await this.executionRepo.update(state.executionId, {
      variables: state.variables,
      status: ExecutionStatus.RUNNING,
    });

    // Save step for the input received
    await this.stepRepo.save(
      this.stepRepo.create({
        executionId: state.executionId,
        nodeKey: state.nodeKey,
        nodeType: NodeType.COLLECT_INPUT,
        status: StepStatus.EXECUTED,
        input: { userInput: msg.body },
        output: { variableName: state.variableName, value: msg.body },
        durationMs: 0,
      }),
    );

    const nodes = await this.nodeRepo.find({ where: { flowId: state.flowId } });
    const edges = await this.edgeRepo.find({ where: { flowId: state.flowId } });

    // Find the next node after the collect_input node
    const nextKey = this.getNextNodeKey(state.nodeKey, edges);
    if (!nextKey) {
      await this.markComplete(state.executionId, state.flowId, state.userId);
      return;
    }

    await this.runFromNode(
      state.executionId,
      state.flowId,
      state.userId,
      nextKey,
      nodes,
      edges,
      state.variables,
      msg,
      sender,
    );
  }

  // ── Core execution loop ───────────────────────────────────────────────────

  private async runFromNode(
    executionId: number,
    flowId: number,
    userId: number,
    startNodeKey: string,
    nodes: FlowNode[],
    edges: FlowEdge[],
    variables: Record<string, any>,
    msg: IncomingMessage,
    sender: FlowSendFn,
    abVariant?: string,
  ) {
    const nodeMap = new Map(nodes.map((n) => [n.nodeKey, n]));
    let currentKey: string | null = startNodeKey;
    const visited = new Set<string>();
    const MAX_STEPS = 50;
    let stepCount = 0;

    while (currentKey && stepCount < MAX_STEPS) {
      if (visited.has(currentKey)) {
        this.logger.warn(`[FlowExecutor] Loop detected at node="${currentKey}" — stopping`);
        break;
      }
      visited.add(currentKey);
      stepCount++;

      const node = nodeMap.get(currentKey);
      if (!node) break;

      // Skip trigger node (already processed)
      if (node.type === NodeType.TRIGGER) {
        currentKey = this.getNextNodeKey(currentKey, edges);
        continue;
      }

      // For A/B test nodes — skip nodes that don't match our variant
      if (node.abVariant && abVariant && node.abVariant !== abVariant) {
        currentKey = this.getNextNodeKey(currentKey, edges, abVariant);
        continue;
      }

      const resolvedConfig = this.templateService.resolveConfig(node.config ?? {}, variables);
      const startTime = Date.now();

      try {
        const result = await this.executeNode(
          node,
          resolvedConfig,
          variables,
          msg,
          sender,
          executionId,
          flowId,
          userId,
          edges,
        );

        const durationMs = Date.now() - startTime;

        await this.stepRepo.save(
          this.stepRepo.create({
            executionId,
            nodeKey: currentKey,
            nodeType: node.type,
            status: StepStatus.EXECUTED,
            input: { message: msg.body, variables },
            output: result.output,
            durationMs,
          }),
        );

        // COLLECT_INPUT pauses execution — resume happens on next message
        if (result.pause) {
          const waitKey = `${userId}:${msg.chatId}`;
          const timeout = (resolvedConfig.timeout ?? 120) * 1000;

          const timeoutHandle = setTimeout(async () => {
            this.waitingForInput.delete(waitKey);
            await this.executionRepo.update(executionId, { status: ExecutionStatus.TIMED_OUT });
            await this.flowService.recordAnalytics(flowId, userId, 'dropped', currentKey ?? undefined);
            this.logger.warn(`[FlowExecutor] Input timeout for executionId=${executionId}`);
          }, timeout);

          this.waitingForInput.set(waitKey, {
            executionId,
            nodeKey: currentKey,
            variableName: resolvedConfig.variableName,
            flowId,
            userId,
            variables,
            timeoutHandle,
          });

          await this.executionRepo.update(executionId, {
            status: ExecutionStatus.WAITING_INPUT,
            currentNodeKey: currentKey,
            variables,
          });
          return; // pause here
        }

        // END / FALLBACK — finish
        if (node.type === NodeType.END || node.type === NodeType.FALLBACK) {
          await this.markComplete(executionId, flowId, userId);
          return;
        }

        // Determine next node
        currentKey = this.resolveNextKey(currentKey, edges, node, result.output, variables, abVariant);

      } catch (err: any) {
        this.logger.error(`[FlowExecutor] Node "${currentKey}" failed: ${err.message}`);

        const failedStep = this.stepRepo.create({
          executionId,
          nodeKey: currentKey ?? 'unknown',
          nodeType: node.type,
          status: StepStatus.FAILED,
          input: { message: msg.body },
          output: { error: err.message },
          errorMessage: err.message,
          durationMs: Date.now() - startTime,
        });
        await this.stepRepo.save(failedStep);

        await this.executionRepo.update(executionId, {
          status: ExecutionStatus.FAILED,
          errorMessage: err.message,
          completedAt: new Date(),
        });
        await this.flowService.recordAnalytics(flowId, userId, 'failed');
        return;
      }
    }

    await this.markComplete(executionId, flowId, userId);
  }

  // ── Execute a single node ─────────────────────────────────────────────────

  private async executeNode(
    node: FlowNode,
    config: Record<string, any>,
    variables: Record<string, any>,
    msg: IncomingMessage,
    sender: FlowSendFn,
    executionId: number,
    flowId: number,
    userId: number,
    edges: FlowEdge[],
  ): Promise<{ output: Record<string, any>; pause?: boolean }> {

    switch (node.type) {
      // ── Message nodes ──────────────────────────────────────────────────────
      case NodeType.SEND_TEXT: {
        await sender.sendText(msg.chatId, config.message);
        return { output: { sent: true, message: config.message } };
      }

      case NodeType.SEND_BUTTONS: {
        await sender.sendButtons(msg.chatId, config.message, config.buttons ?? []);
        return { output: { sent: true, buttons: config.buttons } };
      }

      case NodeType.SEND_LIST: {
        await sender.sendList(msg.chatId, config.message, config.sections ?? [], config.buttonText);
        return { output: { sent: true, sections: config.sections } };
      }

      case NodeType.SEND_TEMPLATE: {
        await sender.sendText(msg.chatId, config.message);
        return { output: { sent: true } };
      }

      case NodeType.SEND_IMAGE:
      case NodeType.SEND_VIDEO:
      case NodeType.SEND_AUDIO:
      case NodeType.SEND_FILE: {
        // For media nodes, send caption as text if no media URL available in runtime
        const caption = config.caption ?? config.message ?? '';
        if (caption) await sender.sendText(msg.chatId, caption);
        return { output: { sent: true, mediaUrl: config.url } };
      }

      // ── Logic nodes ────────────────────────────────────────────────────────
      case NodeType.CONDITION: {
        const result = this.evaluateCondition(config, variables);
        return { output: { conditionResult: result, branch: result ? 'yes' : 'no' } };
      }

      case NodeType.DELAY: {
        const ms = (config.delaySeconds ?? 1) * 1000;
        if (config.message) await sender.sendText(msg.chatId, config.message);
        await new Promise((r) => setTimeout(r, Math.min(ms, 10000))); // cap at 10s in runtime
        return { output: { delayed: true, delaySeconds: config.delaySeconds } };
      }

      case NodeType.RANDOM_SPLIT: {
        const branches: string[] = config.branches ?? ['A', 'B'];
        const chosen = branches[Math.floor(Math.random() * branches.length)];
        return { output: { branch: chosen } };
      }

      case NodeType.AB_TEST: {
        const variant = variables._abVariant ?? (Math.random() < 0.5 ? 'A' : 'B');
        return { output: { variant, branch: variant } };
      }

      // ── Action nodes ───────────────────────────────────────────────────────
      case NodeType.SET_VARIABLE: {
        variables[config.variableName] = config.value;
        return { output: { variableSet: config.variableName, value: config.value } };
      }

      case NodeType.ADD_TAG:
      case NodeType.REMOVE_TAG: {
        // Tag operations are fire-and-forget in runtime (no contact repo here)
        this.logger.log(`[FlowExecutor] ${node.type} tag="${config.tagName}" for chatId=${msg.chatId}`);
        return { output: { tag: config.tagName, action: node.type } };
      }

      case NodeType.ASSIGN_AGENT: {
        this.logger.log(`[FlowExecutor] Assign agent team="${config.team}" for chatId=${msg.chatId}`);
        return { output: { assigned: true, team: config.team } };
      }

      case NodeType.WEBHOOK_CALL: {
        const response = await this.callWebhook(config, variables);
        if (config.saveResponseAs) {
          variables[config.saveResponseAs] = response;
        }
        return { output: { webhookCalled: config.url, response } };
      }

      case NodeType.JUMP_TO_FLOW: {
        this.logger.log(`[FlowExecutor] Jump to flow id=${config.targetFlowId}`);
        return { output: { jumpTo: config.targetFlowId } };
      }

      // ── Input nodes ────────────────────────────────────────────────────────
      case NodeType.WAIT_FOR_INPUT:
      case NodeType.COLLECT_INPUT: {
        if (config.message) {
          await sender.sendText(msg.chatId, config.message);
        }
        return { output: { waiting: true, variableName: config.variableName }, pause: true };
      }

      // ── Terminal nodes ─────────────────────────────────────────────────────
      case NodeType.END: {
        return { output: { completed: true } };
      }

      case NodeType.FALLBACK: {
        if (config.message) await sender.sendText(msg.chatId, config.message);
        return { output: { fallback: true } };
      }

      default:
        return { output: { skipped: true, nodeType: node.type } };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private evaluateCondition(config: Record<string, any>, variables: Record<string, any>): boolean {
    const fieldValue = this.getNestedValue(variables, config.field ?? '');
    const value = config.value;

    switch (config.operator) {
      case 'equals': return String(fieldValue ?? '').toLowerCase() === String(value ?? '').toLowerCase();
      case 'not_equals': return String(fieldValue ?? '') !== String(value ?? '');
      case 'contains': return String(fieldValue ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
      case 'not_contains': return !String(fieldValue ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
      case 'starts_with': return String(fieldValue ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());
      case 'ends_with': return String(fieldValue ?? '').toLowerCase().endsWith(String(value ?? '').toLowerCase());
      case 'greater_than': return Number(fieldValue) > Number(value);
      case 'less_than': return Number(fieldValue) < Number(value);
      case 'is_empty': return !fieldValue;
      case 'is_not_empty': return !!fieldValue;
      default: return false;
    }
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((cur, key) => (cur && typeof cur === 'object' ? cur[key] : undefined), obj);
  }

  private getNextNodeKey(sourceKey: string, edges: FlowEdge[], handle?: string): string | null {
    const outEdges = edges.filter((e) => e.sourceNodeKey === sourceKey);
    if (!outEdges.length) return null;
    if (handle) {
      const match = outEdges.find((e) => e.sourceHandle === handle);
      return match?.targetNodeKey ?? outEdges[0]?.targetNodeKey ?? null;
    }
    return outEdges[0]?.targetNodeKey ?? null;
  }

  private resolveNextKey(
    currentKey: string,
    edges: FlowEdge[],
    node: FlowNode,
    output: Record<string, any>,
    _variables: Record<string, any>,
    abVariant?: string,
  ): string | null {
    const outEdges = edges.filter((e) => e.sourceNodeKey === currentKey);
    if (!outEdges.length) return null;

    if (node.type === NodeType.CONDITION) {
      const branch = output.branch as string;
      const match = outEdges.find((e) => e.sourceHandle === branch);
      return match?.targetNodeKey ?? outEdges[0]?.targetNodeKey ?? null;
    }

    if (node.type === NodeType.AB_TEST) {
      const variant = abVariant ?? output.variant;
      const match = outEdges.find((e) => e.sourceHandle === variant);
      return match?.targetNodeKey ?? outEdges[0]?.targetNodeKey ?? null;
    }

    if (node.type === NodeType.RANDOM_SPLIT) {
      const branch = output.branch as string;
      const match = outEdges.find((e) => e.sourceHandle === branch);
      return match?.targetNodeKey ?? outEdges[0]?.targetNodeKey ?? null;
    }

    return outEdges[0]?.targetNodeKey ?? null;
  }

  private async callWebhook(config: Record<string, any>, variables: Record<string, any>): Promise<any> {
    const url = this.templateService.resolve(config.url, variables);
    const method = (config.method ?? 'POST').toUpperCase();
    const headers = config.headers ?? { 'Content-Type': 'application/json' };
    const body = config.body ? this.templateService.resolveConfig(config.body, variables) : undefined;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
      return await res.json().catch(() => ({ status: res.status }));
    } catch (err: any) {
      this.logger.warn(`[FlowExecutor] Webhook failed: ${err.message}`);
      return { error: err.message };
    }
  }

  private async markComplete(executionId: number, flowId: number, userId: number) {
    await this.executionRepo.update(executionId, {
      status: ExecutionStatus.COMPLETED,
      completedAt: new Date(),
    });
    await this.flowService.recordAnalytics(flowId, userId, 'completed');
    this.logger.log(`[FlowExecutor] Execution #${executionId} completed`);
  }

  /** Called by WhatsApp service to check if a chat is mid-flow */
  isWaitingForInput(userId: number, chatId: string): boolean {
    return this.waitingForInput.has(`${userId}:${chatId}`);
  }
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Flow, FlowStatus } from './entities/flow.entity';
import { FlowNode } from './entities/flow-node.entity';
import { FlowEdge } from './entities/flow-edge.entity';
import { FlowExecution, ExecutionStatus } from './entities/flow-execution.entity';
import { FlowExecutionStep, StepStatus } from './entities/flow-execution-step.entity';
import { FlowAnalytics } from './entities/flow-analytics.entity';
import { FlowRateLimit } from './entities/flow-rate-limit.entity';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { SaveFlowGraphDto } from './dto/save-flow-graph.dto';
import { FeSaveFlowDto } from './dto/fe-save-flow.dto';
import { SimulateFlowDto } from './dto/simulate-flow.dto';
import { FlowValidatorService } from './flow-validator.service';
import { FlowTemplateService } from './flow-template.service';
import { FlowGraphMapper } from './flow-graph.mapper';
import { NodeType } from './entities/flow-node.entity';

@Injectable()
export class FlowBuilderService {
  private readonly logger = new Logger(FlowBuilderService.name);

  constructor(
    @InjectRepository(Flow)
    private readonly flowRepo: Repository<Flow>,
    @InjectRepository(FlowNode)
    private readonly nodeRepo: Repository<FlowNode>,
    @InjectRepository(FlowEdge)
    private readonly edgeRepo: Repository<FlowEdge>,
    @InjectRepository(FlowExecution)
    private readonly executionRepo: Repository<FlowExecution>,
    @InjectRepository(FlowExecutionStep)
    private readonly stepRepo: Repository<FlowExecutionStep>,
    @InjectRepository(FlowAnalytics)
    private readonly analyticsRepo: Repository<FlowAnalytics>,
    @InjectRepository(FlowRateLimit)
    private readonly rateLimitRepo: Repository<FlowRateLimit>,
    private readonly dataSource: DataSource,
    private readonly validator: FlowValidatorService,
    private readonly templateService: FlowTemplateService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(userId: number, dto: CreateFlowDto): Promise<Flow> {
    const flow = this.flowRepo.create({ ...dto, userId });
    return this.flowRepo.save(flow);
  }

  async findAll(userId: number, page = 1, limit = 10, search?: string, status?: FlowStatus) {
    const qb = this.flowRepo
      .createQueryBuilder('flow')
      .where('flow.userId = :userId', { userId });

    if (search) {
      qb.andWhere('(flow.name ILIKE :search OR flow.description ILIKE :search)', {
        search: `%${search}%`,
      });
    }
    if (status) {
      qb.andWhere('flow.status = :status', { status });
    }

    qb.orderBy('flow.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { total, page, limit, totalPages: Math.ceil(total / limit), data };
  }

  async findOne(userId: number, id: number): Promise<Flow> {
    const flow = await this.flowRepo.findOne({
      where: { id },
      relations: ['nodes', 'edges'],
    });
    if (!flow) throw new NotFoundException(`Flow #${id} not found`);
    if (flow.userId !== userId) throw new ForbiddenException();
    return flow;
  }

  async update(userId: number, id: number, dto: UpdateFlowDto): Promise<Flow> {
    const flow = await this.findOne(userId, id);
    Object.assign(flow, dto);
    return this.flowRepo.save(flow);
  }

  async remove(userId: number, id: number): Promise<{ message: string }> {
    const flow = await this.findOne(userId, id);
    await this.flowRepo.remove(flow);
    return { message: 'Flow deleted successfully' };
  }

  async updateStatus(userId: number, id: number, status: FlowStatus): Promise<Flow> {
    const flow = await this.findOne(userId, id);

    // Validate before activating
    if (status === FlowStatus.ACTIVE) {
      const nodes = (flow.nodes ?? []).map((n) => ({
        nodeKey: n.nodeKey,
        type: n.type,
        config: n.config,
        label: n.label,
        positionX: n.positionX,
        positionY: n.positionY,
      }));
      const edges = (flow.edges ?? []).map((e) => ({
        sourceNodeKey: e.sourceNodeKey,
        targetNodeKey: e.targetNodeKey,
        sourceHandle: e.sourceHandle,
        label: e.label,
        condition: e.condition,
      }));
      this.validator.assertValid(nodes, edges, flow.triggerType);
    }

    flow.status = status;
    return this.flowRepo.save(flow);
  }

  // ── Graph — FE Vue Flow format (primary) ─────────────────────────────────

  /**
   * Save flow graph from FE Vue Flow canvas payload.
   * Accepts the raw { name, nodes[], edges[] } the FE sends on save.
   */
  async saveFEGraph(userId: number, flowId: number, dto: FeSaveFlowDto): Promise<Record<string, any>> {
    const flow = await this.findOne(userId, flowId);

    if (dto.name) flow.name = dto.name;
    if (dto.description !== undefined) flow.description = dto.description;
    if (dto.triggerConfig) flow.triggerConfig = dto.triggerConfig;
    if (dto.variables) flow.variables = dto.variables;

    // Auto-extract trigger config from trigger node data if not explicitly provided
    const triggerFeNode = dto.nodes.find((n) => FlowGraphMapper.resolveNodeType(n.type) === NodeType.TRIGGER);
    if (triggerFeNode?.data && !dto.triggerConfig) {
      const { label: _l, ...triggerData } = triggerFeNode.data;
      if (Object.keys(triggerData).length > 0) {
        flow.triggerConfig = triggerData;
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Flow, flow);
      await manager.delete(FlowEdge, { flowId });
      await manager.delete(FlowNode, { flowId });

      for (const feNode of dto.nodes) {
        const dbFields = FlowGraphMapper.feNodeToDb(feNode, flowId);
        const node = manager.create(FlowNode, dbFields as FlowNode);
        await manager.save(FlowNode, node);
      }

      for (const feEdge of dto.edges ?? []) {
        const dbFields = FlowGraphMapper.feEdgeToDb(feEdge, flowId);
        const edge = manager.create(FlowEdge, dbFields as FlowEdge);
        await manager.save(FlowEdge, edge);
      }
    });

    return this.getFEGraph(userId, flowId);
  }

  /**
   * Get flow graph in FE Vue Flow format.
   * Returns { flow, nodes[], edges[] } where nodes/edges are in Vue Flow shape.
   */
  async getFEGraph(userId: number, flowId: number): Promise<Record<string, any>> {
    const flow = await this.findOne(userId, flowId);
    return {
      flow: {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        status: flow.status,
        triggerType: flow.triggerType,
        triggerConfig: flow.triggerConfig,
        variables: flow.variables,
        abTestingEnabled: flow.abTestingEnabled,
        abTestConfig: flow.abTestConfig,
        rateLimitPerUser: flow.rateLimitPerUser,
        rateLimitGlobal: flow.rateLimitGlobal,
        language: flow.language,
        isTemplate: flow.isTemplate,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
      },
      nodes: (flow.nodes ?? []).map((n) => FlowGraphMapper.dbNodeToFe(n)),
      edges: (flow.edges ?? []).map((e) => FlowGraphMapper.dbEdgeToFe(e)),
    };
  }

  async getGraph(userId: number, flowId: number) {
    return this.getFEGraph(userId, flowId);
  }

  // ── Graph — internal format (kept for backward compat) ───────────────────

  async saveGraph(userId: number, flowId: number, dto: SaveFlowGraphDto): Promise<Flow> {
    const flow = await this.findOne(userId, flowId);
    this.validator.assertValid(dto.nodes, dto.edges ?? [], flow.triggerType);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(FlowEdge, { flowId });
      await manager.delete(FlowNode, { flowId });
      const nodes = dto.nodes.map((n) => manager.create(FlowNode, { ...n, flowId }));
      await manager.save(FlowNode, nodes);
      if (dto.edges?.length) {
        const edges = dto.edges.map((e) => manager.create(FlowEdge, { ...e, flowId }));
        await manager.save(FlowEdge, edges);
      }
    });

    return this.findOne(userId, flowId);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  async validateGraph(userId: number, flowId: number) {
    const flow = await this.findOne(userId, flowId);
    const nodes = (flow.nodes ?? []).map((n) => ({
      nodeKey: n.nodeKey,
      type: n.type,
      config: n.config,
      label: n.label,
      positionX: n.positionX,
      positionY: n.positionY,
    }));
    const edges = (flow.edges ?? []).map((e) => ({
      sourceNodeKey: e.sourceNodeKey,
      targetNodeKey: e.targetNodeKey,
      sourceHandle: e.sourceHandle,
      label: e.label,
      condition: e.condition,
    }));
    const result = this.validator.validate(nodes, edges, flow.triggerType);

    // Also return FE-friendly graph so the FE can highlight problem nodes
    const graph = await this.getFEGraph(userId, flowId);
    return { ...result, graph };
  }

  // ── Simulation (test mode) ────────────────────────────────────────────────

  async simulate(userId: number, flowId: number, dto: SimulateFlowDto) {
    const flow = await this.findOne(userId, flowId);

    const nodes = flow.nodes ?? [];
    const edges = flow.edges ?? [];

    if (nodes.length === 0) {
      throw new BadRequestException('Flow has no nodes to simulate.');
    }

    const nodeMap = new Map(nodes.map((n) => [n.nodeKey, n]));
    const adjacency = this.buildAdjacency(edges);

    // Find trigger node
    const triggerNode = nodes.find((n) => n.type === NodeType.TRIGGER);
    if (!triggerNode) throw new BadRequestException('No trigger node found.');

    // Build execution context
    const variables: Record<string, any> = {
      ...(flow.variables ?? {}),
      ...(dto.variables ?? {}),
      contact: {
        phone: dto.contactPhone ?? '+1234567890',
        name: 'Test User',
        email: 'test@example.com',
      },
      message: dto.triggerMessage ?? 'hello',
    };

    // Create simulation execution record
    const execution = await this.executionRepo.save(
      this.executionRepo.create({
        flowId,
        userId,
        contactPhone: dto.contactPhone ?? 'simulation',
        chatId: 'simulation',
        status: ExecutionStatus.RUNNING,
        variables,
        isSimulation: true,
        currentNodeKey: triggerNode.nodeKey,
      }),
    );

    const simulationSteps: any[] = [];
    const visited = new Set<string>();
    let currentKey: string | null = triggerNode.nodeKey;
    let stepCount = 0;
    const MAX_STEPS = 50; // prevent runaway simulations

    while (currentKey && stepCount < MAX_STEPS) {
      if (visited.has(currentKey)) {
        simulationSteps.push({
          nodeKey: currentKey,
          type: 'loop_detected',
          message: 'Loop detected — stopping simulation.',
        });
        break;
      }

      visited.add(currentKey);
      stepCount++;

      const node = nodeMap.get(currentKey);
      if (!node) break;

      const resolvedConfig = this.templateService.resolveConfig(node.config ?? {}, variables);
      const stepResult = this.simulateNode(node, resolvedConfig, variables, dto.triggerMessage);

      simulationSteps.push({
        nodeKey: currentKey,
        nodeType: node.type,
        label: node.label,
        config: resolvedConfig,
        result: stepResult,
      });

      // Save step
      await this.stepRepo.save(
        this.stepRepo.create({
          executionId: execution.id,
          nodeKey: currentKey,
          nodeType: node.type,
          status: StepStatus.EXECUTED,
          input: { message: dto.triggerMessage, variables },
          output: stepResult,
        }),
      );

      // Determine next node
      currentKey = this.resolveNextNode(currentKey, adjacency, node, stepResult, variables);

      if (node.type === NodeType.END || node.type === NodeType.FALLBACK) break;
    }

    // Mark execution complete
    execution.status = ExecutionStatus.SIMULATED;
    execution.completedAt = new Date();
    await this.executionRepo.save(execution);

    return {
      executionId: execution.id,
      flowId,
      isSimulation: true,
      steps: simulationSteps,
      totalSteps: simulationSteps.length,
      variables,
    };
  }

  private simulateNode(
    node: FlowNode,
    resolvedConfig: Record<string, any>,
    variables: Record<string, any>,
    triggerMessage?: string,
  ): Record<string, any> {
    switch (node.type) {
      case NodeType.TRIGGER:
        return { triggered: true, message: triggerMessage };

      case NodeType.SEND_TEXT:
      case NodeType.SEND_BUTTONS:
      case NodeType.SEND_LIST:
      case NodeType.SEND_TEMPLATE:
        return { sent: true, message: resolvedConfig.message };

      case NodeType.SEND_IMAGE:
      case NodeType.SEND_VIDEO:
      case NodeType.SEND_AUDIO:
      case NodeType.SEND_FILE:
        return { sent: true, mediaUrl: resolvedConfig.url };

      case NodeType.CONDITION: {
        const result = this.evaluateCondition(resolvedConfig, variables);
        return { conditionResult: result, branch: result ? 'yes' : 'no' };
      }

      case NodeType.DELAY:
        return { delayed: true, delaySeconds: resolvedConfig.delaySeconds };

      case NodeType.SET_VARIABLE:
        variables[resolvedConfig.variableName] = resolvedConfig.value;
        return { variableSet: resolvedConfig.variableName, value: resolvedConfig.value };

      case NodeType.ADD_TAG:
        return { tagAdded: resolvedConfig.tagName };

      case NodeType.REMOVE_TAG:
        return { tagRemoved: resolvedConfig.tagName };

      case NodeType.WEBHOOK_CALL:
        return { webhookCalled: resolvedConfig.url, simulated: true };

      case NodeType.COLLECT_INPUT:
        return { collected: true, variableName: resolvedConfig.variableName, simulatedValue: 'user_input' };

      case NodeType.RANDOM_SPLIT: {
        const branches: string[] = resolvedConfig.branches ?? [];
        const chosen = branches[Math.floor(Math.random() * branches.length)];
        return { branch: chosen };
      }

      case NodeType.AB_TEST: {
        const variant = Math.random() < 0.5 ? 'A' : 'B';
        return { variant };
      }

      case NodeType.JUMP_TO_FLOW:
        return { jumpTo: resolvedConfig.targetFlowId };

      case NodeType.END:
        return { completed: true };

      case NodeType.FALLBACK:
        return { fallback: true, message: resolvedConfig.message };

      default:
        return { executed: true };
    }
  }

  private evaluateCondition(config: Record<string, any>, variables: Record<string, any>): boolean {
    const { field, operator, value } = config;
    const fieldValue = this.getNestedValue(variables, field ?? '');

    switch (operator) {
      case 'equals': return String(fieldValue) === String(value);
      case 'not_equals': return String(fieldValue) !== String(value);
      case 'contains': return String(fieldValue ?? '').includes(String(value));
      case 'not_contains': return !String(fieldValue ?? '').includes(String(value));
      case 'starts_with': return String(fieldValue ?? '').startsWith(String(value));
      case 'ends_with': return String(fieldValue ?? '').endsWith(String(value));
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

  private buildAdjacency(edges: FlowEdge[]): Map<string, FlowEdge[]> {
    const map = new Map<string, FlowEdge[]>();
    for (const edge of edges) {
      const list = map.get(edge.sourceNodeKey) ?? [];
      list.push(edge);
      map.set(edge.sourceNodeKey, list);
    }
    return map;
  }

  private resolveNextNode(
    currentKey: string,
    adjacency: Map<string, FlowEdge[]>,
    node: FlowNode,
    stepResult: Record<string, any>,
    _variables: Record<string, any>,
  ): string | null {
    const outEdges = adjacency.get(currentKey) ?? [];
    if (outEdges.length === 0) return null;

    // Condition node — pick yes/no branch
    if (node.type === NodeType.CONDITION) {
      const branch = stepResult.branch as string;
      const match = outEdges.find((e) => e.sourceHandle === branch);
      return match?.targetNodeKey ?? outEdges[0]?.targetNodeKey ?? null;
    }

    // Random split / AB test — pick by handle
    if (node.type === NodeType.RANDOM_SPLIT || node.type === NodeType.AB_TEST) {
      const branch = stepResult.branch ?? stepResult.variant;
      const match = outEdges.find((e) => e.sourceHandle === branch);
      return match?.targetNodeKey ?? outEdges[0]?.targetNodeKey ?? null;
    }

    // Default: follow first edge
    return outEdges[0]?.targetNodeKey ?? null;
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getAnalytics(userId: number, flowId: number, days = 30) {
    await this.findOne(userId, flowId); // ownership check

    const since = new Date();
    since.setDate(since.getDate() - days);

    const analytics = await this.analyticsRepo
      .createQueryBuilder('a')
      .where('a.flowId = :flowId AND a.userId = :userId', { flowId, userId })
      .andWhere('a.date >= :since', { since: since.toISOString().split('T')[0] })
      .orderBy('a.date', 'ASC')
      .getMany();

    const totals = analytics.reduce(
      (acc, row) => {
        acc.totalTriggers += row.totalTriggers;
        acc.totalCompleted += row.totalCompleted;
        acc.totalFailed += row.totalFailed;
        acc.totalDropped += row.totalDropped;
        return acc;
      },
      { totalTriggers: 0, totalCompleted: 0, totalFailed: 0, totalDropped: 0 },
    );

    const conversionRate =
      totals.totalTriggers > 0
        ? ((totals.totalCompleted / totals.totalTriggers) * 100).toFixed(2)
        : '0.00';

    const dropOffRate =
      totals.totalTriggers > 0
        ? ((totals.totalDropped / totals.totalTriggers) * 100).toFixed(2)
        : '0.00';

    return {
      flowId,
      period: `${days} days`,
      totals,
      conversionRate: `${conversionRate}%`,
      dropOffRate: `${dropOffRate}%`,
      daily: analytics,
    };
  }

  async getExecutions(userId: number, flowId: number, page = 1, limit = 20) {
    await this.findOne(userId, flowId);

    const [data, total] = await this.executionRepo.findAndCount({
      where: { flowId, userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { total, page, limit, totalPages: Math.ceil(total / limit), data };
  }

  async getExecutionDetail(userId: number, executionId: number) {
    const execution = await this.executionRepo.findOne({
      where: { id: executionId, userId },
      relations: ['steps'],
    });
    if (!execution) throw new NotFoundException(`Execution #${executionId} not found`);
    return execution;
  }

  // ── Rate limit check ──────────────────────────────────────────────────────

  async checkRateLimit(flow: Flow, contactIdentifier: string): Promise<boolean> {
    if (!flow.rateLimitPerUser) return true; // no limit

    const record = await this.rateLimitRepo.findOne({
      where: { flowId: flow.id, contactIdentifier },
    });

    if (!record) return true;

    const secondsSinceLast = (Date.now() - record.lastTriggeredAt.getTime()) / 1000;
    return secondsSinceLast >= flow.rateLimitPerUser;
  }

  async recordTrigger(flowId: number, contactIdentifier: string): Promise<void> {
    let record = await this.rateLimitRepo.findOne({ where: { flowId, contactIdentifier } });

    if (!record) {
      record = this.rateLimitRepo.create({ flowId, contactIdentifier, lastTriggeredAt: new Date(), triggerCount: 1 });
    } else {
      record.lastTriggeredAt = new Date();
      record.triggerCount += 1;
    }

    await this.rateLimitRepo.save(record);
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async getTemplates(userId: number) {
    return this.flowRepo.find({
      where: [{ isTemplate: true }, { userId, isTemplate: true }],
      order: { name: 'ASC' },
    });
  }

  async cloneFromTemplate(userId: number, templateId: number, name: string): Promise<Flow> {
    const template = await this.flowRepo.findOne({
      where: { id: templateId, isTemplate: true },
      relations: ['nodes', 'edges'],
    });
    if (!template) throw new NotFoundException(`Template #${templateId} not found`);

    return this.dataSource.transaction(async (manager) => {
      const newFlow = manager.create(Flow, {
        userId,
        name,
        description: template.description,
        triggerType: template.triggerType,
        triggerConfig: template.triggerConfig,
        variables: template.variables,
        status: FlowStatus.DRAFT,
        language: template.language,
        rateLimitPerUser: template.rateLimitPerUser,
        rateLimitGlobal: template.rateLimitGlobal,
        abTestingEnabled: template.abTestingEnabled,
        abTestConfig: template.abTestConfig,
      });
      const savedFlow = await manager.save(Flow, newFlow);

      if (template.nodes?.length) {
        const nodes = template.nodes.map((n) =>
          manager.create(FlowNode, {
            flowId: savedFlow.id,
            nodeKey: n.nodeKey,
            type: n.type,
            label: n.label,
            config: n.config,
            positionX: n.positionX,
            positionY: n.positionY,
            uiMeta: n.uiMeta,
          }),
        );
        await manager.save(FlowNode, nodes);
      }

      if (template.edges?.length) {
        const edges = template.edges.map((e) =>
          manager.create(FlowEdge, {
            flowId: savedFlow.id,
            sourceNodeKey: e.sourceNodeKey,
            targetNodeKey: e.targetNodeKey,
            sourceHandle: e.sourceHandle,
            label: e.label,
            condition: e.condition,
            uiMeta: e.uiMeta,
          }),
        );
        await manager.save(FlowEdge, edges);
      }

      return savedFlow;
    });
  }

  // ── Trigger matching (called by WhatsApp message handler) ─────────────────

  async findMatchingFlow(userId: number, message: string, chatId: string): Promise<Flow | null> {
    const activeFlows = await this.flowRepo.find({
      where: { userId, status: FlowStatus.ACTIVE },
      relations: ['nodes'],
    });

    for (const flow of activeFlows) {
      const triggerNode = flow.nodes?.find((n) => n.type === NodeType.TRIGGER);
      if (!triggerNode) continue;

      const matched = this.matchesTrigger(flow, triggerNode, message);
      if (!matched) continue;

      // Rate limit check
      const allowed = await this.checkRateLimit(flow, chatId);
      if (!allowed) {
        this.logger.log(`[FlowBuilder] Rate limited: flowId=${flow.id} chatId=${chatId}`);
        continue;
      }

      return flow;
    }

    return null;
  }

  private matchesTrigger(flow: Flow, triggerNode: FlowNode, message: string): boolean {
    // Keywords can be in triggerNode.config OR in flow.triggerConfig (both are valid)
    const nodeCfg = triggerNode.config ?? {};
    const flowCfg = flow.triggerConfig ?? {};
    const lowerMsg = message.toLowerCase().trim();

    switch (flow.triggerType) {
      case 'keyword': {
        // Merge keywords from both sources — node config takes priority
        const keywords: string[] = nodeCfg.keywords ?? flowCfg.keywords ?? [];
        const matchMode: string = nodeCfg.matchMode ?? flowCfg.matchMode ?? 'contains';

        if (keywords.length === 0) {
          this.logger.warn(`[FlowBuilder] Flow "${flow.name}" (id=${flow.id}) has no keywords configured`);
          return false;
        }

        return keywords.some((kw) => {
          const lowerKw = kw.toLowerCase().trim();
          if (matchMode === 'exact') return lowerMsg === lowerKw;
          if (matchMode === 'starts_with') return lowerMsg.startsWith(lowerKw);
          return lowerMsg.includes(lowerKw); // default: contains
        });
      }
      case 'any_message':
        return true;
      case 'first_message':
        return !!(nodeCfg.isFirstMessage ?? flowCfg.isFirstMessage);
      case 'button_reply': {
        const buttonIds: string[] = nodeCfg.buttonIds ?? flowCfg.buttonIds ?? [];
        return buttonIds.includes(message);
      }
      default:
        return false;
    }
  }

  // ── Analytics recording ───────────────────────────────────────────────────

  async recordAnalytics(
    flowId: number,
    userId: number,
    event: 'trigger' | 'completed' | 'failed' | 'dropped',
    nodeKey?: string,
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    let record = await this.analyticsRepo.findOne({
      where: { flowId, userId, date: today },
    });

    if (!record) {
      record = this.analyticsRepo.create({ flowId, userId, date: today });
    }

    if (event === 'trigger') record.totalTriggers += 1;
    if (event === 'completed') record.totalCompleted += 1;
    if (event === 'failed') record.totalFailed += 1;
    if (event === 'dropped') {
      record.totalDropped += 1;
      if (nodeKey) {
        record.nodeDropOff = record.nodeDropOff ?? {};
        record.nodeDropOff[nodeKey] = (record.nodeDropOff[nodeKey] ?? 0) + 1;
      }
    }

    await this.analyticsRepo.save(record);
  }
}

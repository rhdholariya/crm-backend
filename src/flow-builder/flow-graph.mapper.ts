import { NodeType } from './entities/flow-node.entity';
import { FlowNode } from './entities/flow-node.entity';
import { FlowEdge } from './entities/flow-edge.entity';
import { FeFlowNodeDto } from './dto/fe-flow-node.dto';
import { FeFlowEdgeDto } from './dto/fe-flow-edge.dto';

/**
 * Maps FE node type strings → DB NodeType enum values.
 * FE uses camelCase names like "sendMessage", "sendButtons", etc.
 * DB uses snake_case enum values like "send_text", "send_buttons", etc.
 */
const FE_TYPE_TO_NODE_TYPE: Record<string, NodeType> = {
  // Trigger
  trigger: NodeType.TRIGGER,
  triggerNode: NodeType.TRIGGER,

  // Message nodes
  sendMessage: NodeType.SEND_TEXT,
  sendText: NodeType.SEND_TEXT,
  send_text: NodeType.SEND_TEXT,
  sendImage: NodeType.SEND_IMAGE,
  send_image: NodeType.SEND_IMAGE,
  sendVideo: NodeType.SEND_VIDEO,
  send_video: NodeType.SEND_VIDEO,
  sendAudio: NodeType.SEND_AUDIO,
  send_audio: NodeType.SEND_AUDIO,
  sendFile: NodeType.SEND_FILE,
  send_file: NodeType.SEND_FILE,
  sendButtons: NodeType.SEND_BUTTONS,
  send_buttons: NodeType.SEND_BUTTONS,
  sendList: NodeType.SEND_LIST,
  send_list: NodeType.SEND_LIST,
  sendTemplate: NodeType.SEND_TEMPLATE,
  send_template: NodeType.SEND_TEMPLATE,

  // Logic nodes
  condition: NodeType.CONDITION,
  ifElse: NodeType.CONDITION,
  if_else: NodeType.CONDITION,
  delay: NodeType.DELAY,
  wait: NodeType.DELAY,
  randomSplit: NodeType.RANDOM_SPLIT,
  random_split: NodeType.RANDOM_SPLIT,
  abTest: NodeType.AB_TEST,
  ab_test: NodeType.AB_TEST,

  // Action nodes
  setVariable: NodeType.SET_VARIABLE,
  set_variable: NodeType.SET_VARIABLE,
  addTag: NodeType.ADD_TAG,
  add_tag: NodeType.ADD_TAG,
  removeTag: NodeType.REMOVE_TAG,
  remove_tag: NodeType.REMOVE_TAG,
  assignAgent: NodeType.ASSIGN_AGENT,
  assign_agent: NodeType.ASSIGN_AGENT,
  webhookCall: NodeType.WEBHOOK_CALL,
  webhook: NodeType.WEBHOOK_CALL,
  webhook_call: NodeType.WEBHOOK_CALL,
  jumpToFlow: NodeType.JUMP_TO_FLOW,
  jump_to_flow: NodeType.JUMP_TO_FLOW,

  // Input nodes
  waitForInput: NodeType.WAIT_FOR_INPUT,
  wait_for_input: NodeType.WAIT_FOR_INPUT,
  collectInput: NodeType.COLLECT_INPUT,
  collect_input: NodeType.COLLECT_INPUT,
  userInput: NodeType.COLLECT_INPUT,

  // Terminal nodes
  end: NodeType.END,
  endNode: NodeType.END,
  fallback: NodeType.FALLBACK,
  fallbackNode: NodeType.FALLBACK,
};

/**
 * Maps DB NodeType enum → FE type string (for GET /graph response).
 */
const NODE_TYPE_TO_FE_TYPE: Record<NodeType, string> = {
  [NodeType.TRIGGER]: 'trigger',
  [NodeType.SEND_TEXT]: 'sendMessage',
  [NodeType.SEND_IMAGE]: 'sendImage',
  [NodeType.SEND_VIDEO]: 'sendVideo',
  [NodeType.SEND_AUDIO]: 'sendAudio',
  [NodeType.SEND_FILE]: 'sendFile',
  [NodeType.SEND_BUTTONS]: 'sendButtons',
  [NodeType.SEND_LIST]: 'sendList',
  [NodeType.SEND_TEMPLATE]: 'sendTemplate',
  [NodeType.CONDITION]: 'condition',
  [NodeType.DELAY]: 'delay',
  [NodeType.RANDOM_SPLIT]: 'randomSplit',
  [NodeType.AB_TEST]: 'abTest',
  [NodeType.SET_VARIABLE]: 'setVariable',
  [NodeType.ADD_TAG]: 'addTag',
  [NodeType.REMOVE_TAG]: 'removeTag',
  [NodeType.ASSIGN_AGENT]: 'assignAgent',
  [NodeType.WEBHOOK_CALL]: 'webhookCall',
  [NodeType.JUMP_TO_FLOW]: 'jumpToFlow',
  [NodeType.WAIT_FOR_INPUT]: 'waitForInput',
  [NodeType.COLLECT_INPUT]: 'collectInput',
  [NodeType.END]: 'end',
  [NodeType.FALLBACK]: 'fallback',
};

export class FlowGraphMapper {
  /**
   * Convert a FE node (Vue Flow format) → DB FlowNode fields.
   */
  static feNodeToDb(feNode: FeFlowNodeDto, flowId: number): Partial<FlowNode> {
    const nodeType = FE_TYPE_TO_NODE_TYPE[feNode.type] ?? NodeType.SEND_TEXT;

    // Extract position — FE sends either position.x/y or computedPosition.x/y
    const posX = feNode.position?.x ?? feNode.computedPosition?.x ?? 0;
    const posY = feNode.position?.y ?? feNode.computedPosition?.y ?? 0;

    // Extract label from data.label or top-level label
    const label = feNode.data?.label ?? feNode.label ?? feNode.type;

    // Extract config — everything in data except label is config
    const { label: _lbl, ...configFromData } = feNode.data ?? {};
    const config = Object.keys(configFromData).length > 0 ? configFromData : {};

    // Store full FE UI metadata so we can round-trip it back
    const uiMeta: Record<string, any> = {
      feType: feNode.type,           // preserve original FE type string
      dimensions: feNode.dimensions,
      handleBounds: feNode.handleBounds,
      selected: feNode.selected,
      dragging: feNode.dragging,
      ...(feNode.uiMeta ?? {}),
    };

    return {
      flowId,
      nodeKey: feNode.id,
      type: nodeType,
      label,
      config,
      positionX: posX,
      positionY: posY,
      uiMeta,
    };
  }

  /**
   * Convert a FE edge (Vue Flow format) → DB FlowEdge fields.
   */
  static feEdgeToDb(feEdge: FeFlowEdgeDto, flowId: number): Partial<FlowEdge> {
    return {
      flowId,
      sourceNodeKey: feEdge.source,
      targetNodeKey: feEdge.target,
      sourceHandle: feEdge.sourceHandle ?? undefined,
      label: feEdge.label ?? undefined,
      condition: feEdge.data && Object.keys(feEdge.data).length > 0 ? feEdge.data : undefined,
      uiMeta: {
        feId: feEdge.id,
        type: feEdge.type,
        style: feEdge.style,
        animated: feEdge.animated,
        markerEnd: feEdge.markerEnd,
        targetHandle: feEdge.targetHandle,
      },
    };
  }

  /**
   * Convert a DB FlowNode → FE Vue Flow node format.
   * This is what GET /graph returns so the FE can restore the canvas.
   */
  static dbNodeToFe(node: FlowNode): Record<string, any> {
    const feType = node.uiMeta?.feType ?? NODE_TYPE_TO_FE_TYPE[node.type] ?? node.type;

    return {
      id: node.nodeKey,
      type: feType,
      position: { x: node.positionX, y: node.positionY },
      data: {
        label: node.label,
        ...(node.config ?? {}),
      },
      // Restore UI state from uiMeta
      dimensions: node.uiMeta?.dimensions ?? undefined,
      handleBounds: node.uiMeta?.handleBounds ?? undefined,
      selected: node.uiMeta?.selected ?? false,
      dragging: node.uiMeta?.dragging ?? false,
      // Internal DB fields for backend use
      _db: {
        id: node.id,
        nodeKey: node.nodeKey,
        type: node.type,
        abVariant: node.abVariant,
      },
    };
  }

  /**
   * Convert a DB FlowEdge → FE Vue Flow edge format.
   */
  static dbEdgeToFe(edge: FlowEdge): Record<string, any> {
    return {
      id: edge.uiMeta?.feId ?? `e-${edge.sourceNodeKey}-${edge.targetNodeKey}`,
      type: edge.uiMeta?.type ?? 'default',
      source: edge.sourceNodeKey,
      target: edge.targetNodeKey,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.uiMeta?.targetHandle ?? null,
      label: edge.label ?? '',
      data: edge.condition ?? {},
      style: edge.uiMeta?.style ?? { strokeWidth: 2 },
      animated: edge.uiMeta?.animated ?? false,
      markerEnd: edge.uiMeta?.markerEnd ?? 'arrowclosed',
    };
  }

  /**
   * Resolve the NodeType from a FE type string.
   * Falls back to SEND_TEXT if unknown.
   */
  static resolveNodeType(feType: string): NodeType {
    return FE_TYPE_TO_NODE_TYPE[feType] ?? NodeType.SEND_TEXT;
  }
}

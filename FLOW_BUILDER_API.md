# Flow Builder API Documentation

## Overview

- Base URL: `http://localhost:3000/api`
- Auth: JWT Bearer token — all endpoints require `Authorization: Bearer <token>`
- All responses follow the shape: `{ success, message, data, error }`

---

## Section 1: Authentication (Prerequisite)

Login to obtain a token before calling any Flow Builder endpoint.

**POST /api/auth/login**

```json
{
  "email": "admin@example.com",
  "password": "Admin@123"
}
```

Response:

```json
{
  "data": {
    "access_token": "eyJhbGci...",
    "user": { "id": 1 }
  }
}
```

Use the `access_token` value as the Bearer token in all subsequent requests.

---

## Section 2: Flow Builder Endpoints

### 2.1 Create Flow

**POST /api/flows**

```json
{
  "name": "Welcome Bot",
  "triggerType": "keyword",
  "triggerConfig": { "keywords": ["hello", "hi"], "matchMode": "contains" },
  "description": "Greets new users",
  "rateLimitPerUser": 0,
  "language": "en"
}
```

Response:

```json
{
  "data": {
    "id": 6,
    "name": "Welcome Bot",
    "status": "draft",
    "triggerType": "keyword"
  }
}
```

---

### 2.2 List All Flows

**GET /api/flows?page=1&limit=10&search=welcome&status=active**

Response:

```json
{
  "data": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "data": [...]
  }
}
```

---

### 2.3 Get Single Flow

**GET /api/flows/1**

Response:

```json
{
  "data": {
    "id": 1,
    "name": "Welcome & Onboarding Flow",
    "nodes": [...],
    "edges": [...]
  }
}
```

---

### 2.4 Update Flow Metadata

**PATCH /api/flows/1**

```json
{
  "name": "Updated Name",
  "description": "New description",
  "rateLimitPerUser": 300
}
```

---

### 2.5 Update Flow Status

**PATCH /api/flows/1/status**

```json
{ "status": "active" }
```

Validates the graph before activating. If invalid, returns `400` with an error list.

Valid values: `draft` | `active` | `paused` | `archived`

---

### 2.6 Delete Flow

**DELETE /api/flows/1**

Removes the flow and all associated nodes, edges, and executions (cascade delete).

---

### 2.7 Get Flow Graph (Frontend Canvas Format)

**GET /api/flows/1/graph**

Response:

```json
{
  "data": {
    "flow": { "id": 1, "name": "...", "status": "active", "triggerConfig": {} },
    "nodes": [
      {
        "id": "trigger-1",
        "type": "trigger",
        "position": { "x": 250, "y": 50 },
        "data": { "label": "Automation Entry", "keywords": ["hello"] }
      },
      {
        "id": "sendMessage-1",
        "type": "sendMessage",
        "position": { "x": 630, "y": 93 },
        "data": { "label": "Send Message", "message": "Hello {{contact.name}}!" }
      }
    ],
    "edges": [
      {
        "id": "e-trigger-1-sendMessage-1",
        "source": "trigger-1",
        "target": "sendMessage-1",
        "sourceHandle": null
      }
    ]
  }
}
```

---

### 2.8 Save Flow Graph — POST

**POST /api/flows/6/graph**

Accepts the exact Vue Flow format from the frontend canvas.

```json
{
  "name": "Welcome Bot",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "position": { "x": 250, "y": 50 },
      "data": { "label": "Automation Entry", "keywords": ["hello", "hi"], "matchMode": "contains" }
    },
    {
      "id": "sendMessage-1",
      "type": "sendMessage",
      "position": { "x": 630, "y": 200 },
      "data": { "label": "Send Welcome", "message": "Hello {{contact.name}}! Welcome to AcmeCorp 👋" }
    },
    {
      "id": "end-1",
      "type": "end",
      "position": { "x": 630, "y": 380 },
      "data": { "label": "End" }
    }
  ],
  "edges": [
    {
      "id": "e-trigger-1-sendMessage-1",
      "source": "trigger-1",
      "target": "sendMessage-1",
      "sourceHandle": null,
      "targetHandle": null,
      "type": "default",
      "data": {},
      "label": "",
      "markerEnd": "arrowclosed",
      "style": { "strokeWidth": 2 },
      "animated": false
    },
    {
      "id": "e-sendMessage-1-end-1",
      "source": "sendMessage-1",
      "target": "end-1",
      "sourceHandle": null,
      "targetHandle": null,
      "type": "default",
      "data": {},
      "label": "",
      "markerEnd": "arrowclosed",
      "style": { "strokeWidth": 2 },
      "animated": false
    }
  ]
}
```

---

### 2.9 Save Flow Graph — PUT

**PUT /api/flows/6/graph**

Same body as POST above. Both POST and PUT are supported for saving the canvas graph.

---

### 2.10 Validate Flow

**GET /api/flows/1/validate**

Success response:

```json
{
  "data": {
    "valid": true,
    "errors": [],
    "warnings": ["No FALLBACK node — unmatched inputs will have no response."],
    "graph": { "flow": {}, "nodes": [], "edges": [] }
  }
}
```

Error response:

```json
{
  "data": {
    "valid": false,
    "errors": [
      "Flow must have exactly 1 trigger node.",
      "Node 'sendMessage-1' (send_text): message is required."
    ]
  }
}
```

---

### 2.11 Simulate Flow (Test Without WhatsApp)

**POST /api/flows/1/simulate**

```json
{
  "triggerMessage": "hello",
  "contactPhone": "+919824160403",
  "variables": {
    "contact": {
      "name": "Rahul Sharma",
      "phone": "+919824160403",
      "email": "rahul@example.com"
    }
  }
}
```

Response:

```json
{
  "data": {
    "executionId": 25,
    "flowId": 1,
    "isSimulation": true,
    "totalSteps": 4,
    "steps": [
      { "nodeKey": "trigger_1", "nodeType": "trigger", "label": "Keyword Trigger", "result": { "triggered": true, "message": "hello" } },
      { "nodeKey": "welcome_msg", "nodeType": "send_text", "label": "Welcome Message", "config": { "message": "👋 Welcome to AcmeCorp! Hi Rahul Sharma" }, "result": { "sent": true, "message": "👋 Welcome to AcmeCorp! Hi Rahul Sharma" } },
      { "nodeKey": "menu_buttons", "nodeType": "send_buttons", "label": "Main Menu", "result": { "sent": true } },
      { "nodeKey": "end_1", "nodeType": "end", "label": "End", "result": { "completed": true } }
    ],
    "variables": {
      "contact": { "name": "Rahul Sharma", "phone": "+919824160403" },
      "message": "hello"
    }
  }
}
```

---

### 2.12 Get Analytics

**GET /api/flows/1/analytics?days=7**

Response:

```json
{
  "data": {
    "flowId": 1,
    "period": "7 days",
    "totals": {
      "totalTriggers": 383,
      "totalCompleted": 333,
      "totalFailed": 13,
      "totalDropped": 37
    },
    "conversionRate": "86.95%",
    "dropOffRate": "9.66%",
    "daily": [
      { "date": "2026-04-21", "totalTriggers": 45, "totalCompleted": 38, "totalFailed": 2, "totalDropped": 5 },
      { "date": "2026-04-22", "totalTriggers": 62, "totalCompleted": 54, "totalFailed": 1, "totalDropped": 7 }
    ]
  }
}
```

---

### 2.13 Get Execution History

**GET /api/flows/1/executions?page=1&limit=20**

Response:

```json
{
  "data": {
    "total": 20,
    "page": 1,
    "limit": 20,
    "data": [
      {
        "id": 1,
        "flowId": 1,
        "contactPhone": "+919824160403",
        "chatId": "919824160403@c.us",
        "status": "completed",
        "abVariant": null,
        "isSimulation": false,
        "completedAt": "2026-04-27T10:30:00Z",
        "createdAt": "2026-04-27T10:29:55Z"
      }
    ]
  }
}
```

---

### 2.14 Get Execution Detail (With Step Log)

**GET /api/flows/executions/1**

Response:

```json
{
  "data": {
    "id": 1,
    "flowId": 1,
    "contactPhone": "+919824160403",
    "status": "completed",
    "variables": { "contact": { "name": "Rahul", "phone": "+919824160403" } },
    "steps": [
      { "id": 1, "nodeKey": "trigger_1", "nodeType": "trigger", "status": "executed", "durationMs": 2, "output": { "triggered": true } },
      { "id": 2, "nodeKey": "welcome_msg", "nodeType": "send_text", "status": "executed", "durationMs": 245, "output": { "sent": true } },
      { "id": 3, "nodeKey": "end_1", "nodeType": "end", "status": "executed", "durationMs": 1, "output": { "completed": true } }
    ]
  }
}
```

---

### 2.15 Get Templates

**GET /api/flows/templates**

Response:

```json
{
  "data": [
    { "id": 1, "name": "Welcome Flow Template", "isTemplate": true }
  ]
}
```

---

### 2.16 Clone Template

**POST /api/flows/templates/1/clone**

```json
{ "name": "My Welcome Flow" }
```

Response:

```json
{
  "data": { "id": 7, "name": "My Welcome Flow", "status": "draft" }
}
```

---

## Section 3: Node Types Reference

| FE Type String | DB Type | Required Config Fields |
|---|---|---|
| `trigger` | `trigger` | `keywords[]`, `matchMode` |
| `sendMessage` | `send_text` | `message` |
| `sendButtons` | `send_buttons` | `message`, `buttons[{id, text}]` (max 3) |
| `sendList` | `send_list` | `message`, `buttonText`, `sections[{title, rows[{id, title, description}]}]` |
| `sendImage` | `send_image` | `url`, `caption` (optional) |
| `sendVideo` | `send_video` | `url`, `caption` (optional) |
| `sendAudio` | `send_audio` | `url` |
| `sendFile` | `send_file` | `url`, `filename` |
| `sendTemplate` | `send_template` | `message` |
| `condition` | `condition` | `field`, `operator`, `value` |
| `delay` | `delay` | `delaySeconds` (>0), `message` (optional) |
| `randomSplit` | `random_split` | `branches[]` (min 2) |
| `abTest` | `ab_test` | `variantA` (weight%), `variantB` (weight%) |
| `setVariable` | `set_variable` | `variableName`, `value` |
| `addTag` | `add_tag` | `tagName` |
| `removeTag` | `remove_tag` | `tagName` |
| `assignAgent` | `assign_agent` | `team`, `priority` |
| `webhookCall` | `webhook_call` | `url`, `method`, `headers`, `body`, `saveResponseAs` |
| `jumpToFlow` | `jump_to_flow` | `targetFlowId` |
| `collectInput` | `collect_input` | `message`, `variableName`, `timeout` (seconds) |
| `waitForInput` | `wait_for_input` | `variableName`, `timeout` (seconds) |
| `end` | `end` | _(none)_ |
| `fallback` | `fallback` | `message` |

---

## Section 4: Condition Operators

The `field` value uses dot-notation into the variables object (e.g. `contact.name`, `message`, `orderId`).

| Operator | Description |
|---|---|
| `equals` | Exact match |
| `not_equals` | Does not match |
| `contains` | String contains value |
| `not_contains` | String does not contain value |
| `starts_with` | String starts with value |
| `ends_with` | String ends with value |
| `greater_than` | Numeric greater than |
| `less_than` | Numeric less than |
| `is_empty` | Field is null/empty |
| `is_not_empty` | Field has a value |

---

## Section 5: Template Variables

Use `{{variable}}` syntax in any message field.

| Variable | Description |
|---|---|
| `{{contact.name}}` | Contact's display name |
| `{{contact.phone}}` | Contact's phone number |
| `{{contact.email}}` | Contact's email address |
| `{{message}}` | The triggering message text |
| `{{anyCustomVariable}}` | Any variable set via a `set_variable` node |
| `{{webhookResponse.field}}` | Field from a webhook response (requires `saveResponseAs`) |
| `{{orderData.status}}` | Example nested variable |
| `{{bookingConfirmation.ref}}` | Example nested variable |

---

## Section 6: Trigger Types

| `triggerType` Value | When It Fires |
|---|---|
| `keyword` | Message contains/matches configured keywords |
| `any_message` | Every incoming message |
| `first_message` | First ever message from a contact |
| `button_reply` | When contact taps a specific button ID |
| `scheduled` | _(future)_ Scheduled time-based trigger |
| `webhook` | _(future)_ External webhook call |
| `contact_tag` | _(future)_ When a tag is added to a contact |

---

## Section 7: Flow Status Values

| Status | Meaning |
|---|---|
| `draft` | Not active — can be edited freely |
| `active` | Live — matches incoming WhatsApp messages |
| `paused` | Temporarily disabled — not matching messages |
| `archived` | Permanently disabled |

Transitioning from `draft` → `active` runs full graph validation. Returns `400` with error list if invalid.

---

## Section 8: Step-by-Step Testing Guide

### Step 1 — Start the server

```bash
npm run start:dev
```

Wait for seed logs:

```
✓ Admin role created
✓ Flow seeded: "Welcome & Onboarding Flow" (10 nodes, 10 edges)
✓ Flow Builder seed complete
```

### Step 2 — Get auth token

```
POST http://localhost:3000/api/auth/login
{ "email": "admin@example.com", "password": "Admin@123" }
```

Copy `access_token` from the response.

### Step 3 — Verify seeded flows exist

```
GET http://localhost:3000/api/flows
Authorization: Bearer <token>
```

Should return 5 flows.

### Step 4 — Create a new flow

```
POST http://localhost:3000/api/flows
Authorization: Bearer <token>
```

```json
{
  "name": "My Test Bot",
  "triggerType": "keyword",
  "triggerConfig": { "keywords": ["test", "demo"], "matchMode": "contains" }
}
```

Note the returned `id` (e.g. `6`).

### Step 5 — Save canvas nodes and edges

```
POST http://localhost:3000/api/flows/6/graph
Authorization: Bearer <token>
```

```json
{
  "name": "My Test Bot",
  "nodes": [
    { "id": "trigger-1", "type": "trigger", "position": {"x": 250, "y": 50}, "data": { "label": "Start", "keywords": ["test","demo"], "matchMode": "contains" } },
    { "id": "msg-1", "type": "sendMessage", "position": {"x": 250, "y": 220}, "data": { "label": "Reply", "message": "Hi {{contact.name}}! This is a test reply from the bot 🤖" } },
    { "id": "end-1", "type": "end", "position": {"x": 250, "y": 390}, "data": { "label": "Done" } }
  ],
  "edges": [
    { "id": "e1", "source": "trigger-1", "target": "msg-1", "sourceHandle": null, "targetHandle": null, "type": "default", "data": {}, "label": "", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false },
    { "id": "e2", "source": "msg-1", "target": "end-1", "sourceHandle": null, "targetHandle": null, "type": "default", "data": {}, "label": "", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false }
  ]
}
```

Returns the full graph in Vue Flow format.

### Step 6 — Load canvas back (verify round-trip)

```
GET http://localhost:3000/api/flows/6/graph
```

Returns nodes/edges in exact Vue Flow format — pass directly to `useVueFlow()`.

### Step 7 — Validate the flow

```
GET http://localhost:3000/api/flows/6/validate
```

Expected: `{ "valid": true, "errors": [], "warnings": ["No FALLBACK node..."] }`

### Step 8 — Simulate without WhatsApp

```
POST http://localhost:3000/api/flows/6/simulate
```

```json
{
  "triggerMessage": "test",
  "contactPhone": "+919824160403",
  "variables": { "contact": { "name": "Rahul", "phone": "+919824160403" } }
}
```

Returns a step-by-step trace. Verify the `message` field has `{{contact.name}}` resolved to `"Rahul"`.

### Step 9 — Activate the flow

```
PATCH http://localhost:3000/api/flows/6/status
{ "status": "active" }
```

Flow is now live and will respond to WhatsApp messages.

### Step 10 — Connect WhatsApp

```
POST http://localhost:3000/api/whatsapp/start
GET  http://localhost:3000/api/whatsapp/qr
```

Scan the QR code image with WhatsApp on your phone.

### Step 11 — Test with real WhatsApp

Send `"test"` or `"demo"` from any phone to your connected number.

Expected bot reply: `"Hi <YourName>! This is a test reply from the bot 🤖"`

Watch server logs for:

```
[FlowTrigger] Processing message userId=1 chatId=91xxx@c.us body="test"
[FlowExecutor] ✅ Matched flow "My Test Bot" (id=6)
[FlowExecutor] Execution #26 completed
```

### Step 12 — Check analytics

```
GET http://localhost:3000/api/flows/6/analytics?days=7
```

Shows trigger count, completion rate, and drop-off.

### Step 13 — View execution history

```
GET http://localhost:3000/api/flows/6/executions
GET http://localhost:3000/api/flows/executions/26
```

The second request returns the full step-by-step log for execution `#26`.

### Step 14 — Pause the flow

```
PATCH http://localhost:3000/api/flows/6/status
{ "status": "paused" }
```

Flow stops responding to messages.

### Step 15 — Delete the flow

```
DELETE http://localhost:3000/api/flows/6
```

Removes the flow, all nodes, edges, and executions (cascade).

---

## Section 9: Seeded Test Flows

These flows are available immediately after running the seed.

**Flow 1 — "Welcome & Onboarding Flow"** (`id=1`, status: `active`)
- Trigger keywords: `hi`, `hello`, `start`, `hey`
- Path: Welcome msg → Menu buttons → [Register?] → Collect name → Confirm → Tag → End
- Alternate path: [Other] → Fallback → End

**Flow 2 — "Customer Support Flow"** (`id=2`, status: `active`)
- Trigger keywords: `support`, `help`, `issue`, `problem`, `complaint`
- Path: Intro → Issue list → [Billing?] → Delay → Webhook → Ticket confirm → End
- Alternate: [Technical?] → Collect description → Ack → Assign agent → End
- Alternate: [Other] → Fallback → End

**Flow 3 — "Pricing & Lead Capture A/B Test"** (`id=3`, status: `active`)
- Trigger keywords: `pricing`, `price`, `plans`, `cost`, `how much`
- A/B Split 50/50:
  - Variant A: Show full pricing table → CTA buttons → Tag → End
  - Variant B: Qualify (ask contact count) → Personalised rec → CTA → Tag → End

**Flow 4 — "Order Status Tracker"** (`id=4`, status: `active`)
- Trigger keywords: `order`, `track`, `delivery`, `status`, `where is my`
- Path: Ask order ID → [Valid ORD-xxx?] → Webhook fetch → Status message → More help → End
- Alternate: [Invalid] → Error message → More help → End

**Flow 5 — "Appointment Booking Flow"** (`id=5`, status: `draft`)
- Trigger keywords: `book`, `appointment`, `schedule`, `meeting`, `demo`
- Path: Intro → Service list → Save service → Ask date → Ask time → Webhook → Confirm → Tag → End
- Note: Status is `draft` — activate first with `PATCH /api/flows/5/status { "status": "active" }`

---

## Section 10: Rate Limit Reset

If a flow triggered once but won't trigger again, the per-user rate limit may be active.

Fix with SQL:

```sql
-- Remove rate limit record for a specific flow
DELETE FROM flow_rate_limits WHERE flow_id = 1;

-- Or disable rate limiting entirely on the flow
UPDATE flows SET rate_limit_per_user = 0 WHERE id = 1;
```

---

## Section 11: Complex Flow Example — Multi-Step With Condition

### Create the flow

```
POST /api/flows
```

```json
{
  "name": "Lead Qualifier",
  "triggerType": "keyword",
  "triggerConfig": { "keywords": ["interested", "buy", "purchase"], "matchMode": "contains" }
}
```

Returns `id = 7`.

### Save the graph

```
POST /api/flows/7/graph
```

```json
{
  "name": "Lead Qualifier",
  "nodes": [
    { "id": "t1", "type": "trigger", "position": {"x": 300, "y": 50}, "data": { "label": "Interest Trigger", "keywords": ["interested","buy","purchase"], "matchMode": "contains" } },
    { "id": "q1", "type": "collectInput", "position": {"x": 300, "y": 200}, "data": { "label": "Ask Budget", "message": "Great! What is your monthly budget? (e.g. $500, $1000, $5000+)", "variableName": "budget", "timeout": 120 } },
    { "id": "c1", "type": "condition", "position": {"x": 300, "y": 380}, "data": { "label": "High Value?", "field": "budget", "operator": "contains", "value": "5000" } },
    { "id": "m1", "type": "sendMessage", "position": {"x": 100, "y": 560}, "data": { "label": "Enterprise Pitch", "message": "🏆 You qualify for our *Enterprise Plan*!\n\nLet me connect you with our sales team right away." } },
    { "id": "a1", "type": "assignAgent", "position": {"x": 100, "y": 730}, "data": { "label": "Assign Sales", "team": "enterprise-sales", "priority": "high" } },
    { "id": "m2", "type": "sendMessage", "position": {"x": 500, "y": 560}, "data": { "label": "Standard Pitch", "message": "💼 Based on your budget, our *Growth Plan* at $79/mo is perfect for you!\n\nReply *demo* to see it in action." } },
    { "id": "tag1", "type": "addTag", "position": {"x": 300, "y": 900}, "data": { "label": "Tag Lead", "tagName": "qualified-lead" } },
    { "id": "end1", "type": "end", "position": {"x": 300, "y": 1050}, "data": { "label": "End" } }
  ],
  "edges": [
    { "id": "e1", "source": "t1", "target": "q1", "sourceHandle": null, "targetHandle": null, "type": "default", "data": {}, "label": "", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false },
    { "id": "e2", "source": "q1", "target": "c1", "sourceHandle": null, "targetHandle": null, "type": "default", "data": {}, "label": "", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false },
    { "id": "e3", "source": "c1", "target": "m1", "sourceHandle": "yes", "targetHandle": null, "type": "default", "data": {}, "label": "High Value", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false },
    { "id": "e4", "source": "c1", "target": "m2", "sourceHandle": "no", "targetHandle": null, "type": "default", "data": {}, "label": "Standard", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false },
    { "id": "e5", "source": "m1", "target": "a1", "sourceHandle": null, "targetHandle": null, "type": "default", "data": {}, "label": "", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false },
    { "id": "e6", "source": "a1", "target": "tag1", "sourceHandle": null, "targetHandle": null, "type": "default", "data": {}, "label": "", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false },
    { "id": "e7", "source": "m2", "target": "tag1", "sourceHandle": null, "targetHandle": null, "type": "default", "data": {}, "label": "", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false },
    { "id": "e8", "source": "tag1", "target": "end1", "sourceHandle": null, "targetHandle": null, "type": "default", "data": {}, "label": "", "markerEnd": "arrowclosed", "style": {"strokeWidth": 2}, "animated": false }
  ]
}
```

### Simulate it

```
POST /api/flows/7/simulate
```

```json
{
  "triggerMessage": "interested",
  "variables": {
    "contact": { "name": "Priya", "phone": "+917698175157" },
    "budget": "$5000+"
  }
}
```

Condition evaluates `true` → Enterprise path → `assign_agent` step executed.

### Activate it

```
PATCH /api/flows/7/status
{ "status": "active" }
```

Now live. Send `"interested"` on WhatsApp → bot asks for budget → routes based on answer.

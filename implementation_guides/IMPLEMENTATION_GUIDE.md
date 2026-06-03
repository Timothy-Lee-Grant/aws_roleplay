# CloudRealm — Implementation Guide
### Complete Roadmap from Current State to World-Class AWS Education Game

*Written after a full audit of every file in the codebase. Nothing in this document is aspirational padding — every item has been thought through against the actual code.*

---

## Part 1 — Current State Audit

### What is working

The core gameplay loop is functional. The canvas renders an 11×9 hex grid with four distinct terrain zones. Services can be selected from the palette and placed on valid tiles. The click-to-select → click-to-place interaction is reliable. Zoom toward cursor and alt+drag pan both work. The three missions check in real time. The gold economy deducts on placement and refunds 50% on removal. All 12 service sprites have idle animations driven by `Math.sin(t)`. Animated connection lines flow between adjacent compatible services. Toast notifications explain placement failures.

The underlying architecture is solid. The `game/` folder is pure functions. The Zustand store is the single source of truth. The RAF loop reads state via refs so it never restarts on state changes. The camera transform is correctly applied so all world-space drawing code is coordinate-agnostic.

### Bugs and technical debt

**Bug 1 — Duplicate dead code.** `drawGrid()` and `drawConnections()` are exported from `src/game/hexGrid.js` and never imported anywhere. `GameBoard.jsx` has its own internal versions of both. The hexGrid.js versions should be deleted. `TERRAIN_COLOR` and `TERRAIN_STROKE` in `constants.js` are also imported by hexGrid.js but only used by `drawGrid()` which is dead code — both can be removed once dead code is cleaned up.

**Bug 2 — No HiDPI / Retina support.** The canvas is sized in CSS pixels: `canvas.width = canvas.clientWidth`. On a Retina display (`devicePixelRatio = 2`), this makes every drawn pixel 2×2 physical pixels — the entire game looks blurry. Fix:
```js
const dpr = window.devicePixelRatio || 1
canvas.width  = canvas.clientWidth  * dpr
canvas.height = canvas.clientHeight * dpr
ctx.scale(dpr, dpr)
```
Apply this in the ResizeObserver callback and reset the `ctx.scale(dpr, dpr)` after every `clearRect` (since scale is part of the canvas state that gets cleared). Without this fix, the game looks unpolished on every modern laptop.

**Bug 3 — `completedMissions` is a `Set`, not a plain value.** Zustand tracks state changes by shallow equality comparison. `new Set()` and a mutated Set are the same object reference, so Zustand cannot detect when the set changes via `.add()`. The current code creates a *new* Set (`const next = new Set(completedMissions); next.add(id)`) which is correct, but this is fragile and trips up React DevTools, serialisation, and persistence. Replace with an array:
```js
completedMissions: [],   // IDs of completed missions
// Check: completedMissions.includes(id)
// Add:   [...completedMissions, id]
```

**Bug 4 — `Cinzel` font in canvas toast unreliable.** The toast draws text with `ctx.font = '13px Cinzel, serif'`. Canvas font strings require the font to already be loaded in the browser before the canvas sees it. Google Fonts loads asynchronously, so on fast first frames the canvas falls back to `serif`. Use `document.fonts.ready` to ensure fonts are loaded before the first draw, or use a system font for canvas text.

**Bug 5 — `pixelToHex` has imprecision at hex boundaries.** The current inverse hex formula uses `Math.round(py / ROW_STEP)` as the row estimate, but hex rows overlap by `R * 0.5` so the simple round produces the wrong tile when the cursor is in the overlap band between rows. This is visible as a ~10px dead zone at the top/bottom of some tiles. A proper fix uses axial coordinate cube-rounding. For now, users experience occasional missed clicks near tile edges.

**Bug 6 — `placeService` does not guard against out-of-bounds row/col.** If `pixelToHex` returns a clamped coord at the grid edge and the user clicks the outer void, `grid[row][col]` will exist (it's an outside tile) but this should be validated more defensively. Currently it silently fails because `canPlaceHere('outside', svcDef)` returns false.

**Bug 7 — No drag detection threshold.** The `handleClick` guard `if (dragRef.current) return` only fires if the user holds the mouse down (triggering mousedown with altKey) and then releases on the same click event. A user who alt+clicks without moving will have `dragRef.current = null` by the time the click fires (mouseup sets it to null), so they accidentally place a service. The drag guard needs a pixel-distance threshold: if total drag distance < 5px, treat as a click anyway.

### AWS accuracy gaps in the current model

These are places where the game's mechanics diverge from how AWS actually works. They matter because the game's educational purpose depends on accuracy.

**Gap 1 — IGW is not placed "on a tile".** In real AWS, an Internet Gateway is *attached to a VPC* — it's a VPC-level resource, not a subnet-level one. Placing it on a wall tile implies it's physically in the VPC perimeter, which is conceptually close but misleading. The better model: IGW should be placed *outside* the VPC wall (in the Outer Realm zone, adjacent to a gate tile) to represent it sitting at the edge of AWS infrastructure.

**Gap 2 — Security Groups are completely absent.** In real AWS, just being in the same subnet does NOT mean two services can communicate. Every EC2 instance, RDS instance, Lambda VPC config, and ALB has a Security Group that defines which IP ranges and ports are allowed in and out. Without this mechanic, the game teaches that "adjacent = connected," which is wrong. Security Groups are one of the most common sources of confusion and production bugs in real AWS environments. They must be a game mechanic.

**Gap 3 — Route Tables are absent.** A public subnet is not public because of magic — it's public because its route table has an entry `0.0.0.0/0 → igw-xxxxxxxx`. A private subnet routes `0.0.0.0/0 → nat-xxxxxxxx`. Without this, players don't understand why their EC2 instance has no internet access even with an IGW "placed."

**Gap 4 — S3 is not a VPC resource.** S3 is a regional AWS service, not a resource that lives inside a VPC subnet. Placing S3 in the "private subnet" teaches the wrong mental model. Real AWS: S3 is accessed from a VPC either via the public internet (through NAT/IGW), or — better — via a **VPC Endpoint** (Gateway type). VPC Endpoints are themselves a crucial concept. S3 should be placed *outside* the VPC, connected by a special "Endpoint" connector.

**Gap 5 — CloudFront is not in a VPC subnet.** CloudFront is a global edge network. It does not live in a VPC. Placing it in the public subnet implies it's a compute resource sitting in your AWS account's network, which is incorrect. CloudFront should be in the Outer Realm zone, representing its position at the internet edge, outside your VPC entirely.

**Gap 6 — Lambda's VPC placement is oversimplified.** Lambda functions can run either inside a VPC (in which case they need an ENI and a subnet) or outside a VPC (which is the default, and actually has better cold start performance and internet access without NAT). The game currently forces Lambda into the private subnet, which is only correct for Lambdas that need to access private VPC resources like RDS.

**Gap 7 — No Availability Zone concept.** Every real production AWS architecture deploys resources across multiple Availability Zones for fault tolerance. Currently the board represents a single-AZ flat network. A high-availability deployment looks completely different from a single-AZ one — and the SAA-C03 exam heavily tests this distinction.

**Gap 8 — NAT Gateway cost model is misleading.** NAT GW costs `$0.045/hr` plus `$0.045/GB` of data processed. Assigning it a flat `10🪙/hr` hides the data transfer cost that makes NAT GW expensive at scale. The game should eventually model both components.

**Gap 9 — Connection graph is directional but shown as undirected.** In real AWS, traffic flows in a specific direction. CloudFront *requests from* S3 — S3 doesn't push to CloudFront. Lambda *is triggered by* SQS — Lambda doesn't subscribe to SQS proactively. The connection arrows should show directionality. Bidirectional connections (EC2 ↔ RDS: EC2 writes to and reads from RDS) should show arrows on both ends. This directionality matters for understanding IAM permissions and network ACLs.

---

## Part 2 — Immediate Fixes (Before Adding Features)

Do these before any new feature work. They are quick and prevent confusion.

**1. Clean up dead code in hexGrid.js**
Remove the exported `drawGrid()` and `drawConnections()` functions and their dependencies (`TERRAIN_COLOR`, `TERRAIN_STROKE` imports). This reduces cognitive overhead and eliminates the confusion of two `drawConnections` implementations.

**2. Fix HiDPI canvas** (2 hours)
Apply `devicePixelRatio` scaling in the ResizeObserver. This is the single most visible visual quality improvement possible right now.

**3. Replace `Set` with array for `completedMissions`**
Change `new Set()` to `[]`, `.has(id)` to `.includes(id)`, and the new Set construction to `[...completedMissions, id]`. 30 minutes. Eliminates a class of subtle Zustand state-tracking bugs.

**4. Add zone labels to the canvas**
The board currently has no text labels. A player new to the game cannot tell which green tiles are "public" and which teal tiles are "private." Draw small text labels (using the canvas, in world space, after the terrain draw pass): "PUBLIC SUBNET" centred over the green zone, "PRIVATE SUBNET" centred over the teal zone, "VPC WALL" on the wall tiles. Use a small, legible font at low opacity so they don't dominate the visuals.

**5. Fix `pixelToHex` precision**
Implement proper axial cube-coordinate hex rounding. The algorithm:
```js
// Convert offset pixel to axial coords, round in cube space, convert back
function pixelToHexPrecise(wx, wy) {
  const px = wx - BOARD_PAD_X
  const py = wy - BOARD_PAD_Y
  const q = (2/3 * px) / HEX_R
  const r_axial = (-1/3 * px + Math.sqrt(3)/3 * py) / HEX_R
  // cube round
  let x = q, z = r_axial, y = -x - z
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z)
  const xd = Math.abs(rx-x), yd = Math.abs(ry-y), zd = Math.abs(rz-z)
  if (xd > yd && xd > zd) rx = -ry-rz
  else if (yd > zd) ry = -rx-rz
  else rz = -rx-ry
  // convert axial back to offset
  const col = rx + (rz - (rz & 1)) / 2
  const row = rz
  return { row: Math.max(0, Math.min(ROWS-1, row)), col: Math.max(0, Math.min(COLS-1, col)) }
}
```

---

## Part 3 — Phase 1: Foundation Completion

*Goal: a complete, polished, playable game with proper structure and 15+ missions. No new major systems needed yet — just filling out what's already scaffolded.*

### 3.1 Game Phase State Machine

The store currently has no phase concept. Add it:

```js
// In gameStore.js
phase: 'title',  // 'title' | 'build' | 'wave' | 'debrief'
```

The `App.jsx` renders the appropriate top-level component based on phase. This enables proper screens: a title/splash screen, the main game, and a post-mission debrief. The state machine is the foundation everything else builds on.

Transitions:
- `title → build`: player clicks "Begin the Siege"
- `build → wave`: player clicks "Unleash the Traffic" (sends simulated requests through the architecture)
- `wave → debrief`: traffic simulation completes, score calculated
- `debrief → build`: player clicks "Reinforce the Kingdom" (next mission)

### 3.2 Title Screen

A simple but atmospheric opening screen. Shows the CloudRealm logo, the fantasy map as a background (rendered in canvas, no services placed, just terrain), and three options: New Game, Continue, and How to Play. The "how to play" flow should be a 5-slide tutorial sequence that teaches the core loop.

### 3.3 Tutorial Sequence

Before Mission 1, walk the player through 5 steps:
1. "This is your VPC — the kingdom walls. Nothing enters without permission." (highlight the wall tiles)
2. "The public subnet faces the Outer Realm. Public services go here." (highlight green tiles)
3. "The private subnet is your Inner Sanctum. Databases and background workers go here." (highlight teal tiles)
4. "Click a service card on the left, then click a tile to place it." (force the player to place one EC2)
5. "Gold is your budget. Every service costs gold per hour — plan wisely." (show gold counter)

This should be an overlay system in React (not canvas), using a `tutorialStep` state in the store to control which tooltip is visible and which area of the screen is highlighted.

### 3.4 Expanded Service Roster

Current: 12 services. Target: 22 for Phase 1. New additions:

| ID | Fantasy Name | AWS Service | Zone | Cost | Key Concept Taught |
|---|---|---|---|---|---|
| `route53` | The Cartographer | Route53 | outer | 3 | DNS, routing policies, health checks |
| `apigw` | The Drawbridge | API Gateway | public | 8 | REST/HTTP API front door, rate limiting |
| `sns` | The Herald | SNS | private | 1 | Fan-out pub/sub, topic subscriptions |
| `elasticache` | The Crystal Orb | ElastiCache | private | 18 | In-memory cache, Redis/Memcached |
| `eventbridge` | The Prophecy Engine | EventBridge | private | 2 | Event routing, scheduled rules, patterns |
| `waf` | The Ward | WAF | public | 12 | Web Application Firewall, OWASP rules |
| `cognito` | The Gatekeeper | Cognito | public | 4 | User authentication, JWT tokens |
| `cloudwatch` | The All-Seeing Eye | CloudWatch | any | 3 | Metrics, logs, alarms |
| `sg` | Permission Scroll | Security Group | any | 0 | Stateful firewall, inbound/outbound rules |
| `vpc_endpoint` | The Secret Passage | VPC Endpoint | wall | 0 | Private S3/DynamoDB access without NAT |

Each new service needs: a sprite function in `sprites.js`, an entry in `constants.js` SERVICES array, zone placement rules, and a connection graph entry.

### 3.5 Fifteen Missions for Phase 1

Current: 3 missions. Each mission must teach a specific, real AWS concept. Requirements must be enforced with precision — no mission should be completable with an architecturally incorrect setup.

**Mission 1 — The First Bastion** *(existing)*
Concept: IGW + ALB + EC2. Three-tier web entry point.

**Mission 2 — The Serverless Scout** *(existing)*
Concept: SQS → Lambda event-driven pipeline.

**Mission 3 — The Eternal Archive** *(existing)*
Concept: S3 origin → CloudFront CDN + RDS structured storage.

**Mission 4 — The Gatekeepers**
Concept: API Gateway as front door to Lambda.
Requirements: Place API Gateway (The Drawbridge) in public subnet. Place Lambda in private subnet. API Gateway and Lambda must be adjacent. Place an IAM Royal Decree adjacent to the Lambda (Lambda needs execution role).
*Teaches: API Gateway → Lambda integration, Lambda execution role requirement.*

**Mission 5 — The Herald's Network**
Concept: SNS fan-out to multiple SQS queues.
Requirements: Place SNS (The Herald) in private subnet. Place two SQS Raven Queues in private subnet. Both SQS tiles must be adjacent to the SNS tile.
*Teaches: SNS pub/sub fan-out, decoupled notification delivery to multiple consumers.*

**Mission 6 — The Warded Gate**
Concept: WAF in front of CloudFront.
Requirements: Place WAF (The Ward) in public subnet. Place CloudFront (Far Watcher) in public subnet. WAF and CloudFront must be adjacent. The CloudFront must also connect to S3 in private subnet.
*Teaches: WAF protects internet-facing services, CloudFront as origin shield.*

**Mission 7 — The Secret Passage**
Concept: VPC Endpoint for S3 (private access without NAT).
Requirements: Place S3 in private subnet. Place a VPC Endpoint (Secret Passage) on a wall tile. Lambda in private subnet adjacent to S3. No NAT Gateway deployed.
*Teaches: VPC Gateway Endpoints allow private resources to reach S3/DynamoDB without NAT, saving cost.*

**Mission 8 — The Crystal Memory**
Concept: ElastiCache in front of RDS.
Requirements: Place RDS in private subnet. Place ElastiCache (Crystal Orb) in private subnet. EC2 or Lambda must be adjacent to ElastiCache. ElastiCache must be adjacent to RDS.
*Teaches: Caching layer reduces database load. Reads hit cache first, only miss to RDS.*

**Mission 9 — The Cartographer's Map**
Concept: Route53 DNS routing.
Requirements: Place Route53 (The Cartographer) outside the VPC (in a new "edge" zone adjacent to the outer realm). Connect it to an ALB in the public subnet. ALB connects to at least two EC2 instances.
*Teaches: Route53 as the DNS entry point, routing traffic to load balancers.*

**Mission 10 — The Redundant Kingdom** *(Multi-AZ intro)*
Concept: High availability across multiple AZs.
Requirements: The board has two distinct subnet zones, labeled AZ-1 and AZ-2 (requires expanding the grid or showing a side-by-side layout). Deploy RDS in AZ-1 private subnet. Deploy a second RDS (read replica) in AZ-2 private subnet. Deploy ALB spanning both AZs.
*Teaches: Multi-AZ is the foundation of high availability. Stateful services (RDS) need cross-AZ replicas.*

**Mission 11 — The Gatekeeper's Decree**
Concept: Cognito for user authentication.
Requirements: Place Cognito (The Gatekeeper) in public subnet. Place API Gateway adjacent to Cognito. Place Lambda in private subnet adjacent to API Gateway. Lambda must have an IAM Royal Decree adjacent to it.
*Teaches: Cognito → API Gateway → Lambda auth flow. JWT validation at the API layer.*

**Mission 12 — The Watchful Eye**
Concept: CloudWatch monitoring.
Requirements: Deploy at least one EC2, one Lambda, and one RDS. Place CloudWatch (The All-Seeing Eye) tiles adjacent to all three. Add an IAM Royal Decree for CloudWatch.
*Teaches: Every service should have monitoring. CloudWatch needs IAM permissions to collect metrics from resources.*

**Mission 13 — The Siege Withstood** *(Traffic spike challenge)*
Concept: Auto Scaling Group.
Requirements: Place an ALB. Place at least 3 EC2 instances connected to the ALB. Place an Auto Scaling configuration tile adjacent to the EC2 cluster. The total EC2 instances behind ALB must be ≥ 3.
*Teaches: ASGs allow horizontal scaling under load. ALB distributes traffic across scaled instances.*

**Mission 14 — The Prophecy Fulfilled**
Concept: EventBridge for scheduled and event-driven workflows.
Requirements: Place EventBridge (Prophecy Engine) in private subnet. Connect to Lambda (for scheduled invocations). Connect to SNS (for event fan-out). Lambda must have IAM Decree.
*Teaches: EventBridge as the central event bus. Scheduled rules (cron), event patterns, and integration with Lambda/SNS.*

**Mission 15 — The Full Kingdom** *(Capstone)*
Concept: Complete production-grade three-tier architecture with proper security.
Requirements: IGW placed. Route53 connected to ALB. WAF in front of CloudFront. ALB routing to ECS cluster. ECS tasks reading from ElastiCache, with ElastiCache in front of RDS (Multi-AZ). Lambda processing SQS messages writing to DynamoDB. All services have IAM Decrees. CloudWatch monitoring all tiers.
*Teaches: How a real production system fits together. Every component has a reason.*

### 3.6 In-Game Service Encyclopedia

Every service card in the palette should be expandable — clicking an "info" icon shows a panel with:
- What this AWS service actually is (2-3 sentences)
- Common use cases (3 bullet points)
- Why it lives in this zone (public/private explanation)
- Real AWS pricing summary
- Connection to the fantasy character (why is Lambda a ninja?)

This is the single most important learning feature to add early. Players will place services they don't understand, see them fail mission requirements, and click info to understand why. This is exactly the learning loop we want.

### 3.7 Architecture Feedback Panel

After placing a set of services, a real-time panel should show:
- **What your current architecture does** — a plain-language description generated from the placed services ("Your architecture has an internet-accessible web tier with EC2 behind a load balancer, connected to a private database...")
- **Anti-patterns detected** — if a player places RDS in the public subnet, immediately flag it: "⚠️ The Great Library is exposed to the Outer Realm. Real databases should never be publicly accessible."
- **Missing components** — "Your EC2 instance has no path to the Outer Realm. Did you forget the Iron Gate (Internet Gateway)?"

Implement this as a `validateArchitecture(grid, placed)` pure function in a new `src/game/validator.js` file. It takes the current state and returns an array of `{ severity, code, message }` objects.

---

## Part 4 — Phase 2: The Living World

*Goal: the board feels alive. Traffic flows. Services animate in response to game events. There is a wave phase with actual simulation.*

### 4.1 Data Packet Visualization

The most impactful visual feature for teaching is watching data flow through the architecture you've built. A "request" enters the system from the Outer Realm, follows valid connections through your services, and either succeeds or fails based on your architecture.

**Implementation:**
```js
// A packet is a point moving along a path of hexCenter positions
const packet = {
  path: [{ x, y }, { x, y }, ...],  // world-space waypoints
  progress: 0,      // 0.0 to path.length
  speed: 0.8,       // tiles per second
  type: 'request',  // 'request' | 'response' | 'event' | 'error'
  color: '#6af',
}
```

Each frame, advance `progress += speed * deltaMs / 1000`. The packet's current position is `lerp(path[floor(progress)], path[ceil(progress)], frac(progress))`.

Packets are drawn in the RAF loop after sprites, before UI overlays. A small circle with a trail (decreasing opacity ellipses behind it).

**Traffic scenarios to simulate:**
- HTTP Request: enters at IGW → ALB → EC2 → RDS → response returns
- Lambda invocation: SQS message → Lambda → DynamoDB write
- S3 GET via CloudFront: user → CloudFront → S3 (cache miss) or CloudFront only (cache hit)
- Failed request: enters at IGW → reaches EC2 with no SG → red packet with X animation

### 4.2 Walking Characters

Each placed service should have a secondary "active" animation that plays when a packet reaches it.

- **Lambda**: materialises fully (flash to 100% opacity), does a quick movement animation, then fades back to flicker
- **EC2**: raises sword briefly, then returns to breathing idle
- **RDS**: window glow pulses bright white, then settles back to warm amber
- **SQS**: raven takes flight, arcs toward the connected Lambda, then returns
- **ALB**: shield does a quick rotate/flash showing "routing"

Implementation: the simulation system emits `SERVICE_ACTIVATED` events. The canvas draw loop checks a `activeAnimations` map (keyed by `row,col`) and drives the activation animation based on elapsed time since activation.

### 4.3 Threat System

Threats are the "attack wave" of the game. If your architecture has vulnerabilities, threats exploit them. This is where the game gets tense and where the educational value spikes — players experience the *consequence* of bad architecture.

**Threat types:**

| Threat | Trigger Condition | Effect |
|---|---|---|
| The Brute (DDoS) | No WAF, ALB is directly internet-facing | Packets multiply, ALB overwhelmed, requests slow |
| The Thief (Data Breach) | RDS in public subnet OR no SG on RDS | RDS "breached" — glowing red, data lost, mission failed |
| The Impersonator (IAM) | Lambda has no IAM Decree | Lambda refuses to execute — all invocations fail |
| The Cartomancer (Route Hijack) | No Route53, relying on direct IP | "Routes scrambled" — some traffic sent to wrong services |
| The Phantom (Unmonitored Failure) | No CloudWatch adjacent to critical services | Service fails silently — you don't know until too late |
| The Miser (Cost Bomb) | NAT Gateway processing high traffic volume | Gold drains at 3× the normal rate for that frame |

Threats should be shown as red sprites approaching the VPC wall from outside. If the architecture has the proper defenses in place, they are deflected. If not, they reach the vulnerable service and trigger the effect. This creates urgency without requiring the player to "fight" — you defend by building correctly.

### 4.4 Simulation Engine (`src/game/simulation.js`)

Following the Dungeon Architect pattern exactly: a pure function that takes state and returns new state plus events.

```js
export function simulationTick(state, deltaMs) {
  const events = []
  let { packets, threats, gold, architectureHealth } = state

  // Advance all packets
  packets = advancePackets(packets, deltaMs)

  // Check packet arrivals at each service
  for (const packet of packets) {
    if (packetArrived(packet)) {
      const service = getServiceAtPacketEnd(packet, state.grid)
      events.push({ type: 'SERVICE_ACTIVATED', serviceId: service.id, row, col })
      // Check if architecture handles this correctly
      if (!canHandle(packet, service, state)) {
        events.push({ type: 'PACKET_FAILED', reason: getFailureReason(packet, service, state) })
      }
    }
  }

  // Advance threats
  threats = advanceThreats(threats, deltaMs)
  for (const threat of threats) {
    if (threatReachedTarget(threat, state)) {
      events.push({ type: 'THREAT_STRUCK', threatType: threat.type, target: threat.target })
    }
  }

  return { packets, threats, gold, events }
}
```

The wave phase calls this every RAF frame. The store consumes events to update battle log, trigger animations, and evaluate win/lose conditions.

### 4.5 Wave Phase UI

When the player clicks "Unleash the Traffic," the build phase transitions to wave phase:
- The palette hides (no new placements during wave)
- A "Battle Log" panel appears on the right (replacing the mission panel) showing real-time events
- Traffic packets begin flowing through the architecture
- Threat sprites approach from outside
- A wave timer counts down (60 seconds)
- At the end: mission success/fail screen with score

---

## Part 5 — Phase 3: Deep AWS Accuracy

*Goal: the game is accurate enough that passing it correlates with understanding real AWS architecture. Every mechanic has a direct AWS equivalent.*

### 5.1 Security Groups as a Game Mechanic

Security Groups are the most important "missing" mechanic. Without them, the game teaches that "adjacent = connected," which is fundamentally wrong.

**How to model them:**

Add a new service type: `sg` (Permission Scroll / Security Group). IAM currently plays this role generically, but SGs are a specific networking concept.

A Security Group has:
- An associated service (EC2, RDS, Lambda ENI, ALB)
- Inbound rules: which source SG can reach this service, on which port
- Outbound rules: where this service can send traffic

**Simplified game mechanic:**
- Every service that handles network traffic (EC2, RDS, ALB, Lambda-in-VPC, ECS) must have an adjacent Security Group tile
- If two services need to communicate (e.g. EC2 → RDS), the SG adjacent to RDS must "allow" traffic from EC2's SG
- In the game: drag a connection between two SG tiles to represent an "allow" rule
- If no rule exists: packet between those services fails, threat can penetrate

This turns "what are Security Groups" from abstract documentation into a felt experience. Players who skip SGs watch their packets fail and their defenses crumble. Players who add them see their architecture become bulletproof.

**UI representation:**
SG tiles are drawn as shields/scrolls. When active (during wave phase), they show a small red ✕ or green ✓ as packets arrive. The board lights up with pass/fail indicators at each SG.

### 5.2 Route Tables

Add a new service type: `rt` (Road Map / Route Table). Every subnet must have one.

**Game mechanic:**
- Public subnet's Road Map must have a route pointing to the Iron Gate (IGW) — draw a connection between them
- Private subnet's Road Map must have a route pointing to the Secret Tunnel (NAT) for outbound internet, or to a VPC Endpoint for S3/DynamoDB access
- If no route: internet-bound packets from EC2 fail ("Route not found" event)

This single mechanic teaches why EC2 instances in a "public subnet" still can't reach the internet if the route table is wrong — one of the most common beginner AWS mistakes.

### 5.3 Multi-AZ Board Layout

Redesign the board for Phase 3. Instead of a single 11×9 grid, show two side-by-side AZ panels inside the VPC wall:

```
┌─────────────────────────────────────────┐
│                VPC WALL                 │
│  ┌──────────────┐  ┌──────────────┐    │
│  │    AZ-1      │  │    AZ-2      │    │
│  │ public priv  │  │ public priv  │    │
│  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────┘
```

This requires a significant grid redesign but is critical for the high-availability missions. Players must understand that deploying only in one AZ is a single point of failure.

Services with Multi-AZ awareness:
- **RDS Multi-AZ**: requires one instance in each AZ's private subnet. If AZ-1 fails, automatic failover to AZ-2.
- **ALB**: always spans multiple AZs (automatic in real AWS). Place in both AZs' public subnets.
- **NAT Gateway**: one per AZ (each AZ's private subnet routes to its own NAT). Common cost-optimization mistake: sharing one NAT across AZs creates cross-AZ data transfer charges.
- **ElastiCache**: cluster mode spans AZs. Shards in both AZs.
- **Lambda**: stateless, automatically multi-AZ (no placement needed, just deploy once).

### 5.4 VPC Endpoints (Correcting S3 and DynamoDB placement)

S3 and DynamoDB are not VPC resources. Fix their placement model:

- S3 tiles belong **outside** the VPC, in a new zone: "AWS Regional Services" (a zone strip to the right of the VPC)
- A new tile type: `vpc_endpoint` (the Secret Passage) goes on a wall tile
- Lambda and EC2 in the private subnet access S3 through the VPC Endpoint tile
- Without an endpoint: traffic routes through NAT Gateway (expensive, visible in gold cost)
- With an endpoint: direct, private connection at no data transfer cost

This teaches VPC Gateway Endpoints — one of the highest-impact cost optimizations in real AWS architectures.

### 5.5 Real Cost Display

Replace the flat gold cost with a dual display:
- **Deployment cost** (one-time, shown when placing)
- **Hourly cost** (ongoing, shown in HUD, accumulates during wave phase)

Map to real AWS pricing orders of magnitude:
```
IGW:          free + $0.09/GB outbound   → 0🪙 deploy, 0🪙/hr
NAT Gateway:  $0.045/hr + $0.045/GB data → 10🪙 deploy, 10🪙/hr + traffic
RDS (db.t3.medium): ~$0.068/hr           → 25🪙 deploy, 25🪙/hr
EC2 (t3.medium):    ~$0.0416/hr          → 10🪙 deploy, 20🪙/hr
Lambda:       $0.0000002/request          → 0🪙 deploy, 0🪙/hr (pay-per-use)
ElastiCache (cache.t3.medium): ~$0.034/hr → 15🪙 deploy, 18🪙/hr
```

A "Monthly Cost Estimator" display should show: "At this architecture, you'd spend approximately $X/month in real AWS." Real dollar values help players connect the game economy to real-world decisions.

### 5.6 Architecture Score System

After the wave phase, score the architecture on five dimensions (matching the AWS Well-Architected Framework pillars):

| Pillar | Score Driver |
|---|---|
| **Security** | SGs on all services, no public databases, WAF present, IAM Decrees on all services |
| **Reliability** | Multi-AZ deployment, at least one RDS replica, ALB spans AZs |
| **Performance** | ElastiCache present, CloudFront for static assets, Lambda for event-driven |
| **Cost Optimization** | VPC Endpoints instead of NAT for S3, Lambda instead of EC2 where appropriate |
| **Operational Excellence** | CloudWatch on all tiers, structured logging (EventBridge), proper tagging via IAM |

Show a radar/spider chart of the five pillars after each wave. This directly mirrors how AWS's Well-Architected Tool works in the real world — and if a player understands these five pillars, they understand the SAA-C03 exam framework.

---

## Part 6 — Phase 4: Learning Tools and Polish

*Goal: every interaction teaches something. The game is a legitimate study tool for AWS certifications.*

### 6.1 Certification Prep Mode

Add a mode toggle: "Adventure Mode" (narrative missions, fantasy theming) vs "Architect Mode" (exam-style challenges, real AWS terminology, strict scoring).

In Architect Mode:
- Service cards show only the AWS name (no fantasy name)
- Missions are phrased as real architecture requirements: "Design a highly available web application that serves static assets globally, handles 10k RPS, stores user data in a relational database with automatic failover, and processes background jobs asynchronously"
- After completion, show which SAA-C03 exam domains the mission covered
- Score is benchmarked against SAA-C03 passing criteria

### 6.2 Click-to-Learn Overlay

Clicking any **placed** service on the board (when not in placement mode) opens a rich overlay panel:

**Layout:**
```
┌─────────────────────────────────────────────┐
│ 📚 Great Library — Amazon RDS               │
│ ─────────────────────────────────────────── │
│ Managed relational database service.        │
│ Handles backups, patching, and failover.    │
│                                             │
│ ⚙️ This instance type: db.t3.medium         │
│ 💰 Real cost: ~$0.068/hr ($49/month)       │
│ 🔒 Security: Requires Security Group        │
│ 🏛 Best practice: Deploy Multi-AZ          │
│                                             │
│ Why in private subnet?                      │
│ Databases must never be publicly reachable. │
│ Only services in your VPC — via SG rules — │
│ should connect. Public databases are        │
│ one of the most common security breaches.   │
│                                             │
│ Connected to: Iron Knight (EC2) ✓          │
│              Shadow Ninja (Lambda) ✓        │
│              Crystal Orb (ElastiCache) ✓   │
│                                             │
│ AWS documentation ↗                         │
└─────────────────────────────────────────────┘
```

### 6.3 "What Broke" Post-Mortem Screen

When the wave phase ends with failures, show a detailed breakdown:

```
⚔ The Siege Is Over — Architecture Report

3 packets succeeded    7 packets failed

FAILURE ANALYSIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✘  SECURITY BREACH — The Great Library (RDS) has no Security Group.
   Threat: The Thief reached your database unimpeded.
   Fix: Place a Permission Scroll adjacent to your RDS tile.
   AWS equivalent: Every RDS instance needs a Security Group allowing
   only trusted sources (your EC2's SG) on port 5432.

✘  ROUTING FAILURE — EC2 instances could not reach the internet.
   Threat: Traffic requests to external APIs timed out.
   Fix: Ensure your public subnet's Road Map has a route to the Iron Gate.
   AWS equivalent: Public subnet route table must have 0.0.0.0/0 → igw-xxx

✘  COST OVERRUN — NAT Gateway processed 480GB of S3 traffic.
   Your gold: depleted. 
   Fix: Replace NAT routing to S3 with a VPC Endpoint (Secret Passage).
   AWS equivalent: S3 Gateway Endpoints are free. NAT data costs add up fast.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Well-Architected Score: 42/100
  Security:             20/40  ██████░░░░░░░░░░
  Reliability:          12/20  ████████░░
  Performance:           5/20  ██░░░░░░░░
  Cost Optimization:     5/10  █████░
  Operational Excellence: 0/10 ░░░░░░░░░░
```

This kind of specific, actionable feedback is what turns a game into a real learning tool.

### 6.4 Architecture Export

After completing a mission, let the player export their architecture as:
- A **diagram image** (canvas screenshot with labels)
- A **CloudFormation snippet** (simplified, showing the resource structure)
- A **text summary** ("Your architecture consists of: 1 Internet Gateway, 1 Application Load Balancer, 2 EC2 instances, 1 RDS Multi-AZ instance, 1 ElastiCache cluster...")

The CloudFormation export doesn't need to be deployable — it just needs to show the structure in recognisable format. Seeing the real YAML/JSON that maps to their board is a powerful "aha" moment.

### 6.5 Keyboard Shortcuts

A player spending serious time in the game needs keyboard access:

| Key | Action |
|---|---|
| `1` – `0` | Select service 1–10 from palette |
| `Escape` | Cancel selection / close overlay |
| `Z` | Undo last placement |
| `R` | Reset board |
| `Tab` | Cycle through placed services |
| `Enter` | Open info overlay for selected service |
| `+` / `-` | Zoom in / out |
| Arrow keys | Pan the map |
| `Space` | Center map on board |

### 6.6 Progress Persistence

Use `localStorage` to save:
- Completed missions (so players don't restart from scratch on page refresh)
- Current board state (allow mid-mission saves)
- Certification mode scores
- Highest well-architected scores per mission

```js
// In gameStore.js, subscribe to changes
useGameStore.subscribe(
  state => ({ placed: state.placed, gold: state.gold, completedMissions: state.completedMissions }),
  snapshot => localStorage.setItem('cloudRealm_save', JSON.stringify(snapshot))
)
```

---

## Part 7 — Phase 5: Long-Term Vision

*These features require substantial infrastructure changes. Tackle only after Phase 4 is complete.*

### 7.1 Procedural Mission Generator

Rather than hand-crafted missions, generate them from templates:

```js
const missionTemplate = {
  type: 'high_availability',
  constraints: {
    minAZs: 2,
    requiredServices: ['alb', 'rds'],
    forbiddenAntipatterns: ['public_rds', 'single_nat'],
  },
  traffic: {
    rps: 5000,
    pattern: 'bursty',
    peakFactor: 10,
  },
}
```

The generator creates a narrative description, generates the correct architecture requirements, and validates them programmatically. This allows unlimited missions that test different combinations of AWS services and Well-Architected principles.

### 7.2 Community Architecture Gallery

Players submit their completed architectures with:
- Screenshot of their board
- Their Well-Architected scores
- Monthly cost estimate

The gallery shows community solutions sorted by score, cost efficiency, and elegance. For each mission, players can compare their architecture to the highest-scoring community solution and see exactly what they missed.

### 7.3 Multiplayer Siege Mode

Two players build different architectures for the same scenario. After the build phase, their architectures are evaluated against the same traffic pattern and threats. The better-architected system handles more traffic, deflects more threats, and costs less. Side-by-side comparison of two architectures is an extraordinarily effective learning technique.

**Implementation note:** This requires a backend (WebSockets for real-time sync). Backend options in order of complexity: Partykit, Cloudflare Durable Objects, or a simple Node.js/Socket.io server. Ironically, deploying the CloudRealm backend on AWS would itself be a learning exercise for engineers contributing to the project.

### 7.4 AWS Service Expansion (30+ Services)

Additional services to add in Phase 5, each requiring sprite, placement rules, connections, and at least one mission:

- **Aurora** (The Twin Libraries) — Aurora vs RDS differentiation, Global Database clusters
- **Redshift** (The Deep Archives) — Data warehousing, separate from OLTP databases
- **Kinesis** (The River) — Real-time data streaming vs SQS batching
- **Step Functions** (The Quest Board) — Orchestration vs choreography patterns
- **EKS** (The Legion) — Container orchestration at scale vs ECS
- **Elastic Beanstalk** (The Barracks Captain) — PaaS abstraction over EC2
- **Amplify** (The Conjured Tower) — Frontend hosting + API, Gen2 architecture
- **AppSync** (The Oracle API) — GraphQL, real-time subscriptions
- **Glue** (The Alchemist) — ETL, data transformation pipeline
- **Athena** (The Inquisitor) — Query S3 data in place, serverless analytics
- **SES** (The Messenger Pigeon) — Transactional email, avoid spam penalties
- **Rekognition** (The Vision Oracle) — Computer vision, AI services
- **Bedrock** (The Ancient Mind) — Generative AI, foundation models
- **CodePipeline** (The Assembly Line) — CI/CD, DevOps pipeline
- **CloudFormation** (The Architect's Scroll) — IaC, infrastructure templating
- **Organizations** (The High Council) — Multi-account, service control policies
- **Control Tower** (The Grand Citadel) — Landing zone, guardrails
- **Transit Gateway** (The Alliance Road) — Multi-VPC and on-premises connectivity
- **Direct Connect** (The Iron Road) — Dedicated network connection from on-prem

---

## Part 8 — Technical Debt and Code Architecture Decisions

### 8.1 Things to never change

These architectural decisions are correct and should be preserved at all costs:

- **`game/` stays pure functions** — no React imports, no DOM calls, no Zustand. If you feel the need to import something from React into `game/`, stop and restructure.
- **RAF reads via refs, never subscriptions** — the draw loop must never restart on state change. If you add a new piece of state the draw loop needs to read, add it as a ref updated in the component body.
- **Zustand is the single source of truth** — no local component state for game data. Component state is only for ephemeral UI state that the canvas doesn't need (hover states on HTML elements, form input, etc.).
- **`simulation.js` must be a pure function** — when you write it, give it the signature `simulationTick(state, deltaMs) → { state, events }`. No side effects. This allows deterministic replay, testing, and eventual multiplayer sync.

### 8.2 The `validator.js` file

Create `src/game/validator.js` as a pure function that runs on every state change and returns architecture diagnostics. This is distinct from mission requirements — it checks for anti-patterns regardless of the current mission.

```js
export function validateArchitecture(grid, placed) {
  const warnings = []

  // Check: no public RDS
  for (const p of placed) {
    if (p.id === 'rds' && p.zone === 'public') {
      warnings.push({ severity: 'critical', code: 'PUBLIC_DATABASE', message: '...' })
    }
  }

  // Check: EC2 in public subnet has path to IGW
  // Check: Lambda has IAM Decree
  // Check: every service with network traffic has a Security Group
  // etc.

  return warnings
}
```

This runs every time `placed` changes. The results feed the Architecture Feedback Panel in real time.

### 8.3 Grid resize for multi-AZ

Moving to a multi-AZ board requires a grid redesign. Do not simply make the grid wider — instead, represent AZs as named regions within the grid. Each cell gains a new property: `az: 'az1' | 'az2' | null`. Services placed in `az1` have different behaviour from those in `az2` during failure scenarios. The zone label overlay should show AZ boundaries clearly.

A pragmatic approach for the multi-AZ board: keep the same 11×9 grid but split it vertically. Columns 1–4 = AZ-1 (both public and private), columns 6–9 = AZ-2 (both public and private), column 5 = the AZ boundary (no placement, just visual). Add a property to the cell: `az: 'az1' | 'az2'`.

### 8.4 Performance considerations at scale

At Phase 3, the board will have:
- ~30+ placed services with idle animations
- 10-20 active data packets each frame
- 3-5 threat sprites
- Connection lines between all adjacent services

The RAF loop will handle this easily — canvas is fast. But consider:
- **Sprite clipping** adds a `save/clip/restore` per placed service. With 30 services, this is 90 canvas state pushes per frame. Fine.
- **Connection line computation** iterates all placed services and their neighbours. With 30 services × 6 neighbours = 180 pair checks per frame. Fine.
- **Packet path computation** can be expensive if paths are recomputed each frame. Cache paths in the packet object, only recompute on architecture change.

The bottleneck at scale will not be JavaScript — it will be the number of canvas draw calls. Profile with the browser DevTools Performance tab if you notice frame drops.

---

## Appendix — Full AWS Service Mapping Reference

This table is the canonical reference for the game's fantasy world. Every service added must have all fields defined before implementation begins.

| AWS Service | Fantasy Name | Character | Zone | Teaches |
|---|---|---|---|---|
| Internet Gateway | The Iron Gate | Stone archway | VPC edge | VPC internet connectivity |
| CloudFront | Far Watcher | All-seeing eye | Edge (outside VPC) | CDN, edge caching, global delivery |
| Route53 | The Cartographer | Ancient map | Edge | DNS, routing policies, health checks |
| WAF | The Ward | Magic barrier | Edge / public | Web application firewall, OWASP |
| API Gateway | The Drawbridge | Guarded bridge | Public | API management, rate limiting, auth |
| ALB | Siege Shield | Tower shield | Public | Load balancing, target groups, health checks |
| EC2 | Iron Knight | Armoured soldier | Public/Private | Compute, instance types, on-demand vs reserved |
| ECS/Fargate | The Barracks | Army quarters | Public/Private | Container orchestration, task definitions |
| EKS | The Legion | Roman legion camp | Public/Private | Kubernetes, pod scheduling, node groups |
| Elastic Beanstalk | Barracks Captain | Officer tent | Public | PaaS, abstracts EC2/ALB/ASG |
| Cognito | The Gatekeeper | Gatehouse | Public | User pools, identity pools, JWT |
| NAT Gateway | Secret Tunnel | Hidden passage | Public | Private subnet outbound internet |
| VPC Endpoint | Secret Passage | Concealed door | Wall | Private S3/DynamoDB access, cost savings |
| Lambda | Shadow Ninja | Cloaked assassin | Private (optional) | Serverless, event-driven, pay-per-invocation |
| SQS | Raven Queue | Queued ravens | Private | Message queuing, decoupling, at-least-once delivery |
| SNS | The Herald | Town crier | Private | Pub/sub, fan-out, notification |
| EventBridge | Prophecy Engine | Oracle table | Private | Event bus, routing rules, schedules |
| Kinesis | The River | Rushing river | Private | Real-time streaming, ordered, replay |
| Step Functions | Quest Board | Mission board | Private | Workflow orchestration, state machines |
| RDS | Great Library | Stone library | Private | Relational DB, ACID, Multi-AZ, Read Replicas |
| Aurora | Twin Libraries | Two linked towers | Private | MySQL/Postgres, Aurora-specific features |
| DynamoDB | Ancient Ruins | Ruined temple | Private | NoSQL, key-value, single-digit ms latency |
| ElastiCache | Crystal Orb | Glowing crystal | Private | In-memory cache, Redis vs Memcached |
| Redshift | Deep Archives | Underground vault | Private | Data warehouse, columnar, OLAP |
| S3 | Endless Vault | Massive storehouse | Regional (outside VPC) | Object storage, lifecycle, versioning |
| EFS | The Shared Tome | Shared book | Private | Network file system, shared storage |
| CloudWatch | All-Seeing Eye | Floating eye | Any | Metrics, logs, alarms, dashboards |
| IAM | Royal Decree | Official scroll | Any | Permissions, roles, least-privilege |
| Security Group | Permission Scroll | Shield rune | Attached to service | Stateful firewall, inbound/outbound rules |
| KMS | Cipher Vault | Locked strongbox | Any | Encryption keys, envelope encryption |
| Secrets Manager | Tome of Secrets | Sealed grimoire | Private | Secret rotation, app credential management |
| CodePipeline | Assembly Line | Forge conveyor | Any | CI/CD, automated deployments |
| Transit Gateway | Alliance Road | Grand highway | VPC edge | Hub-and-spoke multi-VPC, on-prem |
| Direct Connect | Iron Road | Physical railway | VPC edge | Dedicated network, low-latency hybrid |
| Bedrock | Ancient Mind | Sleeping titan | Regional | Foundation models, AI/ML inference |

---

*This guide represents the complete vision for CloudRealm. Phase 1 is achievable in 4-6 weeks of focused development. Phases 2-3 are 3-4 months. Phases 4-5 are ongoing. The most important thing is that every single feature added must be grounded in real AWS behaviour — the game only has educational value if it is accurate.*

*Start with the immediate fixes. Then Phase 1. The foundation is already strong.*

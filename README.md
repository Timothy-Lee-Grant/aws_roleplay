# ☽ CloudRealm — AWS Fantasy RPG

> *"In the beginning there was only the Outer Realm — dark, unordered, and full of traffic. Then the engineers spoke, and the VPC walls rose."*

CloudRealm is a browser-based, hex-tile strategy game that teaches AWS cloud architecture through fantasy world-building. Players are given missions and must construct a working cloud environment by placing AWS services — reimagined as fantasy characters and structures — onto a hexagonal game board. Every placement decision reflects how real AWS architectures are designed: what lives in public vs. private subnets, which services communicate with which, and how to balance capability against cost.

---

## Quick Start

**Requirements:** Node.js 18+

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Table of Contents

1. [The Concept](#the-concept)
2. [How to Play](#how-to-play)
3. [Controls](#controls)
4. [The Game Board](#the-game-board)
5. [The Service Roster](#the-service-roster)
6. [Missions](#missions)
7. [Game Mechanics](#game-mechanics)
8. [Technical Architecture](#technical-architecture)
9. [Project Structure](#project-structure)
10. [What Players Actually Learn](#what-players-actually-learn)
11. [Roadmap](#roadmap)

---

## The Concept

AWS cloud infrastructure is notoriously abstract — services like VPCs, subnets, NAT Gateways, and IAM roles are difficult to visualise in isolation, let alone understand as a system. CloudRealm makes the invisible visible.

Every AWS service maps to a fantasy character or structure with a personality that reflects how it actually behaves:

- **Lambda** is a ninja — it appears only when summoned, completes exactly one task, and vanishes. No idle cost. No permanent station.
- **EC2** is a knight — always on duty, always costing gold (compute hours), upgradeable, and replaceable.
- **RDS** is a Great Library — structured, organised, relational. Has a Primary Scribe (write node) and a Replica Scribe (read replica). Goes offline for maintenance.
- **VPC** is the kingdom wall itself — nothing enters or leaves without the Iron Gate (Internet Gateway) being open.
- **SQS** is the Raven Queue — messages queue up and fly reliably between services. The Ravens don't drop messages.
- **NAT Gateway** is the Secret Tunnel — private forces can venture outward anonymously, but nothing from outside can find its way in.

The game is not a metaphor layered on top of real content. The mechanics *are* the content. When a player places Lambda and SQS adjacent to each other and the animated gold connection line appears, they have just understood event-driven architecture.

---

## How to Play

### Interface Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ☽ CloudRealm        Mission I — The First Bastion    ⚔️ 0  ✅ 0/3  🪙 100  │
├──────────────┬──────────────────────────────────┬───────────────────┤
│              │                                  │                   │
│   SERVICE    │        HEX GRID BOARD            │    MISSIONS       │
│   ROSTER     │        (HTML5 Canvas)            │    PANEL          │
│              │                                  │                   │
│  Click a     │   scroll to zoom                 │  📜 Requirements  │
│  service     │   alt+drag to pan                │                   │
│  card to     │   click tile to place            │  ✓ checked live   │
│  select it   │   right-click to remove          │                   │
│              │                                  │  🗺 Legend        │
└──────────────┴──────────────────────────────────┴───────────────────┘
```

**Step 1 — Read the mission.** The right panel shows the active mission with its requirements. Requirements check off in real time as you build.

**Step 2 — Select a service.** Click any service card in the left panel. It highlights gold and a hint banner appears. Valid tiles on the board immediately pulse green; invalid tiles dim.

**Step 3 — Place it.** Click any glowing tile on the board to place the service. If the placement fails, a brief toast explains why (wrong zone, not enough gold, etc.).

**Step 4 — Watch connections form.** When two adjacent services can communicate, an animated gold dashed line flows between them. This represents a valid AWS integration (e.g. EC2 → RDS, Lambda → SQS).

**Step 5 — Complete the mission.** Once all requirements are satisfied, a "Claim Victory" button appears. Click it to collect your gold reward and unlock the next mission.

**Removing a service** — right-click any occupied tile for a 50% gold refund.

---

## Controls

| Input | Action |
|---|---|
| Click a service card | Select it for placement |
| Click a glowing tile | Place the selected service |
| Right-click an occupied tile | Remove service (50% gold refund) |
| Scroll wheel | Zoom in / out toward cursor |
| Alt + drag | Pan the map |
| Escape | Cancel current selection |

---

## The Game Board

The board is an **11 × 9 hex grid** using pointy-top orientation with odd-r offset rows. Every tile has a terrain type that determines what can be placed on it. The board is rendered on an HTML5 Canvas element and supports smooth zoom and pan.

### Terrain Types

| Terrain | Colour | Description | AWS Equivalent |
|---|---|---|---|
| **VPC Wall** | Dark green, hatched | The kingdom's fortified perimeter. Structural only — most services cannot be placed here. | VPC boundary |
| **VPC Gate** | Dark green, glowing ring | Special wall tiles where the Internet Gateway can be installed. Pulses gold. | IGW attachment point |
| **Public Subnet** | Green (`#1a2d18`) | Visible to the Outer Realm. Public-facing services live here. | AWS Public Subnet |
| **Private Subnet** | Teal (`#112418`) | The Inner Sanctum. No outsider can reach here directly. | AWS Private Subnet |
| **Outer Realm** | Near-black (`#0e1018`) | The internet. Nothing can be deployed here. | The public internet |

### Connection Lines

Animated gold dashed lines flow between adjacent placed services that have valid AWS integration relationships. The flow direction is animated via a moving dash offset. A faint static line appears for services that are adjacent but not architecturally linked — proximity is not connectivity.

---

## The Service Roster

Twelve services are available. Each card shows the service's fantasy name, AWS identity, zone restriction, deploy count, and hourly gold cost.

### Public Subnet Services

| Icon | Fantasy Name | AWS Service | Cost/hr | Max | Connects To |
|---|---|---|---|---|---|
| 🌐 | **The Iron Gate** | Internet Gateway | 0🪙 | 1 | Load Balancer, EC2, CloudFront |
| 👁 | **Far Watcher** | CloudFront | 5🪙 | 2 | Load Balancer, S3 |
| 🛡 | **Siege Shield** | Application Load Balancer | 15🪙 | 2 | EC2, ECS, Lambda |
| ⚔️ | **Iron Knight** | EC2 Instance | 20🪙 | 4 | RDS, SQS, S3, Load Balancer |
| 🪖 | **The Barracks** | ECS / Fargate | 12🪙 | 3 | RDS, SQS, S3 |
| 🌀 | **Secret Tunnel** | NAT Gateway | 10🪙 | 1 | Lambda, ECS |

### Private Subnet Services

| Icon | Fantasy Name | AWS Service | Cost/hr | Max | Connects To |
|---|---|---|---|---|---|
| 🥷 | **Shadow Ninja** | Lambda Function | 0🪙 | 6 | SQS, RDS, S3, DynamoDB |
| 📚 | **Great Library** | RDS Database | 25🪙 | 2 | EC2, ECS, Lambda |
| 🗿 | **Ancient Ruins** | DynamoDB | 5🪙 | 3 | Lambda, EC2, ECS |
| 🏛 | **Endless Vault** | S3 Bucket | 2🪙 | 4 | CloudFront, EC2, Lambda, ECS |
| 🐦 | **Raven Queue** | SQS Queue | 1🪙 | 4 | Lambda, EC2, ECS |

### Any Zone

| Icon | Fantasy Name | AWS Service | Cost/hr | Max | Notes |
|---|---|---|---|---|---|
| 📜 | **Royal Decree** | IAM Role | 0🪙 | 8 | Can be placed in public or private subnet. Future mechanic: services without a Decree cannot operate. |

### Why Lambda costs nothing (and why that matters)

Lambda's gold cost is 0 because Lambda charges per invocation, not per hour. No idle tax. The Iron Knight (EC2) costs 20🪙/hr whether it's handling a request or not. Players who spam EC2 burn gold fast; players who understand when to use Lambda vs EC2 preserve resources for harder missions. This cost asymmetry is the lesson.

---

## Missions

Missions are presented in the right panel. Only one is active at a time; completing it unlocks the next. Requirements check in real time.

### Mission I — The First Bastion

*"A lone knight must guard the realm's gate. Open the Iron Gate, deploy a Knight, and station a Siege Shield."*

**Reward:** 30🪙 · **AWS concept:** IGW → ALB → EC2 (three-tier web architecture entry point)

| Requirement | Service | Zone |
|---|---|---|
| Place the Iron Gate | Internet Gateway | VPC Wall / Gate tile |
| Deploy an Iron Knight | EC2 Instance | Public Subnet |
| Station a Siege Shield | Load Balancer | Public Subnet |

### Mission II — The Serverless Scout

*"The Shadow Ninjas work best through the Raven Queue — summoned by messages, they strike and vanish."*

**Reward:** 40🪙 · **AWS concept:** SQS event source mapping → Lambda

| Requirement | Service | Zone |
|---|---|---|
| Place a Shadow Ninja | Lambda Function | Private Subnet |
| Deploy a Raven Queue | SQS Queue | Private Subnet |
| Lambda and SQS must be adjacent | — | — |

### Mission III — The Eternal Archive

*"Link the Endless Vault to the Far Watcher so artifacts are cached at the kingdom's edge."*

**Reward:** 50🪙 · **AWS concept:** Private S3 origin → CloudFront CDN + RDS metadata store

| Requirement | Service | Zone |
|---|---|---|
| Place the Endless Vault | S3 Bucket | Private Subnet |
| Station a Far Watcher | CloudFront | Public Subnet |
| Protect with the Great Library | RDS | Private Subnet |

---

## Game Mechanics

### Gold Economy

Players start with **100🪙**. Services cost gold to deploy; missions reward gold on completion.

| Action | Gold Change |
|---|---|
| Deploy a service | `-cost` |
| Remove a service | `+50% of original cost` |
| Complete Mission I | `+30` |
| Complete Mission II | `+40` |
| Complete Mission III | `+50` |

The asymmetric refund (50%) teaches a real AWS lesson: over-provisioning costs real money and you can't freely undo it without penalty. Plan before you place.

### Zone Enforcement

`canPlaceHere(terrain, serviceDef)` in `hexGrid.js` enforces placement rules strictly:

| Service Zone | Valid Terrain |
|---|---|
| `public` | Public Subnet only |
| `private` | Private Subnet only |
| `wall` | VPC Wall or VPC Gate tiles |
| `any` | Public or Private Subnet |

When a service is selected, the board immediately shows which tiles are valid (pulsing green overlay) and which are invalid (dimmed). A toast explains rejections: wrong zone, tile occupied, max count reached, or insufficient gold.

### Adjacency and Connections

The `getNeighbors(row, col)` function in `hexGrid.js` returns the six neighbours for a given hex using odd-r offset direction vectors (which differ for even and odd rows). A connection line is drawn between two adjacent placed services when a valid link exists in either service's `conns` array in `constants.js`. This adjacency mechanic teaches topology: Mission II's requirement that Lambda and SQS be on neighbouring tiles mirrors the real AWS concept of event source mapping co-location.

---

## Technical Architecture

### Stack

| Concern | Technology |
|---|---|
| UI framework | React 18 |
| State management | Zustand 4.5 |
| Build tool | Vite 5 |
| Rendering | HTML5 Canvas API |
| Game loop | `requestAnimationFrame` at 60fps |
| Sprites | Programmatic — drawn in code, no image files |
| Fonts | Google Fonts (Cinzel, Crimson Text) |

### Key architectural decisions

**Canvas over DOM for the game board.** The hex grid, service sprites, connection lines, zone highlights, and zoom/pan are all rendered to a single `<canvas>` element. This avoids the layout, style recalculation, and clip-path pointer-event problems of the DOM approach. The HTML panels (palette, missions, HUD) remain as React components — canvas is for the game world, DOM is for the UI chrome.

**requestAnimationFrame game loop.** `GameBoard.jsx` runs a RAF loop at ~60fps. Every frame: clear, apply camera transform, draw terrain, draw connections, draw sprites, draw hover rings, draw toasts. This is the standard clear-and-redraw pattern of all 2D games. No frame requires knowledge of the previous one.

**Zustand for global state.** All game state lives in a single Zustand store (`gameStore.js`). React components subscribe to exactly the slices they need — `HUD` subscribes to `gold`, `placed.length`, and `completedMissions`. The store holds the camera too (`panX`, `panY`, `zoom`).

**Refs in the RAF loop (not subscriptions).** The canvas draw function is created once with `useCallback([], [])`. It reads `grid`, `placed`, `selectedServiceId`, and camera state via refs (`gridRef.current`, etc.) that are updated on every React render. This prevents the RAF loop from restarting when state changes — which would cause flickering. This is the solution to the stale closure problem.

**Pure `game/` engine.** `constants.js`, `hexGrid.js`, and `sprites.js` contain no React, no DOM, no Zustand. They are pure functions: data in, data out (or draw commands to a `ctx` you pass in). This makes them independently testable and decoupled from any framework changes.

**Zoom toward cursor.** Zoom is implemented by adjusting `panX`/`panY` to keep the world point under the cursor stationary: `newPan = cursor - (cursor - pan) * (newZoom / oldZoom)`. The canvas camera applies `ctx.translate(panX, panY)` then `ctx.scale(zoom, zoom)` before drawing, and all click coordinates are inverse-transformed back to world space before hex lookup.

**Programmatic sprites.** Every service character is drawn using canvas primitives (`fillRect`, `arc`, `beginPath`, `lineTo`) in `sprites.js`. No image files. Idle animations are driven entirely by `Math.sin(t * speed)` where `t` is `performance.now()` — a smooth oscillating value that makes sprites breathe, bob, flicker, and rotate without any external animation state.

---

## Project Structure

```
aws_roleplay/
│
├── index.html              Browser entry point
├── package.json            Dependencies and npm scripts
├── vite.config.js          Vite + React plugin config
│
├── src/
│   ├── main.jsx            Mounts React into <div id="root">
│   ├── App.jsx             Root component (phase router for future screens)
│   ├── index.css           CSS custom properties and global resets
│   │
│   ├── game/               Pure game logic — no React, no DOM
│   │   ├── constants.js    All data: services, missions, grid geometry, terrain colours
│   │   ├── hexGrid.js      Hex math: hexCenter, pixelToHex, getNeighbors, drawHexPath
│   │   └── sprites.js      Canvas draw functions for all 12 services
│   │
│   ├── store/
│   │   └── gameStore.js    Zustand store: all state + all actions
│   │
│   └── components/
│       ├── GameScreen.jsx  Root layout: HUD + three-column grid
│       ├── HUD.jsx         Top bar: gold, mission name, counters
│       ├── ServicePalette.jsx  Left panel: service cards, selection state
│       ├── MissionPanel.jsx    Right panel: mission requirements, legend
│       └── GameBoard.jsx   Canvas element + RAF loop + zoom/pan + input
│
├── CONCEPTS.md             Deep technical teaching guide (start here to learn the codebase)
├── SETUP.md                Quick-start and controls reference
│
├── Notes/
│   ├── change_log.json         Structured project history for AI context
│   ├── implementation_notes.md Engineering walkthrough of all decisions
│   └── implementation_techniques.md  DOM vs Canvas analysis and migration rationale
│
└── historical/
    └── aws-rpg.html        v1 — single HTML file, DOM/CSS, vanilla JS (preserved)
```

---

## What Players Actually Learn

Every mechanic maps to a real AWS concept:

| Game Mechanic | AWS Concept | Why It Matters |
|---|---|---|
| VPC wall with gate tiles | VPC + Internet Gateway | No traffic enters a VPC without an IGW attached |
| Public vs. private subnet zones | Subnet routing | Internet-facing services in public; databases in private |
| Lambda costs 0🪙 idle | Lambda per-invocation pricing | Serverless eliminates idle compute cost |
| EC2 always costs gold | EC2 on-demand billing | Running instances accrue charges regardless of load |
| NAT Gateway must go in public subnet | NAT GW placement rule | NAT GW routes private traffic outbound via the public subnet |
| Lambda + SQS adjacency requirement | SQS event source mapping | Lambda subscribes to SQS; they must be co-located architecturally |
| S3 in private subnet + CloudFront public | Private S3 origin + CDN | Block direct S3 access; serve all content via CloudFront |
| RDS in private subnet only | Database isolation | Production RDS should never be publicly accessible |
| 50% removal refund | AWS over-provisioning cost | Unused resources cost money; plan before you provision |
| Connection graph in `conns` array | IAM + VPC routing tables | Services can only communicate if policies and routes allow it |
| Gold economy | AWS billing | Every architectural decision has a real cost implication |

---

## Roadmap

### Near Term

- **More missions** — Route53 (The Cartographer), Auto Scaling Groups (the Cavalry), VPC Peering (the Alliance Treaty), ElastiCache (the Crystal Orb), API Gateway (the Drawbridge)
- **Game phase system** — title screen → build phase → wave/threat phase → debrief, implemented as a proper state machine in the Zustand store
- **Threat mechanics** — incorrect architectures are attacked: a public RDS gets "breached", a Lambda without an IAM Royal Decree is refused entry by the Royal Guard

### Medium Term

- **Walking characters** — Lambda ninjas move between tiles on invocation, EC2 knights patrol their subnet, Raven messages fly along connection lines. Enabled by the RAF loop already in place.
- **`simulation.js`** — a pure tick function (pure data in → data out) that advances threat positions, checks architecture validity each frame, and emits events consumed by the store
- **Tutorial overlay** — guided first run with tooltips explaining each placement decision

### Long Term

- **Multiplayer** — two players build competing architectures, compared against a simulated traffic event
- **Real cost estimator** — gold values map to actual AWS pricing; missions show the real USD equivalent of the architecture built
- **AWS certification prep mode** — missions structured around SAA-C03 (Solutions Architect Associate) exam domains

---

## Reading the Codebase

If you want to understand how the system works:

1. **`CONCEPTS.md`** — read this first. It explains every technical concept (game loops, RAF, delta time, canvas drawing, hex maths, React hooks, Zustand, the stale closure problem, camera transforms) from scratch.
2. **`src/game/hexGrid.js`** — the coordinate maths. Start here for the hex grid.
3. **`src/game/sprites.js`** — how drawing works. Concrete, visual, easy to follow.
4. **`src/store/gameStore.js`** — all state and actions. The single source of truth.
5. **`src/components/GameBoard.jsx`** — where the RAF loop, camera, and input handling live.

---

*CloudRealm is an educational project. AWS service names and concepts are the property of Amazon Web Services.*

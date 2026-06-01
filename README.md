# ☽ CloudRealm — AWS Fantasy RPG

> *"In the beginning there was only the Outer Realm — dark, unordered, and full of traffic. Then the engineers spoke, and the VPC walls rose."*

CloudRealm is a browser-based, hex-tile strategy game that teaches AWS cloud architecture through fantasy world-building. Players are given missions and must construct a working cloud environment by placing AWS services — reimagined as fantasy characters and structures — onto a hexagonal game board. Every placement decision reflects how real AWS architectures are designed: what lives in public vs. private subnets, which services communicate with which, and how to balance capability against cost.

---

## Table of Contents

1. [The Concept](#the-concept)
2. [How to Play](#how-to-play)
3. [The Game Board](#the-game-board)
4. [The Service Roster](#the-service-roster)
5. [Missions](#missions)
6. [Game Mechanics](#game-mechanics)
7. [Technical Architecture](#technical-architecture)
8. [What Players Actually Learn](#what-players-actually-learn)
9. [Roadmap](#roadmap)

---

## The Concept

AWS cloud infrastructure is notoriously abstract — services like VPCs, subnets, NAT Gateways, and IAM roles are difficult to visualise in isolation, let alone understand as a system. CloudRealm makes the invisible visible.

Every AWS service maps to a fantasy character or structure with a personality that reflects how it actually behaves:

- **Lambda** is a ninja — it appears only when summoned, completes exactly one task, and vanishes. No idle cost. No permanent station.
- **EC2** is a knight — always on duty, always costing gold (compute hours), upgradeable, and replaceable.
- **RDS** is a Great Library — structured, organised, with a Primary Scribe (write replica) and a Replica Scribe (read replica). It goes offline for maintenance.
- **VPC** is the kingdom wall itself — nothing enters or leaves without the Iron Gate (Internet Gateway) being open.

The game is not a metaphor layered on top of real content. The mechanics *are* the content. When a player places Lambda and SQS adjacent to each other and the gold dashed connection line appears, they have just understood event-driven architecture.

---

## How to Play

CloudRealm runs entirely in the browser. Open `aws-rpg.html` — no installation, no server, no build step.

### Interface Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ☽ CloudRealm      Mission I — The First Bastion    ⚔️ 0  ✅ 0/3  🪙 100  │
├──────────────┬──────────────────────────────┬───────────────────┤
│              │                              │                   │
│   SERVICE    │        HEX GRID BOARD        │    MISSIONS       │
│   ROSTER     │                              │    PANEL          │
│              │   (drag services here)       │                   │
│  ⚔ Iron      │                              │  📜 Requirements  │
│  Knight      │                              │                   │
│  🥷 Shadow   │                              │  🔍 Tile Info     │
│  Ninja       │                              │                   │
│  ...         │                              │  🗺 Legend        │
│              │                              │                   │
└──────────────┴──────────────────────────────┴───────────────────┘
```

**Step 1 — Read the mission.** Each mission in the right panel describes a challenge in lore language and lists specific requirements. Requirements check off in real time as you build.

**Step 2 — Drag a service.** Click and drag any service card from the left panel onto a hex tile on the board. The board enforces zone rules — public services can only go in the green (public subnet) zone, private services only in the teal (private subnet) zone.

**Step 3 — Watch connections form.** When two adjacent services can communicate with each other, a gold dashed line automatically appears between them. This represents a valid AWS service connection (e.g. EC2 → RDS, Lambda → SQS).

**Step 4 — Complete the mission.** Once all requirements are satisfied, the "Claim Victory" button appears. Click it to collect your gold reward and unlock the next mission.

**Removing a service** — click any occupied tile to inspect it, then click "Remove" for a 50% gold refund.

---

## The Game Board

The board is an **11 × 9 hex grid** using offset rows (odd-r flat-top orientation). Every tile has a terrain type that determines what can be placed on it.

### Terrain Types

| Terrain | Colour | Description | AWS Equivalent |
|---|---|---|---|
| **VPC Wall** | Dark green, hatched | The kingdom's fortified perimeter. Structural only — most services cannot be placed here. | VPC boundary / Security Group perimeter |
| **VPC Gate** | Dark green, door icon | Special wall tiles where the Internet Gateway can be installed. | VPC Internet Gateway attachment point |
| **Public Subnet** | Green (`#1c2e18`) | Visible to the Outer Realm. Public-facing services live here. | AWS Public Subnet |
| **Private Subnet** | Teal (`#142820`) | The Inner Sanctum. No outsider can reach here directly. | AWS Private Subnet |
| **Outer Realm** | Near-black (`#1a1c22`) | The internet. Nothing can be deployed here. | The public internet |

### Grid Coordinates

Rows and columns use zero-based indexing. Odd rows are offset by half a hex width. The private subnet occupies approximately rows 3–5, columns 3–7. The public subnet wraps around it in rows 2–6. The VPC Wall forms the border at rows 1–7, cols 1–9.

### Connection Lines

A gold dashed line with a midpoint dot appears between two adjacent placed services when a valid connection exists in either service's `connections` array. A faint grey dashed line appears for adjacency without a valid connection — indicating the services are neighbours but don't communicate (useful for spatial planning).

---

## The Service Roster

Twelve services are available in this build. Each card shows the service's fantasy name, its AWS identity, a description, its zone restriction, how many are deployed vs. available, and its hourly gold cost.

### Public Subnet Services

These services face the Outer Realm and must live in the green zone.

| Icon | Fantasy Name | AWS Service | Cost/hr | Max | Connects To |
|---|---|---|---|---|---|
| 🌐 | **The Iron Gate** | Internet Gateway | 0🪙 | 1 | Load Balancer, EC2, CloudFront |
| 👁 | **Far Watcher** | CloudFront | 5🪙 | 2 | Load Balancer, S3 |
| 🛡 | **Siege Shield** | Application Load Balancer | 15🪙 | 2 | EC2, ECS, Lambda |
| ⚔️ | **Iron Knight** | EC2 Instance | 20🪙 | 4 | RDS, SQS, S3, Load Balancer |
| 🪖 | **The Barracks** | ECS / Fargate | 12🪙 | 3 | RDS, SQS, S3 |
| 🌀 | **Secret Tunnel** | NAT Gateway | 10🪙 | 1 | Lambda, ECS |

### Private Subnet Services

These services live in the Inner Sanctum — the teal zone. They cannot be accessed directly from the Outer Realm; they only receive traffic from public-facing services or through the NAT Gateway.

| Icon | Fantasy Name | AWS Service | Cost/hr | Max | Connects To |
|---|---|---|---|---|---|
| 🥷 | **Shadow Ninja** | Lambda Function | 0🪙 | 6 | SQS, RDS, S3, DynamoDB |
| 📚 | **Great Library** | RDS Database | 25🪙 | 2 | EC2, ECS, Lambda |
| 🗿 | **Ancient Ruins** | DynamoDB | 5🪙 | 3 | Lambda, EC2, ECS |
| 🏛 | **Endless Vault** | S3 Bucket | 2🪙 | 4 | CloudFront, EC2, Lambda, ECS |
| 🐦 | **Raven Queue** | SQS Queue | 1🪙 | 4 | Lambda, EC2, ECS |

### Anywhere Services

These can be placed in either the public or private subnet.

| Icon | Fantasy Name | AWS Service | Cost/hr | Max | Notes |
|---|---|---|---|---|---|
| 📜 | **Royal Decree** | IAM Role | 0🪙 | 8 | No connections. Grants permission. Future mechanic: services without a Royal Decree cannot operate. |

### Why Iron Gate is Free (and Important)

The Internet Gateway has no cost — just like AWS. But it's a prerequisite for any inbound internet traffic to reach your public subnet. In the game, the board is completely sealed until you place the Iron Gate on a VPC Gate tile. This is the first thing players learn: before anything works, the gateway must be open.

### Why Lambda Costs Nothing (and Everything)

Lambda's gold cost is 0 — because Lambda charges per invocation, not per hour. You only pay when it's called. This is the core principle of serverless: no idle tax. The Iron Knight (EC2) costs 20🪙/hr whether it's processing a request or not. Players who spam EC2 instances burn their gold fast; players who understand when to use Lambda vs. EC2 preserve resources for the harder missions.

---

## Missions

Missions are presented in the right panel. Only one mission is active at a time; completing it unlocks the next. Requirements check in real time — each line turns green with a checkmark as soon as the condition is satisfied.

### Mission I — The First Bastion

*"A lone knight must guard the realm's gate. The kingdom has no defenses — place an Iron Knight in the Outer City and open the Iron Gate so travelers may enter."*

**Reward:** 30🪙

| Requirement | Service | Zone | Notes |
|---|---|---|---|
| Place the Iron Gate | Internet Gateway | VPC Wall / Gate tile | Without this, no traffic enters the kingdom |
| Deploy an Iron Knight | EC2 Instance | Public Subnet | The basic compute unit, always on guard |
| Station a Siege Shield | Load Balancer | Public Subnet | Distributes incoming requests across knights |

**AWS concept taught:** The basic three-tier web architecture entry point — IGW → ALB → EC2. This is the first thing you set up when hosting a web app on AWS.

---

### Mission II — The Serverless Scout

*"The Shadow Ninjas work best through the Raven Queue — they are summoned by messages, strike, and vanish. Build a serverless pipeline in the Inner Sanctum."*

**Reward:** 40🪙

| Requirement | Service | Zone | Notes |
|---|---|---|---|
| Place a Shadow Ninja | Lambda Function | Private Subnet | Must be inside the Inner Sanctum |
| Deploy a Raven Queue | SQS Queue | Private Subnet | The message queue that triggers the Ninja |
| Lambda and SQS must be adjacent | — | — | Adjacency = direct event-source mapping |

**AWS concept taught:** SQS-triggered Lambda is one of the most common serverless patterns. The adjacency requirement reinforces the concept of event source mapping — Lambda subscribes directly to the SQS queue. Players who try to place them on opposite sides of the board quickly discover the adjacency rule and understand why co-location of event producers and consumers matters.

---

### Mission III — The Eternal Archive

*"The scholars demand their scrolls be accessible to all corners of the realm — swiftly. Link the Endless Vault to the Far Watcher so artifacts are cached at the kingdom's edge."*

**Reward:** 50🪙

| Requirement | Service | Zone | Notes |
|---|---|---|---|
| Place the Endless Vault | S3 Bucket | Private Subnet | Origin storage in the Inner Sanctum |
| Station a Far Watcher | CloudFront | Public Subnet | CDN edge cache at the realm's border |
| Protect with the Great Library | RDS | Private Subnet | Metadata / structured data alongside artifacts |

**AWS concept taught:** The S3 + CloudFront static asset delivery pattern is ubiquitous in production AWS. Keeping S3 in the private subnet (not publicly accessible) and routing all reads through CloudFront is a security and performance best practice. The addition of RDS teaches players that object storage (S3) and relational storage (RDS) serve different purposes and often coexist.

---

## Game Mechanics

### Gold Economy

Players start with **100🪙**. Every service costs gold to deploy (reflecting AWS hourly compute costs). Missions reward gold on completion — creating a progression loop where smart architecture earns you the resources to attempt harder missions.

| Action | Gold Change |
|---|---|
| Deploy a service | `-cost` |
| Remove a service | `+50% of cost (refund)` |
| Complete Mission I | `+30` |
| Complete Mission II | `+40` |
| Complete Mission III | `+50` |

The asymmetric refund (50%) teaches a real AWS lesson: over-provisioning is costly. You can't simply spin up every service and remove what you don't need without penalty. Plan before you place.

### Zone Enforcement

Zone rules are enforced strictly at the drop target level. Attempting to drop a private service onto a public tile — or vice versa — results in no placement (the drop is silently rejected). This mirrors real AWS subnet design: you cannot accidentally place an RDS instance in a public subnet in this game, just as a thoughtful architect would configure their security groups to prevent it in production.

| Service Zone | Valid Tiles |
|---|---|
| `public` | Public Subnet only |
| `private` | Private Subnet only |
| `wall` | VPC Wall or VPC Gate tiles |
| `any` | Public or Private Subnet |

### Adjacency and Connections

Connections between services are drawn when two placed services occupy neighbouring hex tiles **and** a valid connection exists in either service's connection list. Connection validity reflects real AWS integration patterns:

- EC2 → RDS: a knight reads from the library
- Lambda → SQS: a ninja is triggered by a raven message
- CloudFront → S3: the far watcher caches the vault's contents
- Load Balancer → EC2/ECS/Lambda: the shield routes to any fighter

Services that are adjacent but have no valid connection still appear (faint grey line) — they're physically close but not architecturally linked. This is intentional: physical proximity on the board should never be confused with actual connectivity.

### Service Limits

Each service has a `maxCount` that reflects real-world constraints or best practices:

- Internet Gateway: **1 per VPC** (AWS hard limit)
- NAT Gateway: **1** (typically one per AZ; single-AZ in this build)
- Load Balancer: **2** (enough for redundancy)
- EC2: **4** (encourages scaling via ECS/Lambda rather than raw instances)
- Lambda: **6** (reflects serverless-first architecture philosophy)

When a service hits its limit, its palette card is greyed out and marked "All deployed."

---

## Technical Architecture

CloudRealm is a **single HTML file** — no build tools, no dependencies, no server required. Open it in any modern browser.

### Stack

- **HTML5** — semantic structure
- **CSS3** — `clip-path` for hexagons, CSS variables for the design system, `grid` for layout
- **Vanilla JavaScript** — no frameworks; all state in a plain JS object
- **Google Fonts** — Cinzel (fantasy headings), Crimson Text (body), loaded from CDN

### Hex Grid

Hexagons are rendered using CSS `clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)` on standard `<div>` elements. The grid uses odd-r offset coordinates: odd-numbered rows are shifted right by half a hex width using a `.offset` class.

Grid dimensions are controlled via CSS variables:
```css
--hex-size: 52px;
--hex-gap: 3px;
```

### Drag and Drop

Uses the native HTML5 Drag and Drop API (`draggable`, `dragstart`, `dragover`, `drop`). Service cards are the drag sources; hex tiles are the drop targets. Zone validation runs inside the `dragover` handler — if the drop would be invalid, `dropEffect` is set to `'none'` and no highlight is shown.

### Connection Rendering

After every placement, `renderConnections()` queries the DOM for each placed service's hex element using `getBoundingClientRect()`, converts to coordinates relative to the board wrapper, then draws SVG `<line>` elements between connected neighbours. This approach is layout-agnostic — it works regardless of screen size or zoom level.

### State Model

All game state lives in a single object:

```js
const state = {
  grid: [],          // 2D array of {terrain, service} cells
  placed: [],        // [{hexId, serviceId, zone, row, col}]
  dragging: null,    // serviceId currently being dragged
  gold: 100,
  completedMissions: Set,
  activeMission: 0,
};
```

There is no framework, no reactivity system, and no virtual DOM. Each interaction calls the relevant `render*()` functions directly. This keeps the codebase readable and easy to extend.

### File Structure

```
aws_roleplay/
├── aws-rpg.html      ← The entire game (single file)
└── README.md         ← This document
```

---

## What Players Actually Learn

Every mechanic in CloudRealm maps to a real AWS concept. This table connects the game to the certification material:

| Game Mechanic | AWS Concept | Real-World Relevance |
|---|---|---|
| VPC wall with gate tiles | VPC + Internet Gateway | No traffic enters a VPC without an IGW attached |
| Public vs. private subnet zones | Public/Private Subnet routing | Internet-facing services in public; databases in private |
| Iron Gate placement prerequisite | IGW attachment | Without attaching an IGW, your EC2 has no route to the internet |
| Lambda costs 0🪙 idle | Lambda per-invocation pricing | Serverless eliminates idle compute cost |
| EC2 always costs gold | EC2 on-demand billing | Running EC2 instances accrue charges regardless of load |
| NAT Gateway in public subnet | NAT Gateway placement rule | NAT GW must be in a public subnet to route private traffic outbound |
| Lambda + SQS adjacency requirement | SQS event source mapping | Lambda subscribes to SQS; they must be in the same account/region |
| S3 in private subnet + CloudFront in public | S3 origin with CloudFront CDN | Block direct S3 access; serve all content via CloudFront |
| RDS in private subnet only | Database isolation | Production RDS instances should never be publicly accessible |
| 50% removal refund | AWS over-provisioning cost | Unused resources cost real money; plan your architecture first |
| Service connection rules | IAM policies + VPC routing tables | Services can only communicate if policies and routes permit it |
| IAM Royal Decree (future mechanic) | IAM roles and policies | Every AWS service needs explicit permissions to interact with others |

By the end of the three starter missions, a player has — without reading a single whitepaper — understood the fundamental AWS three-tier web architecture, serverless event-driven architecture, and a CDN-backed static asset delivery pattern.

---

## Roadmap

The current build is v0.1 — a playable proof of concept with a working board, 12 services, and 3 missions. Planned additions:

### Near Term

- **More missions** — Route53 DNS (The Cartographer), Auto Scaling Groups (the Cavalry), VPC Peering (the Alliance Treaty), ElastiCache (the Crystal Orb), API Gateway (the Drawbridge)
- **Threat mechanics** — incorrect architectures are attacked: a public RDS gets "breached" by The Outside, a Lambda without a proper IAM Decree gets "refused entry" by the Royal Guard
- **Tutorial mode** — guided first placement with tooltips explaining each decision

### Medium Term

- **Animated services** — Lambda tiles flash when "invoked," EC2 tiles pulse steadily, SQS tiles show a small raven flying to adjacent Lambda
- **Architecture validation mode** — after placing, view a summary of what your architecture does, what it costs per month, and common anti-patterns it avoids or exhibits
- **Multiple kingdoms (accounts)** — multi-account architectures, cross-VPC peering, Transit Gateway as a "Alliance Road"

### Long Term

- **Multiplayer** — two players build competing architectures; their costs and uptime are compared after a simulated "traffic event"
- **Real cost estimator** — gold costs map to actual AWS pricing; completing missions shows the real USD equivalent of the architecture built
- **AWS certification prep mode** — missions structured around SAA-C03 (Solutions Architect Associate) exam domains

---

*CloudRealm is an educational project. AWS service names, icons, and concepts are the property of Amazon Web Services.*

// ─── Grid geometry ────────────────────────────────────────────────────────────
export const COLS      = 11
export const ROWS      = 9
export const HEX_R     = 32
export const COL_STEP  = HEX_R * Math.sqrt(3)
export const ROW_STEP  = HEX_R * 1.5
export const BOARD_PAD_X = 28
export const BOARD_PAD_Y = 36

// ─── Terrain IDs ──────────────────────────────────────────────────────────────
export const TERRAIN = {
  VOID:    'void',
  OUTSIDE: 'outside',
  EDGE:    'edge',     // Internet edge — IGW, CloudFront, Route53 live here (outside VPC)
  WALL:    'wall',     // VPC perimeter — structural, no placement
  GATE:    'gate',     // VPC attachment point — visual only, no placement
  PUBLIC:  'public',   // AWS Public Subnet
  PRIVATE: 'private',  // AWS Private Subnet
}

// ─── Terrain colours ──────────────────────────────────────────────────────────
export const TERRAIN_COLOR = {
  void:    '#060810',
  outside: '#0e1018',
  edge:    '#0c1822',  // subtle blue tint — "AWS managed internet edge"
  wall:    '#18261a',
  gate:    '#1e2e1a',
  public:  '#1b2e18',
  private: '#122518',
}
export const TERRAIN_STROKE = {
  void:    '#090b12',
  outside: '#121520',
  edge:    '#1a3040',  // blue border distinguishes edge from outside
  wall:    '#283a26',
  gate:    '#607840',
  public:  '#2c4e28',
  private: '#1c4836',
}

// ─── Services ─────────────────────────────────────────────────────────────────
//
// ZONE KEY:
//   'edge'    → edge tiles (row 0) — services that exist OUTSIDE the VPC
//   'public'  → public subnet tiles — internet-accessible VPC resources
//   'private' → private subnet tiles — internal VPC resources, no direct internet
//   'any'     → public or private subnet (service can live in either)
//   'wall'    → VPC wall tiles (structural placement — rare)
//
// CONNS (directional):
//   Each service lists the services it SENDS TRAFFIC TO.
//   Arrow direction = this service → target.
//   If both A and B list each other → bidirectional (shown with arrows on both ends).
//   This matches real AWS IAM trust relationships and network flow direction.
//
export const SERVICES = [

  // ── Internet Edge (outside VPC) ────────────────────────────────────────────

  {
    id: 'igw',
    icon: '🌐',
    fantasy: 'The Iron Gate',
    aws: 'Internet Gateway',
    zone: 'edge',
    cost: 0,
    max: 1,
    // IGW routes inbound internet traffic INTO the VPC toward the ALB/EC2
    conns: ['alb', 'ec2'],
    requiresSG: false,
    desc: 'Attaches to the VPC — NOT inside it. Routes internet traffic inbound to the ALB or EC2. One per VPC. Zero cost to attach; you pay for data transfer.',
    awsFact: 'A VPC has no internet access until an IGW is attached. This is intentional — VPCs are private by default.',
  },

  {
    id: 'cf',
    icon: '👁',
    fantasy: 'Far Watcher',
    aws: 'CloudFront',
    zone: 'edge',
    cost: 5,
    max: 2,
    // CloudFront is a global CDN — it pulls content from origins (ALB or S3)
    conns: ['alb', 's3'],
    requiresSG: false,
    desc: 'Global CDN — exists at 450+ edge locations worldwide, NOT inside your VPC. Pulls content from an ALB (dynamic) or S3 (static). Caches at the edge.',
    awsFact: 'CloudFront is not a VPC resource. You cannot assign it a security group or subnet. Traffic reaches CloudFront before ever touching your AWS region.',
  },

  // ── Public Subnet ──────────────────────────────────────────────────────────

  {
    id: 'alb',
    icon: '🛡',
    fantasy: 'Siege Shield',
    aws: 'Application Load Balancer',
    zone: 'public',
    cost: 15,
    max: 2,
    // ALB distributes incoming requests to backend compute targets
    conns: ['ec2', 'ecs', 'lambda'],
    requiresSG: true,
    desc: 'Distributes incoming HTTP/HTTPS traffic across EC2, ECS tasks, or Lambda. Lives in public subnet but forwards to private targets. Requires a Security Group.',
    awsFact: 'ALBs always need at least two subnets in different AZs for HA. The ALB is public-facing; your EC2/ECS can be in private subnets.',
  },

  {
    id: 'ec2',
    icon: '⚔️',
    fantasy: 'Iron Knight',
    aws: 'EC2 Instance',
    zone: 'public',
    cost: 20,
    max: 4,
    // EC2 queries databases, publishes messages, reads/writes objects
    conns: ['rds', 'sqs', 'dynamo', 's3'],
    requiresSG: true,
    desc: 'Virtual machine — always running, always costing gold. Requires a Security Group to control inbound/outbound traffic. Cannot communicate with RDS without an SG allowing it.',
    awsFact: 'EC2 billing starts the moment the instance starts, regardless of load. t3.medium = ~$0.04/hr. A Security Group acts as a stateful firewall for each instance.',
  },

  {
    id: 'ecs',
    icon: '🪖',
    fantasy: 'The Barracks',
    aws: 'ECS / Fargate',
    zone: 'public',
    cost: 12,
    max: 3,
    // ECS tasks query databases, publish to queues, read/write storage
    conns: ['rds', 'sqs', 'dynamo', 's3'],
    requiresSG: true,
    desc: 'Runs containers without managing servers (Fargate). Each task needs a Security Group to define what it can reach. Cheaper than EC2 for containerised workloads.',
    awsFact: 'ECS tasks have ENIs (network interfaces) and therefore Security Groups, just like EC2. Forgetting the SG inbound rule is the #1 reason ECS tasks fail to reach RDS.',
  },

  {
    id: 'nat',
    icon: '🌀',
    fantasy: 'Secret Tunnel',
    aws: 'NAT Gateway',
    zone: 'public',
    cost: 10,
    max: 1,
    // NAT routes outbound traffic from private subnet through to IGW
    conns: ['igw'],
    requiresSG: false,
    dataCost: true,   // ← Gap 8: NAT charges per GB processed, not just hourly
    desc: 'Allows private subnet resources to reach the internet without being reachable FROM the internet. MUST live in a public subnet. Costs both hourly AND per GB of data processed.',
    awsFact: '$0.045/hr + $0.045/GB data processed. A Lambda that calls an external API 10M times/month can easily spend $50+/month on NAT alone. Use VPC Endpoints for AWS services instead.',
  },

  // ── Private Subnet ─────────────────────────────────────────────────────────

  {
    id: 'lambda',
    icon: '🥷',
    fantasy: 'Shadow Ninja',
    aws: 'Lambda Function',
    zone: 'any',     // Gap 6 fix: Lambda is NOT required to be in a VPC
    cost: 0,
    max: 6,
    // Lambda invokes downstream services; publishes to SQS
    conns: ['rds', 'dynamo', 's3', 'sqs'],
    requiresSG: false, // SG only needed if Lambda is placed in a VPC subnet
    desc: 'Serverless function — zero idle cost, runs on invocation only. Place in PRIVATE subnet ONLY if it needs to reach private VPC resources (RDS, ElastiCache). Outside VPC = better cold starts.',
    awsFact: 'Lambda without VPC config gets a free public IP and internet access. Lambda inside a VPC needs a NAT Gateway for internet — adding ~$0.045/hr. Only put Lambda in VPC when necessary.',
  },

  {
    id: 'rds',
    icon: '📚',
    fantasy: 'Great Library',
    aws: 'RDS Database',
    zone: 'private',
    cost: 25,
    max: 2,
    // RDS is a passive receiver — it does NOT initiate connections
    conns: [],
    requiresSG: true,
    desc: 'Managed relational database. Always in the PRIVATE subnet — never expose a database to the internet. Requires a Security Group allowing ONLY trusted sources on the database port.',
    awsFact: 'The SG on RDS should only allow traffic from the EC2/Lambda Security Group on port 5432 (Postgres) or 3306 (MySQL). A public RDS is one of the most common critical misconfigurations.',
  },

  {
    id: 'dynamo',
    icon: '🗿',
    fantasy: 'Ancient Ruins',
    aws: 'DynamoDB',
    zone: 'private',
    cost: 5,
    max: 3,
    // DynamoDB is a passive receiver
    conns: [],
    requiresSG: false,
    desc: 'Serverless NoSQL database. Like S3, DynamoDB is a regional AWS service — not a VPC resource. Access it from private subnets via a VPC Gateway Endpoint (free) to avoid NAT costs.',
    awsFact: 'DynamoDB Gateway Endpoint is free. Without it, every DynamoDB call from a private Lambda costs NAT data transfer fees. This is a very common cost leak.',
  },

  {
    id: 's3',
    icon: '🏛',
    fantasy: 'Endless Vault',
    aws: 'S3 Bucket',
    zone: 'edge',    // Gap 4 fix: S3 is NOT a VPC resource — it lives at the regional edge
    cost: 2,
    max: 4,
    // S3 is a passive receiver — services call it, it doesn't initiate
    conns: [],
    requiresSG: false,
    desc: 'Regional object storage — NOT inside your VPC. It exists outside any subnet. Access from private resources via a VPC Gateway Endpoint (free). Direct public access should be blocked; route through CloudFront.',
    awsFact: 'S3 has no security group and no ENI — it is not a network resource in your VPC. Block all public access in S3 settings, then serve content via CloudFront, which can add WAF, caching, and SSL.',
  },

  {
    id: 'sqs',
    icon: '🐦',
    fantasy: 'Raven Queue',
    aws: 'SQS Queue',
    zone: 'private',
    cost: 1,
    max: 4,
    // SQS delivers messages to consumers — Lambda, EC2, ECS poll the queue
    conns: ['lambda', 'ec2', 'ecs'],
    requiresSG: false,
    desc: 'Managed message queue. SQS is also a regional AWS service (not in VPC). It TRIGGERS consumers — Lambda polls the queue (event source mapping). Decouples producers from consumers.',
    awsFact: 'Lambda + SQS event source mapping is pull-based: Lambda polls SQS every 20s. When messages arrive, Lambda is invoked in batches. One Lambda process can consume from one SQS queue concurrently.',
  },

  {
    id: 'iam',
    icon: '📜',
    fantasy: 'Royal Decree',
    aws: 'IAM Role',
    zone: 'any',
    cost: 0,
    max: 8,
    conns: [],
    requiresSG: false,
    desc: 'IAM Roles grant services permission to call other AWS services. Every EC2, Lambda, and ECS task needs a Role. Without one, the service has ZERO permissions — it cannot call any AWS API.',
    awsFact: 'IAM is the most powerful security control in AWS. Follow least-privilege: each service role should only have the permissions it actually needs. Never use wildcard (*) actions in production.',
  },

  // ── Security + Networking ───────────────────────────────────────────────────

  {
    id: 'sg',
    icon: '🔰',
    fantasy: 'Permission Scroll',
    aws: 'Security Group',
    zone: 'any',
    cost: 0,
    max: 12,
    conns: [],
    requiresSG: false,
    desc: 'Stateful virtual firewall — attached to EC2, RDS, ALB, ECS, and Lambda (when in VPC). Controls which sources can connect (inbound) and which destinations the service can reach (outbound). If no rule matches: DENY.',
    awsFact: 'Security Groups are stateful — if inbound traffic is allowed, the return traffic is automatically allowed. Network ACLs (NACLs) are stateless and operate at subnet level. Most engineers use SGs, not NACLs.',
  },

  {
    id: 'rt',
    icon: '🗺',
    fantasy: 'Road Map',
    aws: 'Route Table',
    zone: 'any',
    cost: 0,
    max: 4,
    conns: [],
    requiresSG: false,
    desc: 'Defines where subnet traffic is routed. Public subnet Route Table has 0.0.0.0/0 → IGW (internet access). Private subnet Route Table has 0.0.0.0/0 → NAT Gateway (outbound only). Without a correct route, traffic goes nowhere.',
    awsFact: 'Your EC2 is in a "public subnet" but can\'t reach the internet? Check the Route Table. The subnet is only public if its Route Table has a route to the IGW. This is the #1 beginner networking mistake in AWS.',
  },
]

// ─── Missions ─────────────────────────────────────────────────────────────────
export const MISSIONS = [
  {
    id: 0,
    name: 'The First Bastion',
    reward: 30,
    lore: "The kingdom has no defenses and no connection to the Outer Realm. Place the Iron Gate OUTSIDE the VPC wall — it attaches to the kingdom, not inside it. Then deploy a Knight and station a Shield.",
    reqs: [
      {
        text: 'Place the Iron Gate (IGW) on an edge tile — outside the VPC',
        icon: '🌐',
        check: s => s.placed.some(p => p.id === 'igw'),
      },
      {
        text: 'Deploy an Iron Knight (EC2) in the public subnet',
        icon: '⚔️',
        check: s => s.placed.some(p => p.id === 'ec2' && p.zone === 'public'),
      },
      {
        text: 'Station a Siege Shield (ALB) in the public subnet',
        icon: '🛡',
        check: s => s.placed.some(p => p.id === 'alb' && p.zone === 'public'),
      },
    ],
  },
  {
    id: 1,
    name: 'The Serverless Scout',
    reward: 40,
    lore: "Shadow Ninjas need no permanent post — they are invoked by the Raven Queue and vanish when done. Lambda does NOT need to be in a VPC unless it reads from the Great Library. Place Lambda freely.",
    reqs: [
      {
        text: 'Place a Shadow Ninja (Lambda) — any subnet',
        icon: '🥷',
        check: s => s.placed.some(p => p.id === 'lambda'),
      },
      {
        text: 'Deploy a Raven Queue (SQS) in the private subnet',
        icon: '🐦',
        check: s => s.placed.some(p => p.id === 'sqs' && p.zone === 'private'),
      },
      {
        text: 'Lambda and SQS must be on adjacent tiles',
        icon: '🔗',
        check: s => checkAdjacent(s, 'lambda', 'sqs'),
      },
    ],
  },
  {
    id: 2,
    name: 'The Eternal Archive',
    reward: 50,
    lore: "The Endless Vault (S3) does not live inside the kingdom walls — it is a regional service of the realm, accessible everywhere. Place it outside the VPC alongside the Far Watcher. The Great Library belongs inside, protected.",
    reqs: [
      {
        text: 'Place the Endless Vault (S3) on an edge tile — S3 is not a VPC resource',
        icon: '🏛',
        check: s => s.placed.some(p => p.id === 's3' && p.zone === 'edge'),
      },
      {
        text: 'Station a Far Watcher (CloudFront) on an edge tile',
        icon: '👁',
        check: s => s.placed.some(p => p.id === 'cf' && p.zone === 'edge'),
      },
      {
        text: 'Protect structured knowledge with the Great Library (RDS) in private subnet',
        icon: '📚',
        check: s => s.placed.some(p => p.id === 'rds' && p.zone === 'private'),
      },
    ],
  },
]

// ─── Helpers (used by mission checks) ─────────────────────────────────────────
function checkAdjacent(s, idA, idB) {
  const nbFn = s.getNeighbors
  if (!nbFn) return false
  const pA = s.placed.filter(p => p.id === idA)
  const pB = s.placed.filter(p => p.id === idB)
  for (const a of pA) {
    const nbrs = nbFn(a.row, a.col)
    for (const b of pB) {
      if (nbrs.some(n => n.row === b.row && n.col === b.col)) return true
    }
  }
  return false
}

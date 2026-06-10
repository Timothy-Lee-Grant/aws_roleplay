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
  VOID:         'void',
  OUTSIDE:      'outside',
  EDGE:         'edge',        // Internet edge — IGW, CloudFront, Route53 live here (outside VPC)
  WALL:         'wall',        // VPC perimeter — structural, no placement
  GATE:         'gate',        // VPC attachment point — visual only, no placement
  PUBLIC:       'public',      // AWS Public Subnet (AZ-1 cols 2-4, AZ-2 cols 6-8)
  PRIVATE:      'private',     // AWS Private Subnet (AZ-1 cols 2-4, AZ-2 cols 6-8)
  AZ_BOUNDARY:  'az_boundary', // Vertical divider between AZ-1 and AZ-2 — no placement
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

// ─── Hourly cost model (5.5 — Real Cost Display) ──────────────────────────────
//
// Game gold per hour each placed service consumes.
// Scaled to be roughly proportional to real AWS pricing.
// Teaches the key insight: not all services are free to run —
// EC2/RDS/NAT accumulate cost per hour regardless of load.
export const HOURLY_COSTS = {
  igw:         0,   // Free — charges only on data transfer out ($0.09/GB)
  cf:          1,   // ~$0.01/hr effective (CloudFront pay-per-request, very low idle)
  alb:         5,   // $0.018/hr + LCU charges — always-on cost
  ec2:         4,   // t3.medium ~$0.042/hr on-demand
  ecs:         4,   // Fargate t3.medium equivalent ~$0.0445/hr
  nat:         4,   // $0.045/hr + $0.045/GB data — one of the biggest hidden costs
  lambda:      0,   // Pay per invocation — $0 idle (huge cost advantage vs EC2!)
  rds:         7,   // db.t3.medium ~$0.068/hr — always running even when idle
  dynamo:      0,   // Pay per request — $0 idle (serverless DB)
  s3:          0,   // Pay per GB stored + requests — negligible hourly
  sqs:         0,   // Pay per message — $0 idle
  iam:         0,   // Free
  sg:          0,   // Free
  rt:          0,   // Free
  route53:     0,   // $0.50/hosted zone/month = $0.0007/hr
  apigw:       1,   // ~$3.50/million API calls — low idle, spikes under load
  sns:         0,   // Pay per notification — $0 idle
  elasticache: 3,   // cache.t3.medium ~$0.034/hr — always on
  eventbridge: 0,   // $1/million events — $0 idle
  waf:         1,   // ~$5/mo base + $0.60/million requests
  cognito:     0,   // First 50k MAU free — effectively $0
  cloudwatch:  1,   // ~$0.30/metric/month per service monitored
  vpc_endpoint: 1,  // $0.01/hr per AZ (interface endpoints)
}

// Human-readable real AWS monthly cost for the DebriefScreen estimator.
// Values at minimal/typical usage. Shown as informational cost education.
export const REAL_COSTS = {
  igw:         'Free (+ $0.09/GB out)',
  cf:          '~$0/mo + $0.01/10k requests',
  alb:         '~$16/mo + LCU charges',
  ec2:         '~$31/mo (t3.medium)',
  ecs:         '~$32/mo (Fargate)',
  nat:         '~$33/mo (+ $0.045/GB)',
  lambda:      '$0.20/million requests',
  rds:         '~$50/mo (db.t3.medium)',
  dynamo:      '$1.25/million reads',
  s3:          '$0.023/GB stored',
  sqs:         '$0.40/million messages',
  iam:         'Free',
  sg:          'Free',
  rt:          'Free',
  route53:     '$0.50/zone/month',
  apigw:       '$3.50/million calls',
  sns:         '$0.50/million notifications',
  elasticache: '~$25/mo (cache.t3.medium)',
  eventbridge: '$1/million events',
  waf:         '~$6/mo + $0.60/million req',
  cognito:     'Free up to 50k MAU',
  cloudwatch:  '~$0.30/metric/month',
  vpc_endpoint: '$7.30/mo per AZ',
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
    conns: ['igw', 'nat', 'vpc_endpoint'],
    requiresSG: false,
    desc: 'Defines where subnet traffic is routed. Public subnet Route Table has 0.0.0.0/0 → IGW (internet access). Private subnet Route Table has 0.0.0.0/0 → NAT Gateway (outbound only). Without a correct route, traffic goes nowhere.',
    awsFact: 'Your EC2 is in a "public subnet" but can\'t reach the internet? Check the Route Table. The subnet is only public if its Route Table has a route to the IGW. This is the #1 beginner networking mistake in AWS.',
  },

  // ── New services — Phase 1 expansion ──────────────────────────────────────

  {
    id: 'route53',
    icon: '🌍',
    fantasy: 'The Cartographer',
    aws: 'Route 53',
    zone: 'edge',
    cost: 3,
    max: 1,
    conns: ['alb', 'cf'],
    requiresSG: false,
    desc: 'AWS\'s global DNS service. Routes end-user requests to the right endpoint via routing policies: Simple, Weighted, Latency-based, Failover, Geolocation. Also does health checks and DNS failover.',
    awsFact: 'Route 53 is a global service (not regional). It operates at the DNS layer, before a TCP connection is even made. Failover routing lets you reroute traffic in seconds when a health check fails.',
  },

  {
    id: 'apigw',
    icon: '🚪',
    fantasy: 'The Drawbridge',
    aws: 'API Gateway',
    zone: 'public',
    cost: 8,
    max: 2,
    conns: ['lambda', 'ec2', 'ecs'],
    requiresSG: false,
    desc: 'Fully managed API front door. Handles HTTP/REST/WebSocket APIs, rate limiting, authentication (Cognito, Lambda authorizers), request transformation, and caching. Scales to millions of requests/second.',
    awsFact: 'API Gateway charges per API call and per GB of data transfer. For high-throughput APIs, the per-call cost adds up. HTTP APIs are 70% cheaper than REST APIs for most use cases.',
  },

  {
    id: 'sns',
    icon: '📣',
    fantasy: 'The Herald',
    aws: 'SNS',
    zone: 'private',
    cost: 1,
    max: 4,
    conns: ['sqs', 'lambda', 'ec2'],
    requiresSG: false,
    desc: 'Pub/sub fan-out messaging. One SNS topic can deliver to multiple SQS queues, Lambda functions, HTTP endpoints, and email simultaneously. Used for decoupled event notification.',
    awsFact: 'SNS + SQS is the classic AWS fan-out pattern. SNS delivers to all subscribers instantly; SQS provides durable buffering so each consumer can process at its own pace without message loss.',
  },

  {
    id: 'elasticache',
    icon: '🔮',
    fantasy: 'Crystal Orb',
    aws: 'ElastiCache',
    zone: 'private',
    cost: 18,
    max: 2,
    conns: ['rds', 'dynamo'],
    requiresSG: true,
    desc: 'Managed in-memory caching (Redis or Memcached). Sub-millisecond read latency. Used to cache database query results, sessions, leaderboards, and any frequently-read data.',
    awsFact: 'ElastiCache Redis supports persistence, replication, and pub/sub. Memcached is simpler but has no persistence or replication. For new projects, choose Redis — it\'s strictly more capable.',
  },

  {
    id: 'eventbridge',
    icon: '🔭',
    fantasy: 'Prophecy Engine',
    aws: 'EventBridge',
    zone: 'private',
    cost: 2,
    max: 2,
    conns: ['lambda', 'sns', 'sqs'],
    requiresSG: false,
    desc: 'Serverless event bus. Routes events from AWS services, custom apps, and SaaS partners to targets based on content-based rules. Also runs scheduled tasks (cron/rate expressions).',
    awsFact: 'EventBridge replaced CloudWatch Events. It supports 200+ AWS service sources and third-party SaaS integrations. Event patterns match on any JSON field — far more powerful than SNS message filtering.',
  },

  {
    id: 'waf',
    icon: '🛡️',
    fantasy: 'The Ward',
    aws: 'WAF',
    zone: 'edge',
    cost: 12,
    max: 1,
    conns: ['alb', 'cf', 'apigw'],
    requiresSG: false,
    desc: 'Web Application Firewall. Blocks OWASP Top 10 threats (SQL injection, XSS, etc.), rate-limits IPs, geo-blocks, and inspects HTTP headers/bodies. Attaches to ALB, CloudFront, or API Gateway.',
    awsFact: 'WAF charges per WebACL, per rule, and per million requests inspected. AWS Managed Rules give you pre-built OWASP protections. Without WAF, your ALB/CloudFront is exposed to automated attack traffic.',
  },

  {
    id: 'cognito',
    icon: '🔑',
    fantasy: 'The Gatekeeper',
    aws: 'Cognito',
    zone: 'public',
    cost: 4,
    max: 1,
    conns: ['apigw', 'alb'],
    requiresSG: false,
    desc: 'Managed user authentication and authorization. User Pools handle signup/login and issue JWTs. Identity Pools grant temporary AWS credentials to authenticated users. Integrates with social providers (Google, Facebook).',
    awsFact: 'Cognito User Pools are free for the first 50,000 MAUs. JWT tokens from Cognito can be validated directly by API Gateway — no custom authorizer Lambda needed. This is the simplest auth pattern for serverless.',
  },

  {
    id: 'cloudwatch',
    icon: '👁️',
    fantasy: 'All-Seeing Eye',
    aws: 'CloudWatch',
    zone: 'any',
    cost: 3,
    max: 3,
    conns: ['ec2', 'lambda', 'rds', 'ecs', 'alb'],
    requiresSG: false,
    desc: 'AWS\'s observability platform. Collects metrics, logs, and traces from all AWS services. Set alarms that trigger SNS notifications or Auto Scaling. Logs Insights queries let you search log data in seconds.',
    awsFact: 'Every AWS service emits free default metrics to CloudWatch (CPU, request count, error rate). Custom metrics cost $0.30/metric/month. Without CloudWatch, you are flying blind — you won\'t know when things break.',
  },

  {
    id: 'vpc_endpoint',
    icon: '🚇',
    fantasy: 'Secret Passage',
    aws: 'VPC Endpoint',
    zone: 'wall',
    cost: 0,
    max: 4,
    conns: ['s3', 'dynamo'],
    requiresSG: false,
    desc: 'Private connection from your VPC to AWS services (S3, DynamoDB) without internet traffic. Gateway Endpoints (S3/DynamoDB) are free. Interface Endpoints (everything else) cost $0.01/hr per AZ.',
    awsFact: 'Without a VPC Endpoint, Lambda/EC2 in a private subnet must go through NAT Gateway to reach S3 — costing $0.045/GB. An S3 Gateway Endpoint routes traffic privately at zero data-transfer cost. Use it always.',
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

  // ── Mission 4 ─────────────────────────────────────────────────────────────
  {
    id: 3,
    name: 'The Gatekeepers',
    reward: 45,
    lore: "The Drawbridge (API Gateway) controls all passage into the kingdom. Only through it may the Shadow Ninja (Lambda) be reached — and the Ninja must carry a Royal Decree (IAM) to act on the kingdom's behalf.",
    reqs: [
      {
        text: 'Place The Drawbridge (API Gateway) in the public subnet',
        icon: '🚪',
        check: s => s.placed.some(p => p.id === 'apigw' && p.zone === 'public'),
      },
      {
        text: 'Deploy a Shadow Ninja (Lambda) in the private subnet',
        icon: '🥷',
        check: s => s.placed.some(p => p.id === 'lambda' && p.zone === 'private'),
      },
      {
        text: 'API Gateway and Lambda must be adjacent',
        icon: '🔗',
        check: s => checkAdjacent(s, 'apigw', 'lambda'),
      },
      {
        text: 'Lambda needs a Royal Decree (IAM role) adjacent to it',
        icon: '📜',
        check: s => checkAdjacent(s, 'lambda', 'iam'),
      },
    ],
  },

  // ── Mission 5 ─────────────────────────────────────────────────────────────
  {
    id: 4,
    name: "The Herald's Network",
    reward: 40,
    lore: "The Herald (SNS) broadcasts to all Raven Queues (SQS) at once — one shout, many listeners. This is the fan-out pattern: decouple event producers from consumers so each can scale independently.",
    reqs: [
      {
        text: 'Place The Herald (SNS) in the private subnet',
        icon: '📣',
        check: s => s.placed.some(p => p.id === 'sns' && p.zone === 'private'),
      },
      {
        text: 'Deploy two Raven Queues (SQS) in the private subnet',
        icon: '🐦',
        check: s => s.placed.filter(p => p.id === 'sqs' && p.zone === 'private').length >= 2,
      },
      {
        text: 'Both SQS queues must be adjacent to the SNS tile',
        icon: '🔗',
        check: s => {
          const nbFn = s.getNeighbors
          if (!nbFn) return false
          const sns   = s.placed.find(p => p.id === 'sns')
          if (!sns) return false
          const nbrs  = nbFn(sns.row, sns.col)
          const adjSQS = s.placed.filter(p =>
            p.id === 'sqs' && nbrs.some(n => n.row === p.row && n.col === p.col)
          )
          return adjSQS.length >= 2
        },
      },
    ],
  },

  // ── Mission 6 ─────────────────────────────────────────────────────────────
  {
    id: 5,
    name: 'The Warded Gate',
    reward: 50,
    lore: "The Ward (WAF) stands before the Far Watcher (CloudFront). Every request from the Outer Realm must pass through the Ward's runes before reaching your content. Behind the Watcher, the Endless Vault (S3) holds the realm's knowledge.",
    reqs: [
      {
        text: 'Place The Ward (WAF) on an edge tile',
        icon: '🛡️',
        check: s => s.placed.some(p => p.id === 'waf' && p.zone === 'edge'),
      },
      {
        text: 'Station the Far Watcher (CloudFront) on an edge tile',
        icon: '👁',
        check: s => s.placed.some(p => p.id === 'cf' && p.zone === 'edge'),
      },
      {
        text: 'WAF and CloudFront must be adjacent',
        icon: '🔗',
        check: s => checkAdjacent(s, 'waf', 'cf'),
      },
      {
        text: 'CloudFront must connect to S3 (place S3 on an edge tile, adjacent to CloudFront)',
        icon: '🏛',
        check: s => checkAdjacent(s, 'cf', 's3'),
      },
    ],
  },

  // ── Mission 7 ─────────────────────────────────────────────────────────────
  {
    id: 6,
    name: 'The Secret Passage',
    reward: 55,
    lore: "Why send the realm's correspondence through the public roads (and pay the toll) when a Secret Passage (VPC Endpoint) leads directly to the Vault? No NAT required. No gold wasted on data transfer.",
    reqs: [
      {
        text: 'Place the Endless Vault (S3) on an edge tile',
        icon: '🏛',
        check: s => s.placed.some(p => p.id === 's3' && p.zone === 'edge'),
      },
      {
        text: 'Place a Secret Passage (VPC Endpoint) on a wall tile',
        icon: '🚇',
        check: s => s.placed.some(p => p.id === 'vpc_endpoint' && p.zone === 'wall'),
      },
      {
        text: 'Deploy a Shadow Ninja (Lambda) in the private subnet, adjacent to the VPC Endpoint',
        icon: '🥷',
        check: s => {
          const ep = s.placed.find(p => p.id === 'vpc_endpoint' && p.zone === 'wall')
          if (!ep || !s.getNeighbors) return false
          const nbrs = s.getNeighbors(ep.row, ep.col)
          return s.placed.some(p =>
            p.id === 'lambda' && p.zone === 'private' &&
            nbrs.some(n => n.row === p.row && n.col === p.col)
          )
        },
      },
      {
        text: 'No NAT Gateway deployed (use the endpoint, not the public road)',
        icon: '🚫',
        check: s => !s.placed.some(p => p.id === 'nat'),
      },
    ],
  },

  // ── Mission 8 ─────────────────────────────────────────────────────────────
  {
    id: 7,
    name: 'The Crystal Memory',
    reward: 50,
    lore: "The Crystal Orb (ElastiCache) remembers answers so the Great Library (RDS) need not be consulted every time. Cache reads — only consult the library on a miss. Your database breathes easy.",
    reqs: [
      {
        text: 'Place the Great Library (RDS) in the private subnet',
        icon: '📚',
        check: s => s.placed.some(p => p.id === 'rds' && p.zone === 'private'),
      },
      {
        text: 'Place the Crystal Orb (ElastiCache) in the private subnet',
        icon: '🔮',
        check: s => s.placed.some(p => p.id === 'elasticache' && p.zone === 'private'),
      },
      {
        text: 'ElastiCache and RDS must be adjacent (cache sits in front of DB)',
        icon: '🔗',
        check: s => checkAdjacent(s, 'elasticache', 'rds'),
      },
      {
        text: 'EC2 or Lambda must be adjacent to ElastiCache (reads cache first)',
        icon: '⚔️',
        check: s => checkAdjacent(s, 'ec2', 'elasticache') || checkAdjacent(s, 'lambda', 'elasticache'),
      },
    ],
  },

  // ── Mission 9 ─────────────────────────────────────────────────────────────
  {
    id: 8,
    name: "The Cartographer's Map",
    reward: 45,
    lore: "Before any traveler can find the kingdom, the Cartographer (Route 53) must mark it on the map. DNS is the first step of every request — without it, the Siege Shield (ALB) is unreachable by name.",
    reqs: [
      {
        text: 'Place The Cartographer (Route 53) on an edge tile',
        icon: '🌍',
        check: s => s.placed.some(p => p.id === 'route53' && p.zone === 'edge'),
      },
      {
        text: 'Place a Siege Shield (ALB) in the public subnet',
        icon: '🛡',
        check: s => s.placed.some(p => p.id === 'alb' && p.zone === 'public'),
      },
      {
        text: 'Route 53 and ALB must be adjacent',
        icon: '🔗',
        check: s => checkAdjacent(s, 'route53', 'alb'),
      },
      {
        text: 'At least two Iron Knights (EC2) behind the ALB',
        icon: '⚔️',
        check: s => {
          const albs = s.placed.filter(p => p.id === 'alb')
          if (!albs.length || !s.getNeighbors) return false
          const adjEC2 = new Set()
          for (const alb of albs) {
            const nbrs = s.getNeighbors(alb.row, alb.col)
            for (const p of s.placed) {
              if (p.id === 'ec2' && nbrs.some(n => n.row === p.row && n.col === p.col)) {
                adjEC2.add(`${p.row},${p.col}`)
              }
            }
          }
          return adjEC2.size >= 2
        },
      },
    ],
  },

  // ── Mission 10 ────────────────────────────────────────────────────────────
  {
    id: 9,
    name: 'The Gatekeeper\'s Decree',
    reward: 55,
    lore: "The Gatekeeper (Cognito) stands before The Drawbridge (API Gateway). No traveler may pass without a verified token. The Shadow Ninja (Lambda) behind the gate needs a Royal Decree (IAM) to act.",
    reqs: [
      {
        text: 'Place The Gatekeeper (Cognito) in the public subnet',
        icon: '🔑',
        check: s => s.placed.some(p => p.id === 'cognito' && p.zone === 'public'),
      },
      {
        text: 'Place The Drawbridge (API Gateway) adjacent to Cognito',
        icon: '🚪',
        check: s => checkAdjacent(s, 'cognito', 'apigw'),
      },
      {
        text: 'Deploy a Shadow Ninja (Lambda) in the private subnet, adjacent to API Gateway',
        icon: '🥷',
        check: s => {
          const apigws = s.placed.filter(p => p.id === 'apigw')
          if (!apigws.length || !s.getNeighbors) return false
          return apigws.some(gw => {
            const nbrs = s.getNeighbors(gw.row, gw.col)
            return s.placed.some(p =>
              p.id === 'lambda' && p.zone === 'private' &&
              nbrs.some(n => n.row === p.row && n.col === p.col)
            )
          })
        },
      },
      {
        text: 'Lambda must have an IAM Royal Decree adjacent',
        icon: '📜',
        check: s => checkAdjacent(s, 'lambda', 'iam'),
      },
    ],
  },

  // ── Mission 11 ────────────────────────────────────────────────────────────
  {
    id: 10,
    name: 'The Watchful Eye',
    reward: 40,
    lore: "A kingdom that cannot see itself is blind to its own fall. The All-Seeing Eye (CloudWatch) must watch over your compute, your functions, and your library. What you cannot measure, you cannot improve.",
    reqs: [
      {
        text: 'Deploy at least one EC2, one Lambda, and one RDS',
        icon: '⚙️',
        check: s =>
          s.placed.some(p => p.id === 'ec2') &&
          s.placed.some(p => p.id === 'lambda') &&
          s.placed.some(p => p.id === 'rds'),
      },
      {
        text: 'Place an All-Seeing Eye (CloudWatch) adjacent to EC2',
        icon: '👁️',
        check: s => checkAdjacent(s, 'cloudwatch', 'ec2'),
      },
      {
        text: 'Place an All-Seeing Eye (CloudWatch) adjacent to Lambda',
        icon: '👁️',
        check: s => checkAdjacent(s, 'cloudwatch', 'lambda'),
      },
      {
        text: 'Place an All-Seeing Eye (CloudWatch) adjacent to RDS',
        icon: '👁️',
        check: s => checkAdjacent(s, 'cloudwatch', 'rds'),
      },
    ],
  },

  // ── Mission 12 ────────────────────────────────────────────────────────────
  {
    id: 11,
    name: 'The Siege Withstood',
    reward: 60,
    lore: "When the traffic siege comes, one knight is not enough. Three Iron Knights (EC2) behind the Siege Shield (ALB) can take turns — if one falls, the others hold the line. This is horizontal scaling.",
    reqs: [
      {
        text: 'Place a Siege Shield (ALB) in the public subnet',
        icon: '🛡',
        check: s => s.placed.some(p => p.id === 'alb' && p.zone === 'public'),
      },
      {
        text: 'Deploy at least 3 Iron Knights (EC2) behind the ALB (adjacent to it)',
        icon: '⚔️',
        check: s => {
          const albs = s.placed.filter(p => p.id === 'alb')
          if (!albs.length || !s.getNeighbors) return false
          const adjEC2 = new Set()
          for (const alb of albs) {
            const nbrs = s.getNeighbors(alb.row, alb.col)
            for (const p of s.placed) {
              if (p.id === 'ec2' && nbrs.some(n => n.row === p.row && n.col === p.col)) {
                adjEC2.add(`${p.row},${p.col}`)
              }
            }
          }
          return adjEC2.size >= 3
        },
      },
      {
        text: 'Each EC2 must have a Permission Scroll (Security Group)',
        icon: '🔰',
        check: s => {
          const ec2s = s.placed.filter(p => p.id === 'ec2')
          if (!ec2s.length || !s.getNeighbors) return false
          return ec2s.every(ec => {
            const nbrs = s.getNeighbors(ec.row, ec.col)
            return s.placed.some(p => p.id === 'sg' && nbrs.some(n => n.row === p.row && n.col === p.col))
          })
        },
      },
    ],
  },

  // ── Mission 13 ────────────────────────────────────────────────────────────
  {
    id: 12,
    name: 'The Prophecy Fulfilled',
    reward: 55,
    lore: "The Prophecy Engine (EventBridge) sees all events — scheduled and reactive. It summons the Shadow Ninja (Lambda) on a schedule and fans events to the Herald (SNS). Orchestration through events, not code.",
    reqs: [
      {
        text: 'Place the Prophecy Engine (EventBridge) in the private subnet',
        icon: '🔭',
        check: s => s.placed.some(p => p.id === 'eventbridge' && p.zone === 'private'),
      },
      {
        text: 'EventBridge must be adjacent to Lambda (scheduled invocation)',
        icon: '🔗',
        check: s => checkAdjacent(s, 'eventbridge', 'lambda'),
      },
      {
        text: 'EventBridge must be adjacent to SNS (event fan-out)',
        icon: '🔗',
        check: s => checkAdjacent(s, 'eventbridge', 'sns'),
      },
      {
        text: 'Lambda must have an IAM Royal Decree adjacent',
        icon: '📜',
        check: s => checkAdjacent(s, 'lambda', 'iam'),
      },
    ],
  },

  // ── Mission 14 ────────────────────────────────────────────────────────────
  {
    id: 13,
    name: 'The Full Kingdom',
    reward: 100,
    lore: "All the pieces. IGW for entry. Route53 for DNS. WAF before CloudFront. ALB routing to EC2. RDS with ElastiCache in front. SQS feeding Lambda. Everything watched by CloudWatch. This is production-grade AWS.",
    reqs: [
      {
        text: 'Internet Gateway placed on edge tile',
        icon: '🌐',
        check: s => s.placed.some(p => p.id === 'igw'),
      },
      {
        text: 'Route 53 → ALB → EC2 chain present',
        icon: '🌍',
        check: s =>
          s.placed.some(p => p.id === 'route53') &&
          s.placed.some(p => p.id === 'alb') &&
          s.placed.some(p => p.id === 'ec2') &&
          checkAdjacent(s, 'route53', 'alb') &&
          checkAdjacent(s, 'alb', 'ec2'),
      },
      {
        text: 'ElastiCache in front of RDS (both in private subnet)',
        icon: '🔮',
        check: s =>
          s.placed.some(p => p.id === 'elasticache' && p.zone === 'private') &&
          s.placed.some(p => p.id === 'rds' && p.zone === 'private') &&
          checkAdjacent(s, 'elasticache', 'rds'),
      },
      {
        text: 'SQS → Lambda pipeline with IAM Decree',
        icon: '🥷',
        check: s =>
          checkAdjacent(s, 'sqs', 'lambda') &&
          checkAdjacent(s, 'lambda', 'iam'),
      },
      {
        text: 'CloudWatch monitoring at least 3 services',
        icon: '👁️',
        check: s => {
          if (!s.getNeighbors) return false
          const cws = s.placed.filter(p => p.id === 'cloudwatch')
          const watched = new Set()
          for (const cw of cws) {
            const nbrs = s.getNeighbors(cw.row, cw.col)
            for (const p of s.placed) {
              if (p.id !== 'cloudwatch' && nbrs.some(n => n.row === p.row && n.col === p.col)) {
                watched.add(p.id)
              }
            }
          }
          return watched.size >= 3
        },
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

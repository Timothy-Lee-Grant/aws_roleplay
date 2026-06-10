/**
 * validator.js — Pure function architecture diagnostics.
 *
 * Called every time `placed` changes. Returns an array of warnings that
 * describe anti-patterns, missing components, and best-practice violations —
 * independent of which mission is active.
 *
 * Signature: validateArchitecture(placed, getNeighbors) → Warning[]
 *
 * Warning shape: { severity: 'critical'|'warning'|'info', code, title, message }
 *
 * Rules here should reflect real AWS best practices. If something wouldn't
 * cause a production incident, it doesn't need to be a 'critical' warning.
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

function isAdjacent(placed, getNeighbors, idA, idB) {
  const as = placed.filter(p => p.id === idA)
  const bs = placed.filter(p => p.id === idB)
  for (const a of as) {
    const nbrs = getNeighbors(a.row, a.col)
    for (const b of bs) {
      if (nbrs.some(n => n.row === b.row && n.col === b.col)) return true
    }
  }
  return false
}

function hasService(placed, id) {
  return placed.some(p => p.id === id)
}

function countService(placed, id) {
  return placed.filter(p => p.id === id).length
}

function hasAdjacentSG(placed, getNeighbors, serviceId) {
  const svc = placed.find(p => p.id === serviceId)
  if (!svc) return true  // service not placed — no warning needed
  const nbrs = getNeighbors(svc.row, svc.col)
  return placed.some(p => p.id === 'sg' && nbrs.some(n => n.row === p.row && n.col === p.col))
}

// ── Main validator ─────────────────────────────────────────────────────────────

/**
 * @param {Array} placed  — array of { id, row, col, zone }
 * @param {Function} getNeighbors — (row, col) → [{row, col}]
 * @returns {Array<{severity, code, title, message}>}
 */
export function validateArchitecture(placed, getNeighbors) {
  if (!placed || placed.length === 0 || !getNeighbors) return []

  const warnings = []

  const push = (severity, code, title, message) =>
    warnings.push({ severity, code, title, message })

  // ── Critical violations ───────────────────────────────────────────────────

  // RDS in public subnet
  if (placed.some(p => p.id === 'rds' && p.zone === 'public')) {
    push('critical', 'PUBLIC_DATABASE',
      'Database exposed to internet',
      'The Great Library (RDS) is in the Public Subnet. Real databases must NEVER be publicly accessible. Move it to the Private Subnet (teal tiles).')
  }

  // DynamoDB in public subnet
  if (placed.some(p => p.id === 'dynamo' && p.zone === 'public')) {
    push('critical', 'PUBLIC_NOSQL',
      'NoSQL database exposed',
      'Ancient Ruins (DynamoDB) is in the Public Subnet. DynamoDB is a regional service — it should be accessed from private resources via IAM, not placed publicly.')
  }

  // ElastiCache in public subnet
  if (placed.some(p => p.id === 'elasticache' && p.zone === 'public')) {
    push('critical', 'PUBLIC_CACHE',
      'Cache exposed to internet',
      'Crystal Orb (ElastiCache) has no authentication by default. In the public subnet it would be accessible to the internet. Move to private subnet.')
  }

  // Lambda in public subnet (not wrong, just unusual — make it a warning)
  if (placed.some(p => p.id === 'lambda' && p.zone === 'public')) {
    push('warning', 'LAMBDA_PUBLIC_SUBNET',
      'Lambda in public subnet',
      'Shadow Ninja (Lambda) in the public subnet is unusual. Lambda only needs VPC placement when accessing private resources like RDS. Outside VPC is simpler and has better cold start performance.')
  }

  // ── Missing critical components ───────────────────────────────────────────

  // EC2/ECS without ALB (single point of failure for web traffic)
  const hasPublicCompute = placed.some(p => (p.id === 'ec2' || p.id === 'ecs') && p.zone === 'public')
  const hasALB = hasService(placed, 'alb')
  if (hasPublicCompute && !hasALB) {
    push('warning', 'COMPUTE_WITHOUT_LB',
      'No load balancer',
      'You have compute in the public subnet but no Siege Shield (ALB). Direct internet traffic to EC2/ECS creates a single point of failure and no easy way to scale horizontally.')
  }

  // IGW missing when public resources are present
  const hasPublicServices = placed.some(p =>
    (p.id === 'ec2' || p.id === 'alb' || p.id === 'ecs') && p.zone === 'public'
  )
  if (hasPublicServices && !hasService(placed, 'igw')) {
    push('critical', 'MISSING_IGW',
      'No Internet Gateway',
      'You have public subnet resources but no Iron Gate (Internet Gateway). Without an IGW attached to the VPC, no internet traffic can reach your public subnet. Your ALB/EC2 is unreachable.')
  }

  // Private subnet resources with no outbound path (NAT or VPC Endpoint)
  const hasPrivateCompute = placed.some(p =>
    (p.id === 'ec2' || p.id === 'lambda' || p.id === 'ecs') && p.zone === 'private'
  )
  const hasNAT = hasService(placed, 'nat')
  const hasVPCEndpoint = hasService(placed, 'vpc_endpoint')
  if (hasPrivateCompute && !hasNAT && !hasVPCEndpoint) {
    push('info', 'NO_OUTBOUND_PATH',
      'Private resources have no outbound path',
      'EC2/Lambda in the private subnet cannot reach the internet or AWS services (S3, DynamoDB) without a Secret Tunnel (NAT) or Secret Passage (VPC Endpoint). Add one if they need outbound access.')
  }

  // ── Security best practices ───────────────────────────────────────────────

  // RDS without Security Group
  if (hasService(placed, 'rds') && !hasAdjacentSG(placed, getNeighbors, 'rds')) {
    push('warning', 'RDS_NO_SG',
      'RDS missing Security Group',
      'The Great Library (RDS) has no Permission Scroll (Security Group) adjacent. In real AWS, RDS with no SG configured allows all traffic. Place an SG tile adjacent to restrict access.')
  }

  // EC2 without Security Group
  const ec2s = placed.filter(p => p.id === 'ec2')
  const ec2WithoutSG = ec2s.filter(ec => {
    const nbrs = getNeighbors(ec.row, ec.col)
    return !placed.some(p => p.id === 'sg' && nbrs.some(n => n.row === p.row && n.col === p.col))
  })
  if (ec2WithoutSG.length > 0) {
    push('warning', 'EC2_NO_SG',
      `${ec2WithoutSG.length} EC2 instance${ec2WithoutSG.length > 1 ? 's' : ''} missing Security Group`,
      'Iron Knights (EC2) without Permission Scrolls (SGs) are unprotected. In production every EC2 instance needs a Security Group defining allowed inbound ports and source IPs.')
  }

  // Lambda with no IAM role
  if (hasService(placed, 'lambda') && !isAdjacent(placed, getNeighbors, 'lambda', 'iam')) {
    push('warning', 'LAMBDA_NO_IAM',
      'Lambda missing IAM role',
      'Shadow Ninja (Lambda) has no Royal Decree (IAM Role) adjacent. Without an execution role, Lambda cannot call any AWS API — not S3, not DynamoDB, not CloudWatch. It will fail immediately.')
  }

  // ECS with no IAM role
  if (hasService(placed, 'ecs') && !isAdjacent(placed, getNeighbors, 'ecs', 'iam')) {
    push('info', 'ECS_NO_IAM',
      'ECS missing task execution role',
      'The Barracks (ECS) has no Royal Decree (IAM Role). ECS tasks need a task execution role (to pull images) and optionally a task role (to call AWS APIs). Without them, tasks may fail to start.')
  }

  // ── Cost optimizations ────────────────────────────────────────────────────

  // NAT Gateway but S3 without VPC Endpoint
  if (hasNAT && hasService(placed, 's3') && !hasVPCEndpoint) {
    push('info', 'S3_VIA_NAT',
      'S3 traffic routed through NAT Gateway',
      'You have a Secret Tunnel (NAT) and an Endless Vault (S3) but no Secret Passage (VPC Endpoint). S3 traffic through NAT costs $0.045/GB. A free Gateway Endpoint bypasses NAT entirely.')
  }

  // Multiple NAT Gateways
  if (countService(placed, 'nat') > 1) {
    push('info', 'MULTI_NAT',
      'Multiple NAT Gateways',
      'Good — multiple NAT Gateways means each AZ has its own outbound path. Sharing one NAT across AZs creates cross-AZ data transfer charges ($0.01/GB). This is the correct multi-AZ pattern.')
  }

  // ── Observability ─────────────────────────────────────────────────────────

  // Services present but no CloudWatch
  const monitoredServices = ['ec2', 'lambda', 'rds', 'ecs', 'alb']
  const hasMonitoredService = placed.some(p => monitoredServices.includes(p.id))
  if (hasMonitoredService && !hasService(placed, 'cloudwatch')) {
    push('info', 'NO_MONITORING',
      'No monitoring configured',
      'You have compute and data services but no All-Seeing Eye (CloudWatch). Without monitoring you won\'t know when services fail, spike in cost, or degrade. Add CloudWatch adjacent to critical services.')
  }

  // ── Positive reinforcement ────────────────────────────────────────────────

  // Good: ElastiCache in front of RDS
  if (isAdjacent(placed, getNeighbors, 'elasticache', 'rds') &&
      placed.some(p => p.id === 'elasticache' && p.zone === 'private') &&
      placed.some(p => p.id === 'rds' && p.zone === 'private')) {
    push('info', 'CACHE_PATTERN',
      '✓ Caching layer in place',
      'Crystal Orb (ElastiCache) is correctly positioned in front of the Great Library (RDS). Cache reads reduce database load and improve response latency from milliseconds to microseconds.')
  }

  // Good: VPC Endpoint used instead of NAT for S3
  if (hasVPCEndpoint && hasService(placed, 's3') && !hasNAT) {
    push('info', 'ENDPOINT_PATTERN',
      '✓ Cost-efficient S3 access',
      'Using a Secret Passage (VPC Endpoint) instead of NAT Gateway for S3 access. This routes traffic privately at zero data-transfer cost — a real-world cost optimization worth applying in production.')
  }

  return warnings
}

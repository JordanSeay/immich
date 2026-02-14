# =============================================================================
# ElastiCache Module - Redis
# =============================================================================

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.app_name}-${var.environment}-redis-subnet"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.app_name}-${var.environment}-redis-subnet"
    Environment = var.environment
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.app_name}-${var.environment}-redis"
  description          = "Redis cluster for ${var.app_name} ${var.environment}"

  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  port                 = 6379
  engine               = "redis"
  engine_version       = var.use_localstack ? null : "7.1"
  parameter_group_name = var.use_localstack ? null : "default.redis7"

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.security_group_id]

  automatic_failover_enabled = var.num_cache_clusters > 1
  multi_az_enabled           = var.num_cache_clusters > 1

  at_rest_encryption_enabled = !var.use_localstack
  transit_encryption_enabled = false # Enable when apps support TLS

  tags = {
    Name        = "${var.app_name}-${var.environment}-redis"
    Environment = var.environment
  }
}

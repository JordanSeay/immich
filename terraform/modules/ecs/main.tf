# =============================================================================
# ECS Module - Fargate Cluster, Task Definitions, Services
# =============================================================================
# TODO: Add aws_appautoscaling_target and aws_appautoscaling_policy for CPU/memory-based scaling
# TODO: Add deployment_circuit_breaker to ECS service for auto-rollback on failed deployments
# TODO: Add CloudWatch alarms for task failures and high error rates

# --- CloudWatch Log Groups ---

resource "aws_cloudwatch_log_group" "immich_server" {
  name              = "/ecs/${var.app_name}-${var.environment}/immich-server"
  retention_in_days = 14

  tags = {
    Name        = "${var.app_name}-${var.environment}-server-logs"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "immich_ml" {
  name              = "/ecs/${var.app_name}-${var.environment}/immich-ml"
  retention_in_days = 14

  tags = {
    Name        = "${var.app_name}-${var.environment}-ml-logs"
    Environment = var.environment
  }
}

# --- ECS Cluster ---

resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = var.use_localstack ? "disabled" : "enabled"
  }

  tags = {
    Name        = "${var.app_name}-${var.environment}"
    Environment = var.environment
  }
}

# --- Task Definition: Immich Server ---

resource "aws_ecs_task_definition" "immich_server" {
  family                   = "${var.app_name}-${var.environment}-server"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "immich-server"
      image     = "ghcr.io/immich-app/immich-server:${var.immich_version}"
      essential = true
      # TODO: Make cpu/memory configurable via variables
      cpu       = 512
      memory    = 1024

      portMappings = [
        {
          containerPort = 2283
          hostPort      = 2283
          protocol      = "tcp"
        }
      ]

      environment = concat(
        [
          { name = "DB_HOSTNAME", value = var.db_hostname },
          { name = "DB_USERNAME", value = var.db_username },
          # TODO: Use AWS Secrets Manager + container secrets block instead of plaintext
          { name = "DB_PASSWORD", value = var.db_password },
          { name = "DB_DATABASE_NAME", value = var.db_name },
          { name = "REDIS_HOSTNAME", value = var.redis_hostname },
          { name = "IMMICH_STORAGE_BACKEND", value = "s3" },
          { name = "IMMICH_S3_BUCKET", value = var.s3_bucket },
          { name = "IMMICH_S3_REGION", value = var.s3_region },
          { name = "IMMICH_S3_FORCE_PATH_STYLE", value = tostring(var.use_localstack) },
        ],
        var.s3_endpoint != null ? [
          { name = "IMMICH_S3_ENDPOINT", value = var.s3_endpoint },
          { name = "IMMICH_S3_ACCESS_KEY", value = "test" },
          { name = "IMMICH_S3_SECRET_KEY", value = "test" },
        ] : []
      )

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:2283/api/server/ping || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.immich_server.name
          "awslogs-region"        = var.s3_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Name        = "${var.app_name}-${var.environment}-server"
    Environment = var.environment
  }
}

# --- Task Definition: Immich Machine Learning ---

resource "aws_ecs_task_definition" "immich_ml" {
  family                   = "${var.app_name}-${var.environment}-ml"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "immich-ml"
      image     = "ghcr.io/immich-app/immich-machine-learning:${var.immich_version}"
      essential = true
      cpu       = 1024
      memory    = 2048

      environment = [
        { name = "IMMICH_HOST", value = "0.0.0.0" },
      ]

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3003/ping || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 120
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.immich_ml.name
          "awslogs-region"        = var.s3_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Name        = "${var.app_name}-${var.environment}-ml"
    Environment = var.environment
  }
}

# --- ECS Service: Immich Server ---

resource "aws_ecs_service" "immich_server" {
  name            = "${var.app_name}-${var.environment}-server"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.immich_server.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = var.use_localstack
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "immich-server"
    container_port   = 2283
  }

  tags = {
    Name        = "${var.app_name}-${var.environment}-server"
    Environment = var.environment
  }
}

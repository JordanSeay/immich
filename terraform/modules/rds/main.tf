# =============================================================================
# RDS Module - PostgreSQL Database
# =============================================================================
# TODO: Add lifecycle prevent_destroy to protect against accidental deletion
# TODO: Add CloudWatch alarms for CPU, memory, storage, and connection count

resource "aws_db_subnet_group" "main" {
  name       = "${var.app_name}-${var.environment}-db-subnet"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.app_name}-${var.environment}-db-subnet"
    Environment = var.environment
  }
}

resource "aws_db_parameter_group" "postgres" {
  count = var.use_localstack ? 0 : 1

  name   = "${var.app_name}-${var.environment}-pg-params"
  family = "postgres15"

  # Immich uses the pgvectors extension (pgvecto.rs, library name "vectors.so").
  # This is distinct from the pgvector extension ("vector.so").
  parameter {
    name  = "shared_preload_libraries"
    value = "vectors.so"
  }

  parameter {
    name  = "max_wal_size"
    value = "2048" # 2GB in MB
  }

  tags = {
    Name        = "${var.app_name}-${var.environment}-pg-params"
    Environment = var.environment
  }
}

resource "aws_db_instance" "main" {
  identifier = "${var.app_name}-${var.environment}-db"

  engine         = "postgres"
  engine_version = var.use_localstack ? null : "15"
  instance_class = var.instance_class

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  allocated_storage     = 20
  max_allocated_storage = var.use_localstack ? null : 100

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.security_group_id]
  parameter_group_name   = var.use_localstack ? null : aws_db_parameter_group.postgres[0].name

  multi_az            = var.multi_az
  publicly_accessible = false
  storage_encrypted   = !var.use_localstack

  backup_retention_period = var.use_localstack ? 0 : 7

  skip_final_snapshot       = var.use_localstack
  final_snapshot_identifier = "${var.app_name}-${var.environment}-db-final"

  tags = {
    Name        = "${var.app_name}-${var.environment}-db"
    Environment = var.environment
  }
}

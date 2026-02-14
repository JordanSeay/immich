# =============================================================================
# Immich AWS Infrastructure - Root Module
# =============================================================================
#
# Deploys a complete Immich stack on AWS (or LocalStack for local development).
#
# Modules:
#   - vpc:         VPC, subnets, NAT, security groups, S3 VPC endpoint
#   - s3:          Media storage bucket with versioning & encryption
#   - rds:         PostgreSQL database with pgvectors extension
#   - elasticache: Redis cache cluster
#   - iam:         ECS task roles with S3 permissions
#   - ecs:         Fargate cluster, task definitions, services
#   - alb:         Application Load Balancer
#
# Usage:
#   terraform init
#   terraform plan -var-file=environments/local.tfvars
#   terraform apply -var-file=environments/local.tfvars -auto-approve
#

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # State stored locally for now (no remote backend until AWS is used)
  # TODO: Enable remote state with DynamoDB lock table for team collaboration:
  # backend "s3" {
  #   bucket         = "immich-terraform-state"
  #   key            = "immich/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-lock"
  #   encrypt        = true
  # }
}

# =============================================================================
# Provider Configuration
# =============================================================================

provider "aws" {
  region = var.aws_region

  # LocalStack overrides
  access_key = var.use_localstack ? "test" : null
  secret_key = var.use_localstack ? "test" : null

  skip_credentials_validation = var.use_localstack
  skip_metadata_api_check     = var.use_localstack
  skip_requesting_account_id  = var.use_localstack

  dynamic "endpoints" {
    for_each = var.use_localstack ? [1] : []
    content {
      s3             = var.localstack_endpoint
      iam            = var.localstack_endpoint
      ecs            = var.localstack_endpoint
      ec2            = var.localstack_endpoint
      rds            = var.localstack_endpoint
      elasticache    = var.localstack_endpoint
      elbv2          = var.localstack_endpoint
      cloudwatchlogs = var.localstack_endpoint
      secretsmanager = var.localstack_endpoint
      sts            = var.localstack_endpoint
    }
  }
}

# =============================================================================
# Modules
# =============================================================================

module "vpc" {
  source = "./modules/vpc"

  app_name        = var.app_name
  environment     = var.environment
  vpc_cidr        = var.vpc_cidr
  use_localstack  = var.use_localstack
}

module "s3" {
  source = "./modules/s3"

  app_name              = var.app_name
  environment           = var.environment
  s3_bucket_name        = var.s3_bucket_name
  enable_versioning     = var.s3_enable_versioning
  enable_encryption     = var.s3_enable_encryption
  use_localstack        = var.use_localstack
}

module "iam" {
  source = "./modules/iam"

  app_name       = var.app_name
  environment    = var.environment
  s3_bucket_arn  = module.s3.bucket_arn
  use_localstack = var.use_localstack
}

module "rds" {
  source = "./modules/rds"

  app_name           = var.app_name
  environment        = var.environment
  instance_class     = var.rds_instance_class
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = var.db_password
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_id  = module.vpc.rds_security_group_id
  multi_az           = var.rds_multi_az
  use_localstack     = var.use_localstack
}

module "elasticache" {
  source = "./modules/elasticache"

  app_name            = var.app_name
  environment         = var.environment
  node_type           = var.redis_node_type
  num_cache_clusters  = var.redis_num_cache_clusters
  subnet_ids          = module.vpc.private_subnet_ids
  security_group_id   = module.vpc.redis_security_group_id
  use_localstack      = var.use_localstack
}

module "ecs" {
  source = "./modules/ecs"

  app_name              = var.app_name
  environment           = var.environment
  immich_version        = var.immich_version
  desired_count         = var.ecs_desired_count
  subnet_ids            = module.vpc.private_subnet_ids
  security_group_id     = module.vpc.ecs_security_group_id
  execution_role_arn    = module.iam.ecs_execution_role_arn
  task_role_arn         = module.iam.ecs_task_role_arn
  target_group_arn      = module.alb.target_group_arn
  s3_bucket             = module.s3.bucket_name
  s3_region             = var.aws_region
  s3_endpoint           = var.use_localstack ? var.localstack_endpoint : null
  db_hostname           = module.rds.endpoint
  db_name               = var.db_name
  db_username           = var.db_username
  db_password           = var.db_password
  redis_hostname        = module.elasticache.endpoint
  use_localstack        = var.use_localstack
}

module "alb" {
  source = "./modules/alb"

  app_name          = var.app_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.public_subnet_ids
  security_group_id = module.vpc.alb_security_group_id
  use_localstack    = var.use_localstack
}

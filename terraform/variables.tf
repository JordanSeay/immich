# =============================================================================
# Variables
# =============================================================================

# --- General ---

variable "app_name" {
  description = "Application name prefix for all resources"
  type        = string
  default     = "immich"
}

variable "environment" {
  description = "Deployment environment (local, dev, staging, prod)"
  type        = string
  default     = "local"
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

# --- LocalStack ---

variable "use_localstack" {
  description = "Use LocalStack instead of AWS (for local development)"
  type        = bool
  default     = true
}

variable "localstack_endpoint" {
  description = "LocalStack endpoint URL"
  type        = string
  default     = "http://localhost:4566"
}

# --- VPC ---

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# --- S3 ---

variable "s3_bucket_name" {
  description = "Name of the S3 bucket for media storage"
  type        = string
  default     = "immich-media"
}

variable "s3_enable_versioning" {
  description = "Enable S3 bucket versioning"
  type        = bool
  default     = true
}

variable "s3_enable_encryption" {
  description = "Enable S3 server-side encryption"
  type        = bool
  default     = true
}

# --- RDS ---

variable "rds_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "immich"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
  default     = "postgres"
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = false
}

# --- ElastiCache / Redis ---

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_clusters" {
  description = "Number of Redis cache clusters"
  type        = number
  default     = 1
}

# --- ECS ---

variable "immich_version" {
  description = "Immich Docker image version tag"
  type        = string
  default     = "release"
}

variable "ecs_desired_count" {
  description = "Desired number of ECS service instances"
  type        = number
  default     = 1
}

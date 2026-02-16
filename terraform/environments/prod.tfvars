# =============================================================================
# Production AWS Account
# =============================================================================
# This file should be populated from a secrets manager or CI/CD pipeline.
# NEVER commit db_password in plain text.

environment = "prod"

# --- LocalStack ---
use_localstack = false

# --- General ---
app_name   = "immich"
aws_region = "us-east-1"

# --- S3 ---
s3_bucket_name       = "immich-media-prod"
s3_enable_versioning = true
s3_enable_encryption = true

# --- RDS ---
rds_instance_class = "db.r6g.large"
db_name            = "immich"
db_username        = "immich_admin"
db_password        = ""  # Injected via TF_VAR_db_password in CI/CD
rds_multi_az       = true

# --- Redis ---
redis_node_type          = "cache.r6g.large"
redis_num_cache_clusters = 2

# --- ECS ---
immich_version    = "release"
ecs_desired_count = 2

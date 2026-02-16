# =============================================================================
# Local Development (LocalStack)
# =============================================================================

environment = "local"

# --- LocalStack ---
use_localstack      = true
localstack_endpoint = "http://localhost:4566"

# --- General ---
app_name   = "immich"
aws_region = "us-east-1"

# --- S3 ---
s3_bucket_name       = "immich-media"
s3_enable_versioning = true
s3_enable_encryption = false  # Not needed for LocalStack

# --- RDS ---
rds_instance_class = "db.t3.micro"
db_name            = "immich"
db_username        = "postgres"
db_password        = "postgres"
rds_multi_az       = false

# --- Redis ---
redis_node_type          = "cache.t3.micro"
redis_num_cache_clusters = 1

# --- ECS ---
immich_version    = "release"
ecs_desired_count = 1

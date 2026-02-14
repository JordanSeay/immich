#!/usr/bin/env bash
# =============================================================================
# Terraform + LocalStack Validation Script
# =============================================================================
# Deploys all Terraform modules against LocalStack, validates resources,
# then tears everything down.
#
# Prerequisites:
#   - Docker running
#   - terraform CLI installed
#   - awscli installed (for verification)
#
# Usage:
#   ./scripts/terraform-localstack.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TF_DIR="$PROJECT_DIR/terraform"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cleanup() {
  log_info "Cleaning up..."
  cd "$TF_DIR"
  if ! terraform destroy -var-file=environments/local.tfvars -auto-approve 2>/dev/null; then
    log_warn "Terraform destroy failed during cleanup; resources may remain in LocalStack."
  fi
  if ! docker compose -f "$PROJECT_DIR/docker-compose.localstack.yml" down -v 2>/dev/null; then
    log_warn "Docker compose down failed during cleanup; LocalStack containers/volumes may still be running."
  fi
}

trap cleanup EXIT

# -------------------------------------------------------------------------
# Step 1: Start LocalStack
# -------------------------------------------------------------------------
log_info "Starting LocalStack..."
docker compose -f "$PROJECT_DIR/docker-compose.localstack.yml" up -d localstack

log_info "Waiting for LocalStack to be healthy..."
for i in $(seq 1 30); do
  if docker exec immich_localstack awslocal s3 ls 2>/dev/null; then
    log_info "LocalStack is ready!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    log_error "LocalStack failed to start"
    exit 1
  fi
  sleep 2
done

# -------------------------------------------------------------------------
# Step 2: Terraform init & plan
# -------------------------------------------------------------------------
log_info "Running terraform init..."
cd "$TF_DIR"
terraform init -input=false

log_info "Running terraform plan..."
terraform plan -var-file=environments/local.tfvars -out=tfplan

# -------------------------------------------------------------------------
# Step 3: Terraform apply
# -------------------------------------------------------------------------
log_info "Running terraform apply..."
terraform apply -auto-approve tfplan

# -------------------------------------------------------------------------
# Step 4: Verify resources
# -------------------------------------------------------------------------
log_info "Verifying deployed resources..."

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
ENDPOINT="http://localhost:4566"

ERRORS=0

# S3 Bucket
log_info "Checking S3 bucket..."
if aws --endpoint-url="$ENDPOINT" s3 ls s3://immich-media 2>/dev/null; then
  log_info "✓ S3 bucket 'immich-media' exists"
else
  log_error "✗ S3 bucket not found"
  ERRORS=$((ERRORS + 1))
fi

# IAM Roles
log_info "Checking IAM roles..."
for role in immich-local-ecs-execution-role immich-local-ecs-task-role; do
  if aws --endpoint-url="$ENDPOINT" iam get-role --role-name "$role" 2>/dev/null | grep -q RoleName; then
    log_info "✓ IAM role '$role' exists"
  else
    log_error "✗ IAM role '$role' not found"
    ERRORS=$((ERRORS + 1))
  fi
done

# VPC
log_info "Checking VPC..."
VPC_COUNT=$(aws --endpoint-url="$ENDPOINT" ec2 describe-vpcs --query 'Vpcs[*].VpcId' --output text 2>/dev/null | wc -w)
if [ "$VPC_COUNT" -gt 0 ]; then
  log_info "✓ VPC created ($VPC_COUNT found)"
else
  log_error "✗ No VPCs found"
  ERRORS=$((ERRORS + 1))
fi

# Terraform outputs
log_info "Checking Terraform outputs..."
terraform output -json | python3 -c "
import json, sys
outputs = json.load(sys.stdin)
required = ['vpc_id', 's3_bucket_name', 'alb_dns_name', 'ecs_cluster_name']
for key in required:
    if key in outputs and outputs[key].get('value'):
        print(f'  ✓ {key} = {outputs[key][\"value\"]}')
    else:
        print(f'  ✗ {key} missing or empty')
        sys.exit(1)
" || ERRORS=$((ERRORS + 1))

# -------------------------------------------------------------------------
# Results
# -------------------------------------------------------------------------
echo ""
if [ "$ERRORS" -eq 0 ]; then
  log_info "=========================================="
  log_info "All Terraform + LocalStack checks passed!"
  log_info "=========================================="
  exit 0
else
  log_error "=========================================="
  log_error "$ERRORS check(s) failed"
  log_error "=========================================="
  exit 1
fi

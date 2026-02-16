#!/bin/bash
set -euo pipefail

#
# Verify that all LocalStack resources exist and are properly configured.
#
# Usage:
#   ./scripts/verify-localstack-resources.sh
#

ENDPOINT="${LOCALSTACK_ENDPOINT:-http://localhost:4566}"
REGION="${AWS_REGION:-us-east-1}"
BUCKET="${S3_BUCKET:-immich-media}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_DEFAULT_REGION="$REGION"

PASS=0
FAIL=0

check() {
  local desc="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=========================================="
echo " LocalStack Resource Verification"
echo "=========================================="

echo ""
echo "S3:"
check "Bucket '$BUCKET' exists" \
  aws --endpoint-url="$ENDPOINT" s3api head-bucket --bucket "$BUCKET"

check "Bucket versioning enabled" \
  sh -c "aws --endpoint-url='$ENDPOINT' s3api get-bucket-versioning --bucket '$BUCKET' | grep -q Enabled"

check "Public access blocked" \
  sh -c "aws --endpoint-url='$ENDPOINT' s3api get-public-access-block --bucket '$BUCKET' | grep -q true"

echo ""
echo "IAM:"
check "ECS execution role exists" \
  aws --endpoint-url="$ENDPOINT" iam get-role --role-name immich-ecs-execution-role

check "ECS task role exists" \
  aws --endpoint-url="$ENDPOINT" iam get-role --role-name immich-ecs-task-role

check "S3 access policy attached" \
  aws --endpoint-url="$ENDPOINT" iam get-role-policy --role-name immich-ecs-task-role --policy-name immich-s3-access

echo ""
echo "Secrets Manager:"
check "Database credentials secret exists" \
  aws --endpoint-url="$ENDPOINT" secretsmanager describe-secret --secret-id immich/database-credentials

echo ""
echo "S3 Read/Write:"
echo "test-content" | aws --endpoint-url="$ENDPOINT" s3 cp - "s3://$BUCKET/__verify_test.txt"
check "Can write to S3 bucket" \
  aws --endpoint-url="$ENDPOINT" s3api head-object --bucket "$BUCKET" --key __verify_test.txt

CONTENT=$(aws --endpoint-url="$ENDPOINT" s3 cp "s3://$BUCKET/__verify_test.txt" -)
# Trim whitespace and compare
CONTENT_TRIMMED=$(echo "$CONTENT" | tr -d '\n')
check "Can read from S3 bucket" \
  test "$CONTENT_TRIMMED" = "test-content"

aws --endpoint-url="$ENDPOINT" s3 rm "s3://$BUCKET/__verify_test.txt"
check "Can delete from S3 bucket" \
  sh -c "! aws --endpoint-url='$ENDPOINT' s3api head-object --bucket '$BUCKET' --key __verify_test.txt 2>/dev/null"

echo ""
echo "=========================================="
echo " Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "Some checks failed. Run ./scripts/init-localstack.sh to initialize resources."
  exit 1
fi

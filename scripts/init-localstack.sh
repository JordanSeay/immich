#!/bin/bash
set -euo pipefail

#
# Initialize LocalStack with required AWS resources for Immich S3 storage backend.
#
# Prerequisites:
#   - LocalStack running (docker compose -f docker-compose.localstack.yml up -d)
#   - AWS CLI installed (brew install awscli)
#
# Usage:
#   ./scripts/init-localstack.sh
#

ENDPOINT="http://localhost:4566"
REGION="us-east-1"
BUCKET="immich-media"
ACCOUNT_ID="000000000000"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=$REGION

echo "=========================================="
echo " Initializing LocalStack for Immich"
echo "=========================================="

# Wait for LocalStack to be ready
echo ""
echo "[1/6] Waiting for LocalStack to be ready..."
MAX_RETRIES=30
RETRY=0
until aws --endpoint-url=$ENDPOINT s3 ls 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "ERROR: LocalStack did not become ready in time."
    exit 1
  fi
  echo "  Waiting... ($RETRY/$MAX_RETRIES)"
  sleep 2
done
echo "  ✓ LocalStack is ready"

# Create S3 bucket
echo ""
echo "[2/6] Creating S3 bucket: $BUCKET"
if aws --endpoint-url=$ENDPOINT s3api head-bucket --bucket $BUCKET 2>/dev/null; then
  echo "  ✓ Bucket already exists"
else
  aws --endpoint-url=$ENDPOINT s3api create-bucket \
    --bucket $BUCKET \
    --region $REGION
  echo "  ✓ Bucket created"
fi

# Configure bucket versioning
echo ""
echo "[3/6] Enabling bucket versioning..."
aws --endpoint-url=$ENDPOINT s3api put-bucket-versioning \
  --bucket $BUCKET \
  --versioning-configuration Status=Enabled
echo "  ✓ Versioning enabled"

# Block public access
echo ""
echo "[4/6] Blocking public access..."
aws --endpoint-url=$ENDPOINT s3api put-public-access-block \
  --bucket $BUCKET \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
echo "  ✓ Public access blocked"

# Create IAM role for ECS tasks
echo ""
echo "[5/6] Creating IAM roles and policies..."

# ECS Task Execution Role
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}'

# Create execution role
aws --endpoint-url=$ENDPOINT iam create-role \
  --role-name immich-ecs-execution-role \
  --assume-role-policy-document "$TRUST_POLICY" 2>/dev/null || echo "  Role already exists"

# Create task role with S3 permissions
aws --endpoint-url=$ENDPOINT iam create-role \
  --role-name immich-ecs-task-role \
  --assume-role-policy-document "$TRUST_POLICY" 2>/dev/null || echo "  Role already exists"

# S3 access policy for task role
S3_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::'"$BUCKET"'",
        "arn:aws:s3:::'"$BUCKET"'/*"
      ]
    }
  ]
}'

aws --endpoint-url=$ENDPOINT iam put-role-policy \
  --role-name immich-ecs-task-role \
  --policy-name immich-s3-access \
  --policy-document "$S3_POLICY"
echo "  ✓ IAM roles and policies created"

# Create Secrets Manager secret for DB credentials
echo ""
echo "[6/6] Creating Secrets Manager secrets..."
DB_SECRET='{
  "username": "postgres",
  "password": "postgres",
  "host": "database",
  "port": 5432,
  "dbname": "immich"
}'

aws --endpoint-url=$ENDPOINT secretsmanager create-secret \
  --name immich/database-credentials \
  --secret-string "$DB_SECRET" 2>/dev/null \
  || aws --endpoint-url=$ENDPOINT secretsmanager update-secret \
    --secret-id immich/database-credentials \
    --secret-string "$DB_SECRET"
echo "  ✓ Secrets created"

# Verify all resources
echo ""
echo "=========================================="
echo " Verification"
echo "=========================================="

echo ""
echo "S3 Buckets:"
aws --endpoint-url=$ENDPOINT s3 ls

echo ""
echo "Bucket Versioning:"
aws --endpoint-url=$ENDPOINT s3api get-bucket-versioning --bucket $BUCKET

echo ""
echo "IAM Roles:"
aws --endpoint-url=$ENDPOINT iam list-roles --query 'Roles[?starts_with(RoleName, `immich`)].RoleName' --output text

echo ""
echo "Secrets:"
aws --endpoint-url=$ENDPOINT secretsmanager list-secrets --query 'SecretList[].Name' --output text

echo ""
echo "=========================================="
echo " LocalStack initialized successfully!"
echo "=========================================="
echo ""
echo "S3 Endpoint:  $ENDPOINT"
echo "S3 Bucket:    $BUCKET"
echo "Region:       $REGION"
echo ""
echo "To test S3 access:"
echo "  echo 'hello' | aws --endpoint-url=$ENDPOINT s3 cp - s3://$BUCKET/test.txt"
echo "  aws --endpoint-url=$ENDPOINT s3 ls s3://$BUCKET/"
echo ""

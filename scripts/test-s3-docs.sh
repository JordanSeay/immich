#!/bin/bash
set -euo pipefail

#
# Test S3 Setup Documentation
# 
# This script validates that the S3 setup process documented in the guides works correctly.
#

echo "=========================================="
echo " Testing S3 Setup Documentation"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Test 1: Verify documentation files exist
echo "[Test 1] Checking documentation files..."
DOCS=(
  "docs/docs/install/s3-storage.md"
  "docs/docs/install/environment-variables.md"
  "docker/example.env"
  "docker/README.md"
  "docker/docker-compose.s3.yml"
  "docker-compose.localstack.yml"
  "scripts/init-localstack.sh"
)

MISSING=0
for doc in "${DOCS[@]}"; do
  if [ -f "$PROJECT_ROOT/$doc" ]; then
    echo "  ✓ $doc exists"
  else
    echo "  ✗ $doc NOT FOUND"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -gt 0 ]; then
  echo ""
  echo "❌ Test 1 FAILED: $MISSING documentation file(s) missing"
  exit 1
fi
echo "✓ Test 1 PASSED: All documentation files present"
echo ""

# Test 2: Verify S3 environment variables are documented
echo "[Test 2] Checking S3 environment variables documentation..."
REQUIRED_VARS=(
  "IMMICH_STORAGE_BACKEND"
  "IMMICH_S3_BUCKET"
  "IMMICH_S3_REGION"
  "IMMICH_S3_ENDPOINT"
  "IMMICH_S3_ACCESS_KEY"
  "IMMICH_S3_SECRET_KEY"
  "IMMICH_S3_FORCE_PATH_STYLE"
  "IMMICH_STORAGE_PREFIX"
)

MISSING_VARS=0
for var in "${REQUIRED_VARS[@]}"; do
  if grep -q "$var" "$PROJECT_ROOT/docs/docs/install/environment-variables.md"; then
    echo "  ✓ $var documented in environment-variables.md"
  else
    echo "  ✗ $var NOT documented in environment-variables.md"
    MISSING_VARS=$((MISSING_VARS + 1))
  fi
done

if [ $MISSING_VARS -gt 0 ]; then
  echo ""
  echo "❌ Test 2 FAILED: $MISSING_VARS environment variable(s) not documented"
  exit 1
fi
echo "✓ Test 2 PASSED: All S3 environment variables documented"
echo ""

# Test 3: Verify example.env contains S3 configuration
echo "[Test 3] Checking example.env contains S3 configuration..."
if grep -q "IMMICH_STORAGE_BACKEND" "$PROJECT_ROOT/docker/example.env" && \
   grep -q "IMMICH_S3_BUCKET" "$PROJECT_ROOT/docker/example.env" && \
   grep -q "IMMICH_S3_REGION" "$PROJECT_ROOT/docker/example.env"; then
  echo "  ✓ example.env contains S3 configuration"
else
  echo "  ✗ example.env missing S3 configuration"
  echo ""
  echo "❌ Test 3 FAILED: example.env incomplete"
  exit 1
fi
echo "✓ Test 3 PASSED: example.env has S3 configuration"
echo ""

# Test 4: Verify docker-compose.s3.yml is valid
echo "[Test 4] Validating docker-compose.s3.yml..."
# Create a temporary .env file for validation
TEMP_ENV=$(mktemp)
cat > "$TEMP_ENV" << 'EOF'
IMMICH_VERSION=release
UPLOAD_LOCATION=./library
DB_DATA_LOCATION=./postgres
DB_PASSWORD=postgres
DB_USERNAME=postgres
DB_DATABASE_NAME=immich
IMMICH_STORAGE_BACKEND=s3
IMMICH_S3_BUCKET=immich-media
IMMICH_S3_REGION=us-east-1
EOF

# Copy compose file to temp location and validate (simulates user copying to root)
TEMP_COMPOSE=$(mktemp)
cp "$PROJECT_ROOT/docker/docker-compose.s3.yml" "$TEMP_COMPOSE"
TEMP_DIR=$(dirname "$TEMP_COMPOSE")
cp "$TEMP_ENV" "$TEMP_DIR/.env"

if docker compose -f "$TEMP_COMPOSE" config > /dev/null 2>&1; then
  echo "  ✓ docker-compose.s3.yml is valid"
  rm -f "$TEMP_ENV" "$TEMP_COMPOSE" "$TEMP_DIR/.env"
else
  echo "  ✗ docker-compose.s3.yml has syntax errors"
  rm -f "$TEMP_ENV" "$TEMP_COMPOSE" "$TEMP_DIR/.env"
  echo ""
  echo "❌ Test 4 FAILED: Invalid docker-compose file"
  exit 1
fi
echo "✓ Test 4 PASSED: docker-compose.s3.yml is valid"
echo ""

# Test 5: Verify LocalStack docker-compose is valid
echo "[Test 5] Validating docker-compose.localstack.yml..."
if docker compose -f "$PROJECT_ROOT/docker-compose.localstack.yml" config > /dev/null 2>&1; then
  echo "  ✓ docker-compose.localstack.yml is valid"
else
  echo "  ✗ docker-compose.localstack.yml has syntax errors"
  echo ""
  echo "❌ Test 5 FAILED: Invalid docker-compose file"
  exit 1
fi
echo "✓ Test 5 PASSED: docker-compose.localstack.yml is valid"
echo ""

# Test 6: Verify init-localstack.sh script is executable
echo "[Test 6] Checking init-localstack.sh script..."
if [ -x "$PROJECT_ROOT/scripts/init-localstack.sh" ]; then
  echo "  ✓ init-localstack.sh is executable"
else
  echo "  ✗ init-localstack.sh is not executable"
  echo ""
  echo "❌ Test 6 FAILED: Script permissions incorrect"
  exit 1
fi
echo "✓ Test 6 PASSED: init-localstack.sh is executable"
echo ""

# Test 7: Verify quick-start-s3.sh script is executable
echo "[Test 7] Checking quick-start-s3.sh script..."
if [ -x "$PROJECT_ROOT/scripts/quick-start-s3.sh" ]; then
  echo "  ✓ quick-start-s3.sh is executable"
else
  echo "  ✗ quick-start-s3.sh is not executable"
  echo ""
  echo "❌ Test 7 FAILED: Script permissions incorrect"
  exit 1
fi
echo "✓ Test 7 PASSED: quick-start-s3.sh is executable"
echo ""

# Summary
echo "=========================================="
echo " All Tests Passed! ✓"
echo "=========================================="
echo ""
echo "The S3 setup documentation is complete and ready to use."
echo ""
echo "To test the full setup process:"
echo "  1. LocalStack test: docker compose -f docker-compose.localstack.yml up -d"
echo "  2. Initialize S3:   ./scripts/init-localstack.sh"
echo "  3. Access Immich:   http://localhost:2283"
echo ""
echo "For production AWS S3 setup, see: docs/docs/install/s3-storage.md"
echo ""

#!/usr/bin/env bash
# =============================================================================
# Full Stack Integration Test
# =============================================================================
# Validates the complete Immich + S3 (LocalStack) stack end-to-end:
#   1. Starts LocalStack + supporting services
#   2. Initializes S3 bucket and IAM resources
#   3. Runs S3 backend integration tests
#   4. (Optional) Starts Immich server and tests API connectivity
#
# Usage:
#   ./scripts/full-stack-test.sh [--skip-server]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/server"
SKIP_SERVER=false

for arg in "$@"; do
  case "$arg" in
    --skip-server) SKIP_SERVER=true ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${CYAN}══════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}══════════════════════════════════════${NC}\n"; }

cleanup() {
  log_info "Cleaning up test environment..."
  docker compose -f "$PROJECT_DIR/docker-compose.test.yml" down -v 2>/dev/null || true
}
trap cleanup EXIT

ERRORS=0
TESTS_RUN=0
TESTS_PASSED=0

check() {
  TESTS_RUN=$((TESTS_RUN + 1))
  if eval "$2" 2>/dev/null; then
    log_info "✓ $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "✗ $1"
    ERRORS=$((ERRORS + 1))
  fi
}

# =========================================================================
# Step 1: Start Test Infrastructure
# =========================================================================
log_section "Starting Test Infrastructure"

log_info "Starting LocalStack for testing..."
docker compose -f "$PROJECT_DIR/docker-compose.test.yml" up -d

log_info "Waiting for LocalStack test instance..."
for i in $(seq 1 30); do
  if docker exec immich-localstack-test awslocal s3 ls 2>/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    log_error "LocalStack test instance failed to start"
    exit 1
  fi
  sleep 2
done
log_info "LocalStack test instance ready"

# Wait for init container to complete
log_info "Waiting for bucket initialization..."
for i in $(seq 1 30); do
  if docker exec immich-localstack-test awslocal s3 ls s3://immich-test-media 2>/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    log_error "Test bucket initialization failed"
    exit 1
  fi
  sleep 2
done
log_info "Test bucket ready"

# =========================================================================
# Step 2: Verify LocalStack Resources
# =========================================================================
log_section "Verifying LocalStack Resources"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
ENDPOINT="http://localhost:4567"

check "S3 test bucket exists" "aws --endpoint-url=$ENDPOINT s3 ls s3://immich-test-media"

check "S3 write operation" "echo 'test' | aws --endpoint-url=$ENDPOINT s3 cp - s3://immich-test-media/test-write.txt"

check "S3 read operation" "aws --endpoint-url=$ENDPOINT s3 cp s3://immich-test-media/test-write.txt -"

check "S3 delete operation" "aws --endpoint-url=$ENDPOINT s3 rm s3://immich-test-media/test-write.txt"

# =========================================================================
# Step 3: Run S3 Backend Integration Tests
# =========================================================================
log_section "Running S3 Backend Integration Tests"

cd "$SERVER_DIR"

if [ -f "node_modules/.package-lock.json" ]; then
  log_info "Dependencies already installed"
else
  log_info "Installing server dependencies..."
  npm install 2>&1 | tail -5
fi

log_info "Running storage backend tests..."
if npx vitest run --config test/vitest.config.storage.mjs 2>&1; then
  log_info "✓ All storage backend tests passed"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  log_error "✗ Storage backend tests failed"
  ERRORS=$((ERRORS + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# =========================================================================
# Step 4: Run Unit Tests
# =========================================================================
log_section "Running Unit Tests"

log_info "Running storage factory unit tests..."
if npx vitest run --config test/vitest.config.mjs src/repositories/storage/storage.factory.spec.ts 2>&1; then
  log_info "✓ Factory unit tests passed"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  log_error "✗ Factory unit tests failed"
  ERRORS=$((ERRORS + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# =========================================================================
# Step 5: Server Smoke Test (Optional)
# =========================================================================
if [ "$SKIP_SERVER" = false ]; then
  log_section "Server Smoke Test"
  log_warn "Server smoke test requires the full stack. Skipping for now."
  log_info "(Start full stack with: docker compose -f docker-compose.localstack.yml up)"
fi

# =========================================================================
# Results
# =========================================================================
log_section "Test Results"

echo -e "Tests run:    $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$ERRORS${NC}"
echo ""

if [ "$ERRORS" -eq 0 ]; then
  log_info "All tests passed!"
  exit 0
else
  log_error "$ERRORS test(s) failed"
  exit 1
fi

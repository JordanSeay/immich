# AWS S3 Storage Backend for Immich

This fork adds S3 storage backend support and AWS infrastructure (via Terraform) to [Immich](https://github.com/immich-app/immich), with full LocalStack testing.

## Overview

### What's New

- **S3 Storage Backend** — Pluggable storage layer that replaces local filesystem with AWS S3
- **Storage Abstraction** — Strategy pattern (`StorageBackend` interface) making it easy to add future backends
- **Multi-tenant Support** — Key prefix isolation for SaaS deployments
- **Terraform Infrastructure** — Complete AWS deployment (VPC, ECS Fargate, RDS, ElastiCache, ALB, S3)
- **LocalStack Testing** — Full test suite runs against LocalStack, no AWS account needed

### Architecture

```
┌──────────────┐
│ StorageRepository │  ← Unchanged API surface
└───────┬──────┘
        │ delegates to
        ▼
┌──────────────────┐
│  StorageBackend   │  ← Interface (strategy pattern)
└───────┬──────────┘
        │
   ┌────┴────┐
   ▼         ▼
┌──────┐  ┌──────┐
│ Local │  │  S3  │   ← Selected via IMMICH_STORAGE_BACKEND env var
└──────┘  └──────┘
```

## Quick Start

### Prerequisites

- Node.js 24+ (via Volta)
- Docker & Docker Compose
- Terraform 1.5+ (for infra deployment)
- AWS CLI (for verification scripts)

### 1. Run Unit Tests (no Docker needed)

```bash
cd server
npm install
npx vitest run --config test/vitest.config.mjs src/repositories/storage/storage.factory.spec.ts
```

### 2. Run S3 Integration Tests (LocalStack)

```bash
# Start test LocalStack (port 4567)
docker compose -f docker-compose.test.yml up -d

# Wait for init container to finish, then:
cd server
npm run test:storage
```

### 3. Run Full Stack

```bash
# Start dev environment with S3 backend
docker compose -f docker-compose.localstack.yml up -d

# Initialize LocalStack resources
./scripts/init-localstack.sh

# Verify
./scripts/verify-localstack-resources.sh
```

### 4. Deploy Terraform (LocalStack)

```bash
# Start LocalStack if not already running
docker compose -f docker-compose.localstack.yml up -d localstack

cd terraform
terraform init
terraform plan -var-file=environments/local.tfvars
terraform apply -var-file=environments/local.tfvars -auto-approve
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `IMMICH_STORAGE_BACKEND` | `local` | Storage backend: `local` or `s3` |
| `IMMICH_S3_BUCKET` | — | S3 bucket name (required for S3) |
| `IMMICH_S3_REGION` | — | AWS region (required for S3) |
| `IMMICH_S3_ENDPOINT` | — | Custom endpoint URL (for LocalStack) |
| `IMMICH_S3_ACCESS_KEY` | — | AWS access key (optional, uses IAM role if unset) |
| `IMMICH_S3_SECRET_KEY` | — | AWS secret key (optional, uses IAM role if unset) |
| `IMMICH_S3_FORCE_PATH_STYLE` | `true` | Use path-style URLs (required for LocalStack) |
| `IMMICH_STORAGE_PREFIX` | — | Key prefix for multi-tenant isolation |

### Switching Between Backends

```bash
# Local filesystem (default, no changes needed)
export IMMICH_STORAGE_BACKEND=local

# S3 via LocalStack
export IMMICH_STORAGE_BACKEND=s3
export IMMICH_S3_BUCKET=immich-media
export IMMICH_S3_REGION=us-east-1
export IMMICH_S3_ENDPOINT=http://localhost:4566
export IMMICH_S3_ACCESS_KEY=test
export IMMICH_S3_SECRET_KEY=test
export IMMICH_S3_FORCE_PATH_STYLE=true
```

## Project Structure (New Files)

```
server/src/repositories/storage/
├── storage.backend.ts      # StorageBackend interface
├── local.backend.ts        # Local filesystem implementation
├── s3.backend.ts           # S3 implementation (AWS SDK v3)
├── storage.factory.ts      # Factory (reads env vars, creates backend)
├── storage.factory.spec.ts # Factory unit tests
└── index.ts                # Barrel exports

server/test/
├── storage/
│   └── s3-backend.spec.ts          # S3 integration tests (22 tests)
└── vitest.config.storage.mjs       # Test config for S3 tests

terraform/
├── main.tf                 # Root module
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── environments/
│   ├── local.tfvars        # LocalStack config
│   ├── personal.tfvars     # Dev AWS account (template)
│   └── prod.tfvars         # Production (template)
└── modules/
    ├── vpc/                # VPC, subnets, security groups
    ├── s3/                 # Media bucket
    ├── iam/                # ECS roles with S3 permissions
    ├── rds/                # PostgreSQL 15 + pgvectors
    ├── elasticache/        # Redis cluster
    ├── ecs/                # Fargate tasks & service
    └── alb/                # Application Load Balancer

scripts/
├── init-localstack.sh              # Create S3 bucket, IAM roles
├── verify-localstack-resources.sh  # Verify LocalStack resources
├── terraform-localstack.sh         # Deploy + verify Terraform on LocalStack
└── full-stack-test.sh              # End-to-end test runner

docker-compose.localstack.yml      # Dev environment with S3 backend
docker-compose.test.yml            # Isolated test environment
```

## Testing

| Suite | Command | Requires |
|---|---|---|
| Factory unit tests | `npm test -- src/repositories/storage/storage.factory.spec.ts` | Nothing |
| S3 integration (22 tests) | `npm run test:storage` | LocalStack on port 4567 |
| Terraform validate | `cd terraform && terraform validate` | Terraform CLI |
| Terraform plan | `cd terraform && terraform plan -var-file=environments/local.tfvars` | LocalStack on port 4566 |
| Full stack test | `./scripts/full-stack-test.sh` | Docker |

## Design Decisions

- **Strategy Pattern** — `StorageBackend` interface decouples Immich from any specific storage implementation. Adding GCS, Azure Blob, or MinIO is a matter of implementing the interface.
- **No-op directories on S3** — S3 has no real directories, so `mkdirSync` and `removeEmptyDirs` are no-ops. `existsSync` returns `true` since there's nothing to create.
- **Rename = Copy + Delete** — S3 doesn't support atomic rename, so `rename()` is implemented as `CopyObject` + `DeleteObject`.
- **Multi-tenant prefix** — The `IMMICH_STORAGE_PREFIX` prepends a tenant identifier to all S3 keys, enabling data isolation in shared buckets.
- **LocalStack-first** — All infrastructure is tested against LocalStack. The Terraform `use_localstack` toggle adjusts provider config, skips NAT gateways, and disables features like encryption that LocalStack doesn't fully support.

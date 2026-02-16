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

#### Hybrid Routing

When configured for S3, the `StorageRepository` uses **hybrid routing**:

- **Media paths** (under the configured media location, typically `/data`) are routed to S3
- **Non-media paths** (config, database, system files) stay on the local filesystem
- This is handled automatically by `getBackend(filepath)` — callers don't need to know which backend is active

#### Local Caching for Media Processing

Tools like `sharp`, `ffmpeg`, and `exiftool` require direct filesystem access and cannot read from S3 directly. The repository provides two methods to bridge this gap:

- **`ensureLocalFile(path)`** — Downloads a file from S3 to the local filesystem before processing. Acts as a cache: if the file already exists locally, the download is skipped.
- **`syncGeneratedFiles(paths)`** — Uploads locally-generated files (thumbnails, encoded video) to S3 after processing. Local copies are retained as a cache for serving.

This means the processing flow for an uploaded image is:

```
Upload → Multer writes to local disk → syncLocalFileToBackend() → S3
                                         (local copy deleted)

Metadata Extraction:
  ensureLocalFile() → downloads from S3 → exiftool reads locally

Thumbnail Generation:
  ensureLocalFile() → downloads from S3 → sharp generates thumbnails locally
  → syncGeneratedFiles() → uploads thumbnails to S3 (local copies kept as cache)

Serving:
  ensureLocalFile() → ensures file is local → res.sendFile() serves it
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

### 3. Run Full Stack with S3 (LocalStack)

```bash
# 1. Start infrastructure services first
IMMICH_STORAGE_BACKEND=s3 docker compose -f docker-compose.localstack.yml up -d localstack database redis

# 2. Wait for LocalStack to be healthy, then initialize S3 bucket + IAM
./scripts/init-localstack.sh

# 3. Start the Immich server and ML services
IMMICH_STORAGE_BACKEND=s3 docker compose -f docker-compose.localstack.yml up -d

# 4. Verify everything is running
docker ps  # All containers should show "healthy"

# 5. Open the web UI
open http://localhost:2283
```

> **Important:** The S3 bucket must exist before the server starts, otherwise
> the mount folder health checks will fail. Always run `init-localstack.sh`
> before starting `immich-server`.

#### Restarting After Stopping

If you stop and restart without removing volumes (`docker compose down` without `-v`),
the bucket persists and you can simply:

```bash
IMMICH_STORAGE_BACKEND=s3 docker compose -f docker-compose.localstack.yml up -d
```

If you wipe volumes (`docker compose down -v`), you must re-run the full
startup sequence above since both the database and S3 bucket are fresh.

#### Rebuilding After Code Changes

```bash
# Rebuild the server image (force no-cache to pick up code changes)
IMMICH_STORAGE_BACKEND=s3 docker compose -f docker-compose.localstack.yml build --no-cache immich-server

# Restart just the server
IMMICH_STORAGE_BACKEND=s3 docker compose -f docker-compose.localstack.yml up -d immich-server
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

| Variable                     | Default | Description                                       |
| ---------------------------- | ------- | ------------------------------------------------- |
| `IMMICH_STORAGE_BACKEND`     | `local` | Storage backend: `local` or `s3`                  |
| `IMMICH_S3_BUCKET`           | —       | S3 bucket name (required for S3)                  |
| `IMMICH_S3_REGION`           | —       | AWS region (required for S3)                      |
| `IMMICH_S3_ENDPOINT`         | —       | Custom endpoint URL (for LocalStack)              |
| `IMMICH_S3_ACCESS_KEY`       | —       | AWS access key (optional, uses IAM role if unset) |
| `IMMICH_S3_SECRET_KEY`       | —       | AWS secret key (optional, uses IAM role if unset) |
| `IMMICH_S3_FORCE_PATH_STYLE` | `true`  | Use path-style URLs (required for LocalStack)     |
| `IMMICH_STORAGE_PREFIX`      | —       | Key prefix for multi-tenant isolation             |

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

| Suite                     | Command                                                              | Requires                |
| ------------------------- | -------------------------------------------------------------------- | ----------------------- |
| Factory unit tests        | `npm test -- src/repositories/storage/storage.factory.spec.ts`       | Nothing                 |
| S3 integration (22 tests) | `npm run test:storage`                                               | LocalStack on port 4567 |
| Terraform validate        | `cd terraform && terraform validate`                                 | Terraform CLI           |
| Terraform plan            | `cd terraform && terraform plan -var-file=environments/local.tfvars` | LocalStack on port 4566 |
| Full stack test           | `./scripts/full-stack-test.sh`                                       | Docker                  |

## Design Decisions

- **Strategy Pattern** — `StorageBackend` interface decouples Immich from any specific storage implementation. Adding GCS, Azure Blob, or MinIO is a matter of implementing the interface.
- **Hybrid Routing** — Only media files (under the configured media location) are routed to S3. Config files, database migrations, and other system files remain on the local filesystem. This avoids breaking non-media code paths that expect local filesystem semantics.
- **Local Caching** — Files are downloaded from S3 to the local filesystem before processing by sharp/ffmpeg/exiftool (which require direct filesystem access). Generated thumbnails and encoded videos are kept locally as a cache after being uploaded to S3, so subsequent reads (like serving thumbnails) avoid redundant downloads.
- **No-op directories on S3** — S3 has no real directories, so `mkdirSync` and `removeEmptyDirs` are no-ops. `existsSync` returns `true` since there's nothing to create.
- **Rename = Copy + Delete** — S3 doesn't support atomic rename, so `rename()` is implemented as `CopyObject` + `DeleteObject`.
- **Multi-tenant prefix** — The `IMMICH_STORAGE_PREFIX` prepends a tenant identifier to all S3 keys, enabling data isolation in shared buckets.
- **LocalStack-first** — All infrastructure is tested against LocalStack. The Terraform `use_localstack` toggle adjusts provider config, skips NAT gateways, and disables features like encryption that LocalStack doesn't fully support.

## Troubleshooting

### Server crashes with "NoSuchBucket" or "NoSuchKey" on startup

The S3 bucket must exist and contain `.immich` sentinel files before the server starts. Run `./scripts/init-localstack.sh` before starting the server, or if the database remembers mount checks from a previous run, do a clean restart with `docker compose down -v` and repeat the full startup sequence.

### Thumbnails not loading in the web UI

Ensure the server was rebuilt after the latest code changes (`docker compose build --no-cache immich-server`). The `ensureLocalFile` and `syncGeneratedFiles` methods must be present in the built code for the S3-to-local caching to work.

### WASM plugin warning on startup

The `Failed to load plugin immich-core: CompileError` warning is expected when using the LocalStack Dockerfile, which includes a minimal stub WASM plugin. This does not affect functionality.

### Machine learning errors (OCR/CLIP)

These are unrelated to S3 storage. The ML service may need time to download models on first start, or you may need to check the `immich_machine_learning` container logs.

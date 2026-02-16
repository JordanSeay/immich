---
sidebar_position: 95
---

# S3 Storage Backend

Immich supports using Amazon S3 or S3-compatible services as the storage backend for your media files. This guide will help you set up and configure S3 storage for Immich.

## Overview

When configured with S3 storage:
- **Media files** (photos, videos, thumbnails) are stored in S3
- **System files** (database, configuration) remain on local storage
- Files are automatically synced to S3 after upload
- Processing (thumbnails, video encoding) happens locally with files cached from S3

## Quick Start

### Prerequisites

- An S3 bucket in your AWS account (or S3-compatible service)
- AWS credentials with S3 permissions, or IAM role if running on AWS infrastructure
- Docker and Docker Compose installed

### Basic Setup (AWS S3)

#### Option 1: Using the pre-configured docker-compose.s3.yml

1. **Create an S3 Bucket** in your AWS account:
   ```bash
   aws s3api create-bucket --bucket immich-media --region us-east-1
   ```

2. **Use the S3-ready docker-compose file:**
   ```bash
   # Copy the S3-configured docker-compose file
   cp docker/docker-compose.s3.yml docker-compose.yml
   
   # Copy and configure environment file
   cp docker/example.env .env
   ```

3. **Edit your `.env` file** to add S3 configuration:
   ```bash
   # Enable S3 storage backend
   IMMICH_STORAGE_BACKEND=s3
   
   # S3 bucket configuration
   IMMICH_S3_BUCKET=immich-media
   IMMICH_S3_REGION=us-east-1
   
   # AWS credentials (if not using IAM roles)
   IMMICH_S3_ACCESS_KEY=your-access-key-id
   IMMICH_S3_SECRET_KEY=your-secret-access-key
   ```

4. **Start Immich:**
   ```bash
   docker compose up -d
   ```

#### Option 2: Update existing docker-compose.yml

1. **Create an S3 Bucket** in your AWS account:
   ```bash
   aws s3api create-bucket --bucket immich-media --region us-east-1
   ```

2. **Update your `.env` file** with S3 configuration:
   ```bash
   # Enable S3 storage backend
   IMMICH_STORAGE_BACKEND=s3
   
   # S3 bucket configuration
   IMMICH_S3_BUCKET=immich-media
   IMMICH_S3_REGION=us-east-1
   
   # AWS credentials (if not using IAM roles)
   IMMICH_S3_ACCESS_KEY=your-access-key-id
   IMMICH_S3_SECRET_KEY=your-secret-access-key
   ```

3. **Recreate your containers** to apply the changes:
   ```bash
   docker compose up -d --force-recreate
   ```

That's it! Immich will now store your media files in S3.

## Configuration Options

### Required Variables

| Variable                 | Description                                                      | Example              |
| :----------------------- | :--------------------------------------------------------------- | :------------------- |
| `IMMICH_STORAGE_BACKEND` | Set to `s3` to enable S3 storage                                 | `s3`                 |
| `IMMICH_S3_BUCKET`       | Name of your S3 bucket                                           | `immich-media`       |
| `IMMICH_S3_REGION`       | AWS region where your bucket is located                          | `us-east-1`          |

### Optional Variables

| Variable                     | Description                                                      | Default | Example                       |
| :--------------------------- | :--------------------------------------------------------------- | :------ | :---------------------------- |
| `IMMICH_S3_ENDPOINT`         | Custom endpoint for S3-compatible services                       | -       | `http://minio:9000`           |
| `IMMICH_S3_ACCESS_KEY`       | AWS access key ID (not needed if using IAM roles)                | -       | `AKIAIOSFODNN7EXAMPLE`        |
| `IMMICH_S3_SECRET_KEY`       | AWS secret access key (not needed if using IAM roles)            | -       | `wJalrXUtnFEMI/K7MDENG/...`   |
| `IMMICH_S3_FORCE_PATH_STYLE` | Use path-style URLs (required for MinIO and LocalStack)          | `true`  | `true`                        |
| `IMMICH_STORAGE_PREFIX`      | Prefix for all S3 object keys (useful for bucket sharing)        | -       | `immich/production`           |

## Use Cases

### AWS S3 with IAM Roles

For AWS deployments (EC2, ECS, EKS), use IAM roles instead of access keys.

**Required IAM Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucketLocation"],
    "Resource": ["arn:aws:s3:::immich-media", "arn:aws:s3:::immich-media/*"]
  }]
}
```

**Configuration** (no credentials needed):
```bash
IMMICH_STORAGE_BACKEND=s3
IMMICH_S3_BUCKET=immich-media
IMMICH_S3_REGION=us-east-1
```

### S3-Compatible Services

Immich works with MinIO, Wasabi, Backblaze B2, and other S3-compatible services.

**MinIO Example:**
```bash
IMMICH_STORAGE_BACKEND=s3
IMMICH_S3_BUCKET=immich-media
IMMICH_S3_REGION=us-east-1
IMMICH_S3_ENDPOINT=http://minio:9000
IMMICH_S3_ACCESS_KEY=minioadmin
IMMICH_S3_SECRET_KEY=minioadmin
IMMICH_S3_FORCE_PATH_STYLE=true  # Required for MinIO
```

**Wasabi Example:**
```bash
IMMICH_S3_ENDPOINT=https://s3.us-east-1.wasabisys.com
IMMICH_S3_ACCESS_KEY=your-wasabi-key
```

**Backblaze B2 Example:**
```bash
IMMICH_S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
IMMICH_S3_REGION=us-west-000
```

### Multi-tenant Setup

Use `IMMICH_STORAGE_PREFIX` to isolate multiple instances in one bucket:

```bash
# Instance 1
IMMICH_STORAGE_PREFIX=tenant1

# Instance 2  
IMMICH_STORAGE_PREFIX=tenant2
```

## Testing with LocalStack

LocalStack allows you to test S3 integration locally without an AWS account.

1. **Start LocalStack and Immich:**
   ```bash
   docker compose -f docker-compose.localstack.yml up -d
   ```

2. **Initialize the S3 bucket:**
   ```bash
   ./scripts/init-localstack.sh
   ```

3. **Access Immich** at http://localhost:2283

The `docker-compose.localstack.yml` file is pre-configured with all necessary S3 settings for LocalStack.

## Migration from Local Storage

:::warning
Always back up your data before migrating storage backends!
:::

If you're switching from local storage to S3:

1. **Back up your existing data:**
   ```bash
   # Backup the upload directory (use your actual UPLOAD_LOCATION from .env)
   tar -czf immich-backup-$(date +%Y%m%d).tar.gz ${UPLOAD_LOCATION:-./library}
   ```

2. **Upload existing files to S3:**
   ```bash
   # Sync local files to S3 (preserving directory structure)
   # Replace ./library with your UPLOAD_LOCATION value
   aws s3 sync ${UPLOAD_LOCATION:-./library} s3://immich-media/ --exclude ".*"
   ```

3. **Update environment variables** to enable S3 backend

4. **Recreate containers:**
   ```bash
   docker compose up -d --force-recreate
   ```

## Troubleshooting

**Server fails to start with "NoSuchBucket"**
- Verify bucket exists: `aws s3 ls s3://your-bucket-name`
- Check credentials have correct permissions
- Ensure `IMMICH_S3_REGION` matches bucket region

**"Access Denied" errors**
- Verify IAM policy includes: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`, `s3:GetBucketLocation`
- For IAM roles, ensure role is attached to ECS task or EC2 instance

**Thumbnails not loading**
- Check logs: `docker compose logs immich-server`
- Verify files exist: `aws s3 ls s3://your-bucket-name/thumbs/`
- Ensure container has write access to `/data` for caching

**Connection timeout with custom endpoint**
- Verify endpoint URL is accessible from container
- Use service name (e.g., `http://minio:9000`) not `localhost` in Docker
- Check firewall rules and security groups

**"SignatureDoesNotMatch" with MinIO**
- Set `IMMICH_S3_FORCE_PATH_STYLE=true` (required for MinIO/LocalStack)

## Important Notes

**Performance:** S3 operations require bandwidth. First access may be slower due to download, but subsequent access uses local cache.

**Security:** Use IAM roles on AWS infrastructure, enable bucket versioning, block public access, and use minimum required permissions.

**Costs:** Monitor S3 storage and data transfer costs in your AWS billing.

## Additional Resources

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [MinIO Documentation](https://min.io/docs/)
- [Immich Environment Variables](/install/environment-variables)
- [Immich Docker Compose Setup](/install/docker-compose)

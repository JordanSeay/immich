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

### AWS S3 with IAM Roles (Recommended for AWS deployments)

If you're running Immich on AWS infrastructure (EC2, ECS, EKS), use IAM roles instead of access keys for better security.

**IAM Policy for Immich:**
```json
{
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
        "arn:aws:s3:::immich-media",
        "arn:aws:s3:::immich-media/*"
      ]
    }
  ]
}
```

**Environment variables** (no credentials needed):
```bash
IMMICH_STORAGE_BACKEND=s3
IMMICH_S3_BUCKET=immich-media
IMMICH_S3_REGION=us-east-1
# No IMMICH_S3_ACCESS_KEY or IMMICH_S3_SECRET_KEY needed
```

### MinIO (Self-hosted S3)

MinIO is an open-source S3-compatible object storage server you can self-host.

**docker-compose.yml example:**
```yaml
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

  immich-server:
    # ... other configuration ...
    environment:
      IMMICH_STORAGE_BACKEND: s3
      IMMICH_S3_BUCKET: immich-media
      IMMICH_S3_REGION: us-east-1
      IMMICH_S3_ENDPOINT: http://minio:9000
      IMMICH_S3_ACCESS_KEY: minioadmin
      IMMICH_S3_SECRET_KEY: minioadmin
      IMMICH_S3_FORCE_PATH_STYLE: "true"
    depends_on:
      - minio

volumes:
  minio-data:
```

### Wasabi, Backblaze B2, or other S3-compatible services

Most S3-compatible services work with Immich. You'll need to set the `IMMICH_S3_ENDPOINT` to your provider's endpoint.

**Wasabi example:**
```bash
IMMICH_STORAGE_BACKEND=s3
IMMICH_S3_BUCKET=immich-media
IMMICH_S3_REGION=us-east-1
IMMICH_S3_ENDPOINT=https://s3.us-east-1.wasabisys.com
IMMICH_S3_ACCESS_KEY=your-wasabi-access-key
IMMICH_S3_SECRET_KEY=your-wasabi-secret-key
```

**Backblaze B2 example:**
```bash
IMMICH_STORAGE_BACKEND=s3
IMMICH_S3_BUCKET=immich-media
IMMICH_S3_REGION=us-west-000
IMMICH_S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
IMMICH_S3_ACCESS_KEY=your-b2-key-id
IMMICH_S3_SECRET_KEY=your-b2-application-key
```

### Multi-tenant or Shared Bucket

If you want to run multiple Immich instances sharing the same S3 bucket, use the `IMMICH_STORAGE_PREFIX` variable to isolate data:

**Instance 1:**
```bash
IMMICH_STORAGE_PREFIX=tenant1
```

**Instance 2:**
```bash
IMMICH_STORAGE_PREFIX=tenant2
```

Objects will be stored with keys like:
- `tenant1/library/user-abc/photo.jpg`
- `tenant2/library/user-xyz/photo.jpg`

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

### Server fails to start with "NoSuchBucket" error

**Cause:** The S3 bucket doesn't exist or Immich can't access it.

**Solution:**
- Verify the bucket exists: `aws s3 ls s3://your-bucket-name`
- Check your AWS credentials have the correct permissions
- Ensure `IMMICH_S3_REGION` matches your bucket's region

### "Access Denied" errors

**Cause:** Insufficient S3 permissions.

**Solution:**
- Verify your IAM policy includes all required actions: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`, `s3:GetBucketLocation`
- For IAM roles, ensure the role is properly attached to your ECS task or EC2 instance

### Thumbnails not loading

**Cause:** Files aren't being properly synced or cached.

**Solution:**
- Check container logs: `docker compose logs immich-server`
- Verify files exist in S3: `aws s3 ls s3://your-bucket-name/thumbs/`
- Ensure the server container has write access to the local `/data` directory for caching

### Connection timeout with custom endpoint

**Cause:** Network connectivity issues or incorrect endpoint URL.

**Solution:**
- Verify the endpoint URL is correct and accessible from the Immich container
- For Docker networks, use the service name (e.g., `http://minio:9000`) instead of `localhost`
- Check firewall rules and security groups

### "SignatureDoesNotMatch" with MinIO

**Cause:** Path-style URLs not enabled.

**Solution:**
- Set `IMMICH_S3_FORCE_PATH_STYLE=true` in your environment variables
- This is required for MinIO and LocalStack

## Performance Considerations

- **Bandwidth:** S3 operations require internet bandwidth. Ensure you have sufficient bandwidth for your upload/download needs.
- **Costs:** S3 storage and data transfer have associated costs. Monitor your AWS billing.
- **Latency:** First access to files may be slower due to S3 download, but subsequent access uses local cache.
- **Local Cache:** Immich caches downloaded files locally to improve performance. Ensure the `/data` volume has adequate space.

## Security Best Practices

1. **Use IAM roles** instead of access keys when running on AWS infrastructure
2. **Enable bucket versioning** to protect against accidental deletions
3. **Enable encryption** at rest for sensitive data
4. **Block public access** to your S3 bucket
5. **Use restrictive IAM policies** with minimum required permissions
6. **Regularly rotate access keys** if not using IAM roles
7. **Monitor access logs** for unusual activity

## Additional Resources

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [MinIO Documentation](https://min.io/docs/)
- [Immich Environment Variables](/install/environment-variables)
- [Immich Docker Compose Setup](/install/docker-compose)

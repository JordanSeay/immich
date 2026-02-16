# Immich Docker Compose Files

This directory contains various Docker Compose configurations for different deployment scenarios.

## Available Configurations

### Production Deployments

- **`docker-compose.yml`** - Standard production setup with local storage
  - Use this for most production deployments
  - Stores media files on local filesystem
  - Recommended for single-server deployments

- **`docker-compose.s3.yml`** - Production setup with S3 storage backend
  - Use this when you want to store media in Amazon S3 or S3-compatible storage
  - Requires S3 configuration in `.env` file
  - See [S3 Storage Guide](https://docs.immich.app/install/s3-storage) for setup instructions

- **`docker-compose.prod.yml`** - Optimized production configuration
  - Additional production optimizations
  - Performance tuning

### Development & Testing

- **`docker-compose.dev.yml`** - Development environment
  - Hot-reload support for code changes
  - Development-specific settings

- **`docker-compose.localstack.yml`** - Testing with LocalStack (S3 emulation)
  - Test S3 integration without AWS account
  - Includes LocalStack container for S3 emulation
  - Run `./scripts/init-localstack.sh` after starting

### Specialized Configurations

- **`docker-compose.rootless.yml`** - Rootless container setup
  - Run containers without root privileges
  - Enhanced security

- **`hwaccel.ml.yml`** - Hardware acceleration for machine learning
  - GPU acceleration for ML workloads
  - Use with `docker compose -f docker-compose.yml -f hwaccel.ml.yml up -d`

- **`hwaccel.transcoding.yml`** - Hardware acceleration for video transcoding
  - GPU acceleration for video processing
  - Use with `docker compose -f docker-compose.yml -f hwaccel.transcoding.yml up -d`

## Getting Started

### Standard Setup (Local Storage)

```bash
# Copy environment file
cp example.env .env

# Edit .env with your configuration
nano .env

# Start Immich
docker compose up -d
```

### S3 Storage Setup

```bash
# Copy environment file
cp example.env .env

# Edit .env and configure S3 settings
nano .env
# Set IMMICH_STORAGE_BACKEND=s3
# Configure IMMICH_S3_* variables

# Start with S3 compose file
docker compose -f docker-compose.s3.yml up -d
```

For detailed S3 setup instructions, see the [S3 Storage Guide](https://docs.immich.app/install/s3-storage).

### LocalStack Testing

```bash
# Start LocalStack and Immich
docker compose -f docker-compose.localstack.yml up -d

# Initialize S3 bucket
./scripts/init-localstack.sh

# Access at http://localhost:2283
```

## Configuration Files

- **`example.env`** - Template environment variables
  - Copy this to `.env` and customize
  - Contains all available configuration options
  - Includes S3 configuration examples

- **`prometheus.yml`** - Prometheus monitoring configuration
  - Use for metrics collection

## Environment Variables

See the [Environment Variables documentation](https://docs.immich.app/install/environment-variables) for a complete list of available options.

### Key Variables

- `IMMICH_VERSION` - Immich version to use (default: `release`)
- `UPLOAD_LOCATION` - Local path for media storage
- `DB_DATA_LOCATION` - Local path for database
- `IMMICH_STORAGE_BACKEND` - Storage backend: `local` or `s3`
- `IMMICH_S3_*` - S3 configuration (when using S3 backend)

## Updating

To update Immich:

```bash
# Pull latest images
docker compose pull

# Recreate containers
docker compose up -d
```

## Troubleshooting

### Containers not starting

1. Check logs: `docker compose logs`
2. Verify `.env` file exists and is configured
3. Ensure required volumes/directories exist

### S3 connection issues

1. Verify S3 credentials and permissions
2. Check bucket exists and region is correct
3. Review logs: `docker compose logs immich-server`
4. See [S3 Troubleshooting](https://docs.immich.app/install/s3-storage#troubleshooting)

## Additional Resources

- [Official Documentation](https://docs.immich.app/)
- [Installation Guide](https://docs.immich.app/install/docker-compose)
- [S3 Storage Guide](https://docs.immich.app/install/s3-storage)
- [Environment Variables](https://docs.immich.app/install/environment-variables)

> [!CAUTION]
> Make sure to use the docker-compose.yml of the current release:
> https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml
> 
> The compose file on main may not be compatible with the latest release.


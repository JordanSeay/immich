#!/bin/bash
set -euo pipefail

#
# Immich S3 Quick Start Script
#
# This script helps you quickly set up Immich with S3 storage backend.
# It will guide you through the configuration and start the services.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Helper function to update .env file - handles special characters safely
update_env() {
  local key="$1"
  local value="$2"
  local file="$PROJECT_ROOT/.env"
  
  # Escape special characters for sed (note: [] need to be escaped individually)
  local escaped_value=$(printf '%s\n' "$value" | sed 's/[\.*^$/\[\]]/\\&/g')
  
  # Use | as delimiter to avoid issues with / in values
  if grep -q "^# ${key}=" "$file"; then
    # Uncomment and update
    sed -i.bak "s|^# ${key}=.*|${key}=${escaped_value}|" "$file"
  elif grep -q "^${key}=" "$file"; then
    # Update existing
    sed -i.bak "s|^${key}=.*|${key}=${escaped_value}|" "$file"
  else
    # Add new
    echo "${key}=${value}" >> "$file"
  fi
}

echo "=========================================="
echo " Immich S3 Quick Start"
echo "=========================================="
echo ""

# Check if .env already exists
if [ -f "$PROJECT_ROOT/.env" ]; then
  echo "⚠️  .env file already exists."
  read -p "Do you want to overwrite it? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Using existing .env file. You can edit it manually if needed."
    echo ""
  else
    cp "$PROJECT_ROOT/docker/example.env" "$PROJECT_ROOT/.env"
    echo "✓ Created new .env file from template"
  fi
else
  cp "$PROJECT_ROOT/docker/example.env" "$PROJECT_ROOT/.env"
  echo "✓ Created .env file from template"
fi

echo ""
echo "Choose your storage backend:"
echo "  1) Local storage (default)"
echo "  2) Amazon S3"
echo "  3) MinIO (self-hosted S3)"
echo "  4) Other S3-compatible service (Wasabi, Backblaze B2, etc.)"
echo "  5) LocalStack (for testing)"
echo ""
read -p "Enter choice [1-5]: " -n 1 -r choice
echo ""
echo ""

case $choice in
  1)
    echo "Using local storage (no additional configuration needed)"
    STORAGE_BACKEND="local"
    ;;
  2)
    echo "Configuring AWS S3..."
    STORAGE_BACKEND="s3"
    
    read -p "Enter S3 bucket name: " S3_BUCKET
    read -p "Enter AWS region (e.g., us-east-1): " S3_REGION
    read -p "Use IAM role for credentials? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo "Will use IAM role (no access keys needed)"
      S3_ACCESS_KEY=""
      S3_SECRET_KEY=""
    else
      read -p "Enter AWS Access Key ID: " S3_ACCESS_KEY
      read -sp "Enter AWS Secret Access Key: " S3_SECRET_KEY
      echo
    fi
    
    # Update .env file using helper function
    update_env "IMMICH_STORAGE_BACKEND" "s3"
    update_env "IMMICH_S3_BUCKET" "$S3_BUCKET"
    update_env "IMMICH_S3_REGION" "$S3_REGION"
    
    if [ -n "$S3_ACCESS_KEY" ]; then
      update_env "IMMICH_S3_ACCESS_KEY" "$S3_ACCESS_KEY"
      update_env "IMMICH_S3_SECRET_KEY" "$S3_SECRET_KEY"
    fi
    
    rm -f "$PROJECT_ROOT/.env.bak"
    echo "✓ S3 configuration added to .env"
    ;;
  3)
    echo "Configuring MinIO..."
    STORAGE_BACKEND="s3"
    
    read -p "Enter MinIO endpoint (e.g., http://minio:9000): " S3_ENDPOINT
    read -p "Enter MinIO bucket name: " S3_BUCKET
    read -p "Enter MinIO access key: " S3_ACCESS_KEY
    read -sp "Enter MinIO secret key: " S3_SECRET_KEY
    echo
    
    # Update .env file using helper function
    update_env "IMMICH_STORAGE_BACKEND" "s3"
    update_env "IMMICH_S3_BUCKET" "$S3_BUCKET"
    update_env "IMMICH_S3_REGION" "us-east-1"
    update_env "IMMICH_S3_ENDPOINT" "$S3_ENDPOINT"
    update_env "IMMICH_S3_ACCESS_KEY" "$S3_ACCESS_KEY"
    update_env "IMMICH_S3_SECRET_KEY" "$S3_SECRET_KEY"
    update_env "IMMICH_S3_FORCE_PATH_STYLE" "true"
    
    rm -f "$PROJECT_ROOT/.env.bak"
    echo "✓ MinIO configuration added to .env"
    ;;
  4)
    echo "Configuring S3-compatible service..."
    STORAGE_BACKEND="s3"
    
    read -p "Enter S3 endpoint URL: " S3_ENDPOINT
    read -p "Enter bucket name: " S3_BUCKET
    read -p "Enter region: " S3_REGION
    read -p "Enter access key: " S3_ACCESS_KEY
    read -sp "Enter secret key: " S3_SECRET_KEY
    echo
    
    # Update .env file using helper function
    update_env "IMMICH_STORAGE_BACKEND" "s3"
    update_env "IMMICH_S3_BUCKET" "$S3_BUCKET"
    update_env "IMMICH_S3_REGION" "$S3_REGION"
    update_env "IMMICH_S3_ENDPOINT" "$S3_ENDPOINT"
    update_env "IMMICH_S3_ACCESS_KEY" "$S3_ACCESS_KEY"
    update_env "IMMICH_S3_SECRET_KEY" "$S3_SECRET_KEY"
    
    rm -f "$PROJECT_ROOT/.env.bak"
    echo "✓ S3-compatible service configuration added to .env"
    ;;
  5)
    echo "Setting up LocalStack for testing..."
    STORAGE_BACKEND="localstack"
    echo "✓ Will use docker-compose.localstack.yml"
    ;;
  *)
    echo "Invalid choice. Using local storage."
    STORAGE_BACKEND="local"
    ;;
esac

echo ""
echo "=========================================="
echo " Starting Immich"
echo "=========================================="
echo ""

cd "$PROJECT_ROOT"

if [ "$STORAGE_BACKEND" = "localstack" ]; then
  echo "Starting LocalStack environment..."
  docker compose -f docker-compose.localstack.yml up -d
  
  echo "Waiting for services to be ready..."
  sleep 5
  
  echo "Initializing LocalStack S3 bucket..."
  if [ -f "$PROJECT_ROOT/scripts/init-localstack.sh" ]; then
    "$PROJECT_ROOT/scripts/init-localstack.sh"
  else
    echo "⚠️  init-localstack.sh script not found. You may need to initialize manually."
  fi
else
  # Determine which compose file to use
  if [ "$STORAGE_BACKEND" = "s3" ]; then
    if [ -f "$PROJECT_ROOT/docker/docker-compose.s3.yml" ]; then
      echo "Using docker-compose.s3.yml for S3 storage..."
      docker compose -f docker/docker-compose.s3.yml up -d
    else
      echo "Using standard docker-compose.yml..."
      docker compose up -d
    fi
  else
    echo "Using standard docker-compose.yml..."
    docker compose up -d
  fi
fi

echo ""
echo "=========================================="
echo " Setup Complete!"
echo "=========================================="
echo ""
echo "Immich is now running at: http://localhost:2283"
echo ""
echo "To view logs:"
echo "  docker compose logs -f"
echo ""
echo "To stop:"
echo "  docker compose down"
echo ""
echo "Configuration file: .env"
echo ""

# =============================================================================
# S3 Module - Media Storage Bucket
# =============================================================================

resource "aws_s3_bucket" "media" {
  bucket = "${var.app_name}-${var.environment}-${var.s3_bucket_name}"

  tags = {
    Name        = "${var.app_name}-${var.environment}-media"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  count  = var.enable_encryption ? 1 : 0
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"] # Restrict in production
    max_age_seconds = 3600
  }
}

# Lifecycle rule: transition old versions to cheaper storage
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  count  = var.use_localstack ? 0 : 1
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "transition-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

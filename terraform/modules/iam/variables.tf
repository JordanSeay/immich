variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket for media storage"
  type        = string
}

variable "use_localstack" {
  type    = bool
  default = true
}

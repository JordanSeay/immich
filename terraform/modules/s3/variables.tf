variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "s3_bucket_name" {
  type    = string
  default = "media"
}

variable "enable_versioning" {
  type    = bool
  default = true
}

variable "enable_encryption" {
  type    = bool
  default = true
}

variable "use_localstack" {
  type    = bool
  default = true
}

variable "cors_allowed_origins" {
  description = "List of allowed CORS origins. Use [\"*\"] for development only."
  type        = list(string)
  default     = ["*"]
}

variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "immich_version" {
  type    = string
  default = "release"
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "target_group_arn" {
  type = string
}

variable "s3_bucket" {
  type = string
}

variable "s3_region" {
  type = string
}

variable "s3_endpoint" {
  type    = string
  default = null
}

variable "db_hostname" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "redis_hostname" {
  type = string
}

variable "use_localstack" {
  type    = bool
  default = true
}

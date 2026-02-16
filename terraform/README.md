# Immich Terraform Infrastructure

Modular Terraform configuration for deploying Immich on AWS (or LocalStack).

## Modules

| Module          | Resources                                                                     | Key Outputs                                     |
| --------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| **vpc**         | VPC, 2 public + 2 private subnets, IGW, NAT, security groups, S3 VPC endpoint | `vpc_id`, `*_subnet_ids`, `*_security_group_id` |
| **s3**          | S3 bucket, versioning, encryption, CORS, lifecycle rules                      | `bucket_name`, `bucket_arn`                     |
| **iam**         | ECS execution role (ECR, logs, secrets), task role (S3 CRUD)                  | `ecs_execution_role_arn`, `ecs_task_role_arn`   |
| **rds**         | PostgreSQL 15, subnet group, parameter group (pgvectors)                      | `endpoint`                                      |
| **elasticache** | Redis 7.x replication group, subnet group                                     | `endpoint`, `port`                              |
| **ecs**         | Fargate cluster, server + ML task definitions, ECS service                    | `cluster_name`, `service_name`                  |
| **alb**         | Application Load Balancer, target group, HTTP listener                        | `dns_name`, `target_group_arn`                  |

## Usage

### LocalStack (Local Development)

```bash
# Start LocalStack
docker compose -f ../docker-compose.localstack.yml up -d localstack

# Deploy
terraform init
terraform plan -var-file=environments/local.tfvars
terraform apply -var-file=environments/local.tfvars -auto-approve

# Destroy
terraform destroy -var-file=environments/local.tfvars -auto-approve
```

### AWS (Future)

```bash
# Copy and fill in your values
cp environments/personal.tfvars environments/personal.auto.tfvars
# Edit personal.auto.tfvars with real values

terraform init
terraform plan -var-file=environments/personal.auto.tfvars
terraform apply -var-file=environments/personal.auto.tfvars
```

## Environment Files

| File                           | Purpose              | Committed?       |
| ------------------------------ | -------------------- | ---------------- |
| `environments/local.tfvars`    | LocalStack defaults  | Yes              |
| `environments/personal.tfvars` | Dev account template | Yes (no secrets) |
| `environments/prod.tfvars`     | Production template  | Yes (no secrets) |
| `environments/*.auto.tfvars`   | Personal overrides   | No (gitignored)  |

## Key Variables

| Variable              | Default                 | Description                      |
| --------------------- | ----------------------- | -------------------------------- |
| `use_localstack`      | `true`                  | Target LocalStack instead of AWS |
| `localstack_endpoint` | `http://localhost:4566` | LocalStack URL                   |
| `app_name`            | `immich`                | Resource name prefix             |
| `environment`         | `local`                 | Environment tag                  |
| `s3_bucket_name`      | `immich-media`          | Media storage bucket             |
| `rds_instance_class`  | `db.t3.micro`           | Database instance size           |
| `redis_node_type`     | `cache.t3.micro`        | Cache instance size              |
| `ecs_desired_count`   | `1`                     | Number of ECS service replicas   |

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "service_name" {
  value = aws_ecs_service.immich_server.name
}

output "server_task_definition_arn" {
  value = aws_ecs_task_definition.immich_server.arn
}

output "ml_task_definition_arn" {
  value = aws_ecs_task_definition.immich_ml.arn
}

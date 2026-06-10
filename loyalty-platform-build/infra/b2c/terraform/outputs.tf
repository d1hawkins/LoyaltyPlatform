output "b2b_client_id" {
  value       = azuread_application.b2b_api.client_id
  description = "Write to Key Vault secret b2c-b2b-client-id"
}

output "b2b_client_secret" {
  value       = azuread_application_password.b2b_api.value
  description = "Write to Key Vault secret b2c-b2b-client-secret"
  sensitive   = true
}

output "consumer_client_id" {
  value       = azuread_application.consumer.client_id
  description = "Write to Key Vault secret b2c-consumer-client-id"
}

output "b2b_identifier_uri" {
  value = tolist(azuread_application.b2b_api.identifier_uris)[0]
}

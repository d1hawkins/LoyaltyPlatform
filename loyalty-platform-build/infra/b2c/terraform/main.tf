terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.53"
    }
  }
}

# Assumes ARM_TENANT_ID points at the existing B2C directory.
provider "azuread" {}

locals {
  b2b_scopes = {
    "members.read"       = "Read loyalty members"
    "members.write"      = "Create and update loyalty members"
    "transactions.write" = "Post loyalty transactions"
    "admin"              = "Administrative operations"
  }
}

# -------------------- B2B API registration --------------------
resource "azuread_application" "b2b_api" {
  display_name     = "loyalty-b2b-api"
  sign_in_audience = "AzureADandPersonalMicrosoftAccount"
  identifier_uris  = ["api://loyalty-b2b"]

  api {
    requested_access_token_version = 2

    dynamic "oauth2_permission_scope" {
      for_each = local.b2b_scopes
      content {
        id                         = uuidv5("oid", oauth2_permission_scope.key)
        admin_consent_description  = oauth2_permission_scope.value
        admin_consent_display_name = oauth2_permission_scope.key
        enabled                    = true
        type                       = "Admin"
        value                      = oauth2_permission_scope.key
      }
    }
  }
}

resource "azuread_service_principal" "b2b_api" {
  client_id = azuread_application.b2b_api.client_id
}

resource "azuread_application_password" "b2b_api" {
  application_id = azuread_application.b2b_api.id
  display_name   = "tf-managed"
  end_date       = timeadd(timestamp(), "17520h") # ~2y

  lifecycle {
    ignore_changes = [end_date]
  }
}

# -------------------- Consumer mobile (PKCE public client) --------------------
resource "azuread_application" "consumer" {
  display_name     = "loyalty-consumer-mobile"
  sign_in_audience = "AzureADandPersonalMicrosoftAccount"

  public_client {
    redirect_uris = [
      "loyalty://callback",
      "https://localhost:3000/callback",
    ]
  }

  required_resource_access {
    resource_app_id = azuread_application.b2b_api.client_id

    dynamic "resource_access" {
      for_each = azuread_application.b2b_api.api[0].oauth2_permission_scope
      content {
        id   = resource_access.value.id
        type = "Scope"
      }
    }
  }
}

resource "azuread_service_principal" "consumer" {
  client_id = azuread_application.consumer.client_id
}

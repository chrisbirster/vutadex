variable "database_url" {
  type    = string
  default = getenv("DATABASE_URL")
}

env "local" {
  src = "file://internal/dbschema/schema.sql"
  url = var.database_url
}

env "production" {
  src = "file://internal/dbschema/schema.sql"
  url = var.database_url
}

[![Lifecycle:Stable](https://img.shields.io/badge/Lifecycle-Stable-97ca00)](https://github.com/bcgov/repomountie/blob/master/doc/lifecycle-badges.md)
# WWW SQL Designer
WWW SQL Designer allows users to create database models directly in their browser, without the need for local tools.

The original WWW SQL Designer was created by [Ondrej Zara](http://ondras.zarovi.cz/) and is distributed under the BSD 3-clause license. The browser designer vendors jQuery 3.7.1 locally for DOM, event, and request handling. The original project is available here: https://github.com/ondras/wwwsqldesigner

This repository replaces the backend with a .NET 8 / EF Core version and expands the featureset.

# Quick Start
1. Clone the repository
1. Open the solution in Visual Studio
1. Run it. By default, it will create a LocalDB instance and deploy the DB schema via Entity Framework

Note that the auto-creation of a database and schema only works with LocalDB in a Development environment. When you're setting up a CI/CD pipeline for Test and Production environments, please include a [dotnet ef migrations bundle](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying?tabs=dotnet-core-cli#bundles) step to handle DB migrations.

## Running SQL Server integration tests

The default `dotnet test` run uses the in-memory provider for application and controller tests. The
authorization schema integration tests create and delete isolated databases, so they are skipped unless a
SQL Server connection string is configured. To run those tests, provide a connection string through the
`WWWSQLDESIGNER_TEST_CONNECTION_STRING` environment variable:

```powershell
$env:WWWSQLDESIGNER_TEST_CONNECTION_STRING = "Server=(localdb)\MSSQLLocalDB;Integrated Security=True;TrustServerCertificate=True"
dotnet test
```

The test code replaces the database name in the supplied connection string with a unique name for each
test, so the configured account must be allowed to create and drop databases. The
`ConnectionStrings__DefaultConnection` environment variable is also supported for pipeline configuration.

# Current Features
1. Full-feature ER diagrams
1. Comments per table and column
1. Optional free-form records schedules per table
1. Optional column data classifications (Public, Protected A, Protected B, or Protected C)
1. Server-side creation of full-schema exports for SQL Server, PostgreSQL, MySQL, SQLite, Oracle, SQLAlchemy, web2py, and EF Core
1. Provider-specific export of defaults, generated values, primary/unique/index keys, foreign keys, schemas, comments, classifications, and records schedules where the target supports them
1. Export metadata sidecars containing model/entity/property assignments, resolved target paths, governed vocabulary details, retention disposition, comments, classifications, and records schedules
1. Portable per-table schemas (defaulting to `dbo`) and table/column descriptions, including schema-qualified SQL Server DDL and EF Core mappings
1. Save models to a database and load the latest or a selected version by model and owner
1. The DB connection is based on Entity Framework Core, so supports LocalDB (for development), MSSQL, PostgreSQL, etc.
1. Data model versioning

## Server model authorization

With Keycloak enabled, a model whose `OwnerId` is `NULL` is global and visible
to every authenticated user. Non-null owner IDs and user/group grant target IDs
are stored and matched exactly with case- and whitespace-sensitive SQL Server
semantics; they are not trimmed or case-normalized.

# Upcoming Features
1. Expanding the SQL import feature to support more than an import from a local MySQL DB
1. User roles and permissions

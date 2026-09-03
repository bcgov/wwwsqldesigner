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

# Current Features
1. Full-feature ER diagrams
1. Comments per table and column
1. Optional free-form records schedules per table
1. Optional column data classifications (Public, Protected A, Protected B, or Protected C)
1. Creation of SQL DDL scripts based on the data model (full script only, no migrations)
1. Export of EF Core 8 classes and a DbContext, as C# or a multi-file ZIP, with configurable namespace and context name
1. Portable per-table schemas (defaulting to `dbo`) and table/column descriptions, including schema-qualified SQL Server DDL and EF Core mappings
1. Save models to a database and load the latest or a selected version by model and owner
1. The DB connection is based on Entity Framework Core, so supports LocalDB (for development), MSSQL, PostgreSQL, etc.
1. Data model versioning
 
# Upcoming Features
1. Expanding the SQL import feature to support more than an import from a local MySQL DB
1. User roles and permissions

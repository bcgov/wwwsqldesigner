[![Lifecycle:Stable](https://img.shields.io/badge/Lifecycle-Stable-97ca00)](https://github.com/bcgov/repomountie/blob/master/doc/lifecycle-badges.md)
# WWW SQL Designer
WWW SQL Designer allows users to create database models directly in their browser, without the need for local tools.

The original WWW SQL Designer was created by [Ondrej Zara](http://ondras.zarovi.cz/) and is built atop the [oz.js](http://code.google.com/p/oz-js/) JavaScript module. It is distributed under the BSD 3-clause license and available here: https://github.com/ondras/wwwsqldesigner

This repository replaces the backend with a .NET 6 / EF Core version and expands the featureset.

# Quick Start
1. Clone the repository
1. Open the solution in Visual Studio
1. Run it. By default, it will create a LocalDB instance and deploy the DB schema via Entity Framework

# Current Features
1. Full-feature ER diagrams
1. Comments per table and column
1. Creation of SQL DDL scripts based on the data model (full script only, no migrations)
1. Save and load models from a database
1. The DB connection is based on Entity Framework Core, so supports LocalDB (for development), MSSQL, PostgreSQL, etc.
 
# Upcoming Features
1. Data model versioning
1. Export to Entity Framework classes, not just SQL DDL
1. Capture of data classifications per column
1. Capture of records retention schedule per column
1. Expanding the SQL import feature to support more than an import from a local MySQL DB

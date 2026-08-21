using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WwwSqlDesigner.Migrations
{
    /// <inheritdoc />
    public partial class AddOwnerScopedModelAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels");

            migrationBuilder.AddColumn<string>(
                name: "OwnerId",
                table: "DataModels",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: false,
                defaultValue: "unowned");

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels",
                columns: new[] { "OwnerId", "Keyword", "Version" });

            migrationBuilder.CreateTable(
                name: "DataModelAccessGrants",
                columns: table => new
                {
                    OwnerId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Keyword = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    TargetType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    TargetId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Permission = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false, defaultValue: "View")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataModelAccessGrants", x => new { x.OwnerId, x.Keyword, x.TargetType, x.TargetId });
                });

            migrationBuilder.CreateIndex(
                name: "IX_DataModelAccessGrants_TargetType_TargetId_Permission",
                table: "DataModelAccessGrants",
                columns: new[] { "TargetType", "TargetId", "Permission" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF EXISTS (
                    SELECT [Keyword], [Version]
                    FROM [DataModels]
                    GROUP BY [Keyword], [Version]
                    HAVING COUNT(*) > 1
                )
                BEGIN
                    THROW 51000, 'Cannot roll back owner-scoped model access because owner/version collisions exist.', 1;
                END
                """);

            migrationBuilder.DropTable(
                name: "DataModelAccessGrants");

            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels");

            migrationBuilder.DropColumn(
                name: "OwnerId",
                table: "DataModels");

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels",
                columns: new[] { "Keyword", "Version" });
        }
    }
}

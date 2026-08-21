using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WwwSqlDesigner.Migrations
{
    /// <inheritdoc />
    public partial class MakeOwnerIdRequiredAndScoped : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels");

            migrationBuilder.DropIndex(
                name: "IX_DataModels_OwnerId_Keyword_Version",
                table: "DataModels");

            migrationBuilder.Sql(
                "UPDATE [DataModels] SET [OwnerId] = N'legacy' WHERE [OwnerId] IS NULL OR [OwnerId] = N'';");

            migrationBuilder.AlterColumn<string>(
                name: "OwnerId",
                table: "DataModels",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: false,
                defaultValue: "legacy",
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256,
                oldNullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels",
                columns: new[] { "OwnerId", "Keyword", "Version" });

            migrationBuilder.CreateIndex(
                name: "IX_DataModels_OwnerId_Keyword_Version",
                table: "DataModels",
                columns: new[] { "OwnerId", "Keyword", "Version" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels");

            migrationBuilder.DropIndex(
                name: "IX_DataModels_OwnerId_Keyword_Version",
                table: "DataModels");

            migrationBuilder.AlterColumn<string>(
                name: "OwnerId",
                table: "DataModels",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256,
                oldDefaultValue: "legacy");

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels",
                columns: new[] { "Keyword", "Version" });

            migrationBuilder.CreateIndex(
                name: "IX_DataModels_OwnerId_Keyword_Version",
                table: "DataModels",
                columns: new[] { "OwnerId", "Keyword", "Version" });
        }
    }
}

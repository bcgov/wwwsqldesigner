using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WwwSqlDesigner.Migrations
{
    /// <inheritdoc />
    public partial class AddOwnerIdToDataModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OwnerId",
                table: "DataModels",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DataModels_OwnerId_Keyword_Version",
                table: "DataModels",
                columns: new[] { "OwnerId", "Keyword", "Version" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DataModels_OwnerId_Keyword_Version",
                table: "DataModels");

            migrationBuilder.DropColumn(
                name: "OwnerId",
                table: "DataModels");
        }
    }
}

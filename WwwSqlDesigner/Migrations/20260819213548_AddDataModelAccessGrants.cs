using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WwwSqlDesigner.Migrations
{
    /// <inheritdoc />
    public partial class AddDataModelAccessGrants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
            migrationBuilder.DropTable(
                name: "DataModelAccessGrants");
        }
    }
}

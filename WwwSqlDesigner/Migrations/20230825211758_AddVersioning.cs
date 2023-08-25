using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WwwSqlDesigner.Migrations
{
    public partial class AddVersioning : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels");

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "DataModels",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels",
                columns: new[] { "Keyword", "Version" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "DataModels");

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels",
                column: "Keyword");
        }
    }
}

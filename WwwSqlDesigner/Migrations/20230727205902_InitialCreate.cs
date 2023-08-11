using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WwwSqlDesigner.Migrations
{
    public partial class InitialCreate : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DataModels",
                columns: table => new
                {
                    Keyword = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Data = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "getdate()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataModels", x => x.Keyword);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DataModels");
        }
    }
}

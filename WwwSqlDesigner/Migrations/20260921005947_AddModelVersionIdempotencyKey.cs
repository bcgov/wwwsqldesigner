using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WwwSqlDesigner.Migrations;

public partial class AddModelVersionIdempotencyKey : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // The preceding approved migration already introduced this nullable
        // historical idempotency key and its filtered unique index. Keep this
        // migration as a no-op so upgrade databases do not receive duplicates.
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Deliberately no-op: the column and index belong to the preceding
        // migration and must remain when this compatibility migration rolls back.
    }
}

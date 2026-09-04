using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WwwSqlDesigner.Migrations
{
    /// <inheritdoc />
    public partial class HardenAuthorizationIdentitySchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels");

            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModelAccessGrants",
                table: "DataModelAccessGrants");

            migrationBuilder.DropIndex(
                name: "IX_DataModelAccessGrants_TargetType_TargetId_Permission",
                table: "DataModelAccessGrants");

            migrationBuilder.AlterColumn<string>(
                name: "OwnerId",
                table: "DataModels",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true,
                collation: "Latin1_General_100_BIN2",
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256,
                oldDefaultValue: "unowned");

            migrationBuilder.Sql(
                """
                DELETE [grant]
                FROM [DataModelAccessGrants] AS [grant]
                WHERE [grant].[OwnerId] COLLATE Latin1_General_100_BIN2 = N'unowned'
                    AND DATALENGTH([grant].[OwnerId]) = DATALENGTH(N'unowned');

                UPDATE [DataModels]
                SET [OwnerId] = NULL
                WHERE [OwnerId] COLLATE Latin1_General_100_BIN2 = N'unowned'
                    AND DATALENGTH([OwnerId]) = DATALENGTH(N'unowned');
                """);

            migrationBuilder.AddColumn<int>(
                name: "Id",
                table: "DataModels",
                type: "int",
                nullable: false,
                defaultValue: 0)
                .Annotation("SqlServer:Identity", "1, 1");

            migrationBuilder.AddColumn<int>(
                name: "OwnerIdByteLength",
                table: "DataModels",
                type: "int",
                nullable: true,
                computedColumnSql: "DATALENGTH([OwnerId])",
                stored: true);

            migrationBuilder.AlterColumn<string>(
                name: "TargetId",
                table: "DataModelAccessGrants",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: false,
                collation: "Latin1_General_100_BIN2",
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256);

            migrationBuilder.AlterColumn<string>(
                name: "OwnerId",
                table: "DataModelAccessGrants",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: false,
                collation: "Latin1_General_100_BIN2",
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256);

            migrationBuilder.AddColumn<int>(
                name: "Id",
                table: "DataModelAccessGrants",
                type: "int",
                nullable: false,
                defaultValue: 0)
                .Annotation("SqlServer:Identity", "1, 1");

            migrationBuilder.AddColumn<int>(
                name: "OwnerIdByteLength",
                table: "DataModelAccessGrants",
                type: "int",
                nullable: false,
                computedColumnSql: "DATALENGTH([OwnerId])",
                stored: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetIdByteLength",
                table: "DataModelAccessGrants",
                type: "int",
                nullable: false,
                computedColumnSql: "DATALENGTH([TargetId])",
                stored: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels",
                column: "Id")
                .Annotation("SqlServer:Clustered", true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModelAccessGrants",
                table: "DataModelAccessGrants",
                column: "Id")
                .Annotation("SqlServer:Clustered", true);

            migrationBuilder.CreateIndex(
                name: "IX_DataModels_OwnerId_Keyword_Version_OwnerIdByteLength",
                table: "DataModels",
                columns: new[] { "OwnerId", "Keyword", "Version", "OwnerIdByteLength" },
                unique: true)
                .Annotation("SqlServer:Clustered", false);

            migrationBuilder.CreateIndex(
                name: "IX_DataModelAccessGrants_OwnerId_Keyword_TargetType_TargetId_OwnerIdByteLength_TargetIdByteLength",
                table: "DataModelAccessGrants",
                columns: new[] { "OwnerId", "Keyword", "TargetType", "TargetId", "OwnerIdByteLength", "TargetIdByteLength" },
                unique: true)
                .Annotation("SqlServer:Clustered", false);

            migrationBuilder.CreateIndex(
                name: "IX_DataModelAccessGrants_TargetType_TargetId_Permission_TargetIdByteLength",
                table: "DataModelAccessGrants",
                columns: new[] { "TargetType", "TargetId", "Permission", "TargetIdByteLength" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF EXISTS (
                    SELECT 1
                    FROM [DataModels]
                    WHERE [OwnerId] IS NOT NULL
                        AND [OwnerId] COLLATE Latin1_General_CI_AS = N'unowned'
                )
                BEGIN
                    THROW 51000, 'Cannot roll back authorization identity hardening because an owner identifier equivalent to the unowned sentinel cannot be represented in the previous schema.', 1;
                END

                IF EXISTS (
                    SELECT 1
                    FROM [DataModels]
                    GROUP BY
                        ISNULL([OwnerId], N'unowned') COLLATE Latin1_General_CI_AS,
                        [Keyword] COLLATE Latin1_General_CI_AS,
                        [Version]
                    HAVING COUNT(*) > 1
                )
                BEGIN
                    THROW 51000, 'Cannot roll back authorization identity hardening because model identities collide under the previous comparison semantics.', 1;
                END

                IF EXISTS (
                    SELECT 1
                    FROM [DataModelAccessGrants]
                    WHERE DATALENGTH([OwnerId])
                        + DATALENGTH([Keyword])
                        + DATALENGTH([TargetType])
                        + DATALENGTH([TargetId]) > 900
                )
                BEGIN
                    THROW 51000, 'Cannot roll back authorization identity hardening because a grant identity exceeds the previous 900-byte clustered key limit.', 1;
                END

                IF EXISTS (
                    SELECT 1
                    FROM [DataModelAccessGrants]
                    GROUP BY
                        [OwnerId] COLLATE Latin1_General_CI_AS,
                        [Keyword] COLLATE Latin1_General_CI_AS,
                        [TargetType] COLLATE Latin1_General_CI_AS,
                        [TargetId] COLLATE Latin1_General_CI_AS
                    HAVING COUNT(*) > 1
                )
                BEGIN
                    THROW 51000, 'Cannot roll back authorization identity hardening because grant identities collide under the previous comparison semantics.', 1;
                END
                """);

            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels");

            migrationBuilder.DropIndex(
                name: "IX_DataModels_OwnerId_Keyword_Version_OwnerIdByteLength",
                table: "DataModels");

            migrationBuilder.DropPrimaryKey(
                name: "PK_DataModelAccessGrants",
                table: "DataModelAccessGrants");

            migrationBuilder.DropIndex(
                name: "IX_DataModelAccessGrants_OwnerId_Keyword_TargetType_TargetId_OwnerIdByteLength_TargetIdByteLength",
                table: "DataModelAccessGrants");

            migrationBuilder.DropIndex(
                name: "IX_DataModelAccessGrants_TargetType_TargetId_Permission_TargetIdByteLength",
                table: "DataModelAccessGrants");

            migrationBuilder.Sql(
                """
                UPDATE [DataModels]
                SET [OwnerId] = N'unowned'
                WHERE [OwnerId] IS NULL;
                """);

            migrationBuilder.DropColumn(
                name: "OwnerIdByteLength",
                table: "DataModels");

            migrationBuilder.DropColumn(
                name: "Id",
                table: "DataModels");

            migrationBuilder.DropColumn(
                name: "OwnerIdByteLength",
                table: "DataModelAccessGrants");

            migrationBuilder.DropColumn(
                name: "TargetIdByteLength",
                table: "DataModelAccessGrants");

            migrationBuilder.DropColumn(
                name: "Id",
                table: "DataModelAccessGrants");

            migrationBuilder.AlterColumn<string>(
                name: "OwnerId",
                table: "DataModels",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: false,
                defaultValue: "unowned",
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256,
                oldNullable: true,
                oldCollation: "Latin1_General_100_BIN2");

            migrationBuilder.AlterColumn<string>(
                name: "TargetId",
                table: "DataModelAccessGrants",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256,
                oldCollation: "Latin1_General_100_BIN2");

            migrationBuilder.AlterColumn<string>(
                name: "OwnerId",
                table: "DataModelAccessGrants",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256,
                oldCollation: "Latin1_General_100_BIN2");

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModels",
                table: "DataModels",
                columns: new[] { "OwnerId", "Keyword", "Version" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_DataModelAccessGrants",
                table: "DataModelAccessGrants",
                columns: new[] { "OwnerId", "Keyword", "TargetType", "TargetId" });

            migrationBuilder.CreateIndex(
                name: "IX_DataModelAccessGrants_TargetType_TargetId_Permission",
                table: "DataModelAccessGrants",
                columns: new[] { "TargetType", "TargetId", "Permission" });
        }
    }
}

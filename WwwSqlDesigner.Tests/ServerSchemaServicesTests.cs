using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Text.Json;
using WwwSqlDesigner.Data;
using WwwSqlDesigner.Services;

namespace WwwSqlDesigner.Tests;

[TestClass]
public sealed class ServerSchemaServicesTests
{
    private static readonly string[] CompositeKeyNames = ["A", "B"];

    [TestMethod]
    public void ParsesDdlDialectsIntoCanonicalModel()
    {
        var cases = new[]
        {
            ("mssql", "CREATE TABLE [People] ([Id] INT NOT NULL PRIMARY KEY, [Name] NVARCHAR(50));"),
            ("postgresql", "CREATE TABLE \"People\" (\"Id\" integer NOT NULL PRIMARY KEY, \"Name\" varchar(50));"),
            ("mysql", "CREATE TABLE `People` (`Id` INT NOT NULL PRIMARY KEY, `Name` VARCHAR(50));"),
            ("oracle", "CREATE TABLE \"People\" (\"Id\" NUMBER(10) NOT NULL PRIMARY KEY, \"Name\" VARCHAR2(50));")
        };
        foreach (var (format, ddl) in cases)
        {
            var imported = SchemaImportService.Parse("schema.sql", ddl);
            Assert.IsNotNull(imported.Schema, string.Join(";", imported.Diagnostics.Select(x => x.Message)));
            Assert.AreEqual("People", imported.Schema!.Tables.Single().Name);
            var exported = new SchemaExportService().Export(imported.Schema, format);
            Assert.IsFalse(string.IsNullOrWhiteSpace(exported.Content));
            Assert.AreEqual(exported.Checksum, new SchemaExportService().Export(imported.Schema, format).Checksum);
        }
    }

    [TestMethod]
    public void ParsesEfEntitiesAndRendersEfCore()
    {
        const string source = "public class Person { public int Id { get; set; } public string? Name { get; set; } }";
        var imported = SchemaImportService.Parse("Entities.cs", source);
        Assert.IsNotNull(imported.Schema);
        var exported = new SchemaExportService().Export(imported.Schema!, "ef");
        Assert.Contains("DbSet<Person>", exported.Content);
        Assert.Contains("class Person", exported.Content);
    }

    [TestMethod]
    public void ParsesCompositePrimaryKeysAcrossDialects()
    {
        var statements = new[]
        {
            "CREATE TABLE [Join] ([A] INT NOT NULL, [B] INT NOT NULL, CONSTRAINT [PK_Join] PRIMARY KEY ([A], [B]));",
            "CREATE TABLE \"Join\" (\"A\" integer NOT NULL, \"B\" integer NOT NULL, PRIMARY KEY (\"A\", \"B\"));",
            "CREATE TABLE `Join` (`A` INT NOT NULL, `B` INT NOT NULL, PRIMARY KEY (`A`, `B`));",
            "CREATE TABLE \"Join\" (\"A\" NUMBER NOT NULL, \"B\" NUMBER NOT NULL, CONSTRAINT PK_JOIN PRIMARY KEY (\"A\", \"B\"));"
        };
        foreach (var ddl in statements)
        {
            var schema = SchemaImportService.Parse("schema.sql", ddl).Schema;
            Assert.IsNotNull(schema);
            var table = schema!.Tables.Single();
            Assert.AreSequenceEqual(CompositeKeyNames, table.PrimaryKeyColumns!.ToArray());
            Assert.IsTrue(table.Columns.All(x => x.PrimaryKey));
        }
    }

    [TestMethod]
    public void ParsesDefaultsGeneratedColumnsIndexesAndForeignKeys()
    {
        const string ddl = """
            CREATE TABLE [records].[Parent] (
              [Id] INT IDENTITY(1,1) NOT NULL,
              [Code] NVARCHAR(40) DEFAULT 'unknown' NOT NULL,
              CONSTRAINT [PK_Parent] PRIMARY KEY ([Id]),
              CONSTRAINT [UQ_Parent_Code] UNIQUE ([Code])
            );
            CREATE TABLE [records].[Child] (
              [Id] INT NOT NULL PRIMARY KEY,
              [ParentId] INT NOT NULL,
              CONSTRAINT [FK_Child_Parent] FOREIGN KEY ([ParentId]) REFERENCES [records].[Parent] ([Id]),
              INDEX [IX_Child_Parent] ([ParentId])
            );
            """;

        var imported = SchemaImportService.Parse("schema.sql", ddl);

        Assert.IsNotNull(imported.Schema, string.Join(";", imported.Diagnostics.Select(x => x.Message)));
        var parent = imported.Schema.Tables.Single(table => table.Name == "Parent");
        Assert.AreEqual("records", parent.Schema);
        Assert.IsTrue(parent.Columns.Single(column => column.Name == "Id").AutoIncrement);
        Assert.AreEqual("'unknown'", parent.Columns.Single(column => column.Name == "Code").Default);
        Assert.Contains(key => key.Type == "UNIQUE" && key.Columns.SequenceEqual(["Code"]), parent.Keys!);
        var child = imported.Schema.Tables.Single(table => table.Name == "Child");
        Assert.Contains(key => key.Type == "INDEX" && key.Columns.SequenceEqual(["ParentId"]), child.Keys!);
        var relation = child.Columns.Single(column => column.Name == "ParentId").Relation;
        Assert.IsNotNull(relation);
        Assert.AreEqual("records", relation.Schema);
        Assert.AreEqual("Parent", relation.Table);
        Assert.AreEqual("Id", relation.Column);
        Assert.AreEqual("FK_Child_Parent", relation.Name);
    }

    [TestMethod]
    public void PreservesCanonicalMetadataAssignmentsInSnapshots()
    {
        var modelId = Guid.NewGuid();
        var entityId = Guid.NewGuid();
        var propertyId = Guid.NewGuid();
        var termId = Guid.NewGuid();
        var schema = new CanonicalSchema(
            new[] { new SchemaTable("People", new[] { new SchemaColumn("Name", "TEXT", Id: propertyId) }, entityId) },
            new[] { new CanonicalMetadataAssignment(MetadataTargetType.Model, modelId, termId, "retain") });

        var roundTrip = SchemaExportService.ReadSnapshot(JsonSerializer.Serialize(schema));
        var assignments = roundTrip.MetadataAssignments;
        Assert.IsNotNull(assignments);
        Assert.AreEqual(modelId, assignments.Single().TargetId);
        Assert.AreEqual("retain", assignments.Single().RetentionDisposition);
    }

    [TestMethod]
    public void ReadsCompletePortableDesignerXml()
    {
        const string xml = """
            <sql format="portable-v1">
              <table name="People" schema="records">
                <row name="Id" null="0" autoincrement="1">
                  <datatype>integer</datatype>
                  <default>1</default>
                  <comment>Identifier</comment>
                  <classification>Protected B</classification>
                </row>
                <row name="ManagerId" null="1" autoincrement="0">
                  <datatype>integer</datatype>
                  <relation table="People" schema="records" row="Id" name="FK_People_Manager" />
                </row>
                <key type="PRIMARY" name="PK_People"><part>Id</part></key>
                <key type="INDEX" name="IX_People_Manager"><part>ManagerId</part></key>
                <comment>ᓂᐦᑖᐏᐦᑯᐤ people</comment>
                <records-schedule>ARCS 100-20</records-schedule>
              </table>
            </sql>
            """;

        var table = SchemaExportService.ReadSnapshot(xml).Tables.Single();

        Assert.AreEqual("records", table.Schema);
        Assert.AreEqual("ᓂᐦᑖᐏᐦᑯᐤ people", table.Comment);
        Assert.AreEqual("ARCS 100-20", table.RecordsSchedule);
        Assert.HasCount(2, table.Keys!);
        var id = table.Columns[0];
        Assert.AreEqual("integer", id.Type);
        Assert.IsTrue(id.AutoIncrement);
        Assert.AreEqual("1", id.Default);
        Assert.AreEqual("Identifier", id.Comment);
        Assert.AreEqual("Protected B", id.Classification);
        Assert.IsTrue(id.PrimaryKey);
        var relation = table.Columns[1].Relation;
        Assert.IsNotNull(relation);
        Assert.AreEqual("records", relation.Schema);
        Assert.AreEqual("People", relation.Table);
        Assert.AreEqual("Id", relation.Column);
        Assert.AreEqual("FK_People_Manager", relation.Name);
    }

    [TestMethod]
    public void ServerTemplatesPreserveLegacyExporterCapabilities()
    {
        var modelId = Guid.NewGuid();
        var entityId = Guid.NewGuid();
        var propertyId = Guid.NewGuid();
        var termId = Guid.NewGuid();
        var schema = new CanonicalSchema(
            [
                new SchemaTable(
                    "Parent",
                    [
                        new SchemaColumn("Id", "integer", false, true, Guid.NewGuid(), true),
                        new SchemaColumn("DisplayName", "string(120)", false, Id: Guid.NewGuid(), Default: "'Unknown'", Comment: "Display name")
                    ],
                    Guid.NewGuid(),
                    ["Id"],
                    "records",
                    "Parent table",
                    "ARCS 100-20",
                    [
                        new SchemaKey("PRIMARY", "PK_Parent", ["Id"]),
                        new SchemaKey("UNIQUE", "UQ_Parent_DisplayName", ["DisplayName"])
                    ]),
                new SchemaTable(
                    "Child",
                    [
                        new SchemaColumn("Id", "integer", false, true, Guid.NewGuid(), true),
                        new SchemaColumn(
                            "ParentId",
                            "integer",
                            false,
                            Id: propertyId,
                            Comment: "Parent reference",
                            Classification: "Protected B",
                            Relation: new SchemaRelation("Parent", "Id", "records", "FK_Child_Parent"))
                    ],
                    entityId,
                    ["Id"],
                    "records",
                    "ᓂᐦᑖᐏᐦᑯᐤ child table",
                    "ORCS 12345",
                    [
                        new SchemaKey("PRIMARY", "PK_Child", ["Id"]),
                        new SchemaKey("INDEX", "IX_Child_Parent", ["ParentId"])
                    ])
            ],
            [
                new CanonicalMetadataAssignment(MetadataTargetType.Model, modelId, termId, "retain"),
                new CanonicalMetadataAssignment(MetadataTargetType.Entity, entityId, termId, "archive"),
                new CanonicalMetadataAssignment(MetadataTargetType.Property, propertyId, termId, "null")
            ]);
        var exporter = new SchemaExportService();
        var metadataTerms = new Dictionary<Guid, ExportMetadataTerm>
        {
            [termId] = new(termId, "Data classification", 1, "PROTECTED_B", "Protected B")
        };

        var exports = new Dictionary<string, string>();
        foreach (var format in new[] { "mssql", "postgresql", "mysql", "sqlite", "oracle", "sqlalchemy", "web2py", "ef" })
        {
            var result = exporter.Export(schema, format, metadataTerms);
            Assert.IsFalse(string.IsNullOrWhiteSpace(result.Content), $"{format}: {string.Join("; ", result.Diagnostics.Select(x => x.Message))}");
            Assert.DoesNotContain(diagnostic => diagnostic.Code == "export-template-error", result.Diagnostics, format);
            Assert.Contains(termId.ToString(), result.Sidecar, format);
            Assert.Contains("ARCS 100-20", result.Sidecar, format);
            Assert.Contains("Protected B", result.Sidecar, format);
            Assert.Contains("PROTECTED_B", result.Sidecar, format);
            Assert.Contains("Data classification", result.Sidecar, format);
            using var sidecar = JsonDocument.Parse(result.Sidecar);
            var childMetadata = sidecar.RootElement.GetProperty("tables")[1];
            Assert.AreEqual("ᓂᐦᑖᐏᐦᑯᐤ child table", childMetadata.GetProperty("comment").GetString(), format);
            exports.Add(format, result.Content);
        }

        Assert.Contains("IDENTITY (1, 1)", exports["mssql"]);
        Assert.Contains("FOREIGN KEY", exports["mssql"]);
        Assert.Contains("CREATE INDEX", exports["mssql"]);
        Assert.Contains("MS_Description", exports["mssql"]);
        Assert.Contains("RecordsSchedule", exports["mssql"]);
        Assert.Contains("DataClassification", exports["mssql"]);

        Assert.Contains("BIGSERIAL", exports["postgresql"]);
        Assert.Contains("FOREIGN KEY", exports["postgresql"]);
        Assert.Contains("COMMENT ON TABLE", exports["postgresql"]);
        Assert.Contains("COMMENT ON COLUMN", exports["postgresql"]);

        Assert.Contains("AUTO_INCREMENT", exports["mysql"]);
        Assert.Contains("FOREIGN KEY", exports["mysql"]);
        Assert.Contains("COMMENT '", exports["mysql"]);

        Assert.Contains("AUTOINCREMENT", exports["sqlite"]);
        Assert.Contains("REFERENCES", exports["sqlite"]);
        Assert.Contains("CREATE INDEX", exports["sqlite"]);

        Assert.Contains("CREATE SEQUENCE", exports["oracle"]);
        Assert.Contains("CREATE OR REPLACE TRIGGER", exports["oracle"]);
        Assert.Contains("FOREIGN KEY", exports["oracle"]);
        Assert.Contains("COMMENT ON TABLE", exports["oracle"]);
        Assert.Contains("COMMENT ON COLUMN", exports["oracle"]);

        Assert.Contains("sa.ForeignKey", exports["sqlalchemy"]);
        Assert.Contains("primary_key=True", exports["sqlalchemy"]);
        Assert.Contains("\"reference Parent\"", exports["web2py"]);
        Assert.Contains("HasForeignKey", exports["ef"]);
        Assert.Contains("HasComment", exports["ef"]);
        Assert.Contains("RecordsSchedule", exports["ef"]);
        Assert.Contains("DataClassification", exports["ef"]);
    }
}

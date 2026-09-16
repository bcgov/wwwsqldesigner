using System.Diagnostics;
using System.Security;
using System.Xml;
using System.Xml.Xsl;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace WwwSqlDesigner.Tests;

[TestClass]
public class EfExportTests
{
    private static string Transform(string modelXml, XsltArgumentList? parameters = null)
    {
        var model = new XmlDocument();
        model.LoadXml(modelXml);
        var transform = new XslCompiledTransform();
        transform.Load(Path.Combine(AppContext.BaseDirectory, "TestData", "ef-output.xsl"));
        using var output = new StringWriter(System.Globalization.CultureInfo.InvariantCulture);
        transform.Transform(model, parameters, output);
        return output.ToString();
    }

    [TestMethod]
    public void EfExportMapsSqlTypesAndRelationships()
    {
        var model = new XmlDocument();
        model.LoadXml("""
            <sql>
              <datatypes db="mssql" />
              <table name="parent table">
                <row name="Id" null="0"><datatype>int</datatype></row>
                <row name="External Id" null="0"><datatype>uniqueidentifier</datatype></row>
                <row name="Payload" null="1"><datatype>varbinary(32)</datatype></row>
                <key type="PRIMARY"><part>Id</part></key>
              </table>
              <table name="Child Table">
                <row name="Parent Id" null="0">
                  <datatype>int</datatype>
                  <relation table="parent table" row="Id" />
                </row>
                <row name="Description field" null="1"><datatype>nvarchar(100)</datatype></row>
                <row name="Parent External Id" null="0">
                  <datatype>uniqueidentifier</datatype>
                  <relation table="parent table" row="External Id" />
                </row>
              </table>
            </sql>
            """);

        var transform = new XslCompiledTransform();
        transform.Load(Path.Combine(AppContext.BaseDirectory, "TestData", "ef-output.xsl"));

        using var output = new StringWriter(System.Globalization.CultureInfo.InvariantCulture);
        transform.Transform(model, null, output);
        var generated = output.ToString();

        Assert.Contains("using System;", generated);
        Assert.Contains("public int Id { get; set; }", generated);
        Assert.Contains("public Guid External_Id { get; set; }", generated);
        Assert.Contains("public byte[]? Payload { get; set; }", generated);
        Assert.Contains("public string? Description_field { get; set; }", generated);
        Assert.Contains("public DbSet<parent_table> parent_tables", generated);
        Assert.Contains("HasKey(e => new { e.Id })", generated);
        Assert.Contains("HasOne<parent_table>().WithMany().HasForeignKey(e => e.Parent_Id)", generated);
        Assert.Contains("HasPrincipalKey(p => p.External_Id)", generated);
        Assert.IsFalse(generated.Contains("public  ", StringComparison.Ordinal));
    }

    [TestMethod]
    public void EfExportUsesConfiguredNamespaceAndContext()
    {
        var model = new XmlDocument();
        model.LoadXml("<sql><datatypes db=\"mssql\" /><table name=\"Item\"><row name=\"Id\" null=\"0\"><datatype>int</datatype></row></table></sql>");

        var transform = new XslCompiledTransform();
        transform.Load(Path.Combine(AppContext.BaseDirectory, "TestData", "ef-output.xsl"));
        var parameters = new XsltArgumentList();
        parameters.AddParam("namespace", "", "Example.Models");
        parameters.AddParam("context", "", "ExampleContext");

        using var output = new StringWriter(System.Globalization.CultureInfo.InvariantCulture);
        transform.Transform(model, parameters, output);
        var generated = output.ToString();

        Assert.Contains("namespace Example.Models", generated);
        Assert.Contains("public class ExampleContext : DbContext", generated);
        Assert.Contains("ExampleContext(DbContextOptions<ExampleContext> options)", generated);
    }

    [TestMethod]
    public void EfExportUsesStableDefaults()
    {
        var model = new XmlDocument();
        model.LoadXml("<sql><datatypes db=\"mssql\" /></sql>");

        var transform = new XslCompiledTransform();
        transform.Load(Path.Combine(AppContext.BaseDirectory, "TestData", "ef-output.xsl"));
        using var output = new StringWriter(System.Globalization.CultureInfo.InvariantCulture);
        transform.Transform(model, null, output);
        var generated = output.ToString();

        Assert.Contains("namespace WwwSqlDesigner.Data", generated);
        Assert.Contains("public class ApplicationDbContext : DbContext", generated);
    }

    [TestMethod]
    public void EfExportProducesCompileReadyIdentifiersAndDeterministicCollisions()
    {
        var generated = Transform("""
            <sql>
              <datatypes db="mssql" />
              <table name="2024 Orders#">
                <row name="Event#Id" null="0"><datatype>uniqueidentifier</datatype></row>
                <row name="Line Item" null="0"><datatype>int</datatype></row>
                <row name="Line-Item" null="0"><datatype>int</datatype></row>
                <key type="PRIMARY"><part>Line-Item</part></key>
              </table>
              <table name="2024 Orders!"><row name="Id" null="0"><datatype>int</datatype></row></table>
            </sql>
            """);

        Assert.Contains("public class _2024_Orders_", generated);
        Assert.Contains("public class _2024_Orders__2", generated);
        Assert.Contains("public Guid Event_Id { get; set; }", generated);
        Assert.Contains("public int Line_Item_2 { get; set; }", generated);
        Assert.Contains("HasKey(e => new { e.Line_Item_2 })", generated);
    }

    [TestMethod]
    public void EfExportReservesTheConfiguredContextName()
    {
        var parameters = new XsltArgumentList();
        parameters.AddParam("context", "", "ExampleContext");
        var generated = Transform("""
            <sql><datatypes db="mssql" />
              <table name="ExampleContext"><row name="Id" null="0"><datatype>int</datatype></row></table>
            </sql>
            """, parameters);

        Assert.Contains("public class ExampleContext_2", generated);
        Assert.Contains("public class ExampleContext : DbContext", generated);
    }

    [TestMethod]
    public void EfExportMapsSchemasCommentsAndSameNamedRelationships()
    {
        var generated = Transform("""
            <sql><datatypes db="mssql"/>
              <table name="Item" schema="sales"><row name="Id" null="0"><datatype>int</datatype><comment>id "quoted" \ path { public class Fake { } }</comment></row><comment>表&#10;comment</comment></table>
              <table name="Item" schema="archive"><row name="Id" null="0"><datatype>int</datatype></row></table>
              <table name="Link" schema="dbo"><row name="ArchiveId" null="0"><datatype>int</datatype><relation table="Item" schema="archive" row="Id"/></row></table>
            </sql>
            """);

        Assert.Contains("public class Item_2", generated);
        Assert.Contains("ToTable(\"Item\", \"sales\").HasComment(\"表\\n", generated);
        Assert.Contains("Property(e => e.Id).HasComment(\"id \\\"quoted\\\" \\\\ path { public class Fake { } }\")", generated);
        Assert.Contains("HasOne<Item_2>()", generated);
    }

    [TestMethod]
    public void EfExportEscapesDescriptionsAtTheSqlServerBoundary()
    {
        var description = string.Concat(Enumerable.Repeat("A\"\\\r\n\t", 625));
        Assert.AreEqual(3750, description.Length);

        var generated = Transform("<sql><table name=\"Item\" schema=\"dbo\"><row name=\"Id\" null=\"0\"><datatype>int</datatype></row><comment>"
            + SecurityElement.Escape(description) + "</comment></table></sql>");

        Assert.Contains("HasComment(\"", generated);
        Assert.Contains("A\\\"\\\\\\r\\n\\t", generated);
    }

    [TestMethod]
    public void GeneratedHostileCommentsCompileAndProduceSqlServerDescriptionMigrations()
    {
        var generated = Transform("""
            <sql><datatypes db="mssql"/>
              <table name="Order's Table" schema="sales">
                <row name="Id" null="0"><datatype>int</datatype></row>
                <row name="ValueColumn" null="0"><datatype>nvarchar(100)</datatype><comment>列's "column" \ path&#13;&#10;{ class AlsoFake { } }&#133;&#8232;&#8233;</comment></row>
                <key type="PRIMARY"><part>Id</part></key>
                <comment>表's "table" \ path&#13;&#10;{ public class Fake { } }&#133;&#8232;&#8233;</comment>
              </table>
            </sql>
            """, GeneratedContextParameters());
        Assert.Contains("\\u0085\\u2028\\u2029", generated);
        Assert.IsFalse(generated.Contains('\u0085'));
        Assert.IsFalse(generated.Contains('\u2028'));
        Assert.IsFalse(generated.Contains('\u2029'));
        var projectDirectory = Path.Combine(Path.GetTempPath(), $"wwwsqldesigner-ef-export-{Guid.NewGuid():N}");

        try
        {
            Directory.CreateDirectory(projectDirectory);
            var applicationProject = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../WwwSqlDesigner/WwwSqlDesigner.csproj"));
            File.WriteAllText(Path.Combine(projectDirectory, "GeneratedMigrationProof.csproj"), $"""
                <Project Sdk="Microsoft.NET.Sdk">
                  <PropertyGroup>
                    <OutputType>Exe</OutputType>
                    <TargetFramework>net10.0</TargetFramework>
                    <Nullable>enable</Nullable>
                  </PropertyGroup>
                  <ItemGroup>
                    <ProjectReference Include="{SecurityElement.Escape(applicationProject)}" />
                  </ItemGroup>
                </Project>
                """);
            File.WriteAllText(Path.Combine(projectDirectory, "Program.cs"), generated + """

                namespace GeneratedMigrationProof
                {
                    using System.Linq;
                    using Microsoft.EntityFrameworkCore;
                    using Microsoft.EntityFrameworkCore.Infrastructure;
                    using Microsoft.EntityFrameworkCore.Metadata;
                    using Microsoft.EntityFrameworkCore.Migrations;
                    using Microsoft.EntityFrameworkCore.Migrations.Operations;
                    using Microsoft.EntityFrameworkCore.Storage;
                    using Testing.Generated;

                    internal static class Program
                    {
                        private static void Main()
                        {
                            System.Console.OutputEncoding = System.Text.Encoding.UTF8;
                            var options = new DbContextOptionsBuilder<GeneratedContext>()
                                .UseSqlServer("Server=(localdb)\\mssqllocaldb;Database=GeneratedMigrationProof;Trusted_Connection=True")
                                .Options;
                            using var context = new GeneratedContext(options);
                            var model = context.GetService<IDesignTimeModel>().Model;
                            var operations = context.GetService<IMigrationsModelDiffer>()
                                .GetDifferences(null, model.GetRelationalModel());
                            var commands = context.GetService<IMigrationsSqlGenerator>()
                                .Generate(operations, model);
                            System.Console.Write(string.Join("\n", commands.Select(command => command.CommandText)));
                        }
                    }
                }
                """);

            var result = RunDotNet(projectDirectory);

            Assert.AreEqual(0, result.ExitCode, $"Generated EF source did not compile/run.{Environment.NewLine}{result.Output}");
            Assert.Contains("MS_Description", result.Output);
            Assert.Contains("'SCHEMA', N'sales', 'TABLE', N'Order''s Table';", result.Output);
            Assert.Contains("'SCHEMA', N'sales', 'TABLE', N'Order''s Table', 'COLUMN', N'ValueColumn';", result.Output);
            Assert.Contains("N'表''s \"table\" \\ path'", result.Output);
            Assert.Contains("N'列''s \"column\" \\ path'", result.Output);
            Assert.Contains("NCHAR(13), NCHAR(10)", result.Output);
            Assert.Contains("N'{ public class Fake { } }\u0085\u2028\u2029'", result.Output);
            Assert.Contains("N'{ class AlsoFake { } }\u0085\u2028\u2029'", result.Output);
            Assert.Contains("\u0085", result.Output);
            Assert.Contains("\u2028", result.Output);
            Assert.Contains("\u2029", result.Output);
        }
        finally
        {
            if (Directory.Exists(projectDirectory))
            {
                Directory.Delete(projectDirectory, recursive: true);
            }
        }
    }

    private static XsltArgumentList GeneratedContextParameters()
    {
        var parameters = new XsltArgumentList();
        parameters.AddParam("namespace", "", "Testing.Generated");
        parameters.AddParam("context", "", "GeneratedContext");
        return parameters;
    }

    private static (int ExitCode, string Output) RunDotNet(string projectDirectory)
    {
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = "dotnet",
            Arguments = "run --project GeneratedMigrationProof.csproj --configuration Release",
            WorkingDirectory = projectDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
            StandardErrorEncoding = System.Text.Encoding.UTF8,
            UseShellExecute = false,
            CreateNoWindow = true
        }) ?? throw new AssertFailedException("Could not start the .NET SDK.");
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        return (process.ExitCode, standardOutput.GetAwaiter().GetResult() + standardError.GetAwaiter().GetResult());
    }

    [TestMethod]
    public void EfOptionsRejectInvalidNamesBeforePersisting()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var options = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "options.js"));
        var window = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "window.js"));

        Assert.Contains("setCustomValidity", options);
        Assert.Contains("return false;", options);
        Assert.Contains("CONFIG.CSHARP_KEYWORDS.includes", options);
        Assert.Contains("this.callback?.() !== false", window);
    }

    [TestMethod]
    public void EmitsClassificationAnnotationWithOrWithoutComment()
    {
        var generated = Transform("""
            <sql><table name="Person" schema="dbo">
              <row name="PublicId" null="0"><datatype>int</datatype><classification>Public</classification></row>
              <row name="Secret" null="0"><datatype>nvarchar(20)</datatype><comment>Note</comment><classification>Protected B</classification></row>
            </table></sql>
            """, GeneratedContextParameters());

        Assert.Contains("Property(e => e.PublicId).HasAnnotation(\"DataClassification\", \"Public\")", generated);
        Assert.Contains("Property(e => e.Secret).HasMaxLength(20).HasComment(\"Note\").HasAnnotation(\"DataClassification\", \"Protected B\")", generated);
    }

    [TestMethod]
    public void EfExportMapsPortableFacetsAndReferenceTypeNullability()
    {
        var generated = Transform("""
            <sql><table name="FacetTypes" schema="dbo">
              <row name="Amount" null="0"><datatype>decimal( 18 , 4 )</datatype><comment>Money</comment><classification>Protected B</classification></row>
              <row name="OptionalAmount" null="1"><datatype>numeric(9,0)</datatype></row>
              <row name="LegacyAmount" null="0"><datatype>dec(7, 2)</datatype></row>
              <row name="Name" null="0"><datatype>string(80)</datatype></row>
              <row name="OptionalName" null="1"><datatype>nvarchar(max)</datatype></row>
              <row name="Code" null="0"><datatype>char(12)</datatype></row>
              <row name="Payload" null="0"><datatype>binary(32)</datatype></row>
              <row name="OptionalPayload" null="1"><datatype>varbinary(max)</datatype></row>
              <row name="LegacyImage" null="0"><datatype>image</datatype></row>
            </table></sql>
            """);

        Assert.Contains("public decimal Amount { get; set; }", generated);
        Assert.Contains("public decimal? OptionalAmount { get; set; }", generated);
        Assert.Contains("public decimal LegacyAmount { get; set; }", generated);
        Assert.Contains("public string Name { get; set; } = null!;", generated);
        Assert.Contains("public string? OptionalName { get; set; }", generated);
        Assert.Contains("public string Code { get; set; } = null!;", generated);
        Assert.Contains("public byte[] Payload { get; set; } = null!;", generated);
        Assert.Contains("public byte[]? OptionalPayload { get; set; }", generated);
        Assert.Contains("public byte[] LegacyImage { get; set; } = null!;", generated);
        const string amountChain = "Property(e => e.Amount).HasPrecision(18, 4).HasComment(\"Money\").HasAnnotation(\"DataClassification\", \"Protected B\")";
        Assert.AreEqual(1, generated.Split(amountChain, StringSplitOptions.None).Length - 1);
        Assert.Contains("Property(e => e.OptionalAmount).HasPrecision(9, 0)", generated);
        Assert.Contains("Property(e => e.LegacyAmount).HasPrecision(7, 2)", generated);
        Assert.Contains("Property(e => e.Name).HasMaxLength(80)", generated);
        Assert.Contains("Property(e => e.Code).HasMaxLength(12)", generated);
        Assert.Contains("Property(e => e.Payload).HasMaxLength(32)", generated);
        Assert.IsFalse(generated.Contains("HasMaxLength(max)", StringComparison.Ordinal));
        Assert.IsFalse(generated.Contains("Property(e => e.OptionalName)", StringComparison.Ordinal));
        Assert.IsFalse(generated.Contains("Property(e => e.OptionalPayload)", StringComparison.Ordinal));
    }

    [TestMethod]
    public void EfExportPreservesStringAndBinaryLengthAliases()
    {
        var generated = Transform("""
            <sql><table name="Aliases" schema="dbo">
              <row name="CharValue" null="0"><datatype>char(1)</datatype></row>
              <row name="VarcharValue" null="0"><datatype>varchar(2)</datatype></row>
              <row name="NcharValue" null="0"><datatype>nchar(3)</datatype></row>
              <row name="NvarcharValue" null="0"><datatype>nvarchar(4)</datatype></row>
              <row name="BinaryValue" null="0"><datatype>binary(5)</datatype></row>
              <row name="VarbinaryValue" null="0"><datatype>varbinary(6)</datatype></row>
            </table></sql>
            """);

        Assert.Contains("Property(e => e.CharValue).HasMaxLength(1)", generated);
        Assert.Contains("Property(e => e.VarcharValue).HasMaxLength(2)", generated);
        Assert.Contains("Property(e => e.NcharValue).HasMaxLength(3)", generated);
        Assert.Contains("Property(e => e.NvarcharValue).HasMaxLength(4)", generated);
        Assert.Contains("Property(e => e.BinaryValue).HasMaxLength(5)", generated);
        Assert.Contains("Property(e => e.VarbinaryValue).HasMaxLength(6)", generated);
    }

    [TestMethod]
    public void EmitsEscapedRecordsScheduleAnnotationInTheTableMappingChain()
    {
        var generated = Transform("""
            <sql><table name="Item" schema="sales">
              <row name="Id" null="0"><datatype>int</datatype></row>
              <comment>Table note</comment>
              <records-schedule> Keep "quoted" \ path&#13;&#10;O'Brien </records-schedule>
            </table></sql>
            """, GeneratedContextParameters());

        Assert.Contains("ToTable(\"Item\", \"sales\").HasComment(\"Table note\").HasAnnotation(\"RecordsSchedule\", \" Keep \\\"quoted\\\" \\\\ path\\r\\nO'Brien \")",
generated);
    }

    [TestMethod]
    public void XmlParsingRejectsDtdsAndRequiresModernBrowserApis()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var io = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "io.js"));

        Assert.Contains("DTD and entity declarations are not allowed.", io);
        Assert.Contains("if (!globalThis.DOMParser)", io);
        Assert.Contains("if (!globalThis.XSLTProcessor || !globalThis.DOMParser)", io);
        Assert.IsLessThan(io.IndexOf("SQL.IO.prototype.transformEf", StringComparison.Ordinal), io.IndexOf("SQL.IO.prototype.parseXml", StringComparison.Ordinal));
        Assert.IsFalse(io.Contains("ActiveXObject", StringComparison.Ordinal));
        Assert.IsFalse(io.Contains("Msxml2.DOMDocument", StringComparison.Ordinal));
    }

    [TestMethod]
    public void StylesheetLoadCompletesOnceAndClearsTheThrobberOnFailure()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var io = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "io.js"))
            .ReplaceLineEndings("\n");

        Assert.Contains("let completed = false;", io);
        Assert.Contains("const complete = (err, xslDoc) => {", io);
        Assert.Contains("this.owner.window.hideThrobber();\n            return;", io);
    }

    [TestMethod]
    public void ModelControlledNamesAreRenderedAsText()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var visual = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "visual.js"));
        var keyManager = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "keymanager.js"));

        Assert.Contains("this.dom.title.textContent = text;", visual);
        Assert.IsFalse(visual.Contains("this.dom.title.innerHTML = text;", StringComparison.Ordinal));
        Assert.Contains("this.dom.listlabel.textContent", keyManager);
        Assert.Contains("o.textContent = row.getTitle();", keyManager);
    }

    [TestMethod]
    public void ModelXmlDoesNotEmbedTheActiveUrl()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var designer = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "wwwsqldesigner.js"));

        Assert.IsFalse(designer.Contains("<!-- Active URL:", StringComparison.Ordinal));
        Assert.IsFalse(designer.Contains("location.href + \" -->", StringComparison.Ordinal));
    }

}

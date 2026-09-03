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

        StringAssert.Contains(generated, "using System;");
        StringAssert.Contains(generated, "public int Id { get; set; }");
        StringAssert.Contains(generated, "public Guid External_Id { get; set; }");
        StringAssert.Contains(generated, "public byte[]? Payload { get; set; }");
        StringAssert.Contains(generated, "public string? Description_field { get; set; }");
        StringAssert.Contains(generated, "public DbSet<parent_table> parent_tables");
        StringAssert.Contains(generated, "HasKey(e => new { e.Id })");
        StringAssert.Contains(generated, "HasOne<parent_table>().WithMany().HasForeignKey(e => e.Parent_Id)");
        StringAssert.Contains(generated, "HasPrincipalKey(p => p.External_Id)");
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

        StringAssert.Contains(generated, "namespace Example.Models");
        StringAssert.Contains(generated, "public class ExampleContext : DbContext");
        StringAssert.Contains(generated, "ExampleContext(DbContextOptions<ExampleContext> options)");
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

        StringAssert.Contains(generated, "namespace WwwSqlDesigner.Data");
        StringAssert.Contains(generated, "public class ApplicationDbContext : DbContext");
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

        StringAssert.Contains(generated, "public class _2024_Orders_");
        StringAssert.Contains(generated, "public class _2024_Orders__2");
        StringAssert.Contains(generated, "public Guid Event_Id { get; set; }");
        StringAssert.Contains(generated, "public int Line_Item_2 { get; set; }");
        StringAssert.Contains(generated, "HasKey(e => new { e.Line_Item_2 })");
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

        StringAssert.Contains(generated, "public class ExampleContext_2");
        StringAssert.Contains(generated, "public class ExampleContext : DbContext");
    }

    [TestMethod]
    public void EfExportMapsSchemasCommentsAndSameNamedRelationships()
    {
        var generated = Transform("""
            <sql><datatypes db="mssql"/>
              <table name="Item" schema="sales"><row name="Id" null="0"><datatype>int</datatype><comment>id "quoted" \ path { public class Fake { } }</comment></row><comment>表
            comment</comment></table>
              <table name="Item" schema="archive"><row name="Id" null="0"><datatype>int</datatype></row></table>
              <table name="Link" schema="dbo"><row name="ArchiveId" null="0"><datatype>int</datatype><relation table="Item" schema="archive" row="Id"/></row></table>
            </sql>
            """);

        StringAssert.Contains(generated, "public class Item_2");
        StringAssert.Contains(generated, "ToTable(\"Item\", \"sales\").HasComment(\"表\\r\\n");
        StringAssert.Contains(generated, "Property(e => e.Id).HasComment(\"id \\\"quoted\\\" \\\\ path { public class Fake { } }\")");
        StringAssert.Contains(generated, "HasOne<Item_2>()");
    }

    [TestMethod]
    public void EfExportEscapesDescriptionsAtTheSqlServerBoundary()
    {
        var description = string.Concat(Enumerable.Repeat("A\"\\\r\n\t", 625));
        Assert.AreEqual(3750, description.Length);

        var generated = Transform("<sql><table name=\"Item\" schema=\"dbo\"><row name=\"Id\" null=\"0\"><datatype>int</datatype></row><comment>"
            + SecurityElement.Escape(description) + "</comment></table></sql>");

        StringAssert.Contains(generated, "HasComment(\"");
        StringAssert.Contains(generated, "A\\\"\\\\\\r\\n\\t");
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
        StringAssert.Contains(generated, "\\u0085\\u2028\\u2029");
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
                    <TargetFramework>net8.0</TargetFramework>
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
            StringAssert.Contains(result.Output, "MS_Description");
            StringAssert.Contains(result.Output, "'SCHEMA', N'sales', 'TABLE', N'Order''s Table';");
            StringAssert.Contains(result.Output, "'SCHEMA', N'sales', 'TABLE', N'Order''s Table', 'COLUMN', N'ValueColumn';");
            StringAssert.Contains(result.Output, "N'表''s \"table\" \\ path'");
            StringAssert.Contains(result.Output, "N'列''s \"column\" \\ path'");
            StringAssert.Contains(result.Output, "NCHAR(13), NCHAR(10)");
            StringAssert.Contains(result.Output, "N'{ public class Fake { } }\u0085\u2028\u2029'");
            StringAssert.Contains(result.Output, "N'{ class AlsoFake { } }\u0085\u2028\u2029'");
            StringAssert.Contains(result.Output, "\u0085");
            StringAssert.Contains(result.Output, "\u2028");
            StringAssert.Contains(result.Output, "\u2029");
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

        StringAssert.Contains(options, "setCustomValidity");
        StringAssert.Contains(options, "return false;");
        StringAssert.Contains(options, "CONFIG.CSHARP_KEYWORDS.includes");
        StringAssert.Contains(window, "this.callback() !== false");
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

        StringAssert.Contains(generated, "Property(e => e.PublicId).HasAnnotation(\"DataClassification\", \"Public\")");
        StringAssert.Contains(generated, "Property(e => e.Secret).HasComment(\"Note\").HasAnnotation(\"DataClassification\", \"Protected B\")");
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

        StringAssert.Contains(generated,
            "ToTable(\"Item\", \"sales\").HasComment(\"Table note\").HasAnnotation(\"RecordsSchedule\", \" Keep \\\"quoted\\\" \\\\ path\\r\\nO'Brien \")");
    }

    [TestMethod]
    public void XmlParsingRejectsDtdsAndRequiresModernBrowserApis()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var io = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "io.js"));

        StringAssert.Contains(io, "DTD and entity declarations are not allowed.");
        StringAssert.Contains(io, "if (!window.DOMParser)");
        StringAssert.Contains(io, "if (!window.XSLTProcessor || !window.DOMParser)");
        Assert.IsTrue(io.IndexOf("SQL.IO.prototype.parseXml", StringComparison.Ordinal) < io.IndexOf("SQL.IO.prototype.transformEf", StringComparison.Ordinal));
        Assert.IsFalse(io.Contains("ActiveXObject", StringComparison.Ordinal));
        Assert.IsFalse(io.Contains("Msxml2.DOMDocument", StringComparison.Ordinal));
    }

    [TestMethod]
    public void StylesheetLoadCompletesOnceAndClearsTheThrobberOnFailure()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var io = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "io.js"));

        StringAssert.Contains(io, "let completed = false;");
        StringAssert.Contains(io, "const complete = (err, xslDoc) => {");
        StringAssert.Contains(io, "this.owner.window.hideThrobber();" + Environment.NewLine + "            return;");
    }

    [TestMethod]
    public void ModelControlledNamesAreRenderedAsText()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var visual = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "visual.js"));
        var keyManager = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "keymanager.js"));

        StringAssert.Contains(visual, "this.dom.title.textContent = text;");
        Assert.IsFalse(visual.Contains("this.dom.title.innerHTML = text;", StringComparison.Ordinal));
        StringAssert.Contains(keyManager, "this.dom.listlabel.textContent");
        StringAssert.Contains(keyManager, "o.textContent = row.getTitle();");
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

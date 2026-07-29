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
    public void EfZipExportAssetsAreIncludedAndConfiguredForClientSideDownload()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var jsZip = Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "jszip-3.10.1.min.js");
        var index = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "index.html"));
        var io = File.ReadAllText(Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "js", "io.js"));

        Assert.IsTrue(File.Exists(jsZip));
        StringAssert.Contains(File.ReadAllText(jsZip), "JSZip v3.10.1");
        StringAssert.Contains(index, "js/jszip-3.10.1.min.js");
        StringAssert.Contains(index, "id=\"clientefzip\"");
        StringAssert.Contains(io, "zip.generateAsync({ type: \"blob\", compression: \"DEFLATE\" })");
        StringAssert.Contains(io, "link.download = name");
        Assert.IsTrue(io.IndexOf("xhr.onerror", StringComparison.Ordinal) < io.IndexOf("xhr.send()", StringComparison.Ordinal));
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
        StringAssert.Contains(io, "this.owner.window.hideThrobber();\n            return;");
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

    [TestMethod]
    public void EfZipExportStringsAreAvailableInEverySupportedLocale()
    {
        var projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var localeDirectory = Path.Combine(projectRoot, "WwwSqlDesigner", "wwwroot", "locale");
        var requiredKeys = new[] { "clientefzip", "efzipexportempty", "efzipexporterror" };

        foreach (var localeFile in Directory.GetFiles(localeDirectory, "*.xml"))
        {
            var locale = new XmlDocument();
            locale.Load(localeFile);
            foreach (var key in requiredKeys)
            {
                Assert.IsNotNull(locale.SelectSingleNode($"/locale/string[@name='{key}']"));
            }
        }
    }
}

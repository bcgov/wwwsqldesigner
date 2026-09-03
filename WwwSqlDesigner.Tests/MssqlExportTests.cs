using System.Xml;
using System.Xml.Xsl;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace WwwSqlDesigner.Tests;

[TestClass]
public class MssqlExportTests
{
    private static string Transform(string xml)
    {
        var model = new XmlDocument();
        model.LoadXml(xml);
        var transform = new XslCompiledTransform();
        transform.Load(Path.Combine(AppContext.BaseDirectory, "TestData", "mssql-output.xsl"));
        using var output = new StringWriter();
        transform.Transform(model, null, output);
        return output.ToString();
    }

    [TestMethod]
    public void EmitsQualifiedEscapedDdlAndUnicodeDescriptions()
    {
        var model = new XmlDocument();
        model.LoadXml("""
            <sql><table name="Ord]er's" schema="Sal]es">
              <row name="I]d" null="0"><datatype>int</datatype><comment>O'Brien
            -- data</comment></row>
              <row name="Parent" null="1"><datatype>int</datatype><relation table="Ord]er's" schema="Archive" row="I]d"/></row>
              <key type="PRIMARY" name="PK]Orders"><part>I]d</part></key>
              <comment>表's description</comment>
            </table></sql>
            """);
        var transform = new XslCompiledTransform();
        transform.Load(Path.Combine(AppContext.BaseDirectory, "TestData", "mssql-output.xsl"));
        using var output = new StringWriter();
        transform.Transform(model, null, output);
        var sql = output.ToString();

        StringAssert.Contains(sql, "CREATE TABLE [Sal]]es].[Ord]]er's]");
        StringAssert.Contains(sql, "CONSTRAINT [PK]]Orders] PRIMARY KEY ([I]]d])");
        StringAssert.Contains(sql, "REFERENCES [Archive].[Ord]]er's] ([I]]d])");
        StringAssert.Contains(sql, "@value=N'表''s description'");
        StringAssert.Contains(sql, "@value=N'O''Brien");
        StringAssert.Contains(sql, "@level2name=N'I]d'");
        Assert.IsFalse(sql.Contains(" -- O'Brien", StringComparison.Ordinal));
    }

    [TestMethod]
    public void CreatesEscapedSchemasOnceBeforeTables()
    {
        var sql = Transform("""
            <sql>
              <table name="One" schema="Odd']Name"><row name="Id"><datatype>int</datatype></row></table>
              <table name="Two" schema="odd']name"><row name="Id"><datatype>int</datatype></row></table>
              <table name="Three" schema="dbo"><row name="Id"><datatype>int</datatype></row></table>
              <table name="Four" schema="a|b"><row name="Id"><datatype>int</datatype></row></table>
              <table name="Five" schema="b"><row name="Id"><datatype>int</datatype></row></table>
              <table name="Six" schema="A|B"><row name="Id"><datatype>int</datatype></row></table>
            </sql>
            """);

        const string schema = "IF SCHEMA_ID(N'Odd'']Name') IS NULL EXEC(N'CREATE SCHEMA [Odd'']]Name]');";
        Assert.AreEqual(1, sql.Split(schema).Length - 1);
        Assert.AreEqual(1, sql.Split("IF SCHEMA_ID(N'a|b') IS NULL").Length - 1);
        Assert.AreEqual(1, sql.Split("IF SCHEMA_ID(N'b') IS NULL").Length - 1);
        Assert.IsTrue(sql.IndexOf(schema, StringComparison.Ordinal) <
            sql.IndexOf("CREATE TABLE", StringComparison.Ordinal));
    }

    [TestMethod]
    public void PreservesInternalSchemaWhitespaceWhenCreatingAndDeduplicating()
    {
        var sql = Transform("""
            <sql>
              <table name="One" schema="Sales  Region"><row name="Id"><datatype>int</datatype></row></table>
              <table name="Two" schema="sales  region"><row name="Id"><datatype>int</datatype></row></table>
              <table name="Three" schema="Sales Region"><row name="Id"><datatype>int</datatype></row></table>
            </sql>
            """);

        Assert.AreEqual(1, sql.Split("IF SCHEMA_ID(N'Sales  Region') IS NULL").Length - 1);
        Assert.AreEqual(1, sql.Split("IF SCHEMA_ID(N'Sales Region') IS NULL").Length - 1);
        StringAssert.Contains(sql, "CREATE TABLE [Sales  Region].[One]");
        StringAssert.Contains(sql, "CREATE TABLE [sales  region].[Two]");
    }

    [TestMethod]
    public void EmitsValidUniqueAndOmitsFulltextWithoutDanglingCommas()
    {
        var sql = Transform("""
            <sql><table name="Keys" schema="dbo">
              <row name="Id"><datatype>int</datatype></row>
              <key type="FULLTEXT" name="Search"><part>Id</part></key>
              <key type="UNIQUE" name="UQ"><part>Id</part></key>
            </table><table name="OnlyFulltext" schema="dbo">
              <row name="Text"><datatype>nvarchar(max)</datatype></row>
              <key type="FULLTEXT" name="Search2"><part>Text</part></key>
            </table></sql>
            """);

        StringAssert.Contains(sql, "CONSTRAINT [UQ] UNIQUE ([Id])");
        Assert.IsFalse(sql.Contains("UNIQUE KEY", StringComparison.Ordinal));
        Assert.IsFalse(sql.Contains("FULLTEXT", StringComparison.Ordinal));
        Assert.IsFalse(sql.Contains("[Text] nvarchar(max) ,", StringComparison.Ordinal));
    }

    [TestMethod]
    public void EmitsSeparateEscapedColumnDataClassification()
    {
        var sql = Transform("""
            <sql><table name="People's" schema="Sec]ure">
              <row name="Birth]Date" null="1"><datatype>date</datatype>
                <comment>Sensitive date</comment><classification>Protected C</classification>
              </row>
            </table></sql>
            """);

        StringAssert.Contains(sql, "@name=N'MS_Description', @value=N'Sensitive date'");
        StringAssert.Contains(sql, "@name=N'DataClassification', @value=N'Protected C'");
        StringAssert.Contains(sql, "@level0name=N'Sec]ure'");
        StringAssert.Contains(sql, "@level1name=N'People''s'");
        StringAssert.Contains(sql, "@level2name=N'Birth]Date'");
    }

    [TestMethod]
    public void EmitsEscapedTableRecordsSchedule()
    {
        var sql = Transform("""
            <sql><table name="People's" schema="Sec]ure">
              <row name="Id" null="0"><datatype>int</datatype></row>
              <records-schedule> Retain O'Brien&#13;&#10;表 </records-schedule>
            </table></sql>
            """);

        StringAssert.Contains(sql, "@name=N'RecordsSchedule', @value=N' Retain O''Brien\r\n表 '");
        StringAssert.Contains(sql, "@level0type=N'SCHEMA', @level0name=N'Sec]ure'");
        StringAssert.Contains(sql, "@level1type=N'TABLE', @level1name=N'People''s'");
        Assert.AreEqual(1, sql.Split("@name=N'RecordsSchedule'").Length - 1);
        Assert.IsFalse(sql.Contains("@level2type", StringComparison.Ordinal));
    }
}

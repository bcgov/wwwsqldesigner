using System.Xml;
using System.Xml.Xsl;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace WwwSqlDesigner.Tests;

[TestClass]
public class MssqlExportTests
{
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
}

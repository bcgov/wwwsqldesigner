using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Text;

namespace WwwSqlDesigner.Controllers.Tests
{
    [TestClass()]
    public class WwwSqlControllerTests : TestBase
    {
        #region Initialization
        private readonly WwwSqlController _controller;

        public WwwSqlControllerTests() : base()
        {
            _controller = InitializeController();
        }

        private WwwSqlController InitializeController()
        {
            var logger = InitializeLogger<WwwSqlController>();
            return new WwwSqlController(logger, _dbContext);
        }
        #endregion

        #region Init Test Data
        private const string FooBarModelXml = "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\r\n<sql>\r\n<datatypes db=\"mssql\">\r\n\t<group label=\"Integer\" color=\"rgb(238,238,170)\">\r\n\t\t<type label=\"TinyInt\" length=\"0\" sql=\"tinyint\" re=\"INT\" quote=\"\" bytes=\"1\" note=\"Integer data: 0 to 255\"/>\r\n\t\t<type label=\"SmallInt\" length=\"0\" sql=\"smallint\" re=\"INT\" quote=\"\" bytes=\"2\" note=\"Integer data: -32,768 to 32,767\"/>\r\n\t\t<type label=\"Int\" length=\"0\" sql=\"int\" re=\"INT\" quote=\"\" bytes=\"4\" note=\"Integer data: -2,147,483,648 to 2,147,483,647\"/>\r\n\t\t<type label=\"BigInt\" length=\"0\" sql=\"bigint\" re=\"INT\" quote=\"\" bytes=\"8\" note=\"Integer data: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Monetary\" color=\"rgb(238,238,170)\">\r\n\t\t<type label=\"Money\" length=\"0\" sql=\"money\" re=\"FLOAT\" quote=\"\" bytes=\"8\" note=\"Integer data: -922,337,203,685,477.5808 to 922,337,203,685,477.5807\"/>\r\n\t\t<type label=\"SmallMoney\" length=\"0\" sql=\"smallmoney\" re=\"FLOAT\" quote=\"\" bytes=\"4\" note=\"-214,748.3648 to 214,748.3647\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Numeric\" color=\"rgb(238,238,170)\">\r\n\t\t<type label=\"Real\" length=\"0\" sql=\"real\" re=\"FLOAT\" quote=\"\" bytes=\"4\" note=\"Floating precision number data: -3.402823E+38 to 3.402823E+38\"/>\r\n\t\t<type label=\"Float\" length=\"0\" sql=\"float\" re=\"FLOAT\" quote=\"\" bytes=\"8\" note=\"Floating precision number data: -4.94E+324 to 4.94E+324\"/>\r\n\t\t<type label=\"Decimal\" length=\"1\" sql=\"decimal\" re=\"DEC\" quote=\"\" bytes=\"n*\" note=\"Fixed precision and scale numeric data: -10^38 +1 to 10^38 -1 (decimal and numeric are synonyms)\"/>\r\n\t\t<type label=\"Numeric\" length=\"1\" sql=\"numeric\" re=\"DEC\" quote=\"\" bytes=\"n*\" note=\"Fixed precision and scale numeric data: -10^38 +1 to 10^38 -1 (decimal and numeric are synonyms)\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Character\" color=\"rgb(255,200,200)\">\r\n\t\t<type label=\"Char\" length=\"0\" sql=\"char\" quote=\"'\" bytes=\"n\" note=\"Fixed-length character data with a maximum length of 8,000 characters\"/>\r\n\t\t<type label=\"Varchar\" length=\"1\" sql=\"varchar\" quote=\"'\" bytes=\"m &lt;= n\" note=\"Variable-length data with a maximum of 8,000 characters\"/>\r\n\t\t<type label=\"Text\" length=\"1\" sql=\"text\" quote=\"'\" bytes=\"&lt;= 2,147,483,647\" note=\"Variable-length data with a maximum length of 2,147,483,647 characters\"/>\r\n\t\t<type label=\"XML\" length=\"0\" sql=\"xml\" quote=\"'\" bytes=\"n\" note=\"XML\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Unicode Character\" color=\"rgb(255,200,200)\">\r\n\t\t<type label=\"nChar\" length=\"0\" sql=\"nchar\" quote=\"'\" bytes=\"n\" note=\"Fixed-length Unicode data with a maximum length of 4,000 characters\"/>\r\n\t\t<type label=\"nVarchar\" length=\"1\" sql=\"nvarchar\" quote=\"'\" bytes=\"m &lt;= n\" note=\"Variable-length Unicode data with a maximum length of 4,000 characters\"/>\r\n\t\t<type label=\"nText\" length=\"1\" sql=\"ntext\" quote=\"'\" bytes=\"&lt;= 2,147,483,647\" note=\"Variable-length Unicode data with a maximum length of 1,073,741,823 characters\"/>\r\n\t</group>\r\n\r\n\r\n\t<group label=\"Date &amp; Time\" color=\"rgb(200,255,200)\">\r\n\t\t<type label=\"Datetime\" length=\"0\" sql=\"datetime2\" quote=\"\" bytes=\"8\" note=\"Jan 1, 1753 to Dec 31, 9999\"/>\r\n\t\t<type label=\"SmallDateTime\" length=\"0\" sql=\"smalldatetime\" quote=\"\" bytes=\"4\" note=\"Jan 1, 1900 to Dec 31, 2079\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Binary\" color=\"rgb(200,200,255)\">\r\n\t\t<type label=\"Binary\" length=\"0\" sql=\"binary\" quote=\"'\" bytes=\"n\" note=\"Fixed-length binary data with a maximum length of 8,000 bytes\"/>\r\n\t\t<type label=\"Varbinary\" length=\"1\" sql=\"varbinary\" quote=\"'\" bytes=\"m &lt;= n\" note=\"Variable-length binary data with a maximum length of 8,000 bytes\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Miscellaneous\" color=\"rgb(200,220,255)\">\r\n\t\t<type label=\"Bit\" length=\"0\" sql=\"bit\" quote=\"\" bytes=\"1\" note=\"Boolean: 1 or 0\"/>\r\n\t\t<type label=\"Image\" length=\"1\" sql=\"image\" re=\"BLOB\" quote=\"\" bytes=\"0 to 2,147,483,647\" note=\"Variable-length binary data with a maximum length of 2,147,483,647 bytes\"/>\r\n\t\t<type label=\"Timestamp\" length=\"0\" sql=\"timestamp\" quote=\"\" bytes=\"8\" note=\"Locally unique binary number updated as a row gets updated\"/>\r\n\t\t<type label=\"SQL Variant\" length=\"1\" sql=\"sql_variant\" quote=\"\" bytes=\"\" note=\"Stores any datatype except text, ntext, image, timestamp\"/>\r\n\t\t<type label=\"Uniqueidentifier\" length=\"1\" sql=\"uniqueidentifier\" quote=\"\" bytes=\"16\" note=\"GUID\"/>\r\n\t</group>\r\n</datatypes><table x=\"489\" y=\"245\" name=\"Foo\">\r\n<row name=\"id\" null=\"1\" autoincrement=\"1\">\r\n<datatype>tinyint</datatype>\r\n<default>NULL</default></row>\r\n<key type=\"PRIMARY\" name=\"\">\r\n<part>id</part>\r\n</key>\r\n</table>\r\n<table x=\"1007\" y=\"249\" name=\"Bar\">\r\n<row name=\"id\" null=\"1\" autoincrement=\"1\">\r\n<datatype>tinyint</datatype>\r\n<default>NULL</default></row>\r\n<row name=\"id_Foo\" null=\"1\" autoincrement=\"0\">\r\n<datatype>tinyint</datatype>\r\n<default>NULL</default><relation table=\"Foo\" row=\"id\" />\r\n</row>\r\n<key type=\"PRIMARY\" name=\"\">\r\n<part>id</part>\r\n</key>\r\n</table>\r\n</sql>\r\n";

        [TestInitialize]
        public void SeedData()
        {
            _dbContext.DataModels.Add(new Data.DataModel()
            {
                CreatedAt = new DateTime(2023, 02, 12, 12, 23, 34),
                Keyword = "Test1",
                Data = FooBarModelXml,
            });
            _dbContext.DataModels.Add(new Data.DataModel()
            {
                CreatedAt = new DateTime(2023, 05, 15, 12, 23, 34),
                Keyword = "Test2",
                Data = FooBarModelXml,
            });
            _dbContext.SaveChanges();
        }
        #endregion

        #region Tests
        [TestMethod()]
        public async Task ListTest()
        {
            var result = await _controller.List().ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            string? content = ((ContentResult)result).Content;
            Assert.IsNotNull(content);
            StringAssert.Contains(content, "Test1");
            StringAssert.Contains(content, "Test2");
        }
        #endregion

        [TestMethod()]
        public async Task LoadTestNoKeyword()
        {
            var result = await _controller.Load(null).ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }

        [TestMethod()]
        public async Task LoadTest()
        {
            var result = await _controller.Load("Test1").ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            string? content = ((ContentResult)result).Content;
            Assert.IsNotNull(content);
            Assert.AreEqual(content, FooBarModelXml);
        }

        [TestMethod()]
        public async Task SaveTestNew()
        {
            var httpContext = new DefaultHttpContext();
            using MemoryStream stream = new(Encoding.UTF8.GetBytes(FooBarModelXml));
            httpContext.Request.Body = stream;
            httpContext.Request.ContentLength = stream.Length;
            _controller.ControllerContext = new ControllerContext()
            {
                HttpContext = httpContext
            };
            var result = await _controller.Save("Test3").ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            var dbContent = _dbContext.DataModels.FirstOrDefault(x => x.Keyword == "Test3");
            Assert.IsNotNull(dbContent);
        }

        [TestMethod()]
        public async Task SaveTestUpdate()
        {
            DateTime oldDate = _dbContext.DataModels.First(x => x.Keyword == "Test1").CreatedAt;
            var httpContext = new DefaultHttpContext();
            using MemoryStream stream = new(Encoding.UTF8.GetBytes(FooBarModelXml));
            httpContext.Request.Body = stream;
            httpContext.Request.ContentLength = stream.Length;
            _controller.ControllerContext = new ControllerContext()
            {
                HttpContext = httpContext
            };
            var result = await _controller.Save("Test1").ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            var dbContent = _dbContext.DataModels.FirstOrDefault(x => x.Keyword == "Test1");
            Assert.IsNotNull(dbContent);
            Assert.AreNotEqual(oldDate, dbContent.CreatedAt);
        }
    }
}
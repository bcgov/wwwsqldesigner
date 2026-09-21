using System.Reflection;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using WwwSqlDesigner.Migrations;

namespace WwwSqlDesigner.Tests;

[TestClass]
public sealed class MigrationChainTests
{
    [TestMethod]
    public void ModelVersionIdempotencyOperationsAreAppliedExactlyOnce()
    {
        var first = RunUp(typeof(AddSqlDesignerApproved));
        var compatibility = RunUp(typeof(AddModelVersionIdempotencyKey));

        var modelVersions = Assert.ContainsSingle(
            first.OfType<CreateTableOperation>().Where(x => x.Name == "ModelVersions"));
        _ = Assert.ContainsSingle(modelVersions.Columns.Where(x => x.Name == "IdempotencyKey"));
        var index = Assert.ContainsSingle(first.OfType<CreateIndexOperation>()
            .Where(x => x.Name == "IX_ModelVersions_VariantId_IdempotencyKey"));
        Assert.IsTrue(index.IsUnique);
        Assert.AreEqual("[IdempotencyKey] IS NOT NULL AND [IdempotencyKey] <> ''", index.Filter);
        Assert.IsEmpty(compatibility);
    }

    private static List<MigrationOperation> RunUp(Type migrationType)
    {
        var migration = (Migration)Activator.CreateInstance(migrationType)!;
        var builder = new MigrationBuilder("Microsoft.EntityFrameworkCore.SqlServer");
        migrationType.GetMethod("Up", BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(migration, [builder]);
        return builder.Operations.ToList();
    }
}

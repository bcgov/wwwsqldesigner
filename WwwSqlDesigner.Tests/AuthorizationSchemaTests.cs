using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Security.Claims;
using WwwSqlDesigner.Authentication;
using WwwSqlDesigner.Controllers;
using WwwSqlDesigner.Data;

namespace WwwSqlDesigner.Tests
{
    [TestClass]
    public class AuthorizationSchemaTests
    {
        private const string AuthorizationIdentityCollation = "Latin1_General_100_BIN2";
        private const string PreviousMigration = "20260821165042_AddOwnerScopedModelAccess";
        private const string CurrentMigration = "20260904011733_HardenAuthorizationIdentitySchema";

        [TestMethod]
        public void ModelSnapshotMatchesCurrentModel()
        {
            using var context = CreateContext();
            var migrationsAssembly = context.GetService<IMigrationsAssembly>();
            var modelDiffer = context.GetService<IMigrationsModelDiffer>();
            var snapshot = context.GetService<IModelRuntimeInitializer>()
                .Initialize(migrationsAssembly.ModelSnapshot!.Model, designTime: true)
                .GetRelationalModel();
            var current = context.GetService<IDesignTimeModel>().Model.GetRelationalModel();
            var differences = modelDiffer.GetDifferences(snapshot, current);

            Assert.AreEqual(
                0,
                differences.Count,
                string.Join(", ", differences.Select(operation => operation switch
                {
                    CreateIndexOperation index =>
                        $"CreateIndex {index.Name} ({string.Join(", ", index.Columns)}) filter={index.Filter ?? "<null>"}",
                    DropIndexOperation index => $"DropIndex {index.Name}",
                    _ => operation.GetType().Name
                })));
        }

        [TestMethod]
        public void SqlServerModelUsesExactIdentityLengthsAndNarrowClusteredKeys()
        {
            using var context = CreateContext();
            var model = context.GetService<IDesignTimeModel>().Model;

            var dataModel = model.FindEntityType(typeof(DataModel))!;
            Assert.AreEqual(
                AuthorizationIdentityCollation,
                dataModel.FindProperty(nameof(DataModel.OwnerId))!.GetCollation());
            Assert.IsTrue(dataModel.FindProperty(nameof(DataModel.OwnerId))!.IsNullable);
            CollectionAssert.AreEqual(
                new[] { nameof(DataModel.Id) },
                dataModel.FindPrimaryKey()!.Properties.Select(property => property.Name).ToArray());
            Assert.AreEqual(
                "DATALENGTH([OwnerId])",
                dataModel.FindProperty("OwnerIdByteLength")!.GetComputedColumnSql());

            var dataModelIdentityIndex = dataModel.GetIndexes().Single(index =>
                index.Properties.Select(property => property.Name).SequenceEqual(
                    new[]
                    {
                        nameof(DataModel.OwnerId),
                        nameof(DataModel.Keyword),
                        nameof(DataModel.Version),
                        "OwnerIdByteLength"
                    }));
            Assert.IsTrue(dataModelIdentityIndex.IsUnique);
            Assert.IsNull(dataModelIdentityIndex.GetFilter());

            var grant = model.FindEntityType(typeof(DataModelAccessGrant))!;
            Assert.AreEqual(
                AuthorizationIdentityCollation,
                grant.FindProperty(nameof(DataModelAccessGrant.OwnerId))!.GetCollation());
            Assert.AreEqual(
                AuthorizationIdentityCollation,
                grant.FindProperty(nameof(DataModelAccessGrant.TargetId))!.GetCollation());
            Assert.AreEqual(
                "DATALENGTH([OwnerId])",
                grant.FindProperty("OwnerIdByteLength")!.GetComputedColumnSql());
            Assert.AreEqual(
                "DATALENGTH([TargetId])",
                grant.FindProperty("TargetIdByteLength")!.GetComputedColumnSql());
            CollectionAssert.AreEqual(
                new[] { nameof(DataModelAccessGrant.Id) },
                grant.FindPrimaryKey()!.Properties.Select(property => property.Name).ToArray());

            var grantIdentityIndex = grant.GetIndexes().Single(index =>
                index.Properties.Select(property => property.Name).SequenceEqual(
                    new[]
                    {
                        nameof(DataModelAccessGrant.OwnerId),
                        nameof(DataModelAccessGrant.Keyword),
                        nameof(DataModelAccessGrant.TargetType),
                        nameof(DataModelAccessGrant.TargetId),
                        "OwnerIdByteLength",
                        "TargetIdByteLength"
                    }));
            Assert.IsTrue(grantIdentityIndex.IsUnique);
            var declaredKeyBytes = grantIdentityIndex.Properties.Sum(
                property => property.ClrType == typeof(int) || property.ClrType == typeof(int?)
                    ? sizeof(int)
                    : property.GetMaxLength()!.Value * sizeof(char));
            Assert.AreEqual(1124, declaredKeyBytes);
            Assert.IsTrue(declaredKeyBytes <= 1700);

            Assert.IsTrue(grant.GetIndexes().Any(index =>
                index.Properties.Select(property => property.Name).SequenceEqual(
                    new[]
                    {
                        nameof(DataModelAccessGrant.TargetType),
                        nameof(DataModelAccessGrant.TargetId),
                        nameof(DataModelAccessGrant.Permission),
                        "TargetIdByteLength"
                    })));
        }

        [TestMethod]
        public void AuthorizationMigrationGeneratesSupportedSqlServerKeysAndCollations()
        {
            using var context = CreateContext();
            var sql = context.GetService<IMigrator>().GenerateScript(PreviousMigration, CurrentMigration);

            StringAssert.Contains(
                sql,
                "ALTER TABLE [DataModels] ALTER COLUMN [OwnerId] nvarchar(256) COLLATE Latin1_General_100_BIN2 NULL;");
            StringAssert.Contains(
                sql,
                "ALTER TABLE [DataModelAccessGrants] ALTER COLUMN [OwnerId] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL;");
            StringAssert.Contains(
                sql,
                "ALTER TABLE [DataModelAccessGrants] ALTER COLUMN [TargetId] nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL;");
            StringAssert.Contains(
                sql,
                "ALTER TABLE [DataModelAccessGrants] ADD CONSTRAINT [PK_DataModelAccessGrants] PRIMARY KEY CLUSTERED ([Id]);");
            StringAssert.Contains(
                sql,
                "ALTER TABLE [DataModels] ADD [OwnerIdByteLength] AS DATALENGTH([OwnerId]) PERSISTED;");
            StringAssert.Contains(
                sql,
                "ALTER TABLE [DataModelAccessGrants] ADD [TargetIdByteLength] AS DATALENGTH([TargetId]) PERSISTED;");
            StringAssert.Contains(
                sql,
                "CREATE UNIQUE NONCLUSTERED INDEX [IX_DataModelAccessGrants_OwnerId_Keyword_TargetType_TargetId_OwnerIdByteLength_TargetIdByteLength] ON [DataModelAccessGrants] ([OwnerId], [Keyword], [TargetType], [TargetId], [OwnerIdByteLength], [TargetIdByteLength])");
            StringAssert.Contains(
                sql,
                "CREATE UNIQUE NONCLUSTERED INDEX [IX_DataModels_OwnerId_Keyword_Version_OwnerIdByteLength] ON [DataModels] ([OwnerId], [Keyword], [Version], [OwnerIdByteLength])");
            StringAssert.Contains(sql, "DELETE [grant]");
            StringAssert.Contains(
                sql,
                "WHERE [grant].[OwnerId] COLLATE Latin1_General_100_BIN2 = N'unowned'");
            StringAssert.Contains(sql, "DATALENGTH([grant].[OwnerId]) = DATALENGTH(N'unowned')");
            Assert.IsFalse(sql.Contains("[model].[Keyword] = [grant].[Keyword]", StringComparison.Ordinal));
            StringAssert.Contains(sql, "SET [OwnerId] = NULL");
            StringAssert.Contains(
                sql,
                "WHERE [OwnerId] COLLATE Latin1_General_100_BIN2 = N'unowned'");
            StringAssert.Contains(sql, "AND DATALENGTH([OwnerId]) = DATALENGTH(N'unowned')");

            var droppedLookupIndex = sql.IndexOf(
                "DROP INDEX [IX_DataModelAccessGrants_TargetType_TargetId_Permission]",
                StringComparison.Ordinal);
            var alteredTargetId = sql.IndexOf(
                "ALTER TABLE [DataModelAccessGrants] ALTER COLUMN [TargetId]",
                StringComparison.Ordinal);
            var recreatedLookupIndex = sql.IndexOf(
                "CREATE INDEX [IX_DataModelAccessGrants_TargetType_TargetId_Permission_TargetIdByteLength] ON [DataModelAccessGrants] ([TargetType], [TargetId], [Permission], [TargetIdByteLength])",
                StringComparison.Ordinal);
            Assert.IsTrue(droppedLookupIndex >= 0 && droppedLookupIndex < alteredTargetId);
            Assert.IsTrue(alteredTargetId < recreatedLookupIndex);

            var deletedLegacyGrant = sql.IndexOf("DELETE [grant]", StringComparison.Ordinal);
            var globalizedLegacyModel = sql.IndexOf("UPDATE [DataModels]", StringComparison.Ordinal);
            Assert.IsTrue(deletedLegacyGrant >= 0 && deletedLegacyGrant < globalizedLegacyModel);

            var downSql = context.GetService<IMigrator>().GenerateScript(CurrentMigration, PreviousMigration);
            StringAssert.Contains(
                downSql,
                "an owner identifier equivalent to the unowned sentinel cannot be represented in the previous schema");
            StringAssert.Contains(
                downSql,
                "model identities collide under the previous comparison semantics");
            StringAssert.Contains(
                downSql,
                "grant identities collide under the previous comparison semantics");
            StringAssert.Contains(
                downSql,
                "a grant identity exceeds the previous 900-byte clustered key limit");
            var widthGuard = downSql.IndexOf(
                "a grant identity exceeds the previous 900-byte clustered key limit",
                StringComparison.Ordinal);
            var firstDestructiveStatement = downSql.IndexOf("DROP CONSTRAINT", StringComparison.Ordinal);
            Assert.IsTrue(widthGuard >= 0 && widthGuard < firstDestructiveStatement);
        }

        [TestMethod]
        public async Task MigrationGlobalizesOnlyExactLegacySentinelAndRemovesAllExactLegacyGrants()
        {
            await RunWithLocalDbAsync(nameof(MigrationGlobalizesOnlyExactLegacySentinelAndRemovesAllExactLegacyGrants), async context =>
            {
                var migrator = context.GetService<IMigrator>();
                await migrator.MigrateAsync(PreviousMigration);
                await context.Database.ExecuteSqlRawAsync(
                    """
                    INSERT INTO [DataModels] ([OwnerId], [Keyword], [Version], [Data])
                    VALUES
                        (N'unowned', N'Global', 0, N'<sql />'),
                        (N'Unowned', N'Uppercase', 0, N'<sql />'),
                        (N'unowned ', N'Trailing', 0, N'<sql />'),
                        (N' unowned', N'Leading', 0, N'<sql />');

                    INSERT INTO [DataModelAccessGrants] ([OwnerId], [Keyword], [TargetType], [TargetId], [Permission])
                    VALUES
                        (N'unowned', N'Global', N'User', N'alice', N'View'),
                        (N'unowned', N'Orphan', N'User', N'alice', N'View'),
                        (N'Unowned', N'Uppercase', N'User', N'alice', N'View'),
                        (N'unowned ', N'Trailing', N'User', N'alice', N'View'),
                        (N' unowned', N'Leading', N'User', N'alice', N'View');
                    """);

                await migrator.MigrateAsync(CurrentMigration);
                var models = await context.DataModels.AsNoTracking().ToListAsync();
                Assert.IsNull(models.Single(model => model.Keyword == "Global").OwnerId);
                Assert.AreEqual("Unowned", models.Single(model => model.Keyword == "Uppercase").OwnerId);
                Assert.AreEqual("unowned ", models.Single(model => model.Keyword == "Trailing").OwnerId);
                Assert.AreEqual(" unowned", models.Single(model => model.Keyword == "Leading").OwnerId);

                var grants = await context.DataModelAccessGrants.AsNoTracking().ToListAsync();
                Assert.IsFalse(grants.Any(grant => grant.Keyword == "Global"));
                Assert.IsFalse(grants.Any(grant => grant.Keyword == "Orphan"));
                Assert.AreEqual("Unowned", grants.Single(grant => grant.Keyword == "Uppercase").OwnerId);
                Assert.AreEqual("unowned ", grants.Single(grant => grant.Keyword == "Trailing").OwnerId);
                Assert.AreEqual(" unowned", grants.Single(grant => grant.Keyword == "Leading").OwnerId);

                await context.Database.ExecuteSqlRawAsync(
                    """
                    DELETE FROM [DataModelAccessGrants] WHERE [Keyword] IN (N'Trailing', N'Uppercase');
                    DELETE FROM [DataModels] WHERE [Keyword] IN (N'Trailing', N'Uppercase');
                    """);
                await migrator.MigrateAsync(PreviousMigration);
                var restoredGlobalCount = await context.Database.SqlQueryRaw<int>(
                    """
                    SELECT COUNT(*) AS [Value]
                    FROM [DataModels]
                    WHERE [Keyword] = N'Global'
                        AND [OwnerId] = N'unowned'
                        AND DATALENGTH([OwnerId]) = DATALENGTH(N'unowned')
                    """).SingleAsync();
                var removedGrantCount = await context.Database.SqlQueryRaw<int>(
                    """
                    SELECT COUNT(*) AS [Value]
                    FROM [DataModelAccessGrants]
                    WHERE [Keyword] = N'Global'
                    """).SingleAsync();
                Assert.AreEqual(1, restoredGlobalCount);
                Assert.AreEqual(0, removedGrantCount);
            });
        }

        [TestMethod]
        public async Task RelationalAuthorizationComparesOwnerUserAndGroupIdsExactly()
        {
            await RunWithLocalDbAsync(nameof(RelationalAuthorizationComparesOwnerUserAndGroupIdsExactly), async context =>
            {
                await context.Database.MigrateAsync();
                var now = DateTime.UtcNow;
                context.DataModels.AddRange(
                    Model("alice", "OwnedExact", "owned-exact", now),
                    Model("alice ", "OwnedTrailing", "owned-trailing", now),
                    Model(" alice", "OwnedLeading", "owned-leading", now),
                    Model("bob", "UserExact", "user-exact", now),
                    Model("bob", "UserTrailing", "user-trailing", now),
                    Model("bob", "UserLeading", "user-leading", now),
                    Model("bob", "GroupExact", "group-exact", now),
                    Model("bob", "GroupTrailing", "group-trailing", now),
                    Model("bob", "GroupLeading", "group-leading", now),
                    Model("bob", "Duplicate", "owner-exact", now.AddMinutes(1)),
                    Model("bob ", "Duplicate", "owner-trailing", now),
                    Model("bob ", "MismatchedGrantOwner", "mismatched-owner", now),
                    Model("grant-owner", "SubmittedTarget", "submitted-target", now));
                context.DataModelAccessGrants.AddRange(
                    Grant("bob", "UserExact", "User", "alice"),
                    Grant("bob", "UserTrailing", "User", "alice "),
                    Grant("bob", "UserLeading", "User", " alice"),
                    Grant("bob", "GroupExact", "Group", "team"),
                    Grant("bob", "GroupTrailing", "Group", "team "),
                    Grant("bob", "GroupLeading", "Group", " team"),
                    Grant("bob", "Duplicate", "User", "alice"),
                    Grant("bob ", "Duplicate", "User", "alice"),
                    Grant("bob", "MismatchedGrantOwner", "User", "alice"));
                await context.SaveChangesAsync();

                var controller = CreateController(context, "alice", "team");
                var response = (ModelListResponse)((JsonResult)await controller.List()).Value!;
                var visible = response.Models.Select(model => model.Keyword).ToArray();
                CollectionAssert.Contains(visible, "OwnedExact");
                CollectionAssert.Contains(visible, "UserExact");
                CollectionAssert.Contains(visible, "GroupExact");
                CollectionAssert.Contains(visible, "Duplicate");
                CollectionAssert.DoesNotContain(visible, "OwnedTrailing");
                CollectionAssert.DoesNotContain(visible, "OwnedLeading");
                CollectionAssert.DoesNotContain(visible, "UserTrailing");
                CollectionAssert.DoesNotContain(visible, "UserLeading");
                CollectionAssert.DoesNotContain(visible, "GroupTrailing");
                CollectionAssert.DoesNotContain(visible, "GroupLeading");
                CollectionAssert.DoesNotContain(visible, "MismatchedGrantOwner");

                var trailingVisible = ((ModelListResponse)((JsonResult)
                    await CreateController(context, "alice ").List()).Value!).Models;
                CollectionAssert.Contains(trailingVisible.Select(model => model.Keyword).ToArray(), "OwnedTrailing");
                CollectionAssert.Contains(trailingVisible.Select(model => model.Keyword).ToArray(), "UserTrailing");
                CollectionAssert.DoesNotContain(trailingVisible.Select(model => model.Keyword).ToArray(), "OwnedExact");
                var leadingVisible = ((ModelListResponse)((JsonResult)
                    await CreateController(context, " alice").List()).Value!).Models;
                CollectionAssert.Contains(leadingVisible.Select(model => model.Keyword).ToArray(), "OwnedLeading");
                CollectionAssert.Contains(leadingVisible.Select(model => model.Keyword).ToArray(), "UserLeading");
                CollectionAssert.DoesNotContain(leadingVisible.Select(model => model.Keyword).ToArray(), "OwnedExact");

                var selected = await controller.Load("Duplicate", null, "bob ");
                Assert.IsInstanceOfType<ContentResult>(selected);
                Assert.AreEqual("owner-trailing", ((ContentResult)selected).Content);

                var grantOwner = CreateController(context, "grant-owner");
                Assert.IsInstanceOfType<NoContentResult>(
                    await grantOwner.GrantAccess(
                        "SubmittedTarget",
                        new AccessGrantRequest("User", " alice ", "View")));
                Assert.AreEqual(
                    " alice ",
                    (await context.DataModelAccessGrants.AsNoTracking()
                        .SingleAsync(grant => grant.Keyword == "SubmittedTarget")).TargetId);
                Assert.IsInstanceOfType<BadRequestObjectResult>(
                    await grantOwner.GrantAccess(
                        "SubmittedTarget",
                        new AccessGrantRequest("User", "   ", "View")));
                var exactSubmittedTarget = ((ModelListResponse)((JsonResult)
                    await CreateController(context, " alice ").List()).Value!).Models;
                var trimmedSubmittedTarget = ((ModelListResponse)((JsonResult)
                    await CreateController(context, "alice").List()).Value!).Models;
                Assert.IsTrue(exactSubmittedTarget.Any(model => model.Keyword == "SubmittedTarget"));
                Assert.IsFalse(trimmedSubmittedTarget.Any(model => model.Keyword == "SubmittedTarget"));
            });
        }

        [TestMethod]
        public async Task RelationalIdentityIndexesAllowWhitespaceVariantsAndEnforceExactDuplicatesAndLengths()
        {
            await RunWithLocalDbAsync(
                nameof(RelationalIdentityIndexesAllowWhitespaceVariantsAndEnforceExactDuplicatesAndLengths),
                async context =>
                {
                    await context.Database.MigrateAsync();
                    var maxOwnerId = new string('o', 256);
                    var maxTargetId = new string('t', 256);
                    context.DataModels.AddRange(
                        Model("alice", "Same", "exact"),
                        Model("alice ", "Same", "trailing"),
                        Model(" alice", "Same", "leading"),
                        Model(maxOwnerId, "MaxOwned", "max-owner"),
                        Model("grant-owner", "MaxShared", "max-shared"));
                    context.DataModelAccessGrants.AddRange(
                        Grant("grant-owner", "Same", "User", "alice"),
                        Grant("grant-owner", "Same", "User", "alice "),
                        Grant("grant-owner", "Same", "User", " alice"),
                        Grant("grant-owner ", "Same", "User", "alice"));
                    await context.SaveChangesAsync();

                    var owner = CreateController(context, "grant-owner");
                    Assert.IsInstanceOfType<NoContentResult>(
                        await owner.GrantAccess(
                            "MaxShared",
                            new AccessGrantRequest("User", maxTargetId, "View")));
                    Assert.AreEqual(
                        maxTargetId,
                        (await context.DataModelAccessGrants.AsNoTracking()
                            .SingleAsync(grant => grant.Keyword == "MaxShared")).TargetId);

                    var maxOwnerModels = ((ModelListResponse)((JsonResult)
                        await CreateController(context, maxOwnerId).List()).Value!).Models;
                    CollectionAssert.Contains(maxOwnerModels.Select(model => model.Keyword).ToArray(), "MaxOwned");
                    var maxTargetModels = ((ModelListResponse)((JsonResult)
                        await CreateController(context, maxTargetId).List()).Value!).Models;
                    CollectionAssert.Contains(maxTargetModels.Select(model => model.Keyword).ToArray(), "MaxShared");

                    Assert.AreEqual(
                        512,
                        await context.DataModels
                            .Where(model => model.Keyword == "MaxOwned")
                            .Select(model => EF.Property<int?>(model, "OwnerIdByteLength"))
                            .SingleAsync());
                    Assert.AreEqual(
                        512,
                        await context.DataModelAccessGrants
                            .Where(grant => grant.Keyword == "MaxShared")
                            .Select(grant => EF.Property<int>(grant, "TargetIdByteLength"))
                            .SingleAsync());

                    context.DataModels.Add(Model("alice", "Same", "duplicate"));
                    await Assert.ThrowsExceptionAsync<DbUpdateException>(() => context.SaveChangesAsync());
                    context.ChangeTracker.Clear();

                    context.DataModelAccessGrants.Add(Grant("grant-owner", "Same", "User", "alice"));
                    await Assert.ThrowsExceptionAsync<DbUpdateException>(() => context.SaveChangesAsync());
                    context.ChangeTracker.Clear();

                    context.DataModels.Add(Model(new string('x', 257), "TooLongOwner", "too-long"));
                    await Assert.ThrowsExceptionAsync<DbUpdateException>(() => context.SaveChangesAsync());
                    context.ChangeTracker.Clear();

                    context.DataModelAccessGrants.Add(
                        Grant("grant-owner", "TooLongTarget", "User", new string('x', 257)));
                    await Assert.ThrowsExceptionAsync<DbUpdateException>(() => context.SaveChangesAsync());
                    context.ChangeTracker.Clear();

                    Assert.IsInstanceOfType<BadRequestObjectResult>(
                        await owner.GrantAccess(
                            "MaxShared",
                            new AccessGrantRequest("User", new string('x', 257), "View")));
                });
        }

        [TestMethod]
        public async Task ConcurrentDuplicateGrantRequestsPersistOnceAndReturnConflict()
        {
            await RunWithLocalDbAsync(
                nameof(ConcurrentDuplicateGrantRequestsPersistOnceAndReturnConflict),
                async context =>
                {
                    await context.Database.MigrateAsync();
                    context.DataModels.Add(Model("owner", "Shared", "shared"));
                    await context.SaveChangesAsync();

                    var connectionString = context.Database.GetConnectionString()!;
                    await using var firstContext = CreateContext(connectionString);
                    await using var secondContext = CreateContext(connectionString);
                    var firstController = CreateController(firstContext, "owner");
                    var secondController = CreateController(secondContext, "owner");
                    var request = new AccessGrantRequest("User", " viewer ", "View");

                    var results = await Task.WhenAll(
                        firstController.GrantAccess("Shared", request),
                        secondController.GrantAccess("Shared", request));

                    Assert.AreEqual(1, results.Count(result => result is NoContentResult));
                    Assert.AreEqual(1, results.Count(result => result is ConflictResult));
                    context.ChangeTracker.Clear();
                    var persisted = await context.DataModelAccessGrants
                        .AsNoTracking()
                        .SingleAsync(grant => grant.Keyword == "Shared");
                    Assert.AreEqual(" viewer ", persisted.TargetId);
                });
        }

        [TestMethod]
        public async Task MigrationDownRejectsGrantIdentityBeyondPreviousClusteredKeyLimitAndRemainsApplied()
        {
            await RunWithLocalDbAsync(
                nameof(MigrationDownRejectsGrantIdentityBeyondPreviousClusteredKeyLimitAndRemainsApplied),
                async context =>
                {
                    var migrator = context.GetService<IMigrator>();
                    await migrator.MigrateAsync(CurrentMigration);
                    var maxOwnerId = new string('o', 256);
                    var maxTargetId = new string('t', 256);
                    context.DataModelAccessGrants.Add(
                        Grant(maxOwnerId, "MaximumWidth", "User", maxTargetId));
                    await context.SaveChangesAsync();

                    var keyBytes = await context.Database.SqlQueryRaw<int>(
                        """
                        SELECT DATALENGTH([OwnerId])
                            + DATALENGTH([Keyword])
                            + DATALENGTH([TargetType])
                            + DATALENGTH([TargetId]) AS [Value]
                        FROM [DataModelAccessGrants]
                        WHERE [Keyword] = N'MaximumWidth'
                        """).SingleAsync();
                    Assert.IsTrue(keyBytes > 900);

                    var exception = await Assert.ThrowsExceptionAsync<SqlException>(
                        () => migrator.MigrateAsync(PreviousMigration));
                    StringAssert.Contains(
                        exception.Message,
                        "grant identity exceeds the previous 900-byte clustered key limit");

                    CollectionAssert.Contains(
                        (await context.Database.GetAppliedMigrationsAsync()).ToArray(),
                        CurrentMigration);
                    context.ChangeTracker.Clear();
                    Assert.AreEqual(
                        maxTargetId,
                        (await context.DataModelAccessGrants
                            .AsNoTracking()
                            .SingleAsync(grant => grant.Keyword == "MaximumWidth")).TargetId);
                });
        }

        [TestMethod]
        public async Task MigrationDownRejectsUnrepresentableAndCollidingIdentities()
        {
            await RunWithLocalDbAsync(nameof(MigrationDownRejectsUnrepresentableAndCollidingIdentities), async context =>
            {
                var migrator = context.GetService<IMigrator>();
                await migrator.MigrateAsync(CurrentMigration);
                var unrepresentable = Model("unowned ", "Owned", "trailing-sentinel");
                context.DataModels.Add(unrepresentable);
                await context.SaveChangesAsync();

                var sentinelException = await Assert.ThrowsExceptionAsync<SqlException>(
                    () => migrator.MigrateAsync(PreviousMigration));
                StringAssert.Contains(
                    sentinelException.Message,
                    "owner identifier equivalent to the unowned sentinel");

                context.DataModels.Remove(unrepresentable);
                await context.SaveChangesAsync();
                context.DataModels.AddRange(
                    Model("alice", "Same", "exact"),
                    Model("alice ", "Same", "trailing"));
                await context.SaveChangesAsync();

                var modelException = await Assert.ThrowsExceptionAsync<SqlException>(
                    () => migrator.MigrateAsync(PreviousMigration));
                StringAssert.Contains(
                    modelException.Message,
                    "model identities collide under the previous comparison semantics");

                await context.DataModels
                    .Where(model => model.Keyword == "Same")
                    .ExecuteDeleteAsync();
                context.DataModelAccessGrants.AddRange(
                    Grant("owner", "Same", "User", "alice"),
                    Grant("owner", "Same", "User", "alice "));
                await context.SaveChangesAsync();

                var grantException = await Assert.ThrowsExceptionAsync<SqlException>(
                    () => migrator.MigrateAsync(PreviousMigration));
                StringAssert.Contains(
                    grantException.Message,
                    "grant identities collide under the previous comparison semantics");
            });
        }

        private static ApplicationDbContext CreateContext()
        {
            return CreateContext(
                "Server=(localdb)\\MSSQLLocalDB;Database=WwwSqlDesignerAuthorizationSchemaTests;Trusted_Connection=True;");
        }

        private static ApplicationDbContext CreateContext(string connectionString)
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(connectionString)
                .Options;
            return new ApplicationDbContext(options);
        }

        private static async Task RunWithLocalDbAsync(
            string testName,
            Func<ApplicationDbContext, Task> test)
        {
            var databaseName = $"WwwSqlDesigner-{testName[..Math.Min(testName.Length, 40)]}-{Guid.NewGuid():N}";
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(
                    $"Server=(localdb)\\MSSQLLocalDB;Database={databaseName};Trusted_Connection=True;MultipleActiveResultSets=true")
                .Options;
            await using var context = new ApplicationDbContext(options);
            try
            {
                await test(context);
            }
            finally
            {
                await context.Database.EnsureDeletedAsync();
            }
        }

        private static DataModel Model(
            string? ownerId,
            string keyword,
            string data,
            DateTime? createdAt = null)
        {
            return new DataModel
            {
                OwnerId = ownerId,
                Keyword = keyword,
                Version = 0,
                Data = data,
                CreatedAt = createdAt ?? DateTime.UtcNow
            };
        }

        private static DataModelAccessGrant Grant(
            string ownerId,
            string keyword,
            string targetType,
            string targetId)
        {
            return new DataModelAccessGrant
            {
                OwnerId = ownerId,
                Keyword = keyword,
                TargetType = targetType,
                TargetId = targetId,
                Permission = "View"
            };
        }

        private static WwwSqlController CreateController(
            ApplicationDbContext context,
            string subject,
            params string[] groups)
        {
            var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, subject) };
            claims.AddRange(groups.Select(group => new Claim("groups", group)));
            var controller = new WwwSqlController(
                NullLogger<WwwSqlController>.Instance,
                context,
                new KeycloakSettings
                {
                    Enabled = true,
                    Authority = "https://login.example/realms/standard",
                    ClientId = "wwwsqldesigner",
                    ClientSecret = "test-secret"
                });
            controller.ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"))
                }
            };
            return controller;
        }
    }
}

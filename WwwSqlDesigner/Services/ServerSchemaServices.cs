using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using System.Xml.Xsl;
using System.Security.Cryptography;
using WwwSqlDesigner.Data;

namespace WwwSqlDesigner.Services;

public sealed record SchemaRelation(string Table, string Column, string Schema = "dbo", string? Name = null);
public sealed record SchemaColumn(
    string Name,
    string Type,
    bool Nullable = true,
    bool PrimaryKey = false,
    Guid? Id = null,
    bool AutoIncrement = false,
    string? Default = null,
    string? Comment = null,
    string? Classification = null,
    SchemaRelation? Relation = null);
public sealed record SchemaKey(string Type, string Name, IReadOnlyList<string> Columns);
public sealed record SchemaTable(
    string Name,
    IReadOnlyList<SchemaColumn> Columns,
    Guid? Id = null,
    IReadOnlyList<string>? PrimaryKeyColumns = null,
    string Schema = "dbo",
    string? Comment = null,
    string? RecordsSchedule = null,
    IReadOnlyList<SchemaKey>? Keys = null);
public sealed record CanonicalMetadataAssignment(MetadataTargetType TargetType, Guid TargetId, Guid VocabularyTermId, string? RetentionDisposition = null);
public sealed record ExportMetadataTerm(Guid Id, string Vocabulary, int VocabularyVersion, string Code, string? Description);
public sealed record CanonicalSchema(IReadOnlyList<SchemaTable> Tables, IReadOnlyList<CanonicalMetadataAssignment>? MetadataAssignments = null);
public sealed record SchemaDiagnostic(string Code, string Message, string? Location = null);
public sealed record ImportResult(CanonicalSchema? Schema, IReadOnlyList<SchemaDiagnostic> Diagnostics)
{
    public string Format { get; init; } = "unknown";
}
public sealed record ExportResult(string Content, string Sidecar, string Checksum, IReadOnlyList<SchemaDiagnostic> Diagnostics);

public static partial class SchemaImportService
{
    private const string DecimalType = "decimal";
    private const string IntegerType = "INTEGER";
    private const string BooleanType = "BOOLEAN";
    private const string TimestampType = "TIMESTAMP";
    private const string PrimaryKeyType = "PRIMARY";

    private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(1);
    private static readonly Regex CreateTable = new(@"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<name>(?:\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)(?:\s*\.\s*(?:\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+))?)\s*\(", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex EfClass = new(@"class\s+(?<name>\w+)\s*\{", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex EfProperty = new(@"public\s+(?<type>[\w?]+)\s+(?<name>\w+)\s*\{\s*get;\s*set;\s*\}", RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex ColumnDefinition = new(@"^(?<name>\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)\s+(?<type>(?:DOUBLE\s+PRECISION|CHARACTER\s+VARYING|BIT\s+VARYING|LONG\s+RAW|TIMESTAMP(?:\s+(?:WITH|WITHOUT|WITH\s+LOCAL)\s+TIME\s+ZONE)?|TIME(?:\s+(?:WITH|WITHOUT)\s+TIME\s+ZONE)?|[A-Za-z_]+)(?:\s*\(\s*[^)]*\))?)\s*(?<rest>.*)$", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex NotNull = new(@"\bNOT\s+NULL\b", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex PrimaryKey = new(@"\bPRIMARY\s+KEY\b", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex AutoIncrement = new(@"\b(?:AUTO_INCREMENT|AUTOINCREMENT|IDENTITY)\b", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex InlineReference = new(@"\bREFERENCES\s+(?<table>(?:\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)(?:\s*\.\s*(?:\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+))?)\s*\(\s*(?<column>\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)\s*\)", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex DefaultValue = new(@"\bDEFAULT\s+(?<value>.+?)(?=\s+(?:NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|REFERENCES|AUTO_INCREMENT|AUTOINCREMENT|IDENTITY)\b|$)", RegexOptions.IgnoreCase | RegexOptions.Singleline, RegexTimeout);
    private static readonly Regex TableKey = new(@"^(?:CONSTRAINT\s+(?<name>\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)\s+)?(?<type>PRIMARY\s+KEY|UNIQUE|FULLTEXT(?:\s+KEY)?|INDEX|KEY)(?:\s+(?:\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+))?\s*\((?<keys>[^)]*)\)$", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking, RegexTimeout);
    private static readonly Regex TableRelation = new(@"^(?:CONSTRAINT\s+(?<name>\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)\s+)?FOREIGN\s+KEY\s*\(\s*(?<column>\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)\s*\)\s*REFERENCES\s+(?<table>(?:\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)(?:\s*\.\s*(?:\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+))?)\s*\(\s*(?<target>\[[^\]]+\]|`[^`]+`|""[^""]+""|\w+)\s*\)", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking, RegexTimeout);

    public static ImportResult Parse(string fileName, string source)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (ext == ".cs") return ParseEf(source) with { Format = "ef-core" };
        if (ext is ".sql" or ".ddl") return ParseDdl(source) with { Format = "ddl" };
        if (ext == ".txt")
        {
            // Text artifacts are accepted only when their content unambiguously
            // identifies one of the supported import dialects.
            if (CreateTable.IsMatch(source)) return ParseDdl(source) with { Format = "ddl" };
            if (EfClass.IsMatch(source)) return ParseEf(source) with { Format = "ef-core" };
        }
        return new(null, new[] { new SchemaDiagnostic("unsupported-format", "Supported artifacts are EF C# (.cs), SQL DDL (.sql/.ddl), or unambiguous text (.txt).") });
    }

    private static ImportResult ParseEf(string source)
    {
        var tables = new List<SchemaTable>();
        foreach (var match in FindClasses(source))
        {
            var columns = EfProperty.Matches(match.Body)
                .Select(x =>
                {
                    var name = x.Groups["name"].Value;
                    return new SchemaColumn(name, MapEfType(x.Groups["type"].Value), x.Groups["type"].Value.EndsWith('?'),
                        Id: StableId($"property:{match.Name}:{name}"));
                })
                .ToList();
            if (columns.Count > 0) tables.Add(new SchemaTable(match.Name, columns, StableId($"entity:{match.Name}")));
        }

        return tables.Count == 0
            ? new(null, new[] { new SchemaDiagnostic("no-entities", "No entity classes with mapped properties were found.") })
            : new(new CanonicalSchema(tables), Array.Empty<SchemaDiagnostic>());
    }

    private static IEnumerable<(string Name, string Body)> FindClasses(string source)
    {
        foreach (Match header in EfClass.Matches(source))
        {
            var depth = 1; var end = header.Index + header.Length;
            for (; end < source.Length && depth > 0; end++)
            {
                if (source[end] == '{') depth++;
                else if (source[end] == '}') depth--;
            }
            if (depth == 0)
            {
                yield return (header.Groups["name"].Value, source[(header.Index + header.Length)..(end - 1)]);
            }
        }
    }

    private static ImportResult ParseDdl(string source)
    {
        var diagnostics = new List<SchemaDiagnostic>();
        var tables = new List<SchemaTable>();
        foreach (var table in FindCreateTables(source))
        {
            var parsed = ParseDdlTable(table.Name, table.Body, diagnostics);
            if (parsed is not null) tables.Add(parsed);
        }

        if (tables.Count == 0) diagnostics.Add(new SchemaDiagnostic("no-tables", "No CREATE TABLE statements were found."));
        return new(tables.Count == 0 ? null : new CanonicalSchema(tables), diagnostics);
    }

    private static SchemaTable? ParseDdlTable(
        string rawName,
        string body,
        List<SchemaDiagnostic> diagnostics)
    {
        var columns = new List<SchemaColumn>();
        var tablePrimaryKeys = new List<string>();
        var keys = new List<SchemaKey>();
        var pendingRelations = new Dictionary<string, SchemaRelation>(StringComparer.OrdinalIgnoreCase);
        foreach (var definition in SplitColumns(body))
            ParseDdlDefinition(definition.Trim(), rawName, columns, keys, tablePrimaryKeys, pendingRelations, diagnostics);
        if (columns.Count == 0)
        {
            diagnostics.Add(new SchemaDiagnostic("empty-table", "A CREATE TABLE statement contained no supported columns.", rawName));
            return null;
        }

        var normalizedKeys = tablePrimaryKeys.Select(Unquote).ToArray();
        ApplyTableConstraints(columns, normalizedKeys, pendingRelations);
        var qualifiedName = SplitQualifiedName(rawName);
        var primaryKeys = normalizedKeys.Length > 0
            ? normalizedKeys
            : columns.Where(column => column.PrimaryKey).Select(column => column.Name).ToArray();
        if (primaryKeys.Length > 0 && keys.All(key => key.Type != PrimaryKeyType))
            keys.Add(new SchemaKey(PrimaryKeyType, string.Empty, primaryKeys));
        return new(
            qualifiedName.Name,
            columns,
            StableId($"entity:{qualifiedName.Schema}:{qualifiedName.Name}"),
            primaryKeys,
            qualifiedName.Schema,
            Keys: keys);
    }

    private static void ParseDdlDefinition(
        string definition,
        string tableName,
        List<SchemaColumn> columns,
        List<SchemaKey> keys,
        List<string> tablePrimaryKeys,
        Dictionary<string, SchemaRelation> pendingRelations,
        List<SchemaDiagnostic> diagnostics)
    {
        if (TryParseTableKey(definition, keys, tablePrimaryKeys)) return;
        if (TryParseTableRelation(definition, pendingRelations)) return;
        var column = ParseDdlColumn(definition, tableName, diagnostics);
        if (column is not null) columns.Add(column);
    }

    private static bool TryParseTableKey(
        string definition,
        List<SchemaKey> keys,
        List<string> tablePrimaryKeys)
    {
        var match = TableKey.Match(definition);
        if (!match.Success) return false;
        var type = match.Groups["type"].Value.Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant() switch
        {
            "PRIMARYKEY" => PrimaryKeyType,
            "FULLTEXTKEY" => "FULLTEXT",
            "KEY" => "INDEX",
            var value => value
        };
        var parts = SplitColumns(match.Groups["keys"].Value).Select(Unquote).ToArray();
        keys.Add(new SchemaKey(type, Unquote(match.Groups["name"].Value), parts));
        if (type == PrimaryKeyType)
            foreach (var part in parts) tablePrimaryKeys.Add(part);
        return true;
    }

    private static bool TryParseTableRelation(
        string definition,
        Dictionary<string, SchemaRelation> pendingRelations)
    {
        var match = TableRelation.Match(definition);
        if (!match.Success) return false;
        var target = SplitQualifiedName(match.Groups["table"].Value);
        pendingRelations[Unquote(match.Groups["column"].Value)] = new(
            target.Name,
            Unquote(match.Groups["target"].Value),
            target.Schema,
            Unquote(match.Groups["name"].Value));
        return true;
    }

    private static SchemaColumn? ParseDdlColumn(
        string definition,
        string tableName,
        List<SchemaDiagnostic> diagnostics)
    {
        var match = ColumnDefinition.Match(definition);
        if (!match.Success)
        {
            diagnostics.Add(new SchemaDiagnostic("unsupported-definition", "A table definition was not understood.", definition));
            return null;
        }
        var rest = match.Groups["rest"].Value;
        var columnName = Unquote(match.Groups["name"].Value);
        var rawType = NormalizeType(match.Groups["type"].Value);
        var defaultMatch = DefaultValue.Match(rest);
        return new(
            columnName,
            CanonicalizeType(rawType),
            !NotNull.IsMatch(rest),
            PrimaryKey.IsMatch(rest),
            StableId($"property:{Unquote(tableName)}:{columnName}"),
            AutoIncrement.IsMatch(rest) || rawType.Contains("SERIAL", StringComparison.OrdinalIgnoreCase),
            defaultMatch.Success ? defaultMatch.Groups["value"].Value.Trim() : null,
            Relation: ParseInlineRelation(rest));
    }

    private static SchemaRelation? ParseInlineRelation(string definition)
    {
        var match = InlineReference.Match(definition);
        if (!match.Success) return null;
        var target = SplitQualifiedName(match.Groups["table"].Value);
        return new(target.Name, Unquote(match.Groups["column"].Value), target.Schema);
    }

    private static void ApplyTableConstraints(
        List<SchemaColumn> columns,
        string[] primaryKeys,
        Dictionary<string, SchemaRelation> relations)
    {
        for (var index = 0; index < columns.Count; index++)
        {
            var column = columns[index];
            if (primaryKeys.Contains(column.Name, StringComparer.OrdinalIgnoreCase))
                column = column with { PrimaryKey = true };
            if (relations.TryGetValue(column.Name, out var relation))
                column = column with { Relation = relation };
            columns[index] = column;
        }
    }

    private static IEnumerable<(string Name, string Body)> FindCreateTables(string source)
    {
        foreach (Match match in CreateTable.Matches(source))
        {
            var start = match.Index + match.Length; var depth = 1; var quote = '\0'; var end = start;
            for (; end < source.Length && depth > 0; end++)
            {
                var c = source[end];
                if (quote != '\0')
                {
                    if (c == quote && (end == 0 || source[end - 1] != '\\')) quote = '\0';
                    continue;
                }
                if (c is '\'' or '"' or '`') { quote = c; continue; }
                if (c == '(') depth++; else if (c == ')') depth--;
            }
            if (depth == 0)
            {
                yield return (match.Groups["name"].Value, source[start..(end - 1)]);
            }
        }
    }

    private static IEnumerable<string> SplitColumns(string body)
    {
        var start = 0; var depth = 0; var quote = '\0';
        for (var i = 0; i < body.Length; i++)
        {
            var c = body[i];
            if (quote != '\0')
            {
                if (c == quote && (i == 0 || body[i - 1] != '\\')) quote = '\0';
                continue;
            }
            if (c is '\'' or '"' or '`') { quote = c; continue; }
            if (c == '(') depth++; else if (c == ')') depth--; else if (c == ',' && depth == 0) { yield return body[start..i]; start = i + 1; }
        }
        if (start < body.Length) yield return body[start..];
    }
    private static string Unquote(string s) => s.Trim().Trim('[', ']', '`', '"');
    private static (string Schema, string Name) SplitQualifiedName(string value)
    {
        var parts = value.Split('.', 2, StringSplitOptions.TrimEntries);
        return parts.Length == 2
            ? (Unquote(parts[0]), Unquote(parts[1]))
            : ("dbo", Unquote(value));
    }
    private static Guid StableId(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes("wwwsqldesigner:" + value));
        return new Guid(bytes.AsSpan(0, 16));
    }
    private static string NormalizeType(string type) =>
        Regex.Replace(type.Trim(), @"\s+", " ", RegexOptions.NonBacktracking, RegexTimeout).ToUpperInvariant();
    private static string CanonicalizeType(string type)
    {
        var match = Regex.Match(type, @"^(?<name>[^()]+?)(?:\((?<facets>.*)\))?$", RegexOptions.NonBacktracking, RegexTimeout);
        var name = match.Groups["name"].Value.Trim().ToLowerInvariant();
        var facets = match.Groups["facets"].Value.Trim();
        var canonical = name switch
        {
            "tinyint" or "smallint" or "mediumint" or "int" or "integer" or "bigint" or "serial" or "bigserial" or "serial4" or "serial8" => "integer",
            DecimalType or "numeric" or "dec" or "number" or "money" or "smallmoney" => DecimalType,
            "real" or "float" or "double" or "double precision" or "binary_float" or "binary_double" => "float",
            "char" or "character" or "varchar" or "varchar2" or "nvarchar" or "nvarchar2" or "nchar" => "string",
            "text" or "ntext" or "clob" or "nclob" or "long" or "mediumtext" or "longtext" => "text",
            "bit" or "bool" or "boolean" or "logical" => "boolean",
            "date" => "date",
            "time" => "time",
            "datetime" or "datetime2" or "smalldatetime" or "timestamp" => "datetime",
            "datetimeoffset" or "timestamp with time zone" or "timestamp with local time zone" => "datetime-with-time-zone",
            "binary" or "varbinary" or "image" or "blob" or "bytea" or "raw" => "binary",
            "uniqueidentifier" or "uuid" => "uuid",
            "json" or "jsonb" => "json",
            "xml" or "xmltype" => "xml",
            _ => type
        };
        return facets.Length > 0 && canonical is DecimalType or "string" or "binary"
            ? $"{canonical}({facets})"
            : canonical;
    }
    private static string MapEfType(string type) => type.TrimEnd('?') switch
    {
        "int" => IntegerType,
        "long" => "BIGINT",
        "short" => "SMALLINT",
        "bool" => BooleanType,
        "decimal" => "DECIMAL",
        "DateTime" => TimestampType,
        "Guid" => "UUID",
        "byte[]" => "BLOB",
        _ => "TEXT"
    };
}

public sealed class SchemaExportService
{
    private const string IntegerKind = "integer";
    private const string PrimaryKeyType = "PRIMARY";
    private const string DecimalKind = "decimal";
    private const string FloatKind = "float";
    private const string StringKind = "string";
    private const string BooleanKind = "boolean";
    private const string DateTimeKind = "datetime";
    private const string ZonedDateTimeKind = "datetime-with-time-zone";
    private const string BinaryKind = "binary";
    private const string NumericSqlType = "numeric";
    private const string VarcharSqlType = "varchar";
    private const string DoubleSqlType = "double";
    private const string TimestampSqlType = "timestamp";
    private const string CommentProperty = "comment";
    private const string SchemaProperty = "schema";
    private const string TableProperty = "table";

    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, Lazy<XslCompiledTransform>> _transforms =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly Dictionary<string, Dictionary<string, string>> TargetTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["mssql"] = Types((IntegerKind, "int"), (DecimalKind, DecimalKind), (FloatKind, FloatKind), (StringKind, "nvarchar"), ("text", "nvarchar(max)"), (BooleanKind, "bit"), ("date", "date"), ("time", "time"), (DateTimeKind, "datetime2"), (ZonedDateTimeKind, "datetimeoffset"), (BinaryKind, "varbinary"), ("uuid", "uniqueidentifier"), ("json", "nvarchar(max)"), ("xml", "xml")),
            ["postgresql"] = Types((IntegerKind, IntegerKind), (DecimalKind, NumericSqlType), (FloatKind, "double precision"), (StringKind, VarcharSqlType), ("text", "text"), (BooleanKind, BooleanKind), ("date", "date"), ("time", "time"), (DateTimeKind, TimestampSqlType), (ZonedDateTimeKind, "timestamp with time zone"), (BinaryKind, "bytea"), ("uuid", "uuid"), ("json", "jsonb"), ("xml", "xml")),
            ["mysql"] = Types((IntegerKind, "int"), (DecimalKind, DecimalKind), (FloatKind, DoubleSqlType), (StringKind, VarcharSqlType), ("text", "text"), (BooleanKind, BooleanKind), ("date", "date"), ("time", "time"), (DateTimeKind, DateTimeKind), (ZonedDateTimeKind, DateTimeKind), (BinaryKind, "blob"), ("uuid", "char(36)"), ("json", "json"), ("xml", "text")),
            ["sqlite"] = Types((IntegerKind, IntegerKind), (DecimalKind, NumericSqlType), (FloatKind, "real"), (StringKind, "text"), ("text", "text"), (BooleanKind, IntegerKind), ("date", "text"), ("time", "text"), (DateTimeKind, "text"), (ZonedDateTimeKind, "text"), (BinaryKind, "blob"), ("uuid", "text"), ("json", "text"), ("xml", "text")),
            ["oracle"] = Types((IntegerKind, "number"), (DecimalKind, "number"), (FloatKind, "binary_double"), (StringKind, "varchar2"), ("text", "clob"), (BooleanKind, "number(1)"), ("date", "date"), ("time", TimestampSqlType), (DateTimeKind, TimestampSqlType), (ZonedDateTimeKind, "timestamp with time zone"), (BinaryKind, "blob"), ("uuid", "varchar2(36)"), ("json", "clob"), ("xml", "xmltype")),
            ["sqlalchemy"] = Types((IntegerKind, "sa.Integer"), (DecimalKind, "sa.Numeric"), (FloatKind, "sa.Float"), (StringKind, "sa.String"), ("text", "sa.Text"), (BooleanKind, "sa.Boolean"), ("date", "sa.Date"), ("time", "sa.Time"), (DateTimeKind, "sa.DateTime"), (ZonedDateTimeKind, "sa.DateTime(timezone=True)"), (BinaryKind, "sa.LargeBinary"), ("uuid", "sa.Uuid"), ("json", "sa.JSON"), ("xml", "sa.Text")),
            ["web2py"] = Types((IntegerKind, IntegerKind), (DecimalKind, DecimalKind), (FloatKind, DoubleSqlType), (StringKind, StringKind), ("text", "text"), (BooleanKind, BooleanKind), ("date", "date"), ("time", "time"), (DateTimeKind, DateTimeKind), (ZonedDateTimeKind, DateTimeKind), (BinaryKind, "blob"), ("uuid", StringKind), ("json", "json"), ("xml", "text")),
            ["ef"] = Types((IntegerKind, "int"), (DecimalKind, DecimalKind), (FloatKind, DoubleSqlType), (StringKind, StringKind), ("text", StringKind), (BooleanKind, "bool"), ("date", "date"), ("time", "time"), (DateTimeKind, DateTimeKind), (ZonedDateTimeKind, "datetimeoffset"), (BinaryKind, BinaryKind), ("uuid", "uuid"), ("json", StringKind), ("xml", StringKind))
        };

    public ExportResult Export(
        CanonicalSchema schema,
        string format,
        IReadOnlyDictionary<Guid, ExportMetadataTerm>? metadataTerms = null)
    {
        var diagnostics = new List<SchemaDiagnostic>();
        var normalized = NormalizeFormat(format);
        if (!TargetTypes.ContainsKey(normalized))
        {
            diagnostics.Add(new("unsupported-provider", $"Unsupported export provider '{format}'."));
            return CreateResult(string.Empty, schema, diagnostics, metadataTerms);
        }

        string content;
        try
        {
            content = Transform(ToLegacyXml(schema, normalized, diagnostics), normalized);
        }
        catch (XsltException exception)
        {
            diagnostics.Add(new("export-template-error", exception.Message, normalized));
            content = string.Empty;
        }

        return CreateResult(content, schema, diagnostics, metadataTerms);
    }

    private static ExportResult CreateResult(
        string content,
        CanonicalSchema schema,
        IReadOnlyList<SchemaDiagnostic> diagnostics,
        IReadOnlyDictionary<Guid, ExportMetadataTerm>? metadataTerms)
    {
        var assignments = (schema.MetadataAssignments ?? Array.Empty<CanonicalMetadataAssignment>())
            .Select(assignment =>
            {
                ExportMetadataTerm? term = null;
                _ = metadataTerms?.TryGetValue(assignment.VocabularyTermId, out term);
                var target = ResolveTarget(schema, assignment);
                return new
                {
                    targetType = assignment.TargetType,
                    targetId = assignment.TargetId,
                    target.schema,
                    target.table,
                    target.column,
                    vocabularyTermId = assignment.VocabularyTermId,
                    vocabulary = term?.Vocabulary,
                    vocabularyVersion = term?.VocabularyVersion,
                    code = term?.Code,
                    description = term?.Description,
                    retentionDisposition = assignment.RetentionDisposition
                };
            });
        var sidecar = JsonSerializer.Serialize(new
        {
            metadataAssignments = assignments,
            tables = schema.Tables.Select(table => new
            {
                id = table.Id,
                schema = table.Schema,
                name = table.Name,
                comment = table.Comment,
                recordsSchedule = table.RecordsSchedule,
                columns = table.Columns.Select(column => new
                {
                    id = column.Id,
                    name = column.Name,
                    comment = column.Comment,
                    classification = column.Classification
                })
            }),
            diagnostics
        });
        var checksum = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();
        return new(content, sidecar, checksum, diagnostics);
    }

    private static (string? schema, string? table, string? column) ResolveTarget(
        CanonicalSchema schema,
        CanonicalMetadataAssignment assignment)
    {
        foreach (var table in schema.Tables)
        {
            if (assignment.TargetType == MetadataTargetType.Entity && table.Id == assignment.TargetId)
                return (table.Schema, table.Name, null);
            var column = table.Columns.FirstOrDefault(value => value.Id == assignment.TargetId);
            if (assignment.TargetType == MetadataTargetType.Property && column is not null)
                return (table.Schema, table.Name, column.Name);
        }
        return (null, null, null);
    }

    public static CanonicalSchema ReadSnapshot(string snapshot)
    {
        if (snapshot.TrimStart().StartsWith('<'))
            return ReadXml(snapshot);
        using var document = JsonDocument.Parse(snapshot);
        var tables = document.RootElement.TryGetProperty("tables", out var value) || document.RootElement.TryGetProperty("Tables", out value) ? value : document.RootElement;
        var schemaTables = tables.EnumerateArray().Select(table => new SchemaTable(
            GetString(table, "name", "Name") ?? "Table",
            GetArray(table, "columns", "Columns").EnumerateArray().Select(column => new SchemaColumn(
                GetString(column, "name", "Name") ?? "Column",
                GetString(column, "type", "Type") ?? "TEXT",
                !TryGetProperty(column, out var nullable, "nullable", "Nullable") || nullable.GetBoolean(),
                TryGetProperty(column, out var pk, "primaryKey", "PrimaryKey") && pk.GetBoolean(),
                TryGetGuid(column, "id", "Id"),
                GetBoolean(column, "autoIncrement", "AutoIncrement"),
                GetString(column, "default", "Default"),
                GetString(column, CommentProperty, "Comment"),
                GetString(column, "classification", "Classification"),
                ReadRelation(column))).ToArray(),
            TryGetGuid(table, "id", "Id"),
            GetArrayIfPresent(table, "primaryKeyColumns", "PrimaryKeyColumns")?.EnumerateArray().Select(x => x.GetString()!).ToArray(),
            GetString(table, SchemaProperty, "Schema") ?? "dbo",
            GetString(table, CommentProperty, "Comment"),
            GetString(table, "recordsSchedule", "RecordsSchedule"),
            ReadKeys(table))).ToArray();
        var metadata = GetArrayIfPresent(document.RootElement, "metadataAssignments", "MetadataAssignments")?
            .EnumerateArray().Select(item => new CanonicalMetadataAssignment(
                GetTargetType(item),
                TryGetGuid(item, "targetId", "TargetId") ?? throw new JsonException("Metadata target id is required."),
                TryGetGuid(item, "vocabularyTermId", "VocabularyTermId") ?? throw new JsonException("Vocabulary term id is required."),
                GetString(item, "retentionDisposition", "RetentionDisposition"))).ToArray();
        return new(schemaTables, metadata);
    }

    private static MetadataTargetType GetTargetType(JsonElement item)
    {
        if (TryGetProperty(item, out var value, "targetType", "TargetType"))
        {
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var numeric))
                return (MetadataTargetType)numeric;
            if (value.ValueKind == JsonValueKind.String && Enum.TryParse<MetadataTargetType>(value.GetString(), true, out var parsed))
                return parsed;
        }
        throw new JsonException("Metadata target type is required.");
    }

    private static string? GetString(JsonElement element, params string[] names)
    {
        foreach (var name in names) if (element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String) return value.GetString();
        return null;
    }
    private static JsonElement GetArray(JsonElement element, params string[] names)
    {
        foreach (var name in names) if (element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array) return value;
        throw new JsonException("Schema table has no columns array.");
    }
    private static JsonElement? GetArrayIfPresent(JsonElement element, params string[] names)
    {
        foreach (var name in names) if (element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array) return value;
        return null;
    }
    private static Guid? TryGetGuid(JsonElement element, params string[] names)
    {
        var value = GetString(element, names);
        return Guid.TryParse(value, out var id) ? id : null;
    }
    private static bool TryGetProperty(JsonElement element, out JsonElement value, params string[] names)
    {
        foreach (var name in names) if (element.TryGetProperty(name, out value)) return true;
        value = default; return false;
    }

    private static bool GetBoolean(JsonElement element, params string[] names) =>
        TryGetProperty(element, out var value, names) &&
        (value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.String && bool.TryParse(value.GetString(), out var parsed) && parsed);

    private static SchemaRelation? ReadRelation(JsonElement column)
    {
        if (!TryGetProperty(column, out var relation, "relation", "Relation") || relation.ValueKind != JsonValueKind.Object)
            return null;
        var table = GetString(relation, TableProperty, "Table");
        var targetColumn = GetString(relation, "column", "Column");
        return string.IsNullOrWhiteSpace(table) || string.IsNullOrWhiteSpace(targetColumn)
            ? null
            : new(table, targetColumn, GetString(relation, SchemaProperty, "Schema") ?? "dbo", GetString(relation, "name", "Name"));
    }

    private static SchemaKey[]? ReadKeys(JsonElement table)
    {
        var keys = GetArrayIfPresent(table, "keys", "Keys");
        return keys?.EnumerateArray().Select(key => new SchemaKey(
            GetString(key, "type", "Type") ?? "INDEX",
            GetString(key, "name", "Name") ?? string.Empty,
            GetArray(key, "columns", "Columns").EnumerateArray().Select(column => column.GetString()!).ToArray())).ToArray();
    }

    private static CanonicalSchema ReadXml(string xml)
    {
        var root = XDocument.Parse(xml, LoadOptions.PreserveWhitespace).Root!;
        var tables = root.Elements(TableProperty).Select(table =>
        {
            var schemaName = (string?)table.Attribute(SchemaProperty) ?? "dbo";
            var tableName = (string?)table.Attribute("name") ?? "Table";
            var keys = table.Elements("key").Select(key => new SchemaKey(
                ((string?)key.Attribute("type") ?? "INDEX").ToUpperInvariant(),
                (string?)key.Attribute("name") ?? string.Empty,
                key.Elements("part").Select(part => part.Value).ToArray())).ToArray();
            var primaryKeyColumns = keys.FirstOrDefault(key => key.Type == PrimaryKeyType)?.Columns ?? Array.Empty<string>();
            var columns = table.Elements("row").Select(row =>
            {
                var name = (string?)row.Attribute("name") ?? "Column";
                var relation = row.Element("relation");
                return new SchemaColumn(
                    name,
                    row.Element("datatype")?.Value.Trim() ?? "text",
                    (string?)row.Attribute("null") != "0",
                    primaryKeyColumns.Contains(name, StringComparer.Ordinal),
                    StableId($"property:{schemaName}:{tableName}:{name}"),
                    (string?)row.Attribute("autoincrement") == "1",
                    row.Element("default")?.Value,
                    row.Element(CommentProperty)?.Value,
                    row.Element("classification")?.Value,
                    relation is null
                        ? null
                        : new(
                            (string?)relation.Attribute("table") ?? string.Empty,
                            (string?)relation.Attribute("row") ?? string.Empty,
                            (string?)relation.Attribute("schema") ?? "dbo",
                            (string?)relation.Attribute("name")));
            }).ToArray();
            return new SchemaTable(
                tableName,
                columns,
                StableId($"entity:{schemaName}:{tableName}"),
                primaryKeyColumns,
                schemaName,
                table.Element(CommentProperty)?.Value,
                table.Element("records-schedule")?.Value,
                keys);
        }).ToArray();
        return new(tables);
    }

    private static XDocument ToLegacyXml(CanonicalSchema schema, string format, ICollection<SchemaDiagnostic> diagnostics)
    {
        return new(new XElement("sql", schema.Tables.Select(table => CreateLegacyTable(table, format, diagnostics))));
    }

    private static XElement CreateLegacyTable(
        SchemaTable table,
        string format,
        ICollection<SchemaDiagnostic> diagnostics)
    {
        var element = new XElement(TableProperty,
            new XAttribute("name", table.Name),
            new XAttribute(SchemaProperty, string.IsNullOrWhiteSpace(table.Schema) ? "dbo" : table.Schema));
        element.Add(table.Columns.Select(column => CreateLegacyRow(table, column, format, diagnostics)));
        element.Add(GetKeys(table).Select(CreateLegacyKey));
        if (!string.IsNullOrWhiteSpace(table.Comment)) element.Add(new XElement(CommentProperty, table.Comment));
        if (!string.IsNullOrWhiteSpace(table.RecordsSchedule)) element.Add(new XElement("records-schedule", table.RecordsSchedule));
        return element;
    }

    private static XElement CreateLegacyRow(
        SchemaTable table,
        SchemaColumn column,
        string format,
        ICollection<SchemaDiagnostic> diagnostics)
    {
        var row = new XElement("row",
            new XAttribute("name", column.Name),
            new XAttribute("null", column.Nullable ? "1" : "0"),
            new XAttribute("autoincrement", column.AutoIncrement ? "1" : "0"),
            new XElement("datatype", MapType(column.Type, format, diagnostics, $"{table.Schema}.{table.Name}.{column.Name}")));
        if (column.Default is not null) row.Add(new XElement("default", column.Default));
        if (column.Relation is not null) row.Add(CreateLegacyRelation(column.Relation));
        if (!string.IsNullOrWhiteSpace(column.Comment)) row.Add(new XElement(CommentProperty, column.Comment));
        if (!string.IsNullOrWhiteSpace(column.Classification)) row.Add(new XElement("classification", column.Classification));
        return row;
    }

    private static XElement CreateLegacyRelation(SchemaRelation relation) =>
        new("relation",
            new XAttribute(TableProperty, relation.Table),
            new XAttribute(SchemaProperty, relation.Schema),
            new XAttribute("row", relation.Column),
            new XAttribute("name", relation.Name ?? string.Empty));

    private static List<SchemaKey> GetKeys(SchemaTable table)
    {
        var keys = table.Keys?.ToList() ?? [];
        if (keys.Count > 0) return keys;
        var primary = table.PrimaryKeyColumns is { Count: > 0 }
            ? table.PrimaryKeyColumns
            : table.Columns.Where(column => column.PrimaryKey).Select(column => column.Name).ToArray();
        if (primary.Count > 0) keys.Add(new(PrimaryKeyType, string.Empty, primary));
        return keys;
    }

    private static XElement CreateLegacyKey(SchemaKey key) =>
        new("key",
            new XAttribute("type", key.Type),
            new XAttribute("name", key.Name),
            key.Columns.Select(column => new XElement("part", column)));

    private string Transform(XDocument source, string format)
    {
        var transform = _transforms.GetOrAdd(
            format,
            name => new Lazy<XslCompiledTransform>(
                () => LoadTransform(name),
                LazyThreadSafetyMode.ExecutionAndPublication)).Value;
        using var sourceReader = source.CreateReader();
        using var writer = new StringWriter(System.Globalization.CultureInfo.InvariantCulture);
        transform.Transform(sourceReader, null, writer);
        return writer.ToString();
    }

    private static XslCompiledTransform LoadTransform(string format)
    {
        var resourceName = $"WwwSqlDesigner.ServerExports.{format}.output.xsl";
        using var stylesheet = typeof(SchemaExportService).Assembly.GetManifestResourceStream(resourceName)
            ?? throw new XsltException($"The server export template '{format}' is unavailable.");
        using var stylesheetReader = XmlReader.Create(stylesheet, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit });
        var transform = new XslCompiledTransform();
        transform.Load(stylesheetReader, XsltSettings.Default, null);
        return transform;
    }

    private static string MapType(string type, string format, ICollection<SchemaDiagnostic> diagnostics, string location)
    {
        var match = Regex.Match(type.Trim(), @"^(?<kind>[^()]+?)(?:\((?<facets>.*)\))?$", RegexOptions.NonBacktracking, TimeSpan.FromSeconds(1));
        var kind = CanonicalKind(match.Groups["kind"].Value);
        var facets = match.Groups["facets"].Value.Trim();
        if (!TargetTypes[format].TryGetValue(kind, out var mapped))
        {
            diagnostics.Add(new("unmapped-type", $"Type '{type}' was preserved as-is.", location));
            return type;
        }
        if (facets.Length > 0 && kind is DecimalKind or StringKind or BinaryKind && !mapped.Contains('('))
            return $"{mapped}({facets})";
        return mapped;
    }

    private static string CanonicalKind(string value) => value.Trim().ToLowerInvariant() switch
    {
        "tinyint" or "smallint" or "mediumint" or "int" or IntegerKind or "bigint" or "serial" or "bigserial" or "serial4" or "serial8" => IntegerKind,
        DecimalKind or NumericSqlType or "dec" or "number" or "money" or "smallmoney" => DecimalKind,
        "real" or FloatKind or DoubleSqlType or "double precision" or "binary_float" or "binary_double" => FloatKind,
        "char" or "character" or VarcharSqlType or "varchar2" or "nvarchar" or "nvarchar2" or "nchar" => StringKind,
        "text" or "ntext" or "clob" or "nclob" or "long" or "mediumtext" or "longtext" => "text",
        "bit" or "bool" or BooleanKind or "logical" => BooleanKind,
        "date" => "date",
        "time" => "time",
        DateTimeKind or "datetime2" or "smalldatetime" or TimestampSqlType => DateTimeKind,
        "datetimeoffset" or "timestamp with time zone" or "timestamp with local time zone" => ZonedDateTimeKind,
        BinaryKind or "varbinary" or "image" or "blob" or "bytea" or "raw" => BinaryKind,
        "uniqueidentifier" or "uuid" => "uuid",
        "json" or "jsonb" => "json",
        "xml" or "xmltype" => "xml",
        var canonical => canonical
    };

    private static string NormalizeFormat(string format) => format.Trim().ToLowerInvariant() switch
    {
        "efcore" or "ef-core" => "ef",
        "postgres" => "postgresql",
        var normalized => normalized
    };

    private static Dictionary<string, string> Types(params (string Kind, string Type)[] values) =>
        values.ToDictionary(value => value.Kind, value => value.Type, StringComparer.OrdinalIgnoreCase);

    private static Guid StableId(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes("wwwsqldesigner:" + value));
        return new Guid(bytes.AsSpan(0, 16));
    }
}

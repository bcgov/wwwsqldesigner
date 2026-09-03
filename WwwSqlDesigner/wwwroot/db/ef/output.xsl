<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="text" omit-xml-declaration="yes" />
    <xsl:param name="namespace" select="'WwwSqlDesigner.Data'" />
    <xsl:param name="context" select="'ApplicationDbContext'" />

    <xsl:template match="/sql">
        <xsl:text>using System;
using Microsoft.EntityFrameworkCore;

namespace </xsl:text><xsl:value-of select="$namespace" /><xsl:text>
{
</xsl:text>
        <xsl:apply-templates select="table" />
        <xsl:text>
    public class </xsl:text><xsl:value-of select="$context" /><xsl:text> : DbContext
    {
        public </xsl:text><xsl:value-of select="$context" /><xsl:text>(DbContextOptions&lt;</xsl:text><xsl:value-of select="$context" /><xsl:text>&gt; options) : base(options) { }
</xsl:text>
        <xsl:apply-templates select="table" mode="dbset" />
        <xsl:text>
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
</xsl:text>
        <xsl:apply-templates select="table" mode="key" />
        <xsl:apply-templates select="table" mode="mapping" />
        <xsl:apply-templates select="table/row/relation" mode="relation" />
        <xsl:text>        }
    }
}
</xsl:text>
    </xsl:template>

    <xsl:template match="table">
        <xsl:text>    public class </xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="@name" /><xsl:with-param name="node" select="." /></xsl:call-template>
        <xsl:text>
    {
</xsl:text>
        <xsl:apply-templates select="row" />
        <xsl:text>    }

</xsl:text>
    </xsl:template>

    <xsl:template match="row">
        <xsl:variable name="type" select="translate(normalize-space(datatype), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')" />
        <xsl:variable name="referenceType" select="contains($type, 'char') or contains($type, 'text') or contains($type, 'xml') or contains($type, 'binary') or $type = 'image' or $type = 'json' or $type = 'jsonb'" />
        <xsl:text>        public </xsl:text>
        <xsl:choose>
            <xsl:when test="contains($type, 'binary') or $type = 'image'">byte[]</xsl:when>
            <xsl:when test="$type = 'bigint' or $type = 'bigserial' or $type = 'serial8'">long</xsl:when>
            <xsl:when test="$type = 'smallint'">short</xsl:when>
            <xsl:when test="$type = 'tinyint'">byte</xsl:when>
            <xsl:when test="$type = 'int' or $type = 'integer' or $type = 'serial' or $type = 'serial4'">int</xsl:when>
            <xsl:when test="$type = 'decimal' or $type = 'numeric' or $type = 'money' or $type = 'smallmoney'">decimal</xsl:when>
            <xsl:when test="$type = 'real'">float</xsl:when>
            <xsl:when test="$type = 'float' or $type = 'double precision'">double</xsl:when>
            <xsl:when test="$type = 'bit' or $type = 'bool' or $type = 'boolean'">bool</xsl:when>
            <xsl:when test="$type = 'uniqueidentifier' or $type = 'uuid'">Guid</xsl:when>
            <xsl:when test="$type = 'time' or $type = 'time without time zone' or $type = 'time with time zone'">TimeSpan</xsl:when>
            <xsl:when test="$type = 'datetimeoffset' or $type = 'timestamp with time zone'">DateTimeOffset</xsl:when>
            <xsl:when test="$type = 'date' or contains($type, 'date') or contains($type, 'timestamp')">DateTime</xsl:when>
            <xsl:when test="$referenceType">string</xsl:when>
            <xsl:otherwise>string</xsl:otherwise>
        </xsl:choose>
        <xsl:if test="@null = '1'">?</xsl:if>
        <xsl:text> </xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="@name" /><xsl:with-param name="node" select="." /></xsl:call-template>
        <xsl:text> { get; set; }</xsl:text>
        <xsl:if test="$referenceType and @null = '0'"> = null!;</xsl:if>
        <xsl:text>
</xsl:text>
    </xsl:template>

    <xsl:template match="table" mode="dbset">
        <xsl:text>        public DbSet&lt;</xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="@name" /><xsl:with-param name="node" select="." /></xsl:call-template>
        <xsl:text>&gt; </xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="@name" /><xsl:with-param name="node" select="." /></xsl:call-template>
        <xsl:text>s { get; set; } = null!;
</xsl:text>
    </xsl:template>

    <xsl:template match="table" mode="key">
        <xsl:apply-templates select="key[@type = 'PRIMARY']" mode="key" />
    </xsl:template>

    <xsl:template match="table" mode="mapping">
        <xsl:text>        modelBuilder.Entity&lt;</xsl:text><xsl:call-template name="identifier"><xsl:with-param name="name" select="@name"/><xsl:with-param name="node" select="."/></xsl:call-template><xsl:text>&gt;().ToTable("</xsl:text><xsl:call-template name="csharp-string"><xsl:with-param name="value" select="@name"/></xsl:call-template><xsl:text>", "</xsl:text><xsl:call-template name="csharp-string"><xsl:with-param name="value" select="@schema"/></xsl:call-template><xsl:text>")</xsl:text><xsl:if test="normalize-space(comment)!=''"><xsl:text>.HasComment("</xsl:text><xsl:call-template name="csharp-string"><xsl:with-param name="value" select="comment"/></xsl:call-template><xsl:text>")</xsl:text></xsl:if><xsl:text>;
</xsl:text>
        <xsl:for-each select="row[normalize-space(comment)!='']">
            <xsl:text>        modelBuilder.Entity&lt;</xsl:text><xsl:call-template name="identifier"><xsl:with-param name="name" select="../@name"/><xsl:with-param name="node" select=".."/></xsl:call-template><xsl:text>&gt;().Property(e =&gt; e.</xsl:text><xsl:call-template name="identifier"><xsl:with-param name="name" select="@name"/><xsl:with-param name="node" select="."/></xsl:call-template><xsl:text>).HasComment("</xsl:text><xsl:call-template name="csharp-string"><xsl:with-param name="value" select="comment"/></xsl:call-template><xsl:text>");
</xsl:text>
        </xsl:for-each>
    </xsl:template>

    <xsl:template match="key" mode="key">
        <xsl:variable name="table" select=".." />
        <xsl:text>        modelBuilder.Entity&lt;</xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="$table/@name" /><xsl:with-param name="node" select="$table" /></xsl:call-template>
        <xsl:text>&gt;().HasKey(e =&gt; new { </xsl:text>
        <xsl:for-each select="part">
            <xsl:variable name="partName" select="." />
            <xsl:text>e.</xsl:text>
            <xsl:call-template name="identifier"><xsl:with-param name="name" select="$partName" /><xsl:with-param name="node" select="$table/row[@name = $partName]" /></xsl:call-template>
            <xsl:if test="position() != last()">, </xsl:if>
        </xsl:for-each>
        <xsl:text> });
</xsl:text>
    </xsl:template>

    <xsl:template match="relation" mode="relation">
        <xsl:variable name="sourceTable" select="ancestor::table" />
        <xsl:variable name="targetName" select="@table" />
        <xsl:variable name="targetSchema" select="@schema" />
        <xsl:variable name="targetTable" select="/sql/table[@name = $targetName and @schema = $targetSchema]" />
        <xsl:variable name="principalName" select="@row" />
        <xsl:text>        modelBuilder.Entity&lt;</xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="$sourceTable/@name" /><xsl:with-param name="node" select="$sourceTable" /></xsl:call-template>
        <xsl:text>&gt;().HasOne&lt;</xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="$targetName" /><xsl:with-param name="node" select="$targetTable" /></xsl:call-template>
        <xsl:text>&gt;().WithMany().HasForeignKey(e =&gt; e.</xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="../@name" /><xsl:with-param name="node" select=".." /></xsl:call-template>
        <xsl:text>).HasPrincipalKey(p =&gt; p.</xsl:text>
        <xsl:call-template name="identifier"><xsl:with-param name="name" select="$principalName" /><xsl:with-param name="node" select="$targetTable/row[@name = $principalName]" /></xsl:call-template>
        <xsl:text>);
</xsl:text>
    </xsl:template>

    <xsl:template name="csharp-string">
        <xsl:param name="value"/>
        <xsl:choose>
        <xsl:when test="string-length($value)&gt;100">
            <xsl:variable name="middle" select="floor(string-length($value) div 2)"/>
            <xsl:call-template name="csharp-string"><xsl:with-param name="value" select="substring($value,1,$middle)"/></xsl:call-template>
            <xsl:call-template name="csharp-string"><xsl:with-param name="value" select="substring($value,$middle + 1)"/></xsl:call-template>
        </xsl:when>
        <xsl:when test="string-length($value)&gt;0">
            <xsl:variable name="char" select="substring($value,1,1)"/>
            <xsl:choose>
                <xsl:when test="$char='\'"><xsl:text>\\</xsl:text></xsl:when>
                <xsl:when test="$char='&quot;'"><xsl:text>\&quot;</xsl:text></xsl:when>
                <xsl:when test="$char='&#13;'"><xsl:text>\r</xsl:text></xsl:when>
                <xsl:when test="$char='&#10;'"><xsl:text>\n</xsl:text></xsl:when>
                <xsl:when test="$char='&#9;'"><xsl:text>\t</xsl:text></xsl:when>
                <xsl:when test="$char='&#133;'"><xsl:text>\u0085</xsl:text></xsl:when>
                <xsl:when test="$char='&#8232;'"><xsl:text>\u2028</xsl:text></xsl:when>
                <xsl:when test="$char='&#8233;'"><xsl:text>\u2029</xsl:text></xsl:when>
                <xsl:otherwise><xsl:value-of select="$char"/></xsl:otherwise>
            </xsl:choose>
            <xsl:call-template name="csharp-string"><xsl:with-param name="value" select="substring($value,2)"/></xsl:call-template>
        </xsl:when>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="identifier">
        <xsl:param name="name" />
        <xsl:param name="node" select="/.." />
        <xsl:variable name="base">
            <xsl:call-template name="identifier-base"><xsl:with-param name="name" select="$name" /></xsl:call-template>
        </xsl:variable>
        <xsl:variable name="contextIdentifier">
            <xsl:call-template name="identifier-base"><xsl:with-param name="name" select="$context" /></xsl:call-template>
        </xsl:variable>
        <xsl:value-of select="string($base)" />
        <xsl:if test="count($node) &gt; 0 and (name($node) = 'table' or name($node) = 'row')">
            <xsl:variable name="collisionCount">
                <xsl:choose>
                    <xsl:when test="name($node) = 'table'"><xsl:call-template name="identifier-collision-count"><xsl:with-param name="nodes" select="$node/preceding-sibling::table" /><xsl:with-param name="identifier" select="string($base)" /></xsl:call-template></xsl:when>
                    <xsl:otherwise><xsl:call-template name="identifier-collision-count"><xsl:with-param name="nodes" select="$node/preceding-sibling::row" /><xsl:with-param name="identifier" select="string($base)" /></xsl:call-template></xsl:otherwise>
                </xsl:choose>
            </xsl:variable>
            <xsl:variable name="reservedContextCount"><xsl:choose><xsl:when test="name($node) = 'table' and string($base) = string($contextIdentifier)">1</xsl:when><xsl:otherwise>0</xsl:otherwise></xsl:choose></xsl:variable>
            <xsl:if test="number($collisionCount) + number($reservedContextCount) &gt; 0"><xsl:text>_</xsl:text><xsl:value-of select="number($collisionCount) + number($reservedContextCount) + 1" /></xsl:if>
        </xsl:if>
    </xsl:template>

    <xsl:template name="identifier-base">
        <xsl:param name="name" />
        <xsl:variable name="sanitized"><xsl:call-template name="sanitize-identifier"><xsl:with-param name="name" select="normalize-space($name)" /></xsl:call-template></xsl:variable>
        <xsl:choose>
            <xsl:when test="$sanitized = 'abstract' or $sanitized = 'as' or $sanitized = 'base' or $sanitized = 'bool' or $sanitized = 'break' or $sanitized = 'byte' or $sanitized = 'case' or $sanitized = 'catch' or $sanitized = 'char' or $sanitized = 'checked' or $sanitized = 'class' or $sanitized = 'const' or $sanitized = 'continue' or $sanitized = 'decimal' or $sanitized = 'default' or $sanitized = 'delegate' or $sanitized = 'do' or $sanitized = 'double' or $sanitized = 'else' or $sanitized = 'enum' or $sanitized = 'event' or $sanitized = 'explicit' or $sanitized = 'extern' or $sanitized = 'false' or $sanitized = 'finally' or $sanitized = 'fixed' or $sanitized = 'float' or $sanitized = 'for' or $sanitized = 'foreach' or $sanitized = 'goto' or $sanitized = 'if' or $sanitized = 'implicit' or $sanitized = 'in' or $sanitized = 'int' or $sanitized = 'interface' or $sanitized = 'internal' or $sanitized = 'is' or $sanitized = 'lock' or $sanitized = 'long' or $sanitized = 'namespace' or $sanitized = 'new' or $sanitized = 'null' or $sanitized = 'object' or $sanitized = 'operator' or $sanitized = 'out' or $sanitized = 'override' or $sanitized = 'params' or $sanitized = 'private' or $sanitized = 'protected' or $sanitized = 'public' or $sanitized = 'readonly' or $sanitized = 'ref' or $sanitized = 'return' or $sanitized = 'sbyte' or $sanitized = 'sealed' or $sanitized = 'short' or $sanitized = 'sizeof' or $sanitized = 'stackalloc' or $sanitized = 'static' or $sanitized = 'string' or $sanitized = 'struct' or $sanitized = 'switch' or $sanitized = 'this' or $sanitized = 'throw' or $sanitized = 'true' or $sanitized = 'try' or $sanitized = 'typeof' or $sanitized = 'uint' or $sanitized = 'ulong' or $sanitized = 'unchecked' or $sanitized = 'unsafe' or $sanitized = 'ushort' or $sanitized = 'using' or $sanitized = 'virtual' or $sanitized = 'void' or $sanitized = 'volatile' or $sanitized = 'while'">
                <xsl:text>@</xsl:text><xsl:value-of select="$sanitized" />
            </xsl:when>
            <xsl:when test="string-length(string($sanitized)) = 0">Unnamed</xsl:when>
            <xsl:otherwise>
                <xsl:if test="contains('0123456789', substring(string($sanitized), 1, 1))">_</xsl:if>
                <xsl:value-of select="string($sanitized)" />
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="identifier-collision-count">
        <xsl:param name="nodes" />
        <xsl:param name="identifier" />
        <xsl:choose>
            <xsl:when test="count($nodes) = 0">0</xsl:when>
            <xsl:otherwise>
                <xsl:variable name="candidate"><xsl:call-template name="identifier-base"><xsl:with-param name="name" select="$nodes[1]/@name" /></xsl:call-template></xsl:variable>
                <xsl:variable name="remaining"><xsl:call-template name="identifier-collision-count"><xsl:with-param name="nodes" select="$nodes[position() &gt; 1]" /><xsl:with-param name="identifier" select="$identifier" /></xsl:call-template></xsl:variable>
                <xsl:choose>
                    <xsl:when test="string($candidate) = $identifier"><xsl:value-of select="number($remaining) + 1" /></xsl:when>
                    <xsl:otherwise><xsl:value-of select="$remaining" /></xsl:otherwise>
                </xsl:choose>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template name="sanitize-identifier">
        <xsl:param name="name" />
        <xsl:if test="string-length($name) &gt; 0">
            <xsl:variable name="character" select="substring($name, 1, 1)" />
            <xsl:choose>
                <xsl:when test="contains('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_0123456789', $character)"><xsl:value-of select="$character" /></xsl:when>
                <xsl:otherwise>_</xsl:otherwise>
            </xsl:choose>
            <xsl:call-template name="sanitize-identifier"><xsl:with-param name="name" select="substring($name, 2)" /></xsl:call-template>
        </xsl:if>
    </xsl:template>
</xsl:stylesheet>

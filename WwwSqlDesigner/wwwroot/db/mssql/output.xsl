<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="text"/>
<xsl:variable name="upper" select="'ABCDEFGHIJKLMNOPQRSTUVWXYZ'"/>
<xsl:variable name="lower" select="'abcdefghijklmnopqrstuvwxyz'"/>

<xsl:template name="replace">
  <xsl:param name="text"/><xsl:param name="find"/><xsl:param name="with"/>
  <xsl:choose>
    <xsl:when test="contains($text,$find)"><xsl:value-of select="substring-before($text,$find)"/><xsl:value-of select="$with"/><xsl:call-template name="replace"><xsl:with-param name="text" select="substring-after($text,$find)"/><xsl:with-param name="find" select="$find"/><xsl:with-param name="with" select="$with"/></xsl:call-template></xsl:when>
    <xsl:otherwise><xsl:value-of select="$text"/></xsl:otherwise>
  </xsl:choose>
</xsl:template>
<xsl:template name="sql-identifier"><xsl:param name="value"/><xsl:text>[</xsl:text><xsl:call-template name="replace"><xsl:with-param name="text" select="$value"/><xsl:with-param name="find" select="']'"/><xsl:with-param name="with" select="']]'"/></xsl:call-template><xsl:text>]</xsl:text></xsl:template>
<xsl:template name="sql-string"><xsl:param name="value"/><xsl:choose><xsl:when test="string-length($value)&gt;100"><xsl:variable name="middle" select="floor(string-length($value) div 2)"/><xsl:call-template name="sql-string"><xsl:with-param name="value" select="substring($value,1,$middle)"/></xsl:call-template><xsl:call-template name="sql-string"><xsl:with-param name="value" select="substring($value,$middle + 1)"/></xsl:call-template></xsl:when><xsl:otherwise><xsl:call-template name="replace"><xsl:with-param name="text" select="$value"/><xsl:with-param name="find" select="&quot;'&quot;"/><xsl:with-param name="with" select="&quot;''&quot;"/></xsl:call-template></xsl:otherwise></xsl:choose></xsl:template>
<xsl:template name="sql-unicode-literal"><xsl:param name="value"/><xsl:text>N'</xsl:text><xsl:call-template name="sql-string"><xsl:with-param name="value" select="$value"/></xsl:call-template><xsl:text>'</xsl:text></xsl:template>
<xsl:template name="qualified"><xsl:param name="schema"/><xsl:param name="name"/><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="$schema"/></xsl:call-template><xsl:text>.</xsl:text><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="$name"/></xsl:call-template></xsl:template>
<xsl:template name="emit-schema">
    <xsl:param name="schema"/>
      <xsl:variable name="identifier"><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="$schema"/></xsl:call-template></xsl:variable>
      <xsl:text>IF SCHEMA_ID(</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="$schema"/></xsl:call-template><xsl:text>) IS NULL EXEC(N'</xsl:text><xsl:call-template name="sql-string"><xsl:with-param name="value" select="concat('CREATE SCHEMA ',string($identifier))"/></xsl:call-template><xsl:text>');
GO

</xsl:text>
</xsl:template>

<xsl:template match="/sql">
  <xsl:for-each select="table">
    <xsl:variable name="schema" select="string(@schema)"/>
    <xsl:variable name="schema-lower" select="translate($schema,$upper,$lower)"/>
    <xsl:if test="$schema!='' and $schema-lower!='dbo' and not(preceding-sibling::table[translate(string(@schema),$upper,$lower)=$schema-lower])">
      <xsl:call-template name="emit-schema"><xsl:with-param name="schema" select="$schema"/></xsl:call-template>
    </xsl:if>
  </xsl:for-each>
  <xsl:for-each select="table">
    <xsl:text>CREATE TABLE </xsl:text><xsl:call-template name="qualified"><xsl:with-param name="schema" select="@schema"/><xsl:with-param name="name" select="@name"/></xsl:call-template><xsl:text> (
</xsl:text>
    <xsl:for-each select="row">
      <xsl:text>  </xsl:text><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="@name"/></xsl:call-template><xsl:text> </xsl:text><xsl:value-of select="datatype"/><xsl:text> </xsl:text>
      <xsl:if test="@null=0"><xsl:text>NOT NULL </xsl:text></xsl:if><xsl:if test="@autoincrement=1"><xsl:text>IDENTITY (1, 1) </xsl:text></xsl:if><xsl:if test="position()!=last() or ../key[@type='PRIMARY' or @type='UNIQUE']"><xsl:text>,</xsl:text></xsl:if><xsl:text>
</xsl:text>
    </xsl:for-each>
    <xsl:for-each select="key[@type='PRIMARY' or @type='UNIQUE']">
      <xsl:text>  </xsl:text><xsl:if test="@name!=''"><xsl:text>CONSTRAINT </xsl:text><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="@name"/></xsl:call-template><xsl:text> </xsl:text></xsl:if>
      <xsl:choose><xsl:when test="@type='PRIMARY'">PRIMARY KEY (</xsl:when><xsl:otherwise>UNIQUE (</xsl:otherwise></xsl:choose>
      <xsl:for-each select="part"><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="."/></xsl:call-template><xsl:if test="position()!=last()">, </xsl:if></xsl:for-each><xsl:text>)</xsl:text><xsl:if test="position()!=last()">,</xsl:if><xsl:text>
</xsl:text>
    </xsl:for-each>
    <xsl:text>) ON [PRIMARY];
GO

</xsl:text>
  </xsl:for-each>
  <xsl:for-each select="table/row/relation">
    <xsl:text>ALTER TABLE </xsl:text><xsl:call-template name="qualified"><xsl:with-param name="schema" select="../../@schema"/><xsl:with-param name="name" select="../../@name"/></xsl:call-template><xsl:text> ADD FOREIGN KEY (</xsl:text><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="../@name"/></xsl:call-template><xsl:text>) REFERENCES </xsl:text><xsl:call-template name="qualified"><xsl:with-param name="schema" select="@schema"/><xsl:with-param name="name" select="@table"/></xsl:call-template><xsl:text> (</xsl:text><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="@row"/></xsl:call-template><xsl:text>);
GO

</xsl:text>
  </xsl:for-each>
  <xsl:for-each select="table/key[@type='INDEX']">
    <xsl:text>CREATE INDEX </xsl:text><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="@name"/></xsl:call-template><xsl:text> ON </xsl:text><xsl:call-template name="qualified"><xsl:with-param name="schema" select="../@schema"/><xsl:with-param name="name" select="../@name"/></xsl:call-template><xsl:text> (</xsl:text><xsl:for-each select="part"><xsl:call-template name="sql-identifier"><xsl:with-param name="value" select="."/></xsl:call-template><xsl:if test="position()!=last()">, </xsl:if></xsl:for-each><xsl:text>);
GO
</xsl:text>
  </xsl:for-each>
  <xsl:for-each select="table[normalize-space(comment)!='']">
    <xsl:text>EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="comment"/></xsl:call-template><xsl:text>, @level0type=N'SCHEMA', @level0name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="@schema"/></xsl:call-template><xsl:text>, @level1type=N'TABLE', @level1name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="@name"/></xsl:call-template><xsl:text>;
GO
</xsl:text>
  </xsl:for-each>
  <xsl:for-each select="table[normalize-space(records-schedule)!='']">
    <xsl:text>EXEC sys.sp_addextendedproperty @name=N'RecordsSchedule', @value=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="records-schedule"/></xsl:call-template><xsl:text>, @level0type=N'SCHEMA', @level0name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="@schema"/></xsl:call-template><xsl:text>, @level1type=N'TABLE', @level1name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="@name"/></xsl:call-template><xsl:text>;
GO
</xsl:text>
  </xsl:for-each>
  <xsl:for-each select="table/row[normalize-space(comment)!='']">
    <xsl:text>EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="comment"/></xsl:call-template><xsl:text>, @level0type=N'SCHEMA', @level0name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="../@schema"/></xsl:call-template><xsl:text>, @level1type=N'TABLE', @level1name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="../@name"/></xsl:call-template><xsl:text>, @level2type=N'COLUMN', @level2name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="@name"/></xsl:call-template><xsl:text>;
GO
</xsl:text>
  </xsl:for-each>
  <xsl:for-each select="table/row[classification]">
    <xsl:text>EXEC sys.sp_addextendedproperty @name=N'DataClassification', @value=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="classification"/></xsl:call-template><xsl:text>, @level0type=N'SCHEMA', @level0name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="../@schema"/></xsl:call-template><xsl:text>, @level1type=N'TABLE', @level1name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="../@name"/></xsl:call-template><xsl:text>, @level2type=N'COLUMN', @level2name=</xsl:text><xsl:call-template name="sql-unicode-literal"><xsl:with-param name="value" select="@name"/></xsl:call-template><xsl:text>;
GO
</xsl:text>
  </xsl:for-each>
</xsl:template>
</xsl:stylesheet>

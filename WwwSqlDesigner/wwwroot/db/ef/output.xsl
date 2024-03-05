<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

	<xsl:output method="text"/>

	<xsl:template match="/datatypes">
		<xsl:text>
using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace ProjectName
{
    public class YourDbContext : DbContext
    {
        // DbSet properties for each table
        </xsl:text>

		<!-- Generate DbSet properties for each table -->
		<xsl:for-each select="table">
			<xsl:text>public DbSet&lt;</xsl:text>
			<xsl:value-of select="@name"/>
			<xsl:text>&gt; </xsl:text>
			<xsl:value-of select="@name"/>
			<xsl:text> { get; set; }</xsl:text>
			<xsl:text>
	}
            </xsl:text>
		</xsl:for-each>

		<xsl:text>    }
}
</xsl:text>
	</xsl:template>
</xsl:stylesheet>

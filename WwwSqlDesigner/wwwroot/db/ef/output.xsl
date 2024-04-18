<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

    <xsl:output method="text"/>

    <!-- Define variables to store data types -->
    <xsl:variable name="datatypes" select="//datatypes/group[@label='EntityFramework']/type"/>

    <!-- Define a template to match the root element -->
    <xsl:template match="/">
        <!-- Start with the namespace and DbContext class -->
        <xsl:text>using System;
using Microsoft.EntityFrameworkCore;

namespace MyApp.Models
{
</xsl:text>
        <!-- Apply templates to process each table -->
        <xsl:apply-templates select="//table"/>
        <!-- Generate DbContext class -->
        <xsl:text>    public class MyDbContext : DbContext
    {
        // DbSet properties for each table
</xsl:text>
        <!-- Generate DbSet properties for each table -->
        <xsl:apply-templates select="//table" mode="dbset"/>
        <xsl:text>        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseSqlServer("YourConnectionStringHere");
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
</xsl:text>
        <!-- Generate Fluent API configurations for relationships -->
        <xsl:apply-templates select="//table/row/relation"/>
        <xsl:text>        }
    }
}
</xsl:text>
    </xsl:template>

    <!-- Define a template to match each table -->
    <xsl:template match="table">
        <!-- Get the table name -->
        <xsl:variable name="tableName" select="@name"/>
        <!-- Start generating the class -->
        <xsl:text>        public class </xsl:text>
        <!-- Append table name to class name to ensure uniqueness -->
        <xsl:value-of select="$tableName"/>
        <xsl:text>
        {
</xsl:text>
        <!-- Apply templates to process each column in the table -->
        <xsl:apply-templates select="row"/>
        <xsl:text>        }
</xsl:text>
    </xsl:template>

    <!-- Define a template to match each column -->
    <xsl:template match="row">
        <!-- Get the data type for the column -->
        <xsl:variable name="columnName" select="@name"/>
        <xsl:variable name="dataType" select="//datatypes/group[@label='EntityFramework']/type[@sql=current()/datatype]"/>
        <!-- Generate property for each column -->
        <xsl:text>            public </xsl:text>
        <xsl:value-of select="$dataType/@label"/>
        <xsl:text> </xsl:text>
        <xsl:value-of select="$columnName"/>
        <xsl:text> { get; set; }
</xsl:text>
    </xsl:template>

    <!-- Define a template to generate DbSet properties -->
    <xsl:template match="table" mode="dbset">
        <xsl:text>        public DbSet&lt;</xsl:text>
        <xsl:value-of select="@name"/>
        <xsl:text>&gt; </xsl:text>
        <xsl:value-of select="@name"/>
        <xsl:text>s { get; set; }
</xsl:text>
    </xsl:template>

    <!-- Define a template to generate Fluent API configurations for relationships -->
    <xsl:template match="relation">
        <xsl:variable name="relatedTable" select="@table"/>
        <xsl:variable name="tableName" select="ancestor::table/@name"/>
        <xsl:variable name="foreignKey" select="@row"/>
        <xsl:text>            modelBuilder.Entity&lt;</xsl:text>
        <xsl:value-of select="$tableName"/>
        <xsl:text>&gt;()</xsl:text>
        <xsl:text>.HasOne(x => x.</xsl:text>
        <xsl:value-of select="$relatedTable"/>
        <xsl:text>).WithMany(y => y.</xsl:text>
        <xsl:value-of select="$relatedTable"/>
        <xsl:text>s)</xsl:text>
        <xsl:text>.HasForeignKey(z => z.</xsl:text>
        <xsl:value-of select="$foreignKey"/>
        <xsl:text>);
</xsl:text>
    </xsl:template>

</xsl:stylesheet>

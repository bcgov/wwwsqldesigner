using System.ComponentModel;
using System.ComponentModel.DataAnnotations;

namespace WwwSqlDesigner.Data
{
    [Description("Table to hold various data models")]
    public partial class DataModel
    {
        [MaxLength(30)]
        [Required]
        [Description("A keyword to identify the data model")]
        public string Keyword { get; set; } = null!;

        [Required]
        [Description("The data model version")]
        public int Version { get; set; }

        [Required]
        [Description("The XML data for the model")]
        public string Data { get; set; } = null!;

        [Required]
        [Description("The date and time when this model was created")]
        public DateTime CreatedAt { get; set; }
    }
}

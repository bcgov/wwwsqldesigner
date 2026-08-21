using System.ComponentModel;
using System.ComponentModel.DataAnnotations;

namespace WwwSqlDesigner.Data
{
    [Description("Table to hold various data models")]
    public partial class DataModel
    {
        public const string UnownedOwnerId = "unowned";

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

        [MaxLength(256)]
        [Required]
        [Description("The owner identifier for the model, or the unowned sentinel")]
        public string OwnerId { get; set; } = UnownedOwnerId;

        [Required]
        [Description("The date and time when this model was created")]
        public DateTime CreatedAt { get; set; }
    }
}

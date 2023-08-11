using System.ComponentModel.DataAnnotations;

namespace WwwSqlDesigner.Data
{
    public partial class DataModel
    {
        [Key]
        [MaxLength(30)]
        [Required]
        public string Keyword { get; set; } = null!;

        [Required]
        public string Data { get; set; } = null!;

        [Required]
        public DateTime CreatedAt { get; set; }
    }
}

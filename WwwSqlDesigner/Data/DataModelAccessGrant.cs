using System.ComponentModel.DataAnnotations;

namespace WwwSqlDesigner.Data
{
    public partial class DataModelAccessGrant
    {
        public int Id { get; set; }

        [MaxLength(256)]
        [Required]
        public string OwnerId { get; set; } = null!;

        [MaxLength(30)]
        [Required]
        public string Keyword { get; set; } = null!;

        [MaxLength(16)]
        [Required]
        public string TargetType { get; set; } = null!;

        [MaxLength(256)]
        [Required]
        public string TargetId { get; set; } = null!;

        [MaxLength(16)]
        [Required]
        public string Permission { get; set; } = "View";
    }
}

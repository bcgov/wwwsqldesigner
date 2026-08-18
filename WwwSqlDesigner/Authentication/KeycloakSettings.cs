namespace WwwSqlDesigner.Authentication
{
    public sealed class KeycloakSettings
    {
        public bool Enabled { get; init; }
        public string? Authority { get; init; }
        public string? ClientId { get; init; }
        public string? ClientSecret { get; init; }

        public bool IsConfigured =>
            Enabled
            && !string.IsNullOrWhiteSpace(Authority)
            && !string.IsNullOrWhiteSpace(ClientId);
    }
}

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
            && !string.IsNullOrWhiteSpace(ClientId)
            && !string.IsNullOrWhiteSpace(ClientSecret);

        public void Validate(bool isDevelopment)
        {
            if (!isDevelopment && !IsConfigured)
            {
                throw new InvalidOperationException(
                    "Keycloak must be configured outside the Development environment.");
            }

            if (Enabled && !IsConfigured)
            {
                throw new InvalidOperationException(
                    "Keycloak is enabled but Authority, ClientId, and ClientSecret must be configured.");
            }
        }
    }
}

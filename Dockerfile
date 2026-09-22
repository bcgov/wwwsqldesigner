# 1. Build Stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["WwwSqlDesigner/WwwSqlDesigner.csproj", "WwwSqlDesigner/"]
RUN dotnet restore "WwwSqlDesigner/WwwSqlDesigner.csproj"

# Copy the rest of the code and build
COPY . .
WORKDIR "/src/WwwSqlDesigner"
RUN dotnet publish "WwwSqlDesigner.csproj" -c Release -o /app/publish /p:UseAppHost=false

# 2. Runtime Stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_HTTP_PORTS=8080

# Run as non-root user (Required for OpenShift)
USER 1001

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "WwwSqlDesigner.dll"]

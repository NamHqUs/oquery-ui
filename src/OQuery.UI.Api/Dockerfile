# See https://aka.ms/customizecontainer to learn how to customize your debug container and how Visual Studio uses this Dockerfile to build your images for faster debugging.

# This stage is used when running from VS in fast mode (Default for Debug configuration)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
COPY ["oquery/data-storage/northstar-demo/", "/oquery/data-storage/northstar-demo/"]
COPY ["oquery/data-storage/unit-test/", "/oquery/data-storage/unit-test/"]
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080


# This stage is used to build the service project
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /workspace
COPY ["src/Directory.Build.props", "src/"]
COPY ["src/Directory.Packages.props", "src/"]
COPY ["src/OQuery.UI.Api/OQuery.UI.Api.csproj", "src/OQuery.UI.Api/"]
COPY ["src/OQuery.UI.Storage.Files/OQuery.UI.Storage.Files.csproj", "src/OQuery.UI.Storage.Files/"]
COPY ["src/OQuery.UI.Abstracts/OQuery.UI.Abstracts.csproj", "src/OQuery.UI.Abstracts/"]
COPY ["oquery/src/OQuery.Sqlite/OQuery.Sqlite.csproj", "oquery/src/OQuery.Sqlite/"]
COPY ["oquery/src/OQuery.SqlServer/OQuery.SqlServer.csproj", "oquery/src/OQuery.SqlServer/"]
COPY ["oquery/src/OQuery.Postgres/OQuery.Postgres.csproj", "oquery/src/OQuery.Postgres/"]
COPY ["src/OQuery.UI.Storage.Postgres/OQuery.UI.Storage.Postgres.csproj", "src/OQuery.UI.Storage.Postgres/"]
COPY ["src/OQuery.UI.SetupTests/OQuery.UI.SetupTests.csproj", "src/OQuery.UI.SetupTests/"]
COPY ["oquery/src/Directory.Build.props", "oquery/src/"]
COPY ["oquery/src/OQuery.Core/OQuery.Core.csproj", "oquery/src/OQuery.Core/"]
COPY ["oquery/src/OQuery.Abstracts/OQuery.Abstracts.csproj", "oquery/src/OQuery.Abstracts/"]
COPY ["oquery/src/OQuery.CockroachDb/OQuery.CockroachDb.csproj", "oquery/src/OQuery.CockroachDb/"]
COPY ["oquery/src/OQuery.MySql/OQuery.MySql.csproj", "oquery/src/OQuery.MySql/"]
COPY ["oquery/src/OQuery.Oracle/OQuery.Oracle.csproj", "oquery/src/OQuery.Oracle/"]
COPY ["oquery/src/OQuery.Db2/OQuery.Db2.csproj", "oquery/src/OQuery.Db2/"]
COPY ["oquery/src/OQuery.Firebird/OQuery.Firebird.csproj", "oquery/src/OQuery.Firebird/"]
COPY ["oquery/src/OQuery.SapHana/OQuery.SapHana.csproj", "oquery/src/OQuery.SapHana/"]
COPY ["oquery/README.md", "oquery/"]
COPY ["oquery/MANUAL.md", "oquery/"]
COPY ["oquery/TECH.md", "oquery/"]
COPY ["oquery/QUERY-MODEL-REFERENCE.md", "oquery/"]
COPY ["oquery/LICENSE", "oquery/"]
RUN dotnet restore "./src/OQuery.UI.Api/OQuery.UI.Api.csproj"
COPY ["src/", "src/"]
COPY ["oquery/src/", "oquery/src/"]
COPY ["oquery/src/OQuery.Abstracts/", "oquery/src/OQuery.Abstracts/"]
WORKDIR "/workspace/src/OQuery.UI.Api"
RUN dotnet build "./OQuery.UI.Api.csproj" -c $BUILD_CONFIGURATION -o /app/build

# This stage is used to publish the service project to be copied to the final stage
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./OQuery.UI.Api.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# This stage is used in production or when running from VS in regular mode (Default when not using the Debug configuration)
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "OQuery.UI.Api.dll"]
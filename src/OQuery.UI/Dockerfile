# See https://aka.ms/customizecontainer to learn how to customize your debug container and how Visual Studio uses this Dockerfile to build your images for faster debugging.

# This stage is used when running from VS in fast mode (Default for Debug configuration)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
COPY ["scripts/", "/scripts/"]
COPY ["oquery/data-storage/queries/", "/app/BuiltinQueries/"]
EXPOSE 8080


# This stage is used to build the service project
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /workspace
COPY ["src/Directory.Build.props", "src/"]
COPY ["src/OQuery.UI/OQuery.UI.csproj", "src/OQuery.UI/"]
COPY ["src/Demo.Services/Demo.Services.csproj", "src/Demo.Services/"]
COPY ["src/Demo.Contracts/Demo.Contracts.csproj", "src/Demo.Contracts/"]
COPY ["src/Demo.DbServices/Demo.DbServices.csproj", "src/Demo.DbServices/"]
COPY ["src/Demo.Share/Demo.Share.csproj", "src/Demo.Share/"]
COPY ["src/Demo.Repositories/Demo.Repositories.csproj", "src/Demo.Repositories/"]
COPY ["oquery/src/Directory.Build.props", "oquery/src/"]
COPY ["oquery/src/OQuery/OQuery.csproj", "oquery/src/OQuery/"]
COPY ["oquery/README.md", "oquery/"]
COPY ["oquery/MANUAL.md", "oquery/"]
COPY ["oquery/TECH.md", "oquery/"]
COPY ["oquery/QUERY-MODEL-REFERENCE.md", "oquery/"]
COPY ["oquery/LICENSE", "oquery/"]
RUN dotnet restore "./src/OQuery.UI/OQuery.UI.csproj"
COPY ["src/", "src/"]
COPY ["oquery/src/OQuery/", "oquery/src/OQuery/"]
COPY ["oquery/data-storage/queries/", "oquery/data-storage/queries/"]
COPY ["scripts/", "scripts/"]
WORKDIR "/workspace/src/OQuery.UI"
RUN dotnet build "./OQuery.UI.csproj" -c $BUILD_CONFIGURATION -o /app/build

# This stage is used to publish the service project to be copied to the final stage
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./OQuery.UI.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# This stage is used in production or when running from VS in regular mode (Default when not using the Debug configuration)
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
COPY --from=build /workspace/scripts /scripts
ENTRYPOINT ["dotnet", "OQuery.UI.dll"]
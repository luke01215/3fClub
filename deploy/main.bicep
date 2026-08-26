// 3F Club - Azure infrastructure
//
// Provisions the whole hosting footprint: a Linux App Service on B1, a burstable
// Postgres Flexible Server, and a storage account for member documents and photos.
//
// Deploy:
//   az group create -n rg-3fclub -l eastus
//   az deployment group create -g rg-3fclub -f deploy/main.bicep -p deploy/main.parameters.json
//
// NOTE: this template has not been validated against a live subscription.
// Run `az bicep build -f deploy/main.bicep` and a what-if before the first real deploy.

@description('Short name used to build every resource name. Lowercase letters and numbers.')
@minLength(3)
@maxLength(12)
param appName string = '3fclub'

@description('Region for all resources. Keep the database in the same region as the app.')
param location string = resourceGroup().location

@description('Administrator login for the Postgres server.')
param dbAdminUser string = 'clubadmin'

@description('Administrator password for the Postgres server. Supply at deploy time; never commit it.')
@secure()
param dbAdminPassword string

@description('App Service plan size. B1 is the smallest tier that supports Always On and free managed TLS certificates.')
@allowed(['B1', 'B2', 'S1', 'P0v3'])
param appServiceSku string = 'B1'

@description('Postgres compute size. B1ms is the burstable entry tier and is ample for this workload.')
param dbSku string = 'Standard_B1ms'

@description('Postgres storage in GB.')
@allowed([32, 64, 128])
param dbStorageGb int = 32

// Deterministic, globally-unique-ish suffix so storage account names do not collide.
var suffix = uniqueString(resourceGroup().id)
var planName = 'plan-${appName}'
var siteName = 'app-${appName}'
var dbServerName = 'psql-${appName}-${suffix}'
var dbName = 'clubdb'
var storageName = toLower('st${appName}${substring(suffix, 0, 8)}')

// ---------------------------------------------------------------------------
// Storage - member documents, meeting minutes, photos
// ---------------------------------------------------------------------------

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // Private by default. Member-only documents are served through signed URLs,
    // never through a guessable public path.
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'media'
  properties: {
    publicAccess: 'None'
  }
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'documents'
  properties: {
    publicAccess: 'None'
  }
}

// ---------------------------------------------------------------------------
// Postgres - members, dues, applications, sign-ins, orders, scores
// ---------------------------------------------------------------------------

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: dbServerName
  location: location
  sku: {
    name: dbSku
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: dbStorageGb
    }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: dbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// App Service outbound IPs are not static on B1, so allow Azure-internal traffic.
// Tighten this to a VNet integration if the club ever needs stricter isolation.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------------------
// App Service
// ---------------------------------------------------------------------------

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: appServiceSku
  }
  kind: 'linux'
  properties: {
    // Required for Linux plans.
    reserved: true
  }
}

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: siteName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      // Next.js standalone output writes server.js next to the app root.
      appCommandLine: 'node server.js'
      // Without this the app unloads after 20 minutes idle, and on a site this
      // quiet almost every visitor would pay a cold start.
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/api/health'
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          // Build during deployment rather than committing node_modules.
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'DATABASE_URL'
          value: 'postgresql://${dbAdminUser}:${dbAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'
        }
        {
          name: 'AZURE_STORAGE_ACCOUNT'
          value: storage.name
        }
        {
          name: 'AZURE_STORAGE_CONTAINER_MEDIA'
          value: 'media'
        }
        {
          name: 'AZURE_STORAGE_CONTAINER_DOCUMENTS'
          value: 'documents'
        }
      ]
    }
  }
  dependsOn: [
    database
  ]
}

// Let the web app reach blob storage with its managed identity instead of a key.
var blobDataContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)

resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, site.id, blobDataContributor)
  properties: {
    roleDefinitionId: blobDataContributor
    principalId: site.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output siteName string = site.name
output siteHostname string = site.properties.defaultHostName
output siteUrl string = 'https://${site.properties.defaultHostName}'
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output storageAccount string = storage.name

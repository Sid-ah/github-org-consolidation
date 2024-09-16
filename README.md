# GitHub Organization Consolidation Script

This script automates the consolidation of multiple GitHub organizations into a single target organization. It transfers repositories, migrates teams and permissions, invites members, migrates webhooks, updates repository settings, verifies the migration, and decommissions the source organizations.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Script Overview](#script-overview)
- [License](#license)

## Prerequisites

- **Node.js**: Ensure you have Node.js installed. Download it from [Node.js Official Website](https://nodejs.org/).
- **GitHub Personal Access Token (PAT)**: Generate a PAT with the following scopes:
  - `repo` (Full control of private repositories)
  - `admin:org` (Read and write access to organization membership)
  - `admin:org_hook` (Manage organization webhooks)
  - `admin:repo_hook` (Manage repository webhooks)
  - `user` (Read and write access to profile info)

## Installation

1. **Clone the Repository**: Clone this repository or copy the `index.js` script into a new directory.

2. **Initialize a Node.js Project**:

   ```bash
   npm init -y
   ```

3. **Install Dependencies**:

   ```bash
   npm install @octokit/rest @octokit/plugin-throttling @octokit/plugin-retry dotenv
   ```

## Configuration

1. **Create a `.env` File**: In the root directory, create a `.env` file to store environment variables.

   ```env
   GITHUB_TOKEN=your_personal_access_token_here
   SOURCE_ORGS=source-org-1,source-org-2
   TARGET_ORG=target-org
   REPO_TOPICS=topic1,topic2
   ```

   - Replace `your_personal_access_token_here` with your GitHub PAT.
   - Replace `source-org-1,source-org-2` with a comma-separated list of your source organizations.
   - Replace `target-org` with the name of your target organization.
   - Replace `topic1,topic2` with repository topics you want to set (optional).

2. **Ensure PAT Scopes**: Verify that your GitHub PAT includes all the necessary scopes mentioned in the [Prerequisites](#prerequisites).

## Usage

Run the script using Node.js:

```bash
node index.js
```

The script will perform the following steps in order:

1. **Transfer Repositories**: Transfers all repositories from the source organizations to the target organization.
2. **Migrate Teams and Permissions**: Migrates teams, team members, and repository permissions to the target organization.
3. **Invite Members**: Invites all unique members from the source organizations to the target organization.
4. **Migrate Webhooks**: Migrates organization and repository webhooks to the target organization.
5. **Update Repository Settings**: Updates repository topics and branch protection rules in the target organization.
6. **Verify Migration**: Verifies that all repositories and teams have been successfully migrated.
7. **Decommission Source Organizations**: Removes members and archives repositories in the source organizations.

**Note**: Each step is executed sequentially, and progress is logged to the console.

## Script Overview

The script consists of several asynchronous functions:

- **Initialization**: Sets up Octokit with throttling and retry plugins to handle API rate limits and retries.
- **`transferRepositories()`**: Transfers repositories from source organizations to the target organization.
- **`migrateTeamsAndPermissions()`**: Migrates teams, members, and repository permissions.
- **`inviteMembers()`**: Invites users to the target organization.
- **`migrateWebhooks()`**: Migrates organization and repository webhooks.
- **`updateRepositorySettings()`**: Updates repository topics and branch protection rules.
- **`verifyMigration()`**: Verifies that repositories and teams are present in the target organization.
- **`decommissionSourceOrgs()`**: Removes members and archives repositories in the source organizations.
- **`main()`**: Executes all functions in sequence using `await` to ensure proper execution flow.

## License

This script is provided "as is" without warranty of any kind.

---

**Please make sure to test the script in a safe environment before running it in a production setting. Always backup important data and ensure compliance with your organization's policies.**
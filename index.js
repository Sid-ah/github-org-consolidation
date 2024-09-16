require('dotenv').config();
const { Octokit } = require("@octokit/rest");
const { throttling } = require("@octokit/plugin-throttling");
const { retry } = require("@octokit/plugin-retry");

// Extend Octokit with plugins
const MyOctokit = Octokit.plugin(throttling, retry);

// Initialize Octokit instance with throttling and retry options
const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,
  request: {
    retries: 3, // Number of retries on error
    retryAfter: 3, // Wait time before retrying
  },
  throttle: {
    onRateLimit: (retryAfter, options, octokitInstance, retryCount) => {
      console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);

      if (retryCount < 3) {
        console.log(`Retrying after ${retryAfter} seconds!`);
        return true; // Retry request
      } else {
        return false; // Do not retry
      }
    },
    onAbuseLimit: (retryAfter, options, octokitInstance) => {
      // Does not retry, only logs a warning
      console.warn(`Abuse detected for request ${options.method} ${options.url}`);
    },
  },
});

const sourceOrgs = process.env.SOURCE_ORGS.split(',');
const targetOrg = process.env.TARGET_ORG;
const repoTopics = process.env.REPO_TOPICS ? process.env.REPO_TOPICS.split(',') : [];

async function transferRepositories() {
  try {
    for (const org of sourceOrgs) {
      let repos = await octokit.paginate(octokit.repos.listForOrg, {
        org,
        type: 'all',
        per_page: 100,
      });

      for (const repo of repos) {
        // Transfer repository
        try {
          await octokit.repos.transfer({
            owner: org,
            repo: repo.name,
            new_owner: targetOrg,
          });
          console.log(`Transferred repository ${repo.full_name} to ${targetOrg}`);
        } catch (error) {
          console.error(`Failed to transfer ${repo.full_name}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error transferring repositories: ${error.message}`);
  }
}

async function migrateTeamsAndPermissions() {
  try {
    for (const org of sourceOrgs) {
      // List teams in the source organization
      let teams = await octokit.paginate(octokit.teams.list, {
        org,
        per_page: 100,
      });

      for (const team of teams) {
        // Create team in target organization
        try {
          const newTeam = await octokit.teams.create({
            org: targetOrg,
            name: team.name,
            description: team.description,
            privacy: team.privacy,
          });
          console.log(`Created team ${team.name} in ${targetOrg}`);

          // Add members to the new team
          let members = await octokit.paginate(octokit.teams.listMembersInOrg, {
            org,
            team_slug: team.slug,
            per_page: 100,
          });

          for (const member of members) {
            await octokit.teams.addOrUpdateMembershipForUserInOrg({
              org: targetOrg,
              team_slug: newTeam.data.slug,
              username: member.login,
              role: 'member',
            });
            console.log(`Added ${member.login} to team ${team.name}`);
          }

          // Get repositories the team has access to
          let teamRepos = await octokit.paginate(octokit.teams.listReposInOrg, {
            org,
            team_slug: team.slug,
            per_page: 100,
          });

          for (const repo of teamRepos) {
            // Add repository to the team in the target organization
            await octokit.teams.addOrUpdateRepoPermissionsInOrg({
              org: targetOrg,
              team_slug: newTeam.data.slug,
              owner: targetOrg,
              repo: repo.name,
              permission: repo.permissions.admin
                ? 'admin'
                : repo.permissions.push
                ? 'push'
                : 'pull',
            });
            console.log(`Granted ${team.name} access to repository ${repo.name}`);
          }
        } catch (error) {
          console.error(`Failed to create team ${team.name}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error migrating teams and permissions: ${error.message}`);
  }
}

async function inviteMembers() {
  try {
    let allMembersSet = new Set();

    for (const org of sourceOrgs) {
      let members = await octokit.paginate(octokit.orgs.listMembers, {
        org,
        per_page: 100,
      });

      for (const member of members) {
        allMembersSet.add(member.login);
      }
    }

    for (const username of allMembersSet) {
      try {
        await octokit.orgs.setMembershipForUser({
          org: targetOrg,
          username,
          role: 'member',
        });
        console.log(`Invited ${username} to ${targetOrg}`);
      } catch (error) {
        console.error(`Failed to invite ${username}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`Error inviting members: ${error.message}`);
  }
}

async function migrateWebhooks() {
  try {
    for (const org of sourceOrgs) {
      // Migrate organization webhooks
      let orgHooks = await octokit.paginate(octokit.orgs.listWebhooks, {
        org,
        per_page: 100,
      });

      for (const hook of orgHooks) {
        try {
          await octokit.orgs.createWebhook({
            org: targetOrg,
            name: hook.name,
            config: hook.config,
            events: hook.events,
            active: hook.active,
          });
          console.log(`Created organization webhook ${hook.name}`);
        } catch (error) {
          console.error(`Failed to create org webhook ${hook.name}: ${error.message}`);
        }
      }

      // Migrate repository webhooks
      let repos = await octokit.paginate(octokit.repos.listForOrg, {
        org,
        per_page: 100,
      });

      for (const repo of repos) {
        // Get webhooks from the source repository
        let hooks = await octokit.paginate(octokit.repos.listWebhooks, {
          owner: org,
          repo: repo.name,
          per_page: 100,
        });

        for (const hook of hooks) {
          try {
            await octokit.repos.createWebhook({
              owner: targetOrg,
              repo: repo.name,
              config: hook.config,
              events: hook.events,
              active: hook.active,
            });
            console.log(`Created webhook ${hook.name} in repository ${repo.name}`);
          } catch (error) {
            console.error(`Failed to create webhook ${hook.name} in ${repo.name}: ${error.message}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error migrating webhooks: ${error.message}`);
  }
}

async function updateRepositorySettings() {
  try {
    let repos = await octokit.paginate(octokit.repos.listForOrg, {
      org: targetOrg,
      per_page: 100,
    });

    for (const repo of repos) {
      try {
        if (repoTopics.length > 0) {
          // Update topics
          await octokit.repos.replaceAllTopics({
            owner: targetOrg,
            repo: repo.name,
            names: repoTopics,
          });
        }

        // Update branch protection
        await octokit.repos.updateBranchProtection({
          owner: targetOrg,
          repo: repo.name,
          branch: repo.default_branch,
          required_status_checks: null,
          enforce_admins: true,
          required_pull_request_reviews: {
            dismiss_stale_reviews: true,
            require_code_owner_reviews: true,
            required_approving_review_count: 2,
          },
          restrictions: null,
        });

        console.log(`Updated settings for repository ${repo.name}`);
      } catch (error) {
        console.error(`Failed to update settings for ${repo.name}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`Error updating repository settings: ${error.message}`);
  }
}

async function verifyMigration() {
  try {
    // Collect expected repositories from source organizations
    let expectedReposSet = new Set();

    for (const org of sourceOrgs) {
      let repos = await octokit.paginate(octokit.repos.listForOrg, {
        org,
        per_page: 100,
      });
      for (const repo of repos) {
        expectedReposSet.add(repo.name);
      }
    }
    let expectedRepos = Array.from(expectedReposSet);

    // Collect expected teams from source organizations
    let expectedTeamsSet = new Set();

    for (const org of sourceOrgs) {
      let teams = await octokit.paginate(octokit.teams.list, {
        org,
        per_page: 100,
      });
      for (const team of teams) {
        expectedTeamsSet.add(team.name);
      }
    }
    let expectedTeams = Array.from(expectedTeamsSet);

    // Verify Repositories
    let actualRepos = await octokit.paginate(octokit.repos.listForOrg, {
      org: targetOrg,
      per_page: 100,
    });

    let actualRepoNames = actualRepos.map(repo => repo.name);
    let missingRepos = expectedRepos.filter(repo => !actualRepoNames.includes(repo));

    if (missingRepos.length > 0) {
      console.warn(`Missing repositories: ${missingRepos.join(', ')}`);
    } else {
      console.log('All repositories are present.');
    }

    // Verify Teams
    let actualTeams = await octokit.paginate(octokit.teams.list, {
      org: targetOrg,
      per_page: 100,
    });

    let actualTeamNames = actualTeams.map(team => team.name);
    let missingTeams = expectedTeams.filter(team => !actualTeamNames.includes(team));

    if (missingTeams.length > 0) {
      console.warn(`Missing teams: ${missingTeams.join(', ')}`);
    } else {
      console.log('All teams are present.');
    }
  } catch (error) {
    console.error(`Error verifying migration: ${error.message}`);
  }
}

async function decommissionSourceOrgs() {
  try {
    for (const org of sourceOrgs) {
      // Remove Members
      let members = await octokit.paginate(octokit.orgs.listMembers, {
        org,
        per_page: 100,
      });

      for (const member of members) {
        try {
          await octokit.orgs.removeMember({
            org,
            username: member.login,
          });
          console.log(`Removed ${member.login} from ${org}`);
        } catch (error) {
          console.error(`Failed to remove ${member.login} from ${org}: ${error.message}`);
        }
      }

      // Archive Repositories
      let repos = await octokit.paginate(octokit.repos.listForOrg, {
        org,
        per_page: 100,
      });

      for (const repo of repos) {
        try {
          // Archive the repository
          await octokit.repos.update({
            owner: org,
            repo: repo.name,
            archived: true,
          });
          console.log(`Archived repository ${repo.name} in ${org}`);
        } catch (error) {
          console.error(`Failed to archive ${repo.name}: ${error.message}`);
        }
      }

      // Notify about manual deletion
      console.log(`Organization ${org} is ready for deletion. Please proceed manually if desired.`);
    }
  } catch (error) {
    console.error(`Error decommissioning source organizations: ${error.message}`);
  }
}

async function main() {
  await transferRepositories();
  await migrateTeamsAndPermissions();
  await inviteMembers();
  await migrateWebhooks();
  await updateRepositorySettings();
  await verifyMigration();
  await decommissionSourceOrgs();
}

main();

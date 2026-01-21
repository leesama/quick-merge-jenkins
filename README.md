# Quick Merge Jenkins

A config-driven VSCode helper for test deployments and demand branch workflows. Reads `.quick-merge.jsonc` from the project root for optional settings.

[![GitHub](https://img.shields.io/badge/GitHub-leesama%2Fquick--merge--jenkins-blue?logo=github)](https://github.com/leesama/quick-merge-jenkins)

[中文说明](README.zh-CN.md)

## Recommended Workflow

This tool is designed around the typical development workflow. Here's a step-by-step guide:

### Step 1: Initialize Config

When using for the first time, click the **Quick Merge Jenkins** icon in the sidebar. If the project is not configured:

- **Create base config**: Generate a `.quick-merge.jsonc` config template in the project root. Customize Jenkins URL, branch settings, etc. as needed.

### Step 2: Start a New Demand

When you receive a new requirement, create a demand branch:

- **Create Demand Branch**: Select type (feature/fix), enter a Chinese description, auto-translate to English and create a new branch from the latest release branch
  - Auto-translation uses DeepSeek API, requires `deepseekApiKey` in config
  - Example: Enter "用户登录优化" → Creates branch `feature_user_login_optimization_20260116`

### Step 3: Develop & Commit

During development, use this button to commit code:

- **Commit changes**: Select files to commit first, then confirm/edit the commit message (defaults to the demand description)

### Step 4: Deploy to Test

After development, deploy to the test environment:

- **Merge to test**: Fetch the latest remote updates, then merge current branch into the target test branch and push (no Jenkins)
- **Deploy to test**: Auto-merge current branch to target test branch (configurable, default `pre-test`) and trigger Jenkins build
  - Shows merge result (commit, changed files, duration)
  - Shows Jenkins trigger result

#### Conflict Handling

If conflicts occur during merge:

- The tool lists all conflict files
- Click a conflict file to open VS Code's built-in merge editor
- After resolving, continue pushing, or click to return to original branch

### Step 5: Squash Commits

After testing passes, optionally clean up commit history before release:

- **Squash commits**: Defaults to selecting recent commits with the same prefix on current branch. Manually adjust selection range, then confirm to squash into one commit for a clean history.

### Step 6: Deploy to Production

When ready to release:

- **Deploy to prod**: Create today's release branch from the latest release branch (prefix configurable, e.g., `release`, `hotfix`). Supports multi-select for both release branches and demand branches to merge.

Or complete squash and deploy in one step:

- **Squash & deploy to prod**: First squash commits, then create release branch and merge current branch

---

## Additional Notes

> Run `Quick Merge Jenkins: Open Config File` from the Command Palette to quickly open the config file.

---

## Config File Format

Project root: `.quick-merge.jsonc` (supports comments)

Example:

```jsonc
{
  // Demand branch settings (created from latest release_YYYYMMDD branch)
  "demandBranch": {
    // Demand type list
    "types": [
      // prefix: branch prefix, commitPrefix: commit message prefix
      { "prefix": "feature", "commitPrefix": "feat" },
      { "prefix": "fix", "commitPrefix": "fix" }
    ],
    // Base branch prefix for matching (default: release)
    "releasePrefix": "release",
    // DeepSeek API key for auto-translation
    "deepseekApiKey": "",
    // DeepSeek API base URL
    "deepseekBaseUrl": "https://api.deepseek.com/v1",
    // DeepSeek model name
    "deepseekModel": "deepseek-chat"
  },
  // Commit settings
  "commit": {
    // Push after commit (default: true)
    "pushAfterCommit": true
  },
  // Deploy to test environment config (targetBranch is also used by Merge to test)
  "deployToTest": {
    // Target branch for merge (default: pre-test)
    "targetBranch": "pre-test",
    // Jenkins trigger config (required for deploy to test)
    "jenkins": {
      // Jenkins base URL (without /job/...)
      "url": "https://jenkins.example.com",
      // Job path in folder/jobName format
      "job": "team/release/deploy-test",
      // Jenkins username
      "user": "jenkins-user",
      // Jenkins API token
      "apiToken": "jenkins-api-token",
      // Enable CSRF crumb (set true if Jenkins has CSRF enabled)
      "crumb": true,
      // Build parameters (supports variables)
      "parameters": {
        "BRANCH": "${currentBranch}",
        "COMMIT": "${headCommit}",
        "ENV": "${deployEnv}"
      }
    }
  },
  // Deploy to production config (create today's branch from latest prefix branch)
  "deployToProd": {
    // Branch prefix list for production releases
    "prodPrefix": ["release", "hotfix"]
  }
}
```

### Field Reference

- `demandBranch`: Demand branch settings (optional)
- Demand branches are created from the latest `releasePrefix_YYYYMMDD` branch (remote preferred); if none found, prompts to select a branch as base
  - `types`: Demand type list (optional, defaults to feature/fix)
    - `prefix`: Branch prefix
    - `commitPrefix`: Commit message prefix (defaults to `prefix`)
  - `releasePrefix`: Base branch prefix for matching (default `release`, also used for prod branch creation)
  - `deepseekApiKey`: DeepSeek API key (can be stored in config)
  - `deepseekBaseUrl`: DeepSeek API base URL (default `https://api.deepseek.com/v1`)
  - `deepseekModel`: DeepSeek model name (default `deepseek-chat`)
- `deployToTest`: Test branch config (optional)
  - `targetBranch`: Merge target branch (default `pre-test`, used by Merge to test too)
  - `jenkins`: Jenkins trigger config (required for Deploy to test)
- `commit`: Commit config (optional)
  - `pushAfterCommit`: Push after commit (default `true`)
- `deployToProd`: Deploy-to-prod config (optional)
  - `prodPrefix`: Branch prefix list (e.g., `release`, `hotfix`); clicking deploy shows the latest branch per prefix for multi-select

### Jenkins Config

- `url`: Jenkins base URL (without `/job/...`)
- `job`: Job path in `folder/jobName` format
- `user` + `apiToken`: Jenkins user auth (recommended, API token at `http://192.168.1.169:8080/user/admin/security/`)
- `crumb`: Set `true` when CSRF is enabled
- `parameters`: Supports variables:
  - `${currentBranch}` `${sourceBranch}` `${targetBranch}` `${mergeCommit}` `${headCommit}` `${deployEnv}`
- `url`, `user`, `apiToken` can be omitted if set in VS Code settings

## Troubleshooting

- Jenkins Crumb 403: Verify `user` + `apiToken` are correct, or set `crumb` to `false`
- Push failed: Check repo permissions and remote settings

## Demand Branch Settings

Config file `demandBranch` takes precedence; you can also set fallback values in VS Code settings:

- `quick-merge-jenkins.deepseekApiKey`: DeepSeek API key
- `quick-merge-jenkins.deepseekBaseUrl`: API base URL (default `https://api.deepseek.com/v1`)
- `quick-merge-jenkins.deepseekModel`: Model name (default `deepseek-chat`)

## Jenkins Settings

You can set global Jenkins defaults in VS Code settings:

- `quick-merge-jenkins.jenkinsUrl`: Jenkins base URL
- `quick-merge-jenkins.jenkinsUser`: Jenkins username
- `quick-merge-jenkins.jenkinsApiToken`: Jenkins API token

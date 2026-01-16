# Quick Merge Jenkins

Config-driven VSCode helper for test deployments and demand branch workflows. It reads `.quick-merge.jsonc` from the project root for optional settings.

[中文说明](README.zh-CN.md)

## Features

- Deploy to test: merge current branch into target and trigger Jenkins
- Conflict handling: list conflict files, open merge editor, return to original branch
- Result details: merge summary (commit, changed files, duration), push + Jenkins status
- Demand branch creation: choose feature/fix + Chinese description, auto-translate and create a branch
- Commit changes: reuse the demand message for quick commits
- Squash commits: squash recent commits with the same base message

## Usage

1. Open the project folder, click the **Quick Merge Jenkins** icon in the sidebar
2. Click "Create base config" to generate `.quick-merge.jsonc` if needed
3. Click "Deploy to test" or "Create Demand Branch" (and other buttons as needed)
4. If you need to adjust settings, open the config file and update it

> Note: Config is read dynamically when running deploy/test or demand-branch actions. Refresh only updates the sidebar state; there is no automatic file watching.
> You can also run `Quick Merge Jenkins: Open Config File` from the Command Palette.

## Config File

Project root: `.quick-merge.jsonc` (comments supported, legacy `.quick-merge.json` also works)

Example:

```jsonc
{
  // Demand branch settings (created from latest release_YYYYMMDD branch)
  "demandBranch": {
    "types": [
      { "prefix": "feature", "commitPrefix": "feat" },
      { "prefix": "fix", "commitPrefix": "fix" }
    ],
    "releasePrefix": "release",
    "deepseekApiKey": "",
    "deepseekBaseUrl": "https://api.deepseek.com/v1",
    "deepseekModel": "deepseek-chat"
  },
  // Deploy to test environment
  "deployToTest": {
    "targetBranch": "pre-test",
    "jenkins": {
      "url": "https://jenkins.example.com",
      "job": "team/release/deploy-test",
      "user": "jenkins-user",
      "apiToken": "jenkins-api-token",
      "crumb": true,
      "parameters": {
        "BRANCH": "${currentBranch}",
        "COMMIT": "${headCommit}",
        "ENV": "${deployEnv}"
      }
    }
  }
}
```

### Field Reference

- `demandBranch`: demand branch settings (optional)
  - demand branches are created from the latest `releasePrefix_YYYYMMDD` branch (remote preferred); if none, pick a branch
  - `types`: demand type list (optional, defaults to feature/fix)
    - `prefix`: branch prefix
    - `commitPrefix`: commit message prefix (defaults to `prefix`)
  - `releasePrefix`: base branch prefix (default `release`)
  - `deepseekApiKey`: DeepSeek API key (can be stored in config)
  - `deepseekBaseUrl`: DeepSeek API base URL (default `https://api.deepseek.com/v1`)
  - `deepseekModel`: DeepSeek model name (default `deepseek-chat`)
- `deployToTest`: deploy-to-test button config (optional)
  - `targetBranch`: merge target branch (default `pre-test`)
  - `jenkins`: Jenkins trigger config

### Jenkins Config

- `url`: Jenkins base URL (no `/job/...`)
- `job`: job path in `folder/jobName` form
- Auth (choose one):
  - `user` + `apiToken` (recommended)
  - `token` (enable "Trigger builds remotely" in job config)
- `crumb`: set `true` when CSRF is enabled
- `parameters`: supports variables:
  - `${currentBranch}` `${sourceBranch}` `${targetBranch}` `${mergeCommit}` `${headCommit}` `${deployEnv}`

## Troubleshooting

- Jenkins Crumb 403: verify `user` + `apiToken`, or set `crumb` to `false`
- Push failed: check repo permissions and remote settings

## Demand Branch Settings

`demandBranch` in the config file takes precedence; you can also set fallback values in VS Code settings:

- `quick-merge.deepseekApiKey`: DeepSeek API key
- `quick-merge.deepseekBaseUrl`: API base URL (default `https://api.deepseek.com/v1`)
- `quick-merge.deepseekModel`: model name (default `deepseek-chat`)

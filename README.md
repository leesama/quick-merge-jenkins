# Quick Merge Jenkins

Config-driven VSCode merge helper. It reads `.quick-merge.jsonc` from the project root, executes the merge flow via buttons, and can trigger Jenkins after a successful merge.

[中文说明](README.zh-CN.md)

## Features

- One-click merge: `checkout target` -> `merge source` -> checkout back
- Conflict handling: list conflict files, open merge editor, return to original branch
- Result details: merge summary (commit, changed files, duration), push + Jenkins status
- Multiple profiles: define multiple merge buttons per project
- Jenkins trigger: optional Jenkins build trigger (configured in file, not UI)
- Deploy to test: optional Jenkins-driven test environment deployment
- Demand branch creation: choose feature/fix + Chinese description, auto-translate and create a branch

## Usage

1. Open the project folder, click the **Quick Merge Jenkins** icon in the sidebar
2. Click the refresh icon to load profiles; if no config exists, it will be created and opened
3. Edit the config, then click the refresh icon again to reload
4. Click a profile button to run the merge
5. Click "Create Demand Branch", pick a type and input a Chinese description to create a branch

> Note: The config is always read dynamically when executing a merge. Refresh is optional and only serves to visually update the button list in the sidebar—it does not affect actual config reading. For performance reasons, automatic file watching is not currently implemented.
> You can also run `Quick Merge Jenkins: Open Config File` from the Command Palette.

## Config File

Project root: `.quick-merge.jsonc` (comments supported, legacy `.quick-merge.json` also works)

Example:

```jsonc
{
  // UI labels
  "ui": {
    "refreshLabel": "⟳"
  },
  // Demand branch settings (created from latest release_YYYYMMDD branch)
  "demandBranch": {
    "prefixes": ["feature", "fix"],
    "releasePrefix": "release",
    "deepseekApiKey": "",
    "deepseekBaseUrl": "https://api.deepseek.com/v1",
    "deepseekModel": "deepseek-chat"
  },
  // Deploy to test environment button
  "deployToTest": {
    "enabled": true,
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
  },
  "profiles": [
    {
      "id": "merge-main",
      "label": {
        "zh": "合并到 main",
        "en": "Merge to main"
      },
      "sourceBranch": "",
      "targetBranch": "main",
      "strategy": "default",
      "pushAfterMerge": true,
      "pushRemote": "origin",
      "jenkins": {
        "enabled": true,
        "url": "https://jenkins.example.com",
        "job": "team/release/build",
        "user": "jenkins-user",
        "apiToken": "jenkins-api-token",
        "crumb": true,
        "parameters": {
          "SOURCE_BRANCH": "${sourceBranch}",
          "TARGET_BRANCH": "${targetBranch}",
          "MERGE_COMMIT": "${mergeCommit}"
        }
      }
    },
    {
      "id": "merge-release",
      "label": {
        "zh": "合并到 release",
        "en": "Merge to release"
      },
      "sourceBranch": "",
      "targetBranch": "release",
      "strategy": "no-ff",
      "pushAfterMerge": false
    }
  ]
}
```

### Field Reference

- `ui.refreshLabel`: refresh button label (optional, supports `{ "zh": "...", "en": "..." }`)
- `demandBranch`: demand branch settings (optional)
  - demand branches are created from the latest `releasePrefix_YYYYMMDD` branch (remote preferred); if none, pick a branch
  - `prefixes`: branch prefixes (default `["feature", "fix"]`)
  - `releasePrefix`: base branch prefix (default `release`)
  - `deepseekApiKey`: DeepSeek API key (can be stored in config)
  - `deepseekBaseUrl`: DeepSeek API base URL (default `https://api.deepseek.com/v1`)
  - `deepseekModel`: DeepSeek model name (default `deepseek-chat`)
- `profiles`: list of merge profiles (required)
  - `id`: profile key
  - `label`: button label (supports `{ "zh": "...", "en": "..." }`)
  - `sourceBranch`: source branch, defaults to current branch when empty
  - `targetBranch`: target branch (required)
  - `strategy`: `default` / `no-ff` / `ff-only`
  - `pushAfterMerge`: push to remote (default `true`)
  - `pushRemote`: remote name (default `origin`, or first remote)
  - `jenkins`: Jenkins trigger config (optional)
- `deployToTest`: deploy-to-test button config (optional)
  - `enabled`: enable deploy button (default `true` if omitted)
  - `label`: button label is built-in and not configurable
  - `jenkins`: Jenkins trigger config

### Jenkins Config

- `url`: Jenkins base URL (no `/job/...`)
- `job`: job path in `folder/jobName` form
- Auth (choose one):
  - `user` + `apiToken` (recommended)
  - `token` (enable "Trigger builds remotely" in job config)
- `crumb`: set `true` when CSRF is enabled
- `parameters`: supports variables:
  - `${sourceBranch}` `${targetBranch}` `${currentBranch}` `${mergeCommit}` `${strategy}` `${pushRemote}`
- Deploy-to-test parameters also support:
  - `${currentBranch}` `${headCommit}` `${deployEnv}` (defaults to `test`)

## Troubleshooting

- Jenkins Crumb 403: verify `user` + `apiToken`, or set `crumb` to `false`
- Push failed: check `pushRemote` and repo permissions

## Demand Branch Settings

`demandBranch` in the config file takes precedence; you can also set fallback values in VS Code settings:

- `quick-merge.deepseekApiKey`: DeepSeek API key
- `quick-merge.deepseekBaseUrl`: API base URL (default `https://api.deepseek.com/v1`)
- `quick-merge.deepseekModel`: model name (default `deepseek-chat`)

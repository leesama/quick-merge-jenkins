# Quick Merge Jenkins

Config-driven VSCode merge helper. It reads `.quick-merge.json` from the project root, executes the merge flow via buttons, and can trigger Jenkins after a successful merge.

[中文说明](README.zh-CN.md)

## Features

- One-click merge: `checkout target` -> `merge source` -> checkout back
- Conflict handling: list conflict files, open merge editor, return to original branch
- Result details: merge summary (commit, changed files, duration), push + Jenkins status
- Multiple profiles: define multiple merge buttons per project
- Jenkins trigger: optional Jenkins build trigger (configured in file, not UI)

## Usage

1. Open the project folder, click the **Quick Merge Jenkins** icon in the sidebar
2. Click "Open Config" to generate `.quick-merge.json`
3. Edit the config, then click "Refresh Config" to load profiles
4. Click a profile button to run the merge

> Note: config is only loaded when you click "Refresh Config".

## Config File

Project root: `.quick-merge.json`

Example:

```json
{
  "ui": {
    "refreshLabel": "Refresh Config",
    "openConfigLabel": "Open Config"
  },
  "profiles": [
    {
      "id": "merge-main",
      "label": "Merge to main",
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
      "label": "Merge to release",
      "sourceBranch": "",
      "targetBranch": "release",
      "strategy": "no-ff",
      "pushAfterMerge": false
    }
  ]
}
```

### Field Reference

- `ui.refreshLabel` / `ui.openConfigLabel`: button labels (optional)
- `profiles`: list of merge profiles (required)
  - `id`: profile key
  - `label`: button label
  - `sourceBranch`: source branch, defaults to current branch when empty
  - `targetBranch`: target branch (required)
  - `strategy`: `default` / `no-ff` / `ff-only`
  - `pushAfterMerge`: push to remote (default `true`)
  - `pushRemote`: remote name (default `origin`, or first remote)
  - `jenkins`: Jenkins trigger config (optional)

### Jenkins Config

- `url`: Jenkins base URL (no `/job/...`)
- `job`: job path in `folder/jobName` form
- Auth (choose one):
  - `user` + `apiToken` (recommended)
  - `token` (enable "Trigger builds remotely" in job config)
- `crumb`: set `true` when CSRF is enabled
- `parameters`: supports variables:
  - `${sourceBranch}` `${targetBranch}` `${currentBranch}` `${mergeCommit}` `${strategy}` `${pushRemote}`

## Troubleshooting

- Jenkins Crumb 403: verify `user` + `apiToken`, or set `crumb` to `false`
- Push failed: check `pushRemote` and repo permissions

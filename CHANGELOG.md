# Changelog

## 2.1.1

- Add a production deploy button with safer confirmation flow and date checks.
- Support `deployToProd.prodPrefix` as strings or objects with per-prefix Jenkins config.
- Default production deploy to open Jenkins only; add `autoDeploy` and `branchParamName` for auto-triggering.
- Auto-inject branch parameters for prod deploys and normalize remote branch refs.
- Unify Jenkins fallback settings via VS Code global config; remove prod-specific settings.
- Enforce continuous selection from latest commit in squash UI.
- Update docs and default config to reflect new prod deploy behavior.

## 2.1.0

- Open production Jenkins page after prod merge actions using new prod Jenkins config.
- Add production Jenkins page settings: `deployToProd.jenkins` and VS Code settings `jenkinsProdUrl`/`jenkinsProdJob`.
- Refresh production merge button labels and related copy to clarify behavior.

## 2.0.10

- Improve documentation for global configuration (VS Code Settings) in README.

## 2.0.9

- Add "Merge to test" action to sync remote, merge into test branch, and push without Jenkins.

## 2.0.7

- Support auto-push to remote after commit. Set `pushAfterCommit` to `false` to disable this feature.

## 2.0.3

- Update commit flow to select files before entering the commit message.

## 1.0.3

- Add release scripts: `release:patch`, `release:minor`, `release:major`.
- Update refresh action copy.

## 1.0.0

- Initial stable release.
- Configuration-driven merge flow and conflict handling.
- Multiple config buttons and Jenkins trigger.

## 0.0.1

- Initial release.
- Configuration-driven merge flow and conflict handling.
- Support multiple config buttons and Jenkins trigger.

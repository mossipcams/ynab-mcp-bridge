# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.2...ynab-mcp-bridge-v0.3.3) (2026-03-11)


### Bug Fixes

* harden streamable HTTP remote probing ([#10](https://github.com/mossipcams/ynab-mcp-bridge/issues/10)) ([b797b08](https://github.com/mossipcams/ynab-mcp-bridge/commit/b797b08f8b947665b997539b250089a15fbfb571))

## [0.3.2](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.1...ynab-mcp-bridge-v0.3.2) (2026-03-11)


### Bug Fixes

* remove standalone health endpoint ([#8](https://github.com/mossipcams/ynab-mcp-bridge/issues/8)) ([da45bc3](https://github.com/mossipcams/ynab-mcp-bridge/commit/da45bc33a9538c848fe79ae7e96b7c6676c57927))

## [0.3.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.0...ynab-mcp-bridge-v0.3.1) (2026-03-11)


### Bug Fixes

* harden plan resolution and HTTP reset flow ([#6](https://github.com/mossipcams/ynab-mcp-bridge/issues/6)) ([7c4b104](https://github.com/mossipcams/ynab-mcp-bridge/commit/7c4b1043e352fdb4f211af33635340ec2c02c6ea))

## [0.3.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.2.0...ynab-mcp-bridge-v0.3.0) (2026-03-10)


### Features

* release expanded read-only YNAB tools ([#5](https://github.com/mossipcams/ynab-mcp-bridge/issues/5)) ([4c5136a](https://github.com/mossipcams/ynab-mcp-bridge/commit/4c5136abdeadd3092e3292dba270da918cc20e56))


### Bug Fixes

* enforce releasable PR titles for release automation ([a008efa](https://github.com/mossipcams/ynab-mcp-bridge/commit/a008efae5a6273116edbba7afd5844de6e68379b))

## [0.2.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.1.2...ynab-mcp-bridge-v0.2.0) (2026-03-10)


### Features

* add tools for bulk approving, deleting, updating transactions, and retrieving payees and transactions; enhance CLAUDE.md with git best practices ([78206ba](https://github.com/mossipcams/ynab-mcp-bridge/commit/78206ba1b0a3b6ace1bcbc26112ae7a0ca097864))
* add tools for listing categories, accounts, scheduled transactions, months, and importing transactions; implement corresponding tests ([f8c2b8e](https://github.com/mossipcams/ynab-mcp-bridge/commit/f8c2b8e4b6750b872bdb1108d5064ce4592bbfde))
* implement error handling utility and update tools to use getErrorMessage for consistent error reporting ([3c60d89](https://github.com/mossipcams/ynab-mcp-bridge/commit/3c60d89e1a8468865622e474ddddcdd667725ffd))

## [0.1.2] - 2024-03-26

### Added
- New `ApproveTransaction` tool for approving existing transactions in YNAB
  - Can approve/unapprove transactions by ID
  - Works in conjunction with GetUnapprovedTransactions tool
  - Preserves existing transaction data when updating approval status
- Added Cursor rules for YNAB API development
  - New `.cursor/rules/ynabapi.mdc` file
  - Provides guidance for working with YNAB types and API endpoints
  - Helps maintain consistency in tool development

### Changed
- Updated project structure documentation to include `.cursor/rules` directory
- Enhanced README with documentation for the new ApproveTransaction tool

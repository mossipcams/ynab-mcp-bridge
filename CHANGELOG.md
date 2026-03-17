# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.4](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.7.3...ynab-mcp-bridge-v0.7.4) (2026-03-17)


### Bug Fixes

* accept mcp bootstrap posts without json content type ([#78](https://github.com/mossipcams/ynab-mcp-bridge/issues/78)) ([772c9f1](https://github.com/mossipcams/ynab-mcp-bridge/commit/772c9f1ffdb4cf3198486b287c4123ce16225661))

## [0.7.3](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.7.2...ynab-mcp-bridge-v0.7.3) (2026-03-17)


### Bug Fixes

* align oauth discovery metadata and add auth debug logs ([#76](https://github.com/mossipcams/ynab-mcp-bridge/issues/76)) ([239a1d4](https://github.com/mossipcams/ynab-mcp-bridge/commit/239a1d4464519d09cd4949110853e758bc762c6e))

## [0.7.2](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.7.1...ynab-mcp-bridge-v0.7.2) (2026-03-17)


### Bug Fixes

* accept Cloudflare Access JWT assertions on MCP requests ([#74](https://github.com/mossipcams/ynab-mcp-bridge/issues/74)) ([fb55838](https://github.com/mossipcams/ynab-mcp-bridge/commit/fb55838bf5f29543e206b6a998ca3d11ba6a4c9d))

## [0.7.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.7.0...ynab-mcp-bridge-v0.7.1) (2026-03-17)


### Bug Fixes

* support ChatGPT OAuth discovery metadata ([#72](https://github.com/mossipcams/ynab-mcp-bridge/issues/72)) ([434e944](https://github.com/mossipcams/ynab-mcp-bridge/commit/434e944c24d5c47b616bdf67418c92346843e29f))

## [0.7.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.5...ynab-mcp-bridge-v0.7.0) (2026-03-17)


### Features

* isolate oauth provider client and discovery fallback ([#68](https://github.com/mossipcams/ynab-mcp-bridge/issues/68)) ([c7ff598](https://github.com/mossipcams/ynab-mcp-bridge/commit/c7ff598fb6496f5f9f938d7c8f0eb74df44de5a4))
* use pipe-delimited format for tool output ([#71](https://github.com/mossipcams/ynab-mcp-bridge/issues/71)) ([919586e](https://github.com/mossipcams/ynab-mcp-bridge/commit/919586e29d2997bb644b115cf9d5bea628533c17))


### Bug Fixes

* accept safari mobile discovery posts without json headers ([#60](https://github.com/mossipcams/ynab-mcp-bridge/issues/60)) ([0bfb686](https://github.com/mossipcams/ynab-mcp-bridge/commit/0bfb6865796fafefea4187a828d1818f09ceb5d5))
* add path-aware oauth discovery metadata aliases ([#64](https://github.com/mossipcams/ynab-mcp-bridge/issues/64)) ([32852b2](https://github.com/mossipcams/ynab-mcp-bridge/commit/32852b237fc97e2ee2aa99f03eb15f80772e6d19))
* advertise oauth delete support in MCP preflight ([#58](https://github.com/mossipcams/ynab-mcp-bridge/issues/58)) ([ef6019e](https://github.com/mossipcams/ynab-mcp-bridge/commit/ef6019e16d817948426d549619e660bc7882b877))
* deepen MCP token usage optimization ([#70](https://github.com/mossipcams/ynab-mcp-bridge/issues/70)) ([f7c77a8](https://github.com/mossipcams/ynab-mcp-bridge/commit/f7c77a8ac77da36f3d71544ee5250a9f24ae7fd3))
* expose openid discovery metadata alias ([#62](https://github.com/mossipcams/ynab-mcp-bridge/issues/62)) ([4171e46](https://github.com/mossipcams/ynab-mcp-bridge/commit/4171e46a3f8ad2c50d4f6d677620c2b14bc520c2))
* reduce MCP token usage ([#69](https://github.com/mossipcams/ynab-mcp-bridge/issues/69)) ([8f43a39](https://github.com/mossipcams/ynab-mcp-bridge/commit/8f43a394de5221e57d48ed18e34c6a55904d4589))


### Reverts

* roll back to v0.6.5 pre-refactor baseline ([#66](https://github.com/mossipcams/ynab-mcp-bridge/issues/66)) ([b16df49](https://github.com/mossipcams/ynab-mcp-bridge/commit/b16df498407c79197b520db508c93b7af6a6aaee))

## [0.6.5](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.4...ynab-mcp-bridge-v0.6.5) (2026-03-16)


### Bug Fixes

* harden MCP OAuth setup boundaries ([#55](https://github.com/mossipcams/ynab-mcp-bridge/issues/55)) ([9db85f1](https://github.com/mossipcams/ynab-mcp-bridge/commit/9db85f1a8e59402ef3a8e77a515e3b332657724a))

## [0.6.4](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.3...ynab-mcp-bridge-v0.6.4) (2026-03-16)


### Bug Fixes

* harden Claude OAuth consent redirects ([#53](https://github.com/mossipcams/ynab-mcp-bridge/issues/53)) ([3d2d236](https://github.com/mossipcams/ynab-mcp-bridge/commit/3d2d236adceacab823ac4bf36a5a60d186016d3a))

## [0.6.3](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.2...ynab-mcp-bridge-v0.6.3) (2026-03-16)


### Bug Fixes

* support Claude OAuth SSE sessions and mixed auth ([#51](https://github.com/mossipcams/ynab-mcp-bridge/issues/51)) ([ca0c145](https://github.com/mossipcams/ynab-mcp-bridge/commit/ca0c14510767efab5589b9c8749c1041459088d9))

## [0.6.2](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.1...ynab-mcp-bridge-v0.6.2) (2026-03-16)


### Bug Fixes

* harden oauth popup consent flow ([#49](https://github.com/mossipcams/ynab-mcp-bridge/issues/49)) ([554ba13](https://github.com/mossipcams/ynab-mcp-bridge/commit/554ba130784cea2893907cf19a5cfc9af078275d))

## [0.6.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.0...ynab-mcp-bridge-v0.6.1) (2026-03-16)


### Bug Fixes

* allow popup oauth consent origins ([#47](https://github.com/mossipcams/ynab-mcp-bridge/issues/47)) ([37e00be](https://github.com/mossipcams/ynab-mcp-bridge/commit/37e00be837ded5ffd1ab36877b70e27e8c58af53))

## [0.6.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.5.0...ynab-mcp-bridge-v0.6.0) (2026-03-16)


### Features

* add AI-friendly finance summary tools ([#45](https://github.com/mossipcams/ynab-mcp-bridge/issues/45)) ([baaa1a8](https://github.com/mossipcams/ynab-mcp-bridge/commit/baaa1a84df7ed4fed7a46ef7dc7e58bfb7f26abe))
* simplify oauth bridge setup ([#44](https://github.com/mossipcams/ynab-mcp-bridge/issues/44)) ([56b7e64](https://github.com/mossipcams/ynab-mcp-bridge/commit/56b7e6447ad9d839dbef62c2eff7e08a9ffbbee9))

## [0.5.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.4.0...ynab-mcp-bridge-v0.5.0) (2026-03-14)


### Features

* broker Cloudflare OAuth for Claude web ([#42](https://github.com/mossipcams/ynab-mcp-bridge/issues/42)) ([404294d](https://github.com/mossipcams/ynab-mcp-bridge/commit/404294dd83dccf1273074449f3bd3056c3743e64))

## [0.4.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.15...ynab-mcp-bridge-v0.4.0) (2026-03-13)


### Features

* add optional MCP OAuth mode for Cloudflare deployments ([#40](https://github.com/mossipcams/ynab-mcp-bridge/issues/40)) ([037c99b](https://github.com/mossipcams/ynab-mcp-bridge/commit/037c99bcf4df903cbda85f45755432e4dd52d83d))

## [0.3.15](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.14...ynab-mcp-bridge-v0.3.15) (2026-03-13)


### Bug Fixes

* address 4 architectural issues ([#37](https://github.com/mossipcams/ynab-mcp-bridge/issues/37)) ([1a376af](https://github.com/mossipcams/ynab-mcp-bridge/commit/1a376affb62679150355659af702b9916972876d))

## [0.3.14](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.13...ynab-mcp-bridge-v0.3.14) (2026-03-12)


### Bug Fixes

* harden HTTP middleware and config wiring ([#35](https://github.com/mossipcams/ynab-mcp-bridge/issues/35)) ([19129a5](https://github.com/mossipcams/ynab-mcp-bridge/commit/19129a51e377ef48c5d6b594a01935ecd2e1e972))

## [0.3.13](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.12...ynab-mcp-bridge-v0.3.13) (2026-03-12)


### Bug Fixes

* centralize runtime config and require explicit config ([#32](https://github.com/mossipcams/ynab-mcp-bridge/issues/32)) ([f22d1f8](https://github.com/mossipcams/ynab-mcp-bridge/commit/f22d1f8d25c62473b2b31dd2afc631b612f1b0b3))

## [0.3.12](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.11...ynab-mcp-bridge-v0.3.12) (2026-03-12)


### Bug Fixes

* centralize runtime config and harden HTTP defaults ([#29](https://github.com/mossipcams/ynab-mcp-bridge/issues/29)) ([ca2acf7](https://github.com/mossipcams/ynab-mcp-bridge/commit/ca2acf7d1afb542012b1c2044036423d478871c7))

## [0.3.11](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.10...ynab-mcp-bridge-v0.3.11) (2026-03-12)


### Bug Fixes

* default HTTP transport to stateless mode ([#27](https://github.com/mossipcams/ynab-mcp-bridge/issues/27)) ([d5fd42e](https://github.com/mossipcams/ynab-mcp-bridge/commit/d5fd42e8503110fc2db7430516ea65f25afe9a40))

## [0.3.10](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.9...ynab-mcp-bridge-v0.3.10) (2026-03-11)


### Bug Fixes

* log JSON-RPC methods in MCP HTTP handoff ([#25](https://github.com/mossipcams/ynab-mcp-bridge/issues/25)) ([960407b](https://github.com/mossipcams/ynab-mcp-bridge/commit/960407bbe2b66dfb219cc3f69be06bb4fcbb3976))

## [0.3.9](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.8...ynab-mcp-bridge-v0.3.9) (2026-03-11)


### Bug Fixes

* harden MCP HTTP transport and add debug logging ([#22](https://github.com/mossipcams/ynab-mcp-bridge/issues/22)) ([73b2f46](https://github.com/mossipcams/ynab-mcp-bridge/commit/73b2f46e30bde9778d7b2fa1bbff48791c2fbdcc))

## [0.3.8](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.7...ynab-mcp-bridge-v0.3.8) (2026-03-11)


### Bug Fixes

* replace custom MCP HTTP wrapper ([#20](https://github.com/mossipcams/ynab-mcp-bridge/issues/20)) ([bad29a0](https://github.com/mossipcams/ynab-mcp-bridge/commit/bad29a0b3e3ebd7c0c71e075cba6fcf1da33e57e))

## [0.3.7](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.6...ynab-mcp-bridge-v0.3.7) (2026-03-11)


### Bug Fixes

* default runtime to http ([#18](https://github.com/mossipcams/ynab-mcp-bridge/issues/18)) ([163f10d](https://github.com/mossipcams/ynab-mcp-bridge/commit/163f10da607884a057cc8038d23f2ea0477e764c))

## [0.3.6](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.5...ynab-mcp-bridge-v0.3.6) (2026-03-11)


### Bug Fixes

* harden authless HTTP transport flow ([#16](https://github.com/mossipcams/ynab-mcp-bridge/issues/16)) ([6f5fcf9](https://github.com/mossipcams/ynab-mcp-bridge/commit/6f5fcf903590645a2f7624887482625fc3b6e407))

## [0.3.5](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.4...ynab-mcp-bridge-v0.3.5) (2026-03-11)


### Bug Fixes

* return 405 for authless GET streamable HTTP probes ([#14](https://github.com/mossipcams/ynab-mcp-bridge/issues/14)) ([0e25d6e](https://github.com/mossipcams/ynab-mcp-bridge/commit/0e25d6e64d0f9addc9f0c8230fdccbb8a3d61651))

## [0.3.4](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.3.3...ynab-mcp-bridge-v0.3.4) (2026-03-11)


### Bug Fixes

* remove oauth probe metadata from authless HTTP server ([#12](https://github.com/mossipcams/ynab-mcp-bridge/issues/12)) ([fcaad35](https://github.com/mossipcams/ynab-mcp-bridge/commit/fcaad35ce3b150e9fdd01a37cc036ba421b70f95))

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

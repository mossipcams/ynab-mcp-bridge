# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.15.23](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.22...ynab-mcp-bridge-v0.15.23) (2026-04-01)


### Bug Fixes

* align auth2 oauth flow and trim bootstrap payloads ([429c770](https://github.com/mossipcams/ynab-mcp-bridge/commit/429c770baf1587c98fc1781d51cabe070b541291))

## [0.15.22](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.21...ynab-mcp-bridge-v0.15.22) (2026-04-01)


### Bug Fixes

* align auth2 architecture guardrails ([e04e4e2](https://github.com/mossipcams/ynab-mcp-bridge/commit/e04e4e2f2bc109946f79156c935cc9d3419670dc))
* harden release-ready CI checks ([d6ec77f](https://github.com/mossipcams/ynab-mcp-bridge/commit/d6ec77f0d06282a91232db796035ef731d328f35))

## [0.15.21](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.20...ynab-mcp-bridge-v0.15.21) (2026-04-01)


### Bug Fixes

* trim oauth bootstrap discovery payloads ([#238](https://github.com/mossipcams/ynab-mcp-bridge/issues/238)) ([c002887](https://github.com/mossipcams/ynab-mcp-bridge/commit/c0028875707f21746662507416d331bfc52232ee))

## [0.15.20](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.19...ynab-mcp-bridge-v0.15.20) (2026-04-01)


### Bug Fixes

* allow oauth bootstrap without bearer token ([0e15244](https://github.com/mossipcams/ynab-mcp-bridge/commit/0e152448144bdc531a1d76ac0df24dfbb9aef3aa))

## [0.15.19](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.18...ynab-mcp-bridge-v0.15.19) (2026-04-01)


### Bug Fixes

* remove legacy oauth runtime ([7a0144b](https://github.com/mossipcams/ynab-mcp-bridge/commit/7a0144b9a2446a07e48b503691a5e970fd305f09))

## [0.15.18](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.17...ynab-mcp-bridge-v0.15.18) (2026-03-31)


### Bug Fixes

* cut over HTTP OAuth to auth2 single path ([#232](https://github.com/mossipcams/ynab-mcp-bridge/issues/232)) ([4c4ae6a](https://github.com/mossipcams/ynab-mcp-bridge/commit/4c4ae6a8f52713ac112c9432f7acc138b0f9aaf6))

## [0.15.17](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.16...ynab-mcp-bridge-v0.15.17) (2026-03-31)


### Bug Fixes

* clear remaining quality lint errors ([7ca5b6f](https://github.com/mossipcams/ynab-mcp-bridge/commit/7ca5b6f7d28df77e53e70fdcd9ac7aa40e18d5af))
* replace the local oauth flow with auth2 ([5dae945](https://github.com/mossipcams/ynab-mcp-bridge/commit/5dae945fc6748bf41d2648754acaf923ffe1ea0a))
* restore oauth test compatibility ([2382f37](https://github.com/mossipcams/ynab-mcp-bridge/commit/2382f3748d52ce1da53e14913151699446c6a7fb))

## [0.15.16](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.15...ynab-mcp-bridge-v0.15.16) (2026-03-31)


### Bug Fixes

* remove duplicated bootstrap import ([b10e247](https://github.com/mossipcams/ynab-mcp-bridge/commit/b10e2470cfb440a8a8a641e8e4760ac52a85cc00))
* restore oauth bootstrap probe compatibility ([34e735a](https://github.com/mossipcams/ynab-mcp-bridge/commit/34e735a54c66c7c81d3e9fabf40c939d64ab3a23))
* return 405 for unauthenticated mcp probes ([6fdcafc](https://github.com/mossipcams/ynab-mcp-bridge/commit/6fdcafccf91758b69a83ea9dcd7f87d07d2aa918))

## [0.15.15](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.14...ynab-mcp-bridge-v0.15.15) (2026-03-31)


### Bug Fixes

* restore oauth bootstrap compatibility ([#225](https://github.com/mossipcams/ynab-mcp-bridge/issues/225)) ([6c37bea](https://github.com/mossipcams/ynab-mcp-bridge/commit/6c37beab473ce03b18ee0ce3c13b55f965d18207))

## [0.15.14](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.13...ynab-mcp-bridge-v0.15.14) (2026-03-31)


### Bug Fixes

* require oauth for the full mcp surface ([#223](https://github.com/mossipcams/ynab-mcp-bridge/issues/223)) ([d80e8df](https://github.com/mossipcams/ynab-mcp-bridge/commit/d80e8dfc5153f358f0085a0ffcdf21bb1dcc13b4))

## [0.15.13](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.12...ynab-mcp-bridge-v0.15.13) (2026-03-31)


### Bug Fixes

* require auth for Claude discovery bootstrap ([#220](https://github.com/mossipcams/ynab-mcp-bridge/issues/220)) ([5fe8049](https://github.com/mossipcams/ynab-mcp-bridge/commit/5fe8049a7061806958dbdd4a919a4b0878a3647b))

## [0.15.12](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.11...ynab-mcp-bridge-v0.15.12) (2026-03-31)


### Bug Fixes

* allow oauth initialized bootstrap notification ([7840594](https://github.com/mossipcams/ynab-mcp-bridge/commit/7840594dfd351ddf8e46c5e52c4434fa553ab1b3))

## [0.15.11](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.10...ynab-mcp-bridge-v0.15.11) (2026-03-31)


### Bug Fixes

* add upstream oauth exchange logging ([#216](https://github.com/mossipcams/ynab-mcp-bridge/issues/216)) ([7fd9e0f](https://github.com/mossipcams/ynab-mcp-bridge/commit/7fd9e0ff422499eecd78a6a31ebb12da54b84f79))

## [0.15.10](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.9...ynab-mcp-bridge-v0.15.10) (2026-03-31)


### Bug Fixes

* keep oauth bootstrap generic before client detection ([bb3aa47](https://github.com/mossipcams/ynab-mcp-bridge/commit/bb3aa478670ca92d233b0694c2affcdae50fb7ca))

## [0.15.9](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.8...ynab-mcp-bridge-v0.15.9) (2026-03-31)


### Bug Fixes

* allow oauth bootstrap mcp methods without auth ([#213](https://github.com/mossipcams/ynab-mcp-bridge/issues/213)) ([dcb0095](https://github.com/mossipcams/ynab-mcp-bridge/commit/dcb0095da7ce89215fdbf50caec0719795311295))


### Reverts

* roll back Claude OAuth compatibility fixes ([#211](https://github.com/mossipcams/ynab-mcp-bridge/issues/211)) ([3512f72](https://github.com/mossipcams/ynab-mcp-bridge/commit/3512f729b2c6cd622ca8ef6cd980659ea0e4d924))

## [0.15.8](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.7...ynab-mcp-bridge-v0.15.8) (2026-03-30)


### Bug Fixes

* unify mcp oauth auth challenges ([efc8acb](https://github.com/mossipcams/ynab-mcp-bridge/commit/efc8acb8735f64e85c1f175929d6cb8cb3eecf7e))

## [0.15.7](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.6...ynab-mcp-bridge-v0.15.7) (2026-03-30)


### Bug Fixes

* restore oauth request auth typing ([eacc1c0](https://github.com/mossipcams/ynab-mcp-bridge/commit/eacc1c041278e270e142d826dcb828a9ebb8a069))
* send Claude-friendly oauth challenge ([d1eb478](https://github.com/mossipcams/ynab-mcp-bridge/commit/d1eb47821971d70676de35f24dbe7403f48eac77))

## [0.15.6](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.5...ynab-mcp-bridge-v0.15.6) (2026-03-30)


### Bug Fixes

* improve Claude OAuth challenge compatibility ([5a99b3e](https://github.com/mossipcams/ynab-mcp-bridge/commit/5a99b3e288f5960b536af77580ccf39eb2c116fb))
* satisfy oauth runtime lint rules ([4a17a85](https://github.com/mossipcams/ynab-mcp-bridge/commit/4a17a85caaafd33e2699c4d1c6a559775367bd18))

## [0.15.5](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.4...ynab-mcp-bridge-v0.15.5) (2026-03-30)


### Bug Fixes

* return 401 for unauthenticated GET /mcp in OAuth mode ([7261b44](https://github.com/mossipcams/ynab-mcp-bridge/commit/7261b44f43c3ea7a546d3b7ba3255623d1c813a3))
* return 401 for unauthenticated GET /mcp in OAuth mode ([ec26e41](https://github.com/mossipcams/ynab-mcp-bridge/commit/ec26e41e6adecd7111e1b4cc42b5343cb1ed8274))

## [0.15.4](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.3...ynab-mcp-bridge-v0.15.4) (2026-03-28)


### Bug Fixes

* reuse persisted Claude profile on authorize ([896d94a](https://github.com/mossipcams/ynab-mcp-bridge/commit/896d94a227b2d524a4e01d3f051efe51cd08b665))

## [0.15.3](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.2...ynab-mcp-bridge-v0.15.3) (2026-03-28)


### Bug Fixes

* exclude offline_access from MCP resource metadata ([d0c53da](https://github.com/mossipcams/ynab-mcp-bridge/commit/d0c53da3556cd479076e6d890a5642a548a35efe))

## [0.15.2](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.1...ynab-mcp-bridge-v0.15.2) (2026-03-28)


### Bug Fixes

* improve Claude Desktop OAuth compatibility ([#195](https://github.com/mossipcams/ynab-mcp-bridge/issues/195)) ([45fdb63](https://github.com/mossipcams/ynab-mcp-bridge/commit/45fdb63b76af63f10202457308ea7f6fc0a8af8b))

## [0.15.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.15.0...ynab-mcp-bridge-v0.15.1) (2026-03-28)


### Bug Fixes

* harden oauth token exchange and tool-call auth ([5dfb96e](https://github.com/mossipcams/ynab-mcp-bridge/commit/5dfb96e658114bdb68803178ca95b1024c4a6db2))
* harden startup sequencing and summary hot paths ([796b2ee](https://github.com/mossipcams/ynab-mcp-bridge/commit/796b2eecb69936fe0e941a9daf6be54de667cd0b))
* move runtime plan adapter out of tool catalog ([f9c9519](https://github.com/mossipcams/ynab-mcp-bridge/commit/f9c9519646524ddf184ca3ac705a93c65a16be48))
* sync release metadata with published version ([205784d](https://github.com/mossipcams/ynab-mcp-bridge/commit/205784d65b89e1fc98b787a36b578eff2f53fac4))
* tighten architecture guardrails ([f39f98a](https://github.com/mossipcams/ynab-mcp-bridge/commit/f39f98ae7fe82be756fe8480651fd0af1b49629e))
* tighten architecture guardrails ([4763842](https://github.com/mossipcams/ynab-mcp-bridge/commit/47638429d31c07da13628cba694d92780f4a5bf0))

## [0.15.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.11...ynab-mcp-bridge-v0.15.0) (2026-03-27)


### Features

* reduce latency for high-signal summary tools ([#187](https://github.com/mossipcams/ynab-mcp-bridge/issues/187)) ([9a82845](https://github.com/mossipcams/ynab-mcp-bridge/commit/9a828452e7b9964bf5c1b1795851f7f5adc791fc))

## [0.14.11](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.10...ynab-mcp-bridge-v0.14.11) (2026-03-27)


### Bug Fixes

* fast-path authless mcp requests ([31021fc](https://github.com/mossipcams/ynab-mcp-bridge/commit/31021fcdfdeebcfe8cd01cdf0cf5e410f7d81e45))

## [0.14.10](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.9...ynab-mcp-bridge-v0.14.10) (2026-03-27)


### Bug Fixes

* align runtime API typing for HTTP transport ([9f2cfa3](https://github.com/mossipcams/ynab-mcp-bridge/commit/9f2cfa38a3c47b18c06789191445105addf45822))
* drop tracked task docs from repo root ([05080d0](https://github.com/mossipcams/ynab-mcp-bridge/commit/05080d038d7310a7c00a4d542f1d925b51227619))
* optimize mcp transport and ynab read hot paths ([797aa2a](https://github.com/mossipcams/ynab-mcp-bridge/commit/797aa2abb349444ef48365ec54713350ef2a2e9b))
* reduce repeated MCP read-path work ([b8654f6](https://github.com/mossipcams/ynab-mcp-bridge/commit/b8654f604ca385335939ff6104a902e94209860d))
* reduce stateless mcp latency ([16099a0](https://github.com/mossipcams/ynab-mcp-bridge/commit/16099a0c8569c84ce6fc71bf7b8efa17d0368a1f))
* resolve latency PR ci failures ([9532457](https://github.com/mossipcams/ynab-mcp-bridge/commit/9532457d7f33ca232cac4688e78dcdc981db9e60))
* satisfy CI lint gates for read-path cache changes ([ec65421](https://github.com/mossipcams/ynab-mcp-bridge/commit/ec654216637ae24f9b6c487195dcbf3758c8454d))

## [0.14.9](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.8...ynab-mcp-bridge-v0.14.9) (2026-03-27)


### Bug Fixes

* remove tracked repo housekeeping files ([#179](https://github.com/mossipcams/ynab-mcp-bridge/issues/179)) ([db1cc13](https://github.com/mossipcams/ynab-mcp-bridge/commit/db1cc13675ba6c62c65199a7d4adda78c16de206))

## [0.14.8](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.7...ynab-mcp-bridge-v0.14.8) (2026-03-27)


### Bug Fixes

* clarify worktree guidance and add pr lifecycle skill ([725bccf](https://github.com/mossipcams/ynab-mcp-bridge/commit/725bccfe680e6b66c9cacdf7c304c0e12c8e3e6d))

## [0.14.7](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.6...ynab-mcp-bridge-v0.14.7) (2026-03-27)


### Bug Fixes

* enrich strict discovery guidance ([9140a28](https://github.com/mossipcams/ynab-mcp-bridge/commit/9140a288c508f18c5f700435d13a73fd579c161f))

## [0.14.6](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.5...ynab-mcp-bridge-v0.14.6) (2026-03-27)


### Bug Fixes

* add MCP discovery compatibility observability ([#171](https://github.com/mossipcams/ynab-mcp-bridge/issues/171)) ([65c584e](https://github.com/mossipcams/ynab-mcp-bridge/commit/65c584edebd3c17816ceb26d3b268e2d9c4d9462))

## [0.14.5](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.4...ynab-mcp-bridge-v0.14.5) (2026-03-27)


### Bug Fixes

* restore MCP discovery resources ([7407edf](https://github.com/mossipcams/ynab-mcp-bridge/commit/7407edf99b8ad10a0315c47625667c51202d4ea7))

## [0.14.4](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.3...ynab-mcp-bridge-v0.14.4) (2026-03-27)


### Bug Fixes

* finish modular monolith task 12 verification ([b684fec](https://github.com/mossipcams/ynab-mcp-bridge/commit/b684fec79bd32b03cad525e384b4863d6e5a23b4))
* remove stale transaction type import ([c89f42d](https://github.com/mossipcams/ynab-mcp-bridge/commit/c89f42dc2c3a61acd9b725f3c25bf4670e07dab2))
* resolve CI lint and typecheck blockers ([5f77831](https://github.com/mossipcams/ynab-mcp-bridge/commit/5f778318dcbc41bc2257d34d445e33dd91adddd5))
* scope coverage to exercised runtime code ([99b1fc7](https://github.com/mossipcams/ynab-mcp-bridge/commit/99b1fc72afb3e5e1a03e91d510d32079078a46eb))

## [0.14.3](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.2...ynab-mcp-bridge-v0.14.3) (2026-03-26)


### Bug Fixes

* harden oauth and split runtime seams ([#165](https://github.com/mossipcams/ynab-mcp-bridge/issues/165)) ([74dcf81](https://github.com/mossipcams/ynab-mcp-bridge/commit/74dcf81a2bf8044baac9ff539c45e9b80cf46117))

## [0.14.2](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.1...ynab-mcp-bridge-v0.14.2) (2026-03-25)


### Bug Fixes

* reduce duplicate feature and oauth code ([4502450](https://github.com/mossipcams/ynab-mcp-bridge/commit/45024504f8984b17b4685895bc0f922e423cb168))
* reduce duplicate feature and oauth code ([27da691](https://github.com/mossipcams/ynab-mcp-bridge/commit/27da691693be800171d01668994e779de5fd8072))
* resolve duplicate remediation CI regressions ([5d5e3cb](https://github.com/mossipcams/ynab-mcp-bridge/commit/5d5e3cbe6a44fe800f5856c2bb6752bbf5f176a5))

## [0.14.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.14.0...ynab-mcp-bridge-v0.14.1) (2026-03-25)


### Bug Fixes

* add tech debt reporting to ci ([93b1315](https://github.com/mossipcams/ynab-mcp-bridge/commit/93b1315b8bfd7098b2436c7029fbfdcf3b49fd75))
* complete tech debt remediation roadmap ([c6be124](https://github.com/mossipcams/ynab-mcp-bridge/commit/c6be124bccac6cec5566ecca8e1a1f1a6617efce))
* persist oauth client compatibility profiles ([72ab56e](https://github.com/mossipcams/ynab-mcp-bridge/commit/72ab56e882927e463228d57e608c0debf0973d30))
* reduce duplication and overhaul debt reporting ([fddb553](https://github.com/mossipcams/ynab-mcp-bridge/commit/fddb553c004dd3fab3f048d9999930decc166881))
* remove http server lint assertion ([548826b](https://github.com/mossipcams/ynab-mcp-bridge/commit/548826b2b0aba407efe1eb9d5b5ef67c7c58825b))
* widen debt reporting to whole codebase ([59f2437](https://github.com/mossipcams/ynab-mcp-bridge/commit/59f2437679773f891eb9b44df34bc9d651a14174))

## [0.14.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.13.0...ynab-mcp-bridge-v0.14.0) (2026-03-24)


### Features

* add reliability tooling and HTTP session reuse ([#158](https://github.com/mossipcams/ynab-mcp-bridge/issues/158)) ([6f91736](https://github.com/mossipcams/ynab-mcp-bridge/commit/6f9173600426fd2998c125ff8fbc5ede232a1b62))

## [0.13.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.12.1...ynab-mcp-bridge-v0.13.0) (2026-03-24)


### Features

* add finance trajectory and monthly review tools ([#154](https://github.com/mossipcams/ynab-mcp-bridge/issues/154)) ([8965fee](https://github.com/mossipcams/ynab-mcp-bridge/commit/8965fee7c4237baa49a08e76cd30bc1593d22c52))


### Bug Fixes

* correct finance tool calculation semantics ([#156](https://github.com/mossipcams/ynab-mcp-bridge/issues/156)) ([dd7d681](https://github.com/mossipcams/ynab-mcp-bridge/commit/dd7d6810897b98a5b6183ddbe09f88213a9d04f3))
* normalize tool month and projection behavior ([#153](https://github.com/mossipcams/ynab-mcp-bridge/issues/153)) ([07275a7](https://github.com/mossipcams/ynab-mcp-bridge/commit/07275a7c406a7fe606eb5090bbf08f8f799ed42b))
* require PR cleanup for local worktrees ([#157](https://github.com/mossipcams/ynab-mcp-bridge/issues/157)) ([855d204](https://github.com/mossipcams/ynab-mcp-bridge/commit/855d20450ddf0bb514ca457d2c9cb59503e6916c))

## [0.12.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.12.0...ynab-mcp-bridge-v0.12.1) (2026-03-23)


### Bug Fixes

* remove 70/20/10 summary tool ([#149](https://github.com/mossipcams/ynab-mcp-bridge/issues/149)) ([5cfb1da](https://github.com/mossipcams/ynab-mcp-bridge/commit/5cfb1daf98bd07d46b59ee56b3984d7c207ab5ee))

## [0.12.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.11.0...ynab-mcp-bridge-v0.12.0) (2026-03-20)


### Features

* add branded type guardrails ([#145](https://github.com/mossipcams/ynab-mcp-bridge/issues/145)) ([5e844b2](https://github.com/mossipcams/ynab-mcp-bridge/commit/5e844b255b4cfefebdb96331e55f78999b9a8a1a))

## [0.11.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.10.6...ynab-mcp-bridge-v0.11.0) (2026-03-20)


### Features

* complete quality stack and add oxlint pilot ([#147](https://github.com/mossipcams/ynab-mcp-bridge/issues/147)) ([ab4bff4](https://github.com/mossipcams/ynab-mcp-bridge/commit/ab4bff4011fbf2191e896a2940335a3c34e8063f))


### Bug Fixes

* align agent workflow docs with planning and TDD ([#144](https://github.com/mossipcams/ynab-mcp-bridge/issues/144)) ([7938c84](https://github.com/mossipcams/ynab-mcp-bridge/commit/7938c8488571c43ce819729f372121bad7fca507))

## [0.10.6](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.10.5...ynab-mcp-bridge-v0.10.6) (2026-03-19)


### Bug Fixes

* stabilize oauth client profile detection across routes ([#141](https://github.com/mossipcams/ynab-mcp-bridge/issues/141)) ([3d84005](https://github.com/mossipcams/ynab-mcp-bridge/commit/3d84005cc92a3cf63146b8159a8fba7c4f03de6d))
* stop release please validation placeholders ([#143](https://github.com/mossipcams/ynab-mcp-bridge/issues/143)) ([2418b9b](https://github.com/mossipcams/ynab-mcp-bridge/commit/2418b9b325bfbf5d506f76a8a8f5c16205744c2d))

## [0.10.5](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.10.4...ynab-mcp-bridge-v0.10.5) (2026-03-19)


### Bug Fixes

* deduplicate header utilities and consolidate CORS handling ([#137](https://github.com/mossipcams/ynab-mcp-bridge/issues/137)) ([561dad5](https://github.com/mossipcams/ynab-mcp-bridge/commit/561dad5705fdb118612baeb2fe0ba5612b414518))
* fetch tags in release-please smoke CI ([#139](https://github.com/mossipcams/ynab-mcp-bridge/issues/139)) ([bca0515](https://github.com/mossipcams/ynab-mcp-bridge/commit/bca0515c9fb785fb73286c7b3ff42f6cba8b025e))
* restore required checks for release-please PRs ([#140](https://github.com/mossipcams/ynab-mcp-bridge/issues/140)) ([4e11334](https://github.com/mossipcams/ynab-mcp-bridge/commit/4e11334118427295cf07dae2fbd23576f3d18177))
* simplify release-please PR CI ([#138](https://github.com/mossipcams/ynab-mcp-bridge/issues/138)) ([8a6e7e5](https://github.com/mossipcams/ynab-mcp-bridge/commit/8a6e7e5d4f71f98cffca8f6a6c838642e18f1e7e))
* tighten dependency guardrails ([#135](https://github.com/mossipcams/ynab-mcp-bridge/issues/135)) ([cc2d36f](https://github.com/mossipcams/ynab-mcp-bridge/commit/cc2d36fdf5d7aca0affbc86de329e67ace34dbb7))

## [0.10.4](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.10.3...ynab-mcp-bridge-v0.10.4) (2026-03-19)


### Bug Fixes

* harden MCP startup and list tool responses ([#132](https://github.com/mossipcams/ynab-mcp-bridge/issues/132)) ([b4a3137](https://github.com/mossipcams/ynab-mcp-bridge/commit/b4a3137b01f1602a84b2406bf867a24678e95a0c))
* stabilize release please PR validation dispatch ([#134](https://github.com/mossipcams/ynab-mcp-bridge/issues/134)) ([3c9b0a5](https://github.com/mossipcams/ynab-mcp-bridge/commit/3c9b0a5cdcf6e5f1617f5fe55f72e95cbcc97868))

## [0.10.3](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.10.2...ynab-mcp-bridge-v0.10.3) (2026-03-19)


### Bug Fixes

* route client detection through profile matchers ([#130](https://github.com/mossipcams/ynab-mcp-bridge/issues/130)) ([a7ff140](https://github.com/mossipcams/ynab-mcp-bridge/commit/a7ff1401297da43973bed068094f86188ffcbb96))

## [0.10.2](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.10.1...ynab-mcp-bridge-v0.10.2) (2026-03-19)


### Bug Fixes

* add client profiles and stabilize oauth flows ([87b425e](https://github.com/mossipcams/ynab-mcp-bridge/commit/87b425e6014b6601fd074accbc1f7341f48aee53))
* trigger checks for release please prs ([#129](https://github.com/mossipcams/ynab-mcp-bridge/issues/129)) ([1eead4e](https://github.com/mossipcams/ynab-mcp-bridge/commit/1eead4ebe6b5a754317ee7f45418c2532150034c))

## [0.10.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.10.0...ynab-mcp-bridge-v0.10.1) (2026-03-19)


### Bug Fixes

* harden agentic CI code quality ([cb05276](https://github.com/mossipcams/ynab-mcp-bridge/commit/cb0527691f549f448fbc2368e6ba88124cc696d3))
* skip CI on release please prs ([3054635](https://github.com/mossipcams/ynab-mcp-bridge/commit/30546358f584fb5f398121adb5efe09cbd08c7a9))
* skip release please title validation ([b4ba7d0](https://github.com/mossipcams/ynab-mcp-bridge/commit/b4ba7d0846ddc71f2d4676501b86dee37398a0b1))
* skip release please title validation ([905e595](https://github.com/mossipcams/ynab-mcp-bridge/commit/905e59557e6295cf62e6ec9460b88f93e705bdd7))


### Reverts

* remove ynab canary automation ([de6d507](https://github.com/mossipcams/ynab-mcp-bridge/commit/de6d507fd916c99296b0ce183276b8d68f350723))

## [0.10.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.9.0...ynab-mcp-bridge-v0.10.0) (2026-03-19)


### Features

* optimize AI-facing finance tools ([dbcdebf](https://github.com/mossipcams/ynab-mcp-bridge/commit/dbcdebfef861a0c70c86d9efcc5a2066ab97fc6a))


### Bug Fixes

* label incoming OpenAI MCP calls as ChatGPT ([914df61](https://github.com/mossipcams/ynab-mcp-bridge/commit/914df611b303efbfbed70b7b28b94904f2fb0896))

## [0.9.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.8.5...ynab-mcp-bridge-v0.9.0) (2026-03-18)


### Features

* add structured pino logging ([70cca52](https://github.com/mossipcams/ynab-mcp-bridge/commit/70cca5298155635463b201662c90fcdd638ebcb4))


### Bug Fixes

* remove unused logger export ([3487c1e](https://github.com/mossipcams/ynab-mcp-bridge/commit/3487c1e3e538688d5d8af676d4a6d82c55edb42f))
* type startup catch callback as unknown ([a39fcf6](https://github.com/mossipcams/ynab-mcp-bridge/commit/a39fcf6c2ba8546ed7889ea8c4612ee832f70c02))

## [0.8.5](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.8.4...ynab-mcp-bridge-v0.8.5) (2026-03-18)


### Bug Fixes

* preserve upstream oauth callback errors without state ([a2809ce](https://github.com/mossipcams/ynab-mcp-bridge/commit/a2809cef46ac08060e2a8bec6bc82a6404ec2ae8))

## [0.8.4](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.8.3...ynab-mcp-bridge-v0.8.4) (2026-03-18)


### Bug Fixes

* allow upstream consent redirects in csp ([e0e16c3](https://github.com/mossipcams/ynab-mcp-bridge/commit/e0e16c3d7e127b30f941b08a0340f3f7fa4d1a79))

## [0.8.3](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.8.2...ynab-mcp-bridge-v0.8.3) (2026-03-18)


### Bug Fixes

* support offline_access refresh flows ([5b2a7bb](https://github.com/mossipcams/ynab-mcp-bridge/commit/5b2a7bb323554823c788fb0d0bc89128b380e655))

## [0.8.2](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.8.1...ynab-mcp-bridge-v0.8.2) (2026-03-18)


### Bug Fixes

* add oauth debug logging ([27df59f](https://github.com/mossipcams/ynab-mcp-bridge/commit/27df59f821e51462b07e9a126c19670de6fd29d4))
* align release metadata with published tag ([efc6070](https://github.com/mossipcams/ynab-mcp-bridge/commit/efc6070e7e6889386cb39210fc8ae3fac1c8ecc2))
* allow null-origin oauth consent posts ([f5b21aa](https://github.com/mossipcams/ynab-mcp-bridge/commit/f5b21aab02d178d72667e89a85250ac2b44923f8))
* rebuild dist for null-origin consent ([ff43d51](https://github.com/mossipcams/ynab-mcp-bridge/commit/ff43d51bc059d70f0ac6f47f151234becfec4e13))

## [0.8.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.8.0...ynab-mcp-bridge-v0.8.1) (2026-03-18)


### Bug Fixes

* add oauth debug logging ([27df59f](https://github.com/mossipcams/ynab-mcp-bridge/commit/27df59f821e51462b07e9a126c19670de6fd29d4))
* align release metadata with published tag ([efc6070](https://github.com/mossipcams/ynab-mcp-bridge/commit/efc6070e7e6889386cb39210fc8ae3fac1c8ecc2))
* clean up 0.8.0 changelog entry ([7c7b2e5](https://github.com/mossipcams/ynab-mcp-bridge/commit/7c7b2e5709736764333f6a26a3024e5f193995ff))
* improve oauth debugging and docs ([8eb2cfa](https://github.com/mossipcams/ynab-mcp-bridge/commit/8eb2cfa2840b2971dc4e6ba645c60af6f775662a))
* resolve main merge conflicts ([03be239](https://github.com/mossipcams/ynab-mcp-bridge/commit/03be239d0ca4a84112bc7cd1f6e3353904b38c3b))

## [0.8.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.8.0...ynab-mcp-bridge-v0.8.1) (2026-03-18)


### Bug Fixes

* clean up 0.8.0 changelog entry ([7c7b2e5](https://github.com/mossipcams/ynab-mcp-bridge/commit/7c7b2e5709736764333f6a26a3024e5f193995ff))
* improve oauth debugging and docs ([8eb2cfa](https://github.com/mossipcams/ynab-mcp-bridge/commit/8eb2cfa2840b2971dc4e6ba645c60af6f775662a))
* resolve main merge conflicts ([03be239](https://github.com/mossipcams/ynab-mcp-bridge/commit/03be239d0ca4a84112bc7cd1f6e3353904b38c3b))

## [0.8.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.7.6...ynab-mcp-bridge-v0.8.0) (2026-03-18)


### Features

* add client-aware oauth setup profiles ([fe7bbee](https://github.com/mossipcams/ynab-mcp-bridge/commit/fe7bbeed6ba42f29a90733a5effd0373e21d25c9))


### Internal

* add dependency guardrails for architecture, linting, and unused-code checks ([a465f35](https://github.com/mossipcams/ynab-mcp-bridge/commit/a465f35b5a8bdc69c85ea444c543048f7ad9b985))
* restore release-please baseline ([#100](https://github.com/mossipcams/ynab-mcp-bridge/issues/100)) ([53bf09c](https://github.com/mossipcams/ynab-mcp-bridge/commit/53bf09c0fe99951a4c5d4e69d62ba1aa617e70d4))

## [0.7.0](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.4...ynab-mcp-bridge-v0.7.0) (2026-03-18)


### Features

* add client-aware oauth setup profiles ([fe7bbee](https://github.com/mossipcams/ynab-mcp-bridge/commit/fe7bbeed6ba42f29a90733a5effd0373e21d25c9))

## [0.6.4](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.3...ynab-mcp-bridge-v0.6.4) (2026-03-18)


### Bug Fixes

* narrow auth broker boundaries ([9081669](https://github.com/mossipcams/ynab-mcp-bridge/commit/9081669f7fa5bed9d189c7a32d81d9aecaefdd34))
* trust proxy headers during oauth token exchange ([92179cf](https://github.com/mossipcams/ynab-mcp-bridge/commit/92179cf1bebec691048a4fb1af9e2151e3ad8a0f))

## [0.6.3](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.2...ynab-mcp-bridge-v0.6.3) (2026-03-17)


### Bug Fixes

* clarify cloudflare callback matching ([ede869a](https://github.com/mossipcams/ynab-mcp-bridge/commit/ede869afe0f6f11640df229dfb174f4833b6545a))
* clarify cloudflare callback matching ([d3dbfc3](https://github.com/mossipcams/ynab-mcp-bridge/commit/d3dbfc3c11394620955f4134a74076f5f4b455da))
* reset release-please baseline after rollback ([8886114](https://github.com/mossipcams/ynab-mcp-bridge/commit/888611401e0ee0f364e405b436e293e61667782f))
* reset release-please baseline after rollback ([d1b4cb4](https://github.com/mossipcams/ynab-mcp-bridge/commit/d1b4cb446a37c269092cbc730dcb07f086947020))

## [0.6.2](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.1...ynab-mcp-bridge-v0.6.2) (2026-03-17)


### Bug Fixes

* clarify cloudflare callback matching ([ede869a](https://github.com/mossipcams/ynab-mcp-bridge/commit/ede869afe0f6f11640df229dfb174f4833b6545a))
* clarify cloudflare callback matching ([d3dbfc3](https://github.com/mossipcams/ynab-mcp-bridge/commit/d3dbfc3c11394620955f4134a74076f5f4b455da))
* reset release-please baseline after rollback ([8886114](https://github.com/mossipcams/ynab-mcp-bridge/commit/888611401e0ee0f364e405b436e293e61667782f))
* reset release-please baseline after rollback ([d1b4cb4](https://github.com/mossipcams/ynab-mcp-bridge/commit/d1b4cb446a37c269092cbc730dcb07f086947020))

## [0.6.1](https://github.com/mossipcams/ynab-mcp-bridge/compare/ynab-mcp-bridge-v0.6.0...ynab-mcp-bridge-v0.6.1) (2026-03-17)


### Bug Fixes

* reset release-please baseline after rollback ([8886114](https://github.com/mossipcams/ynab-mcp-bridge/commit/888611401e0ee0f364e405b436e293e61667782f))
* reset release-please baseline after rollback ([d1b4cb4](https://github.com/mossipcams/ynab-mcp-bridge/commit/d1b4cb446a37c269092cbc730dcb07f086947020))

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

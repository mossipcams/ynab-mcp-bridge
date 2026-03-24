# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

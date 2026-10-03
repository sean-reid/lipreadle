# Changelog

## [0.7.0](https://github.com/sean-reid/lipreadle/compare/lipreadle-v0.6.0...lipreadle-v0.7.0) (2026-10-03)


### Features

* **web:** pin the newest guess above the ranked list ([#35](https://github.com/sean-reid/lipreadle/issues/35)) ([14f97a4](https://github.com/sean-reid/lipreadle/commit/14f97a448deb73e01995825e084807ec7e7a9344))


### Dependencies

* bump wrangler to 4.147 for the undici advisories ([#36](https://github.com/sean-reid/lipreadle/issues/36)) ([c225a04](https://github.com/sean-reid/lipreadle/commit/c225a0486f05ffed3290969c89a3dcdce3ab8050))

## [0.6.0](https://github.com/sean-reid/lipreadle/compare/lipreadle-v0.5.0...lipreadle-v0.6.0) (2026-09-29)


### Features

* give up after five misses and see the word ([#32](https://github.com/sean-reid/lipreadle/issues/32)) ([0974d62](https://github.com/sean-reid/lipreadle/commit/0974d62e3200b72c3b4ab7e8a2e21cdb7155fa10))


### Bug Fixes

* **web:** no title on a give-up, the word in the slots is the reveal ([#34](https://github.com/sean-reid/lipreadle/issues/34)) ([539fb6b](https://github.com/sean-reid/lipreadle/commit/539fb6b34745913c68aac163f8b4ebe155d56ffe))

## [0.5.0](https://github.com/sean-reid/lipreadle/compare/lipreadle-v0.4.0...lipreadle-v0.5.0) (2026-09-29)


### Features

* **pipeline:** flag borderline softness and movement instead of rejecting ([#30](https://github.com/sean-reid/lipreadle/issues/30)) ([38b5e70](https://github.com/sean-reid/lipreadle/commit/38b5e70205830e2d2d4bf02fbc669e5ad469e4f2))

## [0.4.0](https://github.com/sean-reid/lipreadle/compare/lipreadle-v0.3.1...lipreadle-v0.4.0) (2026-09-29)


### Features

* **pipeline:** reject fades and overlaps, review by exception ([#28](https://github.com/sean-reid/lipreadle/issues/28)) ([a354423](https://github.com/sean-reid/lipreadle/commit/a354423a5b0b6a43bdbfd6860f287991a024f781))

## [0.3.1](https://github.com/sean-reid/lipreadle/compare/lipreadle-v0.3.0...lipreadle-v0.3.1) (2026-09-29)


### Performance

* **pipeline:** load review videos only near the viewport ([#26](https://github.com/sean-reid/lipreadle/issues/26)) ([e39b243](https://github.com/sean-reid/lipreadle/commit/e39b243eeb5d7eb1e042eaa464970b2ee67243f1))

## [0.3.0](https://github.com/sean-reid/lipreadle/compare/lipreadle-v0.2.0...lipreadle-v0.3.0) (2026-09-28)


### Features

* **web:** sort guesses by closeness, then recency ([#23](https://github.com/sean-reid/lipreadle/issues/23)) ([b01d26d](https://github.com/sean-reid/lipreadle/commit/b01d26d138d689b515477a717d20c2e59db519b4))

## [0.2.0](https://github.com/sean-reid/lipreadle/compare/lipreadle-v0.1.1...lipreadle-v0.2.0) (2026-09-28)


### Features

* **web:** keep the sound on after a solve ([#22](https://github.com/sean-reid/lipreadle/issues/22)) ([ef494ae](https://github.com/sean-reid/lipreadle/commit/ef494aefb2c6c032cfe6c5e437f99708c4593fdf))
* **worker:** repeat the schedule when the clips run out ([#20](https://github.com/sean-reid/lipreadle/issues/20)) ([43ae2c1](https://github.com/sean-reid/lipreadle/commit/43ae2c1cc8b850397d7eca387e74138ec7801173))


### Bug Fixes

* **web:** load the clip the way iOS Safari needs ([#19](https://github.com/sean-reid/lipreadle/issues/19)) ([9bf4d19](https://github.com/sean-reid/lipreadle/commit/9bf4d19446e358682c6971a46e4468fc49c67638))

## [0.1.1](https://github.com/sean-reid/lipreadle/compare/lipreadle-v0.1.0...lipreadle-v0.1.1) (2026-09-28)


### Bug Fixes

* **web:** autoplay in Safari and tap the clip to restart ([#16](https://github.com/sean-reid/lipreadle/issues/16)) ([d72fb4a](https://github.com/sean-reid/lipreadle/commit/d72fb4a54811a7de8e26eb2d0b1de6903b8d6365))
* **web:** keep the tap label clear of WebKit's play glyph ([#18](https://github.com/sean-reid/lipreadle/issues/18)) ([545f7f8](https://github.com/sean-reid/lipreadle/commit/545f7f892bcbee2d9d181d4b4d201da4ad3c100d))

## 0.1.0 (2026-09-28)


### Features

* daily lipreading puzzle on a Cloudflare Worker ([46a883d](https://github.com/sean-reid/lipreadle/commit/46a883d913a3dcb358cb876fe1e3938e4836f11a))
* **pipeline:** build the clip bank from pronunciation videos ([6ec8982](https://github.com/sean-reid/lipreadle/commit/6ec8982bcf4a5ca1fb77ab1e34c586293e3ee4b5))
* **pipeline:** pace downloads and cool down on throttling ([#14](https://github.com/sean-reid/lipreadle/issues/14)) ([7f3b05c](https://github.com/sean-reid/lipreadle/commit/7f3b05c18d1a6087f55449cfed1ba078a19fd337))
* **web:** lips favicon and Apple touch icon ([#12](https://github.com/sean-reid/lipreadle/issues/12)) ([04a0f3d](https://github.com/sean-reid/lipreadle/commit/04a0f3d812c41e648f5b42af5dd067f1e25e9884))
* **web:** serif monogram favicon ([#13](https://github.com/sean-reid/lipreadle/issues/13)) ([45ec507](https://github.com/sean-reid/lipreadle/commit/45ec507dc620d6a85bc4a433689a0e3710d3e5e0))


### Bug Fixes

* **pipeline:** show wrangler errors and read the token file ([#15](https://github.com/sean-reid/lipreadle/issues/15)) ([bda77bb](https://github.com/sean-reid/lipreadle/commit/bda77bb9f15a48d7594e91ed6c09052ab91f60f5))

# Resume

공개용 정적 이력서 사이트 저장소다. 현재 사이트는 `HTML/CSS/Vanilla JS + Parcel` 기반으로 구성되어 있고, 배포 경로는 `--public-url /resume` 기준을 사용한다.

## 개발

- Node 버전 고정: `nvm use` (`.nvmrc` = `20`)
- `yarn` shim 초기화(최초 1회): `corepack enable`
- 의존성 설치: `yarn install`
- 로컬 개발 서버: `yarn start`
- production build: `yarn build`
- CI 기준 Node 버전: `20`

이 저장소는 `Node 20.x`를 기준으로 동작한다.
Node major 버전을 바꾼 뒤 `start`, `build`, `export`에서 `deasync` binding 오류가 나면, 현재 사용 중인 Node 버전으로 native module을 다시 맞춰야 한다.

- 전체 재설치: `yarn install`
- 빠른 복구: `npm rebuild deasync`

## 검증

- analytics helper 검증: `yarn check:analytics`
- site runtime 가드 검증: `yarn check:runtime`
- print stylesheet 검증: `yarn check:print`
- PDF export 스크립트 검증: `yarn check:export`
- build 산출물 검증: `yarn check:dist`
- 기본 배포 전 검증: `yarn check:site`

## 문서

- PDF export 사용법: [docs/pdf-export.md](docs/pdf-export.md)

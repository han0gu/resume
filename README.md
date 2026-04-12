# Resume

공개용 정적 이력서 사이트 저장소다. 현재 사이트는 `HTML/CSS/Vanilla JS + Parcel` 기반으로 구성되어 있고, 배포 경로는 `--public-url /resume` 기준을 사용한다.

## 개발

- 의존성 설치: `yarn install`
- 로컬 개발 서버: `yarn start`
- production build: `yarn build`

## 검증

- analytics helper 검증: `yarn check:analytics`
- print stylesheet 검증: `yarn check:print`
- PDF export 스크립트 검증: `yarn check:export`
- build 산출물 검증: `yarn check:dist`
- 기본 배포 전 검증: `yarn check:site`

## 문서

- PDF export 사용법: [docs/pdf-export.md](docs/pdf-export.md)

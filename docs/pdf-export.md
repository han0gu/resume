# PDF Export

이 문서는 이력서 사이트를 PDF로 export 하는 방법을 설명한다.

## 개요

PDF export는 `preset` 기반으로 동작한다.
제출용 문서에는 `a4-print` preset을 사용하고, 기존 화면 레이아웃을 긴 한 페이지로 보존하고 싶다면 `desktop-long-canvas`, `mobile-long-canvas` preset을 사용한다.

## 명령

- 제출용 A4 PDF 생성: `yarn export:pdf:a4-print`
- 데스크톱 long-canvas PDF 생성: `yarn export:pdf:desktop-long-canvas`
- 모바일 long-canvas PDF 생성: `yarn export:pdf:mobile-long-canvas`
- 모든 preset PDF 생성: `yarn export:pdf:all`

각 명령은 `build`를 먼저 실행한 뒤, 대응되는 preset PDF를 생성한다.
`yarn export:pdf:all`은 같은 실행 디렉터리 안에 세 가지 산출물을 함께 생성한다.

이 저장소의 기준 Node 버전은 `.nvmrc`에 맞춘 `20.x`다.
로컬에서는 먼저 `nvm use`로 버전을 맞추고, `yarn` 명령이 없으면 최초 1회 `corepack enable`을 실행한다.
CI 기준 Node 버전도 `20`이다.
로컬에서 Node major 버전을 바꾼 뒤 `start`, `build`, `export` 중 하나에서 `deasync` binding 오류가 나면, 현재 사용 중인 Node 버전으로 native module을 다시 맞춘다.

- 전체 재설치: `yarn install`
- 빠른 복구: `npm rebuild deasync`

## 출력 경로

출력물은 매 실행마다 아래 경로에 생성된다.

- `tmp/exports/<run-id>/resume-a4-print.pdf`
- `tmp/exports/<run-id>/resume-desktop-long-canvas.pdf`
- `tmp/exports/<run-id>/resume-mobile-long-canvas.pdf`

`<run-id>`는 timestamp, millisecond, process id를 포함하므로 같은 시각에 여러 번 실행해도 충돌하지 않는다.

`a4-print`는 여러 장의 A4 PDF를 생성할 수 있다.
`desktop-long-canvas`, `mobile-long-canvas`는 각각 데스크톱/모바일 viewport 기준의 1페이지 긴 PDF를 생성한다.

특정 디렉터리에 직접 출력하고 싶다면 `--output-dir` 인자를 사용한다.

예시:

- `yarn export:pdf:desktop-long-canvas --output-dir=tmp/exports/pdf/260412`
- `node scripts/export-pdf.js --preset=mobile-long-canvas --output-dir=tmp/exports/pdf/260412`

## Chrome 실행 파일 경로

이 export 스크립트는 `playwright-core`를 사용하지만, 브라우저를 별도로 내려받아 쓰지 않는다.  
대신 로컬 머신에 이미 설치된 Chrome을 직접 실행해서 PDF를 생성한다.

여기서 말하는 `Chrome 실행 파일 경로`는 Chrome 앱 아이콘 경로가 아니라, 실제로 실행되는 바이너리 파일의 경로를 뜻한다.

기본적으로 macOS에서는 아래 경로를 사용한다.

- `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

Chrome이 이 위치에 없거나 다른 브라우저 실행 파일을 써야 한다면, `CHROME_PATH` 환경변수나 `--chrome-path` 인자로 직접 경로를 넘긴다.

이 값을 잘못 지정하면 export 스크립트는 브라우저를 찾지 못해 실패한다.

예시:

- `CHROME_PATH="/path/to/chrome" yarn export:pdf:a4-print`
- `node scripts/export-pdf.js --preset=all --chrome-path=/path/to/chrome`

## 관련 파일

- export 스크립트: `scripts/export-pdf.js`
- export 검증: `scripts/check-export-pdf.js`
- print CSS 검증: `scripts/check-print-css.js`
- print 전용 스타일: `src/main.css`

# PDF Export

이 문서는 이력서 사이트를 제출용 PDF로 export 하는 방법을 설명한다.

## 개요

제출용 PDF는 `print` 전용 CSS와 headless Chrome 기반 export 스크립트를 사용해 생성한다.  
기본 제출본은 `print-optimized` 버전이며, 필요하면 기존 screen 레이아웃 기준 PDF와 비교 출력도 할 수 있다.

## 명령

- 제출용 PDF 생성: `yarn export:pdf`
- 비교용 PDF 생성: `yarn export:pdf:compare`

`yarn export:pdf`는 `build`를 먼저 실행한 뒤, `print-optimized` PDF를 생성한다.  
`yarn export:pdf:compare`는 `legacy screen` PDF와 `print-optimized` PDF를 함께 생성한다.

## 출력 경로

출력물은 매 실행마다 아래 경로에 생성된다.

- `tmp/exports/<run-id>/resume-a4-print-optimized.pdf`
- `tmp/exports/<run-id>/resume-a4-legacy-screen.pdf`

`<run-id>`는 timestamp, millisecond, process id를 포함하므로 같은 시각에 여러 번 실행해도 충돌하지 않는다.

## Chrome 실행 파일 경로

이 export 스크립트는 `playwright-core`를 사용하지만, 브라우저를 별도로 내려받아 쓰지 않는다.  
대신 로컬 머신에 이미 설치된 Chrome을 직접 실행해서 PDF를 생성한다.

여기서 말하는 `Chrome 실행 파일 경로`는 Chrome 앱 아이콘 경로가 아니라, 실제로 실행되는 바이너리 파일의 경로를 뜻한다.

기본적으로 macOS에서는 아래 경로를 사용한다.

- `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

Chrome이 이 위치에 없거나 다른 브라우저 실행 파일을 써야 한다면, `CHROME_PATH` 환경변수나 `--chrome-path` 인자로 직접 경로를 넘긴다.

이 값을 잘못 지정하면 export 스크립트는 브라우저를 찾지 못해 실패한다.

예시:

- `CHROME_PATH="/path/to/chrome" yarn export:pdf`
- `node scripts/export-pdf.js --mode=both --chrome-path=/path/to/chrome`

## 관련 파일

- export 스크립트: `scripts/export-pdf.js`
- export 검증: `scripts/check-export-pdf.js`
- print CSS 검증: `scripts/check-print-css.js`
- print 전용 스타일: `src/main.css`

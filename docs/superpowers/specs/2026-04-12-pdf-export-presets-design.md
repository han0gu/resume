# PDF Export Preset 확장 설계

## 배경

현재 저장소에는 제출용 PDF를 위한 `A4 print` export 흐름이 존재한다.
이 방식은 인사담당자 제출용 문서에는 적합하지만, 과거에 사용하던
`resume-desktop.pdf`, `resume-mobile.pdf`처럼 레이아웃 전체를 긴 한 페이지로
보존한 PDF를 반복 생성하는 기능은 없다.

이번 작업의 목적은 기존 제출용 export를 유지하면서, 사람이 이해하기 쉬운
명령 체계로 `desktop long-canvas`, `mobile long-canvas` preset을 추가하는 것이다.

## 목표

- 기존 제출용 `A4 print` export를 유지한다.
- `desktop long-canvas`, `mobile long-canvas` preset을 새로 추가한다.
- 사람이 실제로 입력하는 `yarn` 명령과 내부 `--preset` 파라미터 이름을 통일한다.
- 문서와 검증 로직이 새 preset 이름을 기준으로 함께 정리되도록 한다.

## 비목표

- 기존 `A4 print` export를 제거하거나 동작 방식을 크게 바꾸지 않는다.
- 이미지 기반 screenshot PDF로 전환하지 않는다.
- 새 프레임워크나 무거운 빌드 의존성을 도입하지 않는다.

## 사용자 인터페이스

### Yarn 명령

- `yarn export:pdf:a4-print`
- `yarn export:pdf:desktop-long-canvas`
- `yarn export:pdf:mobile-long-canvas`
- `yarn export:pdf:all`

기존 호환용 alias인 `yarn export:pdf`는 유지하지 않는다.

### 스크립트 파라미터

단일 exporter 스크립트 `scripts/export-pdf.js`는 아래 preset 이름을 받는다.

- `--preset=a4-print`
- `--preset=desktop-long-canvas`
- `--preset=mobile-long-canvas`
- `--preset=all`

이름은 외부 명령과 내부 파라미터에서 동일하게 유지한다.

## 아키텍처

### 단일 exporter 유지

세 preset은 모두 하나의 `scripts/export-pdf.js`에서 처리한다.
공통 로직은 아래와 같다.

- `dist/` 존재 여부 확인
- 로컬 static server 기동
- headless Chrome 실행
- `/resume/` 로드 및 폰트 로딩 대기
- preset별 PDF 생성

이 구조를 유지하면 Chrome 실행 경로, 출력 경로, 서버 기동, 에러 처리 로직을
한 군데에서 관리할 수 있다.

### preset별 렌더링 전략

#### `a4-print`

- `print` media 사용
- 현재와 동일하게 `@page` 및 print CSS 적용
- 여러 장의 A4 페이지로 분할된 제출용 PDF 생성

#### `desktop-long-canvas`

- `screen` media 사용
- viewport는 데스크톱 기준으로 고정한다.
- 페이지 전체 높이를 측정한 뒤, 그 높이에 맞는 1페이지 PDF를 생성한다.
- 목표는 기존 `resume-desktop.pdf`와 같은 성격의 긴 PDF를 재현하는 것이다.

권장 초기 viewport는 `1440px` 폭이다. 필요하면 구현 단계에서 과거 산출물과의
차이를 비교해 폭을 미세 조정할 수 있다.

#### `mobile-long-canvas`

- `screen` media 사용
- viewport는 모바일 기준으로 고정한다.
- 페이지 전체 높이를 측정한 뒤, 그 높이에 맞는 1페이지 PDF를 생성한다.
- 목표는 기존 `resume-mobile.pdf`와 같은 성격의 긴 PDF를 재현하는 것이다.

권장 초기 viewport는 `390px` 폭이다. 필요하면 구현 단계에서 과거 산출물과의
차이를 비교해 폭을 미세 조정할 수 있다.

### long-canvas 생성 방식

long-canvas preset은 screenshot이 아니라 PDF 렌더링을 유지한다.
이 선택의 이유는 아래와 같다.

- 텍스트 선택 가능성 유지
- 검색 가능성 유지
- 기존 Playwright 기반 export 흐름 재사용 가능

구현 단계에서는 브라우저에서 문서 전체 높이를 측정한 뒤, PDF 크기를 해당 높이에
맞춰 전달하는 방식으로 1페이지 PDF를 생성한다.

## 출력 규칙

기본 출력 디렉터리는 기존과 동일하게 `tmp/exports/<run-id>/`를 사용한다.
`<run-id>`는 충돌 방지를 위해 timestamp, millisecond, process id를 포함한다.

출력 파일명은 preset 이름이 바로 드러나도록 아래와 같이 통일한다.

- `a4-print` -> `resume-a4-print.pdf`
- `desktop-long-canvas` -> `resume-desktop-long-canvas.pdf`
- `mobile-long-canvas` -> `resume-mobile-long-canvas.pdf`

`all` preset은 같은 출력 디렉터리 안에 위 세 파일을 함께 생성한다.

`--output-dir` 옵션은 유지한다. 따라서 예전처럼 `tmp/export/pdf/<date>/` 같은
디렉터리 구조는 구현 이후에도 사용자가 출력 경로를 명시해 맞출 수 있다.
다만 기본 파일명은 새 preset 규칙을 따른다. 즉 예전 산출물과 동일한 "형태"의
PDF를 제공하는 것이 목표이며, 기본 파일명까지 `resume-desktop.pdf`,
`resume-mobile.pdf`로 되돌리지는 않는다.

## 검증 전략

### export 검증

`scripts/check-export-pdf.js`는 아래 항목을 검증 대상으로 확장한다.

- 지원 preset 목록이 `a4-print`, `desktop-long-canvas`, `mobile-long-canvas`, `all`인지
- preset별 출력 파일명이 문서 규칙과 일치하는지
- `all` preset이 세 가지 산출물을 모두 생성하는지

### print CSS 검증

`scripts/check-print-css.js`는 `a4-print`에 필요한 print CSS 검증을 계속 담당한다.
long-canvas preset은 print CSS 중심 기능이 아니므로, preset/출력 검증은
`check-export-pdf.js` 쪽에서 담당한다.

### 수동 확인

구현 이후 최소 확인 항목은 아래와 같다.

- `yarn export:pdf:a4-print`
- `yarn export:pdf:desktop-long-canvas`
- `yarn export:pdf:mobile-long-canvas`
- `yarn export:pdf:all`

필요하면 과거 산출물과 페이지 폭, 줄바꿈, 전체 높이를 비교해 long-canvas 품질을
조정한다.

## 문서화

`docs/pdf-export.md`를 업데이트한다.

- 새 `yarn` 명령 목록 추가
- 각 preset의 목적과 차이 설명
- 출력 파일명과 출력 디렉터리 규칙 설명
- `--output-dir`, `--chrome-path` 사용 예시 갱신

문서는 사용자가 "제출용 A4"와 "레이아웃 보존용 long-canvas"의 차이를 즉시
이해할 수 있게 작성한다.

## 리스크와 대응

### viewport에 따른 줄바꿈 차이

long-canvas는 viewport 폭에 민감하므로, 과거 산출물과 줄바꿈이 완전히 같지 않을 수 있다.
초기 구현은 `1440px`, `390px`를 기준으로 두고, 비교 결과에 따라 소폭 조정한다.

### PDF 높이 제한 가능성

브라우저/엔진에 따라 지나치게 긴 페이지에서 PDF 렌더링 제약이 있을 수 있다.
현재 예시 산출물 높이는 수천 px 수준이므로 우선 같은 범위에서 구현하고,
실제 결과를 보고 필요 시 안전장치를 추가한다.

### 명령 수 증가

명령 수는 늘어나지만, preset 이름이 명확하므로 문서와 실제 사용성 측면에서는
오히려 혼동이 줄어든다.

## 구현 가이드라인

- `scripts/export-pdf.js`는 `mode` 중심 분기 대신 `preset` 중심 분기로 정리한다.
- preset 설정은 가능하면 데이터 구조로 분리해 파일명, media, viewport, PDF 옵션을
  한 곳에서 정의한다.
- 기존 `a4-print` 동작은 회귀가 없도록 유지한다.
- long-canvas용 PDF 높이 계산 로직은 명시적 함수로 분리한다.

## 완료 기준

- 명령과 내부 파라미터가 모두 `preset` 명명 체계를 사용한다.
- `a4-print`, `desktop-long-canvas`, `mobile-long-canvas`, `all`이 모두 동작한다.
- 기존 제출용 A4 출력은 유지된다.
- 문서와 검증 스크립트가 새 preset 체계에 맞게 갱신된다.

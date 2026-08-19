# Spec: hanto CLI 모드 스위처

`<slug>`: `hanto-cli`

## 1. 목적 / 배경

- **누가**: hanto-agent-team을 설치해 쓰는 개발자(및 프롬프트를 관리하는 비개발자 팀원).
- **문제**: 한 작업 공간에서 "풀 파이프라인으로 갈 일 / 스킬 검색 / MCP 제작 / 그냥 빠른 작업"이 섞여 있는데,
  매번 Claude Code 안에서 말로 모드를 지정해야 하고 세션마다 라우팅이 흔들린다.
- **해결**: 셸에서 서브커맨드로 모드를 **명시적으로** 지정해 Claude Code를 프리셋 프롬프트와 함께 실행하는
  얇은 런처 CLI. 모드별 기본 동작은 프로젝트별 설정 파일 + 비개발자도 쓸 수 있는 설정 UI로 관리한다.

## 2. 명령어 사양

바이너리 이름: `hanto` (신규 별칭) / `hanto-agent-team` (기존 유지). 둘 다 `bin/cli.js`.

```
hanto install                          # (기존) 에이전트 5개를 ./.claude/agents/에 복사
hanto run <slug> [설명...]             # 풀 파이프라인: planner부터 시작
hanto find-skills <검색어...>          # find-skills 스킬 유도 프롬프트로 실행
hanto mcp <서비스/API 설명...>         # mcp-builder 스킬 유도 프롬프트로 실행
hanto quick <작업 설명...>             # 유도 문구 없이 입력 그대로 실행 (파이프라인 우회)
hanto config                           # 브라우저 설정 UI 실행
hanto help | -h | --help               # 사용법
```

### 공통 옵션 (run / find-skills / mcp / quick)

| 옵션 | 효과 |
|------|------|
| `--headless` | 이번 1회만 `claude -p`(비대화형)로 실행 |
| `--interactive` | 이번 1회만 대화형 세션으로 실행 |

우선순위: **CLI 플래그 > 모드별 설정 > 전역 기본값(`defaultExecution`) > 내장 기본값(`interactive`)**.
두 플래그를 동시에 주면 에러(사용법 출력, exit 1).

### 모드별 동작 상세

- **`hanto run <slug> [설명...]`**
  - `<slug>`는 kebab-case 검증(`/^[a-z0-9]+(-[a-z0-9]+)*$/`). 불일치 시 에러 메시지 + 올바른 예시 출력, exit 1.
  - 설명 인자는 선택. 있으면 프롬프트에 포함.
  - 주입 프롬프트(내장 기본, 설정으로 교체 가능):
    planner 서브에이전트부터 시작해 spec-`<slug>`.md → designer → developer → tester → reviewer로
    이어지는 풀 파이프라인을 지시. 휴먼 승인 게이트는 그대로 유지(에이전트 정의가 담당하므로 CLI는 건드리지 않음).
- **`hanto find-skills <검색어...>`** — "find-skills 스킬을 사용해서 다음 요구에 맞는 스킬을 찾아줘: {input}" 형태.
- **`hanto mcp <설명...>`** — "mcp-builder 스킬을 사용해서 다음 대상의 MCP 서버를 만들어줘: {input}" 형태.
- **`hanto quick <작업...>`** — `{input}` 그대로. 서브에이전트/스킬 유도 문구 없음.
- find-skills / mcp / quick에서 입력 인자가 비어 있으면 해당 서브커맨드 사용법 출력, exit 1.

### 실행 방식

- **interactive**: `spawnSync("claude", [prompt], { stdio: "inherit" })` — 프롬프트가 첫 메시지로 들어간 대화형 세션.
- **headless**: `spawnSync("claude", ["-p", prompt], { stdio: "inherit" })` — 출력 후 종료.
- 두 경우 모두 `claude`의 exit code를 그대로 전파.
- 실행 직전 어떤 모드·실행 방식·프롬프트로 실행하는지 1~2줄 표시 (예: `[hanto] run · 대화형 · slug: login-form`).

## 3. 설정 파일: `.claude/hanto.config.json`

프로젝트 루트 기준(= `process.cwd()`). 커밋해서 팀과 공유하는 것을 전제로 한다.

```json
{
  "version": 1,
  "defaultExecution": "interactive",
  "modes": {
    "run":         { "execution": null, "prompt": null },
    "find-skills": { "execution": null, "prompt": null },
    "mcp":         { "execution": null, "prompt": null },
    "quick":       { "execution": null, "prompt": null }
  }
}
```

- `defaultExecution`: `"interactive" | "headless"`.
- `modes.<mode>.execution`: `null`(전역 기본값 따름) 또는 `"interactive" | "headless"`.
- `modes.<mode>.prompt`: `null`(내장 기본 프롬프트) 또는 사용자 템플릿 문자열.
  - 플레이스홀더: `{slug}` (run 전용), `{input}` (모든 모드). 치환은 단순 문자열 replace.
- **파일이 없으면** 내장 기본값으로 정상 동작 — config를 만들지 않아도 모든 명령이 동작해야 한다.
- **파일이 깨졌으면**(JSON 파싱 실패) 경고 1줄 출력 후 내장 기본값으로 폴백. 크래시 금지.
- 알 수 없는 키는 무시하되 저장 시 보존하지 않아도 됨(v1 스키마로 재작성).

## 4. 설정 UI: `hanto config`

비개발자도 쓸 수 있는 **브라우저 설정 화면**. 다크모드/라이트모드 토글 같은 스위치 UX.

### 서버

- Node 내장 `http`만 사용, 외부 의존성 0.
- `127.0.0.1` 에만 바인딩, 포트는 `0`(임의 포트)으로 열고 실제 포트를 URL로 출력.
- 브라우저 자동 오픈 시도: macOS `open` / Linux `xdg-open` / Windows `start`. 실패해도 에러 아님 — URL을 출력하고 대기.
- 종료 조건: ① 저장 완료 후 자동 종료, ② 페이지의 "닫기" 버튼(POST /api/quit), ③ 10분 유휴 타임아웃, ④ Ctrl+C.

### 엔드포인트

| 메서드/경로 | 동작 |
|---|---|
| `GET /` | 설정 페이지 HTML (인라인 CSS/JS, 외부 리소스 없음) |
| `GET /api/config` | `{ current, defaults }` JSON — 현재 설정(파일 병합 결과)과 내장 기본 프롬프트 |
| `POST /api/config` | 검증 후 `.claude/hanto.config.json` 저장(디렉터리 없으면 생성, 임시파일 → rename 원자적 쓰기), 성공 응답 후 서버 종료 |
| `POST /api/quit` | 저장 없이 종료 |

- POST 검증: `defaultExecution`/`execution` 값 화이트리스트, `prompt`는 문자열 또는 null. 검증 실패 시 400 + 한국어 오류 메시지(파일 안 씀).

### 화면 구성 (전부 한국어 레이블)

1. **상단**: "hanto 설정" 제목 + 저장 대상 경로(`.claude/hanto.config.json`) 표시.
2. **기본 실행 방식**: 좌우 토글 스위치 — `대화형 (Claude와 대화하며 진행)` ↔ `자동 실행 (결과만 출력)`.
   각 선택지에 한 줄 설명 문구.
3. **모드별 카드 4개** (run / find-skills / mcp / quick): 카드마다
   - 모드 이름 + 한 줄 설명 (예: run — "기획→디자인→개발→테스트→리뷰 전체 파이프라인")
   - 실행 방식 3-상태 선택: `기본값 따름` / `대화형` / `자동 실행`
   - 프롬프트 편집: 접힌 상태가 기본. 펼치면 textarea에 현재 유효 프롬프트(사용자 값 또는 내장 기본)가 보이고,
     "기본값으로 되돌리기" 버튼 제공. 내장 기본과 동일하면 `prompt: null`로 저장.
   - `{slug}`, `{input}` 플레이스홀더 안내 문구.
4. **하단**: `저장` (저장 후 "저장 완료 — 이 창을 닫아도 됩니다" 표시하고 서버 종료) / `저장 안 하고 닫기`.

## 5. 에러 처리 정리

| 상황 | 동작 |
|---|---|
| `claude` 실행 파일 없음 (spawn ENOENT) | "Claude Code CLI(claude)를 찾을 수 없습니다" + 설치 안내(https://claude.com/claude-code), exit 1 |
| 알 수 없는 서브커맨드 | 전체 사용법 출력, exit 1 |
| 필수 인자 누락 / slug 형식 오류 | 해당 명령 사용법 + 예시, exit 1 |
| `--headless`+`--interactive` 동시 지정 | 에러 메시지, exit 1 |
| config JSON 파싱 실패 | 경고 후 내장 기본값 폴백 (exit 아님) |
| config 저장 실패 (권한 등) | UI에 오류 표시, 서버는 유지 (재시도 가능) |
| config UI 포트 바인딩 실패 | 에러 메시지, exit 1 |

## 6. 파일 변경 계획

| 파일 | 변경 |
|---|---|
| `bin/cli.js` | 서브커맨드 라우팅 + run/find-skills/mcp/quick 실행 로직 (install은 동작 그대로 유지) |
| `bin/config-server.js` (신규) | `hanto config` 서버 + 인라인 HTML UI |
| `bin/defaults.js` (신규) | 내장 기본 프롬프트 4종 + 설정 로드/병합/검증 유틸 |
| `package.json` | `"hanto": "bin/cli.js"` bin 별칭 추가 |
| `README.md` | CLI 사용법/설정 섹션 추가 |

기존 `.claude/agents/*.md` 5개 파일은 **수정하지 않는다**.

## 7. 구현 단계 (step-by-step)

1. **CLI 골격**: 인자 파싱, help, install 유지, 서브커맨드 라우팅 뼈대.
2. **설정 모듈** (`bin/defaults.js`): 내장 기본 프롬프트, config 로드/병합/폴백, 실행방식 우선순위 해석.
3. **실행 모드 4종**: run/find-skills/mcp/quick → 프롬프트 조립 → `claude` spawn, ENOENT 처리.
4. **설정 UI** (`bin/config-server.js`): 서버 + HTML 페이지 + 저장 플로우.
5. **package.json / README** 갱신.
6. **자체 테스트**: 아래 완료 기준 전 항목 검증 (claude 실행은 spawn 인자 확인 수준의 dry-run 검증 포함).

각 step 종료 시 브리핑 + 컨펌 후 다음 step 진행 (plan-first 규칙).

## 8. 완료 기준 (Acceptance criteria)

- [ ] `hanto install`(및 `hanto-agent-team install`) 기존 동작 무회귀.
- [ ] `hanto run login-form "로그인 폼"` → planner 시작 프롬프트로 `claude` 대화형 실행 구성 (내장 기본 기준).
- [ ] `hanto quick "..." --headless` → `claude -p` 실행 구성, exit code 전파.
- [ ] 잘못된 slug(`hanto run Login_Form`) → 에러 + 예시 출력, exit 1.
- [ ] config 파일 없음 → 모든 명령 내장 기본값으로 정상 동작.
- [ ] config 파일이 깨진 JSON → 경고 1줄 + 기본값 폴백, 크래시 없음.
- [ ] `hanto config` → 127.0.0.1 로컬 서버 + 페이지 로드 → 저장 → `.claude/hanto.config.json` 생성/갱신 → 서버 종료.
- [ ] 저장한 설정(예: quick을 headless로)이 이후 `hanto quick` 실행 방식에 반영.
- [ ] `claude` 미설치 환경에서 명확한 한국어 안내 후 exit 1.

## 9. 비범위 (Non-goals)

- GSD식 세션 자동 분리/병렬 실행 없음 — 한 번에 하나의 `claude` 프로세스만 실행.
- 원격/다중 사용자 웹 UI 아님 — localhost 1인용, 저장 후 종료.
- `.claude/agents/*.md` 에이전트 정의 수정 없음.
- find-skills / mcp-builder 스킬 자체의 설치는 이 CLI가 하지 않음 (프롬프트에서 스킬 사용을 유도할 뿐,
  미설치 시 Claude가 안내하도록 둠).
- 사용자별(전역) 설정 파일은 v1에서 제외 — 프로젝트별 설정만.

# CS Bridge — 글로벌 CS 상담원 코파일럿

**라이브 데모: https://bxbae.github.io/cs-bridge/** (백엔드 없이 브라우저에서 동작하는 정적 데모)

해외 고객의 **채팅·이메일 문의**를 한국인 상담원이 빠르고 안전하게 처리하도록 돕는 LLM 애플리케이션입니다.
고객 메시지를 번역·분류하고, 사내 정책(RAG)을 근거로 답변 초안 3개를 만들고, **보내기 전에 규칙 기반 가드로 검증**합니다. 상담이 끝나면 상담 기록을 자동으로 정리합니다.

> 기획 배경: 게임사 글로벌 서버 북미 고객지원 5년 4개월 동안 영어 문의 응대·패치 공지 번역을 하며 겪은 문제
> (번역 시간, 정책에 없는 약속, 용어 불일치, 상담 기록 작성 부담)를 LLM으로 해결합니다.

| | 라이트 | 다크 |
|---|---|---|
| 대시보드 | ![대시보드](docs/dash-light.png) | ![대시보드 다크](docs/dash-dark.png) |
| 상담 콘솔 | ![콘솔](docs/console-light.png) | ![콘솔 다크](docs/console-dark.png) |
| 지식베이스 | ![지식베이스](docs/kb-light.png) | ![지식베이스 다크](docs/kb-dark.png) |

## 주요 기능

| 단계 | 하는 일 |
|---|---|
| 개인정보 마스킹 | 이메일·카드번호(Luhn 검증)·전화번호를 LLM에 보내기 전에 `[EMAIL]` 등으로 치환 |
| 분석 | 언어 감지, 한국어 번역, 의도 요약, 카테고리·감정·긴급도 분류, 검색용 쿼리 재작성 |
| 검색 (RAG) | 정책 문서를 섹션 단위로 검색(BM25 + CS 동의어 확장), 분류 결과를 가중치로 활용 |
| 답변 초안 | 공감형·간결형·단계형 3종, 채널별 형식(채팅/이메일), 근거 문서 ID 인용 |
| 한국어 → 고객 언어 | 상담원이 한국어로 쓰면 용어집을 지켜 번역하고 역번역을 함께 보여줌 |
| 검증 가드 | 아래 표 참고. `error`가 있으면 **보내기 버튼 비활성화 + 서버에서도 422로 차단** |
| 상담 기록 | 요약, 문의 내용, 조치, 후속 조치, 이관 여부, 태그 |
| KPI | 초안 채택률, 평균 수정률, 첫 초안까지 시간, 가드가 차단한 초안 수 |
| 대시보드 | 채팅·이메일 문의 추이(1주~2개월), 최근 상담, 오늘의 브리핑(답변 대기·긴급), 초안 채택률·가드 통과율, 주간 문의 증감, CSV 내보내기 |
| 지식베이스 | 근거 정책 문서·용어집 검색 |
| 디자인 | 인디고·코랄, 왼쪽 아이콘 레일 + 연보라 사이드 패널. 라이트·다크·자동(OS 설정 추종), 새로고침 시 깜빡임 없음 |

차트는 외부 라이브러리 없이 SVG로 직접 그렸습니다. 시리즈 색(채팅 인디고·이메일 코랄)은 색각이상(CVD) 구분·밝기 대역·대비를 라이트·다크 각각 검사기로 확인했고, 대비가 낮은 색을 쓰는 차트에는 범례·툴팁·"표로 보기"를 함께 둡니다.

### 검증 가드 (`backend/app/pipeline/validate.py`)

| 코드 | 수준 | 잡아내는 것 |
|---|---|---|
| `unsupported_promise` | 차단 | 환불·크리스탈·복구 약속인데 근거 문서에 없거나, 문서에 없는 수치(500개, 1시간 등) |
| `prohibited_promise` | 차단 | 정책상 상담원이 할 수 없는 약속 (예: 계정 정지 해제) |
| `conditional_policy` | 확인 | 조건이 있는 정책 (예: 시즌 패스는 활성화 후 환불 불가) |
| `number_mismatch` | 차단 | 한국어 원문의 숫자가 번역문에서 빠지거나 바뀜 |
| `pii` | 차단 | 답변에 개인정보 포함 |
| `ungrounded_citation` | 차단 | 검색되지 않은 문서를 근거로 인용 |
| `glossary` | 확인 | 용어집(이의 신청 → appeal 등) 미준수 |
| `absolute_wording` | 확인 | "right away", "guarantee" 등 단정적 표현 |
| `email_greeting/signoff`, `chat_length` | 확인 | 채널 형식 |

## 평가 (`backend/eval`)

```bash
cd backend && python -m eval.run_eval      # eval/report.md 생성
```

| 지표 | mock (오프라인 기준선) | Claude 연결 시 |
|---|---|---|
| 카테고리 정확도 (30건) | 0.80 | 측정 예정 |
| 검색 Hit@1 / Hit@3 (28건) | 0.71 / 0.93 | 측정 예정 (쿼리 재작성 효과) |
| 가드 정확도 (12건, 차단/확인/통과) | 1.00 | 동일 (규칙 기반) |
| 차단해야 할 답변 재현율 | 1.00 | 동일 |

mock 분류기는 키워드 규칙이라 의도적으로 기준선 역할을 합니다. `LLM_PROVIDER=anthropic`으로 같은 평가를 돌려 개선 폭을 비교합니다.

## 실행

```bash
# 1) 백엔드 (API 키 없이 mock 모드로 바로 실행)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2) 프론트엔드
cd frontend
npm install
npm run dev            # http://localhost:3000

# 실제 LLM 사용
export LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-...
```

Docker: `cp .env.example .env && docker compose up --build`

첫 실행 시 데모 데이터가 생성됩니다: 오늘 문의 4건 + 대시보드용 지난 13일 이력(평가 문항을 실제 파이프라인에 통과시킨 뒤 날짜만 과거로 조정, 상담원 동작은 시뮬레이션). 이력 생성은 mock 모드에서만 기본 실행되며(`SEED_HISTORY=auto`), 실제 LLM에서도 만들려면 `SEED_HISTORY=1`.

### 정적 데모 (GitHub Pages)

`main`에 push하면 `.github/workflows/pages.yml`이 자동 배포합니다.

1. `backend/scripts/export_demo.py`가 실제 백엔드(mock)를 돌려 대화·대시보드·지식베이스와 프리셋 문의 분석 결과를 `frontend/public/demo/snapshot.json`으로 내보냅니다.
2. 브라우저에서는 `lib/demo/demoApi.ts`가 API 대신 이 스냅샷을 씁니다. 검증 가드는 TypeScript로 옮겼고, `npm run demo:parity`가 Python과 결과가 **완전히 같은지** 131개 케이스로 확인합니다(배포 전 필수 단계).
3. `npm run build:demo`로 `/cs-bridge` 경로용 정적 파일을 만듭니다.

로컬에서 확인: `cd backend && python -m scripts.export_demo && cd ../frontend && npm run demo:parity && npm run build:demo` 후 `out/`을 `/cs-bridge/` 경로로 서빙.

테스트: `cd backend && pytest -q` (26개)

## 구조

```
backend/app
├── main.py              FastAPI 라우트
├── service.py           상담 워크플로 (고객 메시지 → 분석·검색·초안·검증 / 상담원 답변 / 요약 / KPI)
├── dashboard.py         대시보드 집계 (일별 추이, 카테고리, 큐, 가드 경고)
├── llm/                 Provider 인터페이스, Anthropic, 오프라인 mock
├── pipeline/
│   ├── pii.py           개인정보 마스킹
│   ├── retrieve.py      KB 파싱 + BM25 + 동의어 확장 (pgvector로 교체 가능한 인터페이스)
│   ├── steps.py         analyze / drafts / translate / summarize
│   ├── prompts.py       JSON 출력 프롬프트
│   ├── glossary.py      용어집
│   └── validate.py      검증 가드
├── kb/                  가상 게임 서비스 정책 문서 (영문 + 상담원용 한국어 요약)
└── data/glossary.json
frontend/
├── app/                 / 대시보드 · /console 상담 콘솔 · /kb 지식베이스
├── components/
│   ├── AppShell.tsx     아이콘 레일 + 밑줄 탭 레이아웃
│   ├── ThemeProvider    테마 상태 (SSR 안전, 명시적 선택만 저장)
│   ├── charts.tsx       SVG 라인·링 차트, 툴팁, 표 보기
│   └── dashboard/       대시보드 (추이·최근 상담·브리핑·응대 요약)
└── app/globals.css      디자인 토큰 (라이트·다크 CSS 변수)
```

## 데이터

전 직장 자료는 사용하지 않았습니다. 가상 게임 **Starfall Odyssey**의 정책 문서·용어집·평가 문항을 직접 작성했습니다.

## 다음 단계

- [ ] Claude 연결 후 평가 수치 측정 및 프롬프트 개선
- [ ] 임베딩(BGE-M3) + pgvector 하이브리드 검색
- [ ] 상담원 수정 이력을 다음 초안에 반영하는 개인화
- [ ] 패치노트 다국어 번역기 (용어집 일관성 검사)
- [ ] 음성 상담(AICC): STT 연동

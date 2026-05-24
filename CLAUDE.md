# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 실행

```bash
node index.js
```

봇 실행 전 `.env` 파일이 있어야 합니다. `.env.example`을 복사해서 값을 채우세요.

## 환경 변수 (`.env`)

| 변수 | 설명 |
|------|------|
| `DISCORD_TOKEN` | Discord Developer Portal의 봇 토큰 |
| `GUILD_ID` | 봇이 동작할 서버 ID |
| `ADMIN_CHANNEL_ID` | 인증 요청 메시지가 전송될 관리자 채널 ID |
| `VERIFY_CHANNEL_ID` | `/인증` 명령어가 허용되는 채널 ID (다른 채널에서 실행 시 차단) |
| `ROLE_ID_OPTION_1` | `/인증` 옵션1 승인 시 부여할 역할 ID |
| `ROLE_LABEL_OPTION_1` | 옵션1 버튼 라벨 / 메시지에 들어갈 이름 (예: `LLM 스터디`) |
| `ROLE_ID_OPTION_2` | `/인증` 옵션2 승인 시 부여할 역할 ID |
| `ROLE_LABEL_OPTION_2` | 옵션2 버튼 라벨 / 메시지에 들어갈 이름 |
| `PROGRESS_CHANNEL_ID_OPTION_1` | 옵션1 스터디의 진도 알림이 게시될 채널 ID |
| `PROGRESS_CRON_OPTION_1` | 옵션1 진도 알림 cron 표현식 (`Asia/Seoul`, 예: `0 9 * * 1-5` = 평일 오전 9시) |
| `PROGRESS_CHANNEL_ID_OPTION_2` | 옵션2 스터디의 진도 알림이 게시될 채널 ID |
| `PROGRESS_CRON_OPTION_2` | 옵션2 진도 알림 cron 표현식 |

## 아키텍처

`index.js`는 봇 부트스트랩과 디스패치만 담당하고, 각 기능은 별도 모듈로 분리되어 있습니다.

**기능 모듈 규약:** 각 모듈(예: `verify.js`)은 다음을 export 해야 합니다:
- `commands`: `SlashCommandBuilder().toJSON()` 결과의 배열 (없으면 빈 배열)
- `handle(interaction)`: 자기 모듈에 해당하는 인터랙션이면 처리하고, 아니면 조용히 return
- `init(client)` (선택): 부팅 시 1회 호출되는 초기화 훅. 스케줄러 등록 등 `client` 객체가 필요한 부트스트랩에 사용 (예: `progress.js`).

`index.js`는 `clientReady`에서 모든 모듈의 `commands`를 합쳐 Guild 단위로 등록하고, `init`이 있는 모듈은 호출합니다. `interactionCreate`에서는 각 모듈의 `handle()`을 차례로 호출합니다.

**기능 추가 절차:**
1. 새 모듈 파일 생성 (예: `welcome.js`) — `commands`와 `handle`(필요 시 `init`) export
2. `index.js`에서 `require('./welcome')` 후 `commands` 배열에 spread, `interactionCreate`에 `handle` 호출 추가, `init`이 있다면 `clientReady` 안에서 호출

## 인증 기능 (`verify.js`)

**이벤트 흐름:**
1. `/인증 image:[file]` — 이미지 첨부와 함께 슬래시 커맨드 실행
2. 인증 채널에 공개 메시지 + 이미지 게시
3. 관리자 채널에 동일 이미지 + `[옵션1] [옵션2] [거부]` 버튼 게시
4. 관리자가 옵션 클릭 → 해당 역할 부여, 공개 메시지 "승인되었습니다"로 수정 + ✅ 리액션
5. 거부 클릭 → 공개 메시지 "거부되었습니다"로 수정 + ❌ 리액션

**버튼 customId 규칙:** `{action}_{userId}_{publicMessageId}_{publicChannelId}` — 인증 채널의 공개 메시지를 나중에 fetch/edit/react하기 위한 정보를 모두 인코딩. action은 `opt1`/`opt2`/`deny`.

**Discord 권한 요구사항:** 봇 역할에 `Manage Roles` 권한이 있어야 하고, 봇 역할이 부여할 역할들보다 상위에 있어야 합니다.

## 진도 알림 기능 (`progress.js`)

평일(월~금) 정해진 시각에 각 스터디 채널로 그날의 진도를 Embed 카드로 자동 공지합니다.

**데이터:** `data/progress-option1.json`, `data/progress-option2.json` — `YYYY-MM-DD` 키 기반.

```json
{
  "2026-05-25": {
    "title": "5주차: Attention 메커니즘",
    "body": "자료: https://...\n과제: ..."
  }
}
```

해당 날짜에 키가 없으면 조용히 스킵합니다. JSON은 매 발사 시 다시 읽어서 봇 재시작 없이 추가/수정이 반영됩니다.

**스케줄러:** `node-cron`, 타임존 `Asia/Seoul`. 두 스터디 각각 독립된 cron job. 봇이 꺼져 있던 시각의 알림은 사후 발송하지 않습니다.

**색상:** 옵션1 청록(`0x1abc9c`), 옵션2 파랑(`0x3498db`).

**검증용 API:** `previewForToday(optKey)` — Discord 연결 없이 오늘 날짜 Embed JSON(또는 `null`)을 반환합니다. 예:

```powershell
node -e "require('dotenv').config(); console.log(JSON.stringify(require('./progress').previewForToday('opt1'), null, 2))"
```

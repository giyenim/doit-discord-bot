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
| `MISSION_FORUM_CHANNEL_ID` | 옵션1/2 미션 인증글이 올라오는 통합 포럼 채널 ID |
| `MISSION_FORUM_TAG_ID_OPTION_1` | 미션 포럼의 옵션1 forum tag ID |
| `MISSION_FORUM_TAG_ID_OPTION_2` | 미션 포럼의 옵션2 forum tag ID |

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
    "week": 1,
    "title": "5주차: Attention 메커니즘",
    "body": "자료: https://...\n과제: ..."
  }
}
```

해당 날짜에 키가 없으면 조용히 스킵합니다. JSON은 매 발사 시 다시 읽어서 봇 재시작 없이 추가/수정이 반영됩니다.

`week` 필드는 `progress.js` 자체는 사용하지 않으며, `mission.js`가 "이번 주차"를 파생할 때 참조합니다. 진도 데이터를 새로 추가할 때 `week`를 같이 채워 두세요.

**스케줄러:** `node-cron`, 타임존 `Asia/Seoul`. 두 스터디 각각 독립된 cron job. 봇이 꺼져 있던 시각의 알림은 사후 발송하지 않습니다.

**색상:** 옵션1 청록(`0x1abc9c`), 옵션2 파랑(`0x3498db`).

**검증용 API:** `previewForToday(optKey)` — Discord 연결 없이 오늘 날짜 Embed JSON(또는 `null`)을 반환합니다. 예:

```powershell
node -e "require('dotenv').config(); console.log(JSON.stringify(require('./progress').previewForToday('opt1'), null, 2))"
```

**`/진도` 사용자 명령어:** 사용자가 본인에게만 보이도록(ephemeral) 오늘 진도를 확인합니다. 명령어를 실행한 채널 ID로 어느 스터디인지 판별 (`PROGRESS_CHANNEL_ID_OPTION_1/2`와 매칭). 두 채널 중 어느 것도 아니면 차단 안내, 오늘 항목이 없으면 "오늘은 진도가 없어요" 안내.

## 미션 현황 기능 (`mission.js`)

`/미션현황` 슬래시 커맨드로 사용자가 본인에게만 보이도록(ephemeral) 지난 주 스터디 미션 완료 현황을 확인합니다 (미션 승인이 주차 종료 후에 일어나므로 `week - 1` 기준). 표시: 지난 주 챕터, 지난 주 미션 완료 인원, 본인 누적 완료/미완료 메시지, 내 스터디 완료율 / 전체 스터디 완료율 두 프로그래스바. 진도가 1주차라 "지난 주"가 없으면 챕터/완료 인원 자리에 "(아직 없음)" 표시.

**채널 정책:** `/진도`와 동일하게 `PROGRESS_CHANNEL_ID_OPTION_1/2`에서만 실행 가능. 다른 채널에서는 차단 안내.

**전체 인원 정의:** `ROLE_ID_OPTION_1/2` 역할 보유자 전원. `guild.members.fetch()` 호출이 필요해 **`GuildMembers` privileged intent**가 활성화되어 있어야 합니다 (`index.js`의 클라이언트 intents + Discord Developer Portal → Bot → "Server Members Intent" 토글 둘 다 필요).

**데이터:** `data/mission-option1.json`, `data/mission-option2.json` — 주차 번호(문자열) 키.

```json
{
  "1": { "chapters": "1장 ~ 5장", "completed": ["디스코드_userId1", "디스코드_userId2"] },
  "2": { "chapters": "6장 ~ 7장", "completed": [] }
}
```

`chapters`는 스크린에 표시되는 미션 범위 라벨(자유 텍스트), `completed`는 완료한 멤버의 디스코드 user ID 배열. 현재 1차 구현은 **수기 관리** — 운영자가 JSON을 직접 편집합니다 (관리 UI는 추후 별도 명령으로 추가 예정).

**주차 파생 규칙:** 진도 JSON에서 "오늘 ≤ 가장 가까운 날짜" 항목의 `week` 값을 "이번 주차"로 사용. 주말/공휴일에 실행해도 직전 평일의 주차가 잡힙니다. 진도 시작 전이면 안내 메시지, 해당 주차 미션 키가 미션 JSON에 없으면 별도 안내.

진도 JSON과 마찬가지로 매 요청마다 다시 읽어서 봇 재시작 없이 반영됩니다.

### `/미션승인` (관리자 전용)

운영자가 `data/mission-option*.json`을 손으로 편집하지 않고, **미션 인증 포럼 스레드 안에서** 작성자의 해당 주차 완료 여부를 토글합니다.

```
/미션승인 주차:5
```

- **실행 위치:** `MISSION_FORUM_CHANNEL_ID` 포럼의 스레드 안에서만. 다른 채널/포럼에서는 차단 안내.
- **권한:** `setDefaultMemberPermissions(Administrator)`로 등록 — Discord UI에서 비관리자에겐 명령 자체가 보이지 않습니다.
- **작성자 식별:** 포럼 스레드의 `ownerId` (= 인증 글 작성자).
- **옵션 판별:** 스레드 `appliedTags`에 `MISSION_FORUM_TAG_ID_OPTION_1/2` 중 **정확히 하나**가 있어야 동작. 0개/2개면 안내 메시지.
- **주차 자동 추론은 하지 않습니다.** 미션 승인은 해당 주차가 끝난 다음 일어나므로 "오늘 기준 이번 주차"는 항상 어긋남 → 운영자가 인수로 명시.
- **토글:** 해당 주차 `completed` 배열에 작성자 ID가 있으면 제거(취소), 없으면 추가(승인). `JSON.stringify(data, null, 2)`로 저장.
- **응답:** 운영자에게만 보이는 ephemeral 한 줄 (`[라벨] 닉네임 N주차 승인 완료` / `... 취소`). 스레드 공개 메시지는 보내지 않습니다 — 작성자에게 안내하는 메시지는 운영자가 직접 작성합니다.

# ASC Student Manage

## GitHub Codespaces Quick Start

Codespaces creates `.env`, installs missing dependencies, generates Prisma Client, and applies SQLite migrations through `npm run dev:prepare`.

Run:

```bash
npm run dev
```

Then open the forwarded port `3000` URL.

ASC ?숈썝 ?댁쁺 蹂대뱶?낅땲?? Next.js, Prisma, SQLite瑜??ъ슜?⑸땲??

## GitHub Codespaces?먯꽌 ?ㅽ뻾

Codespaces ?곕??먯뿉???꾨옒 ?쒖꽌濡??ㅽ뻾?섎㈃ ?⑸땲??

```bash
npm run dev
```

`npm run dev`???ㅽ뻾 ?꾩뿉 ?먮룞?쇰줈 ?ㅼ쓬 ?묒뾽??癒쇱? ?섑뻾?⑸땲??

- `.env`媛 ?놁쑝硫?`DATABASE_URL="file:./dev.db"` ?앹꽦
- Prisma Client ?앹꽦
- SQLite DB 留덉씠洹몃젅?댁뀡 ?곸슜
- Next.js 媛쒕컻 ?쒕쾭瑜?`0.0.0.0:3000`?쇰줈 ?ㅽ뻾

?쒕쾭媛 ?⑤㈃ Codespaces??forwarded port `3000` URL濡??묒냽?섎㈃ ?⑸땲??

## 濡쒖뺄 ?ㅽ뻾

```bash
npm run dev
```

濡쒖뺄 DB ?뚯씪(`dev.db`), `.env`, `node_modules`, `.next`??Git???щ━吏 ?딆뒿?덈떎.

## Environment Variables

Copy `.env.example` to `.env` for local development and adjust values per environment.

| Name | Example | Description |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | Prisma database connection string. Local development uses SQLite by default. |
| `OMR_SERVER_URL` | `` | Optional external OMR service URL. Leave empty to use the local Python flow. |
| `OMR_AUTO_RECOGNIZE` | `false` | Set to `false` to skip recognition immediately after upload. Users can run recognition manually from OMR results. Set to `true` to keep the existing automatic recognition flow after upload. If omitted, the app preserves the previous behavior and auto-recognizes. |
| `ASC_PYTHON_PATH` | `` | Optional Python executable path for OMR/PDF processing. |
| `SMS_PROVIDER` | `dry-run` | SMS provider mode. Use `dry-run` for development. |
| `SMS_API_KEY` / `SMS_API_SECRET` | `` | SMS provider credentials for non-dry-run environments. |
| `SMS_SENDER_NUMBER` | `` | Registered sender phone number for SMS. |
| `SMS_DRY_RUN` | `true` | Keeps message sending in preview/log-only mode when true. |
| `SSODAA_API_KEY` | `` | 쏘다 API Key. DB 설정값이 없을 때 fallback으로 사용합니다. |
| `SSODAA_TOKEN_KEY` | `` | 쏘다 Token Key. 쏘다 관리자 페이지에서 발급받은 값을 사용합니다. |
| `SSODAA_DEFAULT_SEND_PHONE` | `` | 쏘다에 등록된 기본 발신번호입니다. 숫자만 저장/사용됩니다. |
| `SSODAA_UNSUB_PHONE` | `` | 광고 문자 무료 수신거부 번호입니다. |
| `SSODAA_SENDER_NAME` | `` | 기본 발송자명 또는 학원명입니다. |
| `SSODAA_TEST_RECEIVER_PHONE` | `` | 설정 화면 테스트 문자 기본 수신번호입니다. |
| `APP_ENCRYPTION_KEY` | `` | 쏘다 API Key/Token Key를 DB에 저장할 때 사용하는 암호화 키입니다. 없으면 DB 저장을 막고 `.env` fallback 사용을 안내합니다. |


# ASC Student Manage

ASC 학원 운영 보드입니다. Next.js, Prisma, SQLite를 사용합니다.

## GitHub Codespaces에서 실행

Codespaces 터미널에서 아래 순서로 실행하면 됩니다.

```bash
npm ci
npm run dev
```

`npm run dev`는 실행 전에 자동으로 다음 작업을 먼저 수행합니다.

- `.env`가 없으면 `DATABASE_URL="file:./dev.db"` 생성
- Prisma Client 생성
- SQLite DB 마이그레이션 적용
- Next.js 개발 서버를 `0.0.0.0:3000`으로 실행

서버가 뜨면 Codespaces의 forwarded port `3000` URL로 접속하면 됩니다.

## 로컬 실행

```bash
npm ci
npm run dev
```

로컬 DB 파일(`dev.db`), `.env`, `node_modules`, `.next`는 Git에 올리지 않습니다.

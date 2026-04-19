-- 문제 다국어 지원 (JSONB translations)

-- (1) translations 컬럼 추가 (nullable 임시)
ALTER TABLE "problems" ADD COLUMN "translations" jsonb;--> statement-breakpoint

-- (2) 기존 데이터 백필 — 모두 한국어 확정
UPDATE "problems"
SET "translations" = jsonb_build_object(
	'original', 'ko',
	'entries', jsonb_build_object(
		'ko', jsonb_build_object(
			'title', "title",
			'content', "content",
			'createdAt', to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			'updatedAt', to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		)
	)
);--> statement-breakpoint

-- (3) NOT NULL 제약 + 기존 컬럼 제거
ALTER TABLE "problems"
	ALTER COLUMN "translations" SET NOT NULL,
	DROP COLUMN "title",
	DROP COLUMN "content";--> statement-breakpoint

-- (4) display_title generated column 추가
ALTER TABLE "problems" ADD COLUMN "display_title" text
	GENERATED ALWAYS AS (
		COALESCE(
			"translations"->'entries'->'ko'->>'title',
			("translations"->'entries'->("translations"->>'original'))->>'title'
		)
	) STORED NOT NULL;--> statement-breakpoint

-- (5) 인덱스
CREATE INDEX IF NOT EXISTS "problems_display_title_idx" ON "problems" USING btree ("display_title");

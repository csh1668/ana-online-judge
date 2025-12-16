-- Playground MinIO 마이그레이션
-- content 필드를 minio_path로 변경

-- 1. 기존 playground_files 테이블의 모든 데이터 삭제 (기존 데이터는 MinIO에 없으므로)
TRUNCATE TABLE playground_files CASCADE;

-- 2. content 컬럼 삭제
ALTER TABLE playground_files DROP COLUMN IF EXISTS content;

-- 3. minio_path 컬럼 추가
ALTER TABLE playground_files ADD COLUMN IF NOT EXISTS minio_path TEXT NOT NULL;









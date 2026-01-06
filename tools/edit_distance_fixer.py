#!/usr/bin/env python3
"""
Edit Distance Fixer Tool

Anigma 문제의 edit_distance를 재계산하여 DB를 업데이트합니다.
줄바꿈 문자 정규화(\r\n -> \n)를 적용하여 일관된 결과를 보장합니다.

Usage:
    python3 edit_distance_fixer.py <contest_id> [--dry-run]

Example:
    # Dry run (DB 업데이트 안함)
    python3 edit_distance_fixer.py 1 --dry-run
    
    # 실제 DB 업데이트
    python3 edit_distance_fixer.py 1
"""

import sys
import os
import argparse
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import List, Dict, Any, Optional
import Levenshtein


def download_from_minio_via_docker(minio_path: str, local_path: str) -> None:
    """
    Docker cp를 통해 MinIO 컨테이너에서 파일을 다운로드합니다.
    
    Args:
        minio_path: MinIO 경로 (예: "aoj-storage/submissions/123.zip")
        local_path: 로컬 저장 경로
    """
    # MinIO 컨테이너 내부 경로: /data/<bucket>/<key>
    container_path = f"aoj-minio:/data/{minio_path}"
    
    cmd = ['docker', 'cp', container_path, local_path]
    
    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        raise IOError(f"Failed to download from MinIO: {e.stderr}")


def normalize_line_endings(text: str) -> str:
    """줄바꿈 문자를 정규화합니다 (\r\n -> \n)."""
    return text.replace('\r\n', '\n')


def read_all_source_files(directory: Path) -> str:
    """
    디렉토리에서 모든 소스 파일을 재귀적으로 읽어 합칩니다.
    Rust 코드의 read_all_source_files 함수와 동일한 로직입니다.
    """
    code = []
    valid_extensions = ['cpp', 'c', 'h', 'hpp', 'cc', 'cxx', 'java', 'py']
    
    # 정렬된 순서로 파일 읽기
    paths = sorted(directory.rglob('*'))
    
    for path in paths:
        if path.is_file():
            ext = path.suffix.lstrip('.').lower()
            if ext in valid_extensions:
                try:
                    content = path.read_text(encoding='utf-8', errors='ignore')
                    # 줄바꿈 정규화
                    content = normalize_line_endings(content)
                    code.append(content)
                    code.append('\n')
                except Exception as e:
                    print(f"Warning: Failed to read {path}: {e}")
    
    return ''.join(code)


def extract_reference_code(reference_code_path: str) -> str:
    """
    Reference 코드를 추출합니다.
    Rust 코드의 로직과 동일하게 ZIP 또는 단일 파일을 처리합니다.
    """
    if not reference_code_path:
        return ""
    
    with tempfile.TemporaryDirectory() as temp_dir:
        local_path = Path(temp_dir) / "reference"
        
        # MinIO 컨테이너에서 파일 복사
        download_from_minio_via_docker(reference_code_path, str(local_path))
        
        if reference_code_path.endswith('.zip'):
            # ZIP 파일인 경우
            extract_dir = Path(temp_dir) / "extracted"
            extract_dir.mkdir()
            
            with zipfile.ZipFile(local_path) as zf:
                zf.extractall(extract_dir)
            
            # 모든 소스 파일 읽기
            return read_all_source_files(extract_dir)
        else:
            # 단일 텍스트 파일
            text = local_path.read_text(encoding='utf-8', errors='ignore')
            return normalize_line_endings(text)


def extract_submitted_code(zip_path: str) -> str:
    """
    제출된 코드를 추출합니다.
    ZIP 파일을 압축 해제하여 모든 소스 파일을 읽습니다.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        local_zip = Path(temp_dir) / "submission.zip"
        extract_dir = Path(temp_dir) / "extracted"
        extract_dir.mkdir()
        
        # MinIO 컨테이너에서 ZIP 파일 복사
        download_from_minio_via_docker(zip_path, str(local_zip))
        
        # ZIP 압축 해제
        with zipfile.ZipFile(local_zip) as zf:
            zf.extractall(extract_dir)
        
        # 모든 소스 파일 읽기
        return read_all_source_files(extract_dir)


def calculate_edit_distance(submitted_code: str, reference_code: str) -> Optional[int]:
    """
    편집 거리를 계산합니다.
    Rust의 triple_accel::levenshtein과 동일한 결과를 반환합니다.
    """
    if not reference_code:
        return None
    
    # Levenshtein distance 계산
    distance = Levenshtein.distance(submitted_code, reference_code)
    return distance


def fetch_anigma_submissions(contest_id: int) -> List[Dict[str, Any]]:
    """
    PostgreSQL에서 contest_id에 해당하는 Anigma Task2 제출 기록을 가져옵니다.
    """
    query = f"""
    SELECT 
        s.id,
        s.problem_id,
        s.zip_path,
        s.edit_distance as old_edit_distance,
        p.reference_code_path,
        u.username
    FROM submissions s
    JOIN problems p ON s.problem_id = p.id
    JOIN users u ON s.user_id = u.id
    WHERE s.contest_id = {contest_id}
        AND s.anigma_task_type = 2
        AND s.verdict = 'accepted'
        AND s.zip_path IS NOT NULL
    ORDER BY s.id ASC
    """
    
    cmd = [
        'docker', 'exec', 'aoj-postgres',
        'psql', '-U', 'postgres', '-d', 'aoj',
        '-t', '-A', '-F', '|', '-c', query
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        submissions = []
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            
            parts = line.split('|')
            if len(parts) < 6:
                continue
            
            # None 문자열을 실제 None으로 변환
            old_distance = parts[3].strip()
            if old_distance == '' or old_distance.lower() == 'none':
                old_distance = None
            else:
                old_distance = int(old_distance)
            
            ref_code_path = parts[4].strip()
            if ref_code_path == '' or ref_code_path.lower() == 'none':
                ref_code_path = None
            
            submissions.append({
                'id': int(parts[0].strip()),
                'problem_id': int(parts[1].strip()),
                'zip_path': parts[2].strip(),
                'old_edit_distance': old_distance,
                'reference_code_path': ref_code_path,
                'username': parts[5].strip(),
            })
        
        return submissions
    except subprocess.CalledProcessError as e:
        print(f"Error fetching data from database: {e}")
        print(f"Error output: {e.stderr}")
        return []


def update_edit_distance(submission_id: int, new_distance: int) -> bool:
    """DB에서 edit_distance를 업데이트합니다."""
    query = f"UPDATE submissions SET edit_distance = {new_distance} WHERE id = {submission_id}"
    
    cmd = [
        'docker', 'exec', 'aoj-postgres',
        'psql', '-U', 'postgres', '-d', 'aoj',
        '-c', query
    ]
    
    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error updating database: {e}")
        print(f"Error output: {e.stderr}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Anigma 문제의 edit_distance를 재계산하여 DB를 업데이트합니다.'
    )
    parser.add_argument('contest_id', type=int, help='Contest ID')
    parser.add_argument('--dry-run', action='store_true', 
                       help='DB를 업데이트하지 않고 변경 사항만 출력합니다')
    
    args = parser.parse_args()
    
    print(f"Contest ID: {args.contest_id}")
    print(f"Dry Run: {args.dry_run}")
    print()
    
    # Submission 데이터 가져오기
    submissions = fetch_anigma_submissions(args.contest_id)
    
    if not submissions:
        print("No submissions found.")
        return 0
    
    print(f"Found {len(submissions)} submissions to process\n")
    
    # 통계
    total = len(submissions)
    updated = 0
    unchanged = 0
    errors = 0
    
    for idx, submission in enumerate(submissions, 1):
        sub_id = submission['id']
        username = submission['username']
        old_distance = submission['old_edit_distance']
        
        print(f"[{idx}/{total}] Processing submission #{sub_id} (user: {username})...", end=' ')
        
        try:
            # Reference 코드 추출
            ref_code = extract_reference_code(submission['reference_code_path'])
            
            # 제출 코드 추출
            submitted_code = extract_submitted_code(submission['zip_path'])
            
            # 편집 거리 계산
            new_distance = calculate_edit_distance(submitted_code, ref_code)
            
            if new_distance is None:
                print(f"SKIP (no reference code)")
                unchanged += 1
                continue
            
            if old_distance == new_distance:
                print(f"OK (distance: {new_distance})")
                unchanged += 1
            else:
                print(f"CHANGED (old: {old_distance}, new: {new_distance})")
                
                if not args.dry_run:
                    if update_edit_distance(sub_id, new_distance):
                        updated += 1
                    else:
                        errors += 1
                        print(f"  ERROR: Failed to update DB")
                else:
                    updated += 1  # dry-run에서는 카운트만
        
        except Exception as e:
            print(f"ERROR: {e}")
            errors += 1
    
    # 최종 통계
    print("\n" + "="*60)
    print(f"Total: {total}")
    print(f"Updated: {updated}")
    print(f"Unchanged: {unchanged}")
    print(f"Errors: {errors}")
    
    if args.dry_run:
        print("\n(This was a dry run - no changes were made to the database)")
    
    return 0 if errors == 0 else 1


if __name__ == '__main__':
    sys.exit(main())


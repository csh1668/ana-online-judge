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
from io import BytesIO
from pathlib import Path
from typing import List, Dict, Any, Optional
import Levenshtein
import boto3
from botocore.client import Config


def get_minio_client():
    """MinIO S3 클라이언트를 생성합니다."""
    endpoint = os.getenv('MINIO_ENDPOINT', 'http://localhost:9000')
    access_key = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
    secret_key = os.getenv('MINIO_SECRET_KEY', 'minioadmin')
    
    return boto3.client(
        's3',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version='s3v4'),
        region_name='us-east-1'
    )


def download_from_minio(client, bucket: str, key: str) -> bytes:
    """MinIO에서 파일을 다운로드합니다."""
    response = client.get_object(Bucket=bucket, Key=key)
    return response['Body'].read()


def list_minio_directory(client, bucket: str, prefix: str) -> List[str]:
    """MinIO 디렉토리의 파일 목록을 가져옵니다."""
    files = []
    paginator = client.get_paginator('list_objects_v2')
    
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        if 'Contents' in page:
            for obj in page['Contents']:
                files.append(obj['Key'])
    
    return files


def normalize_line_endings(text: str) -> str:
    """줄바꿈 문자를 정규화합니다 (\r\n -> \n)."""
    return text.replace('\r\n', '\n')


def read_all_source_files(directory: Path, debug: bool = False) -> str:
    """
    디렉토리에서 모든 소스 파일을 재귀적으로 읽어 합칩니다.
    Rust 코드의 read_all_source_files 함수와 동일한 로직입니다.
    """
    code = []
    valid_extensions = ['cpp', 'c', 'h', 'hpp', 'cc', 'cxx', 'java', 'py']
    
    # 정렬된 순서로 파일 읽기
    paths = sorted(directory.rglob('*'))
    
    if debug:
        print(f"    DEBUG: Scanning directory: {directory}")
        print(f"    DEBUG: Found {len(paths)} total items")
    
    source_files_found = 0
    skipped_files = 0
    for path in paths:
        if path.is_file():
            # macOS 메타데이터 파일 무시
            if path.name.startswith('._') or path.name == '.DS_Store':
                if debug:
                    print(f"    DEBUG: Skipped (metadata): {path.name}")
                skipped_files += 1
                continue
            
            ext = path.suffix.lstrip('.').lower()
            if debug:
                print(f"    DEBUG: File: {path.name} (ext: {ext})")
            if ext in valid_extensions:
                source_files_found += 1
                try:
                    content = path.read_text(encoding='utf-8', errors='ignore')
                    # 줄바꿈 정규화
                    content = normalize_line_endings(content)
                    code.append(content)
                    code.append('\n')
                except Exception as e:
                    print(f"    WARNING: Failed to read {path}: {e}")
    
    if debug:
        print(f"    DEBUG: Source files found: {source_files_found}, Skipped: {skipped_files}")
        print(f"    DEBUG: Total code length: {len(''.join(code))} chars")
    
    return ''.join(code)


def extract_reference_code(client, reference_code_path: str, bucket: str = "aoj-storage", debug: bool = False) -> str:
    """
    Reference 코드를 추출합니다.
    Rust 코드의 로직과 동일하게 ZIP, 디렉토리, 또는 단일 파일을 처리합니다.
    """
    if not reference_code_path:
        return ""
    
    if debug:
        print(f"    DEBUG: Reference path: {reference_code_path}")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # ZIP 파일인 경우
        if reference_code_path.endswith('.zip'):
            try:
                data = download_from_minio(client, bucket, reference_code_path)
                extract_dir = Path(temp_dir) / "extracted"
                extract_dir.mkdir()
                
                with zipfile.ZipFile(BytesIO(data)) as zf:
                    zf.extractall(extract_dir)
                
                return read_all_source_files(extract_dir, debug=debug)
            except Exception as e:
                if debug:
                    print(f"    DEBUG: Failed to download as ZIP: {e}")
                return ""
        
        # 디렉토리인지 확인 (파일 목록 조회)
        try:
            files = list_minio_directory(client, bucket, reference_code_path)
            
            if debug:
                print(f"    DEBUG: Found {len(files)} files in directory")
            
            if not files:
                # 단일 파일로 시도
                try:
                    data = download_from_minio(client, bucket, reference_code_path)
                    text = data.decode('utf-8', errors='ignore')
                    return normalize_line_endings(text)
                except:
                    return ""
            
            # 디렉토리인 경우 - 모든 파일 다운로드
            code_parts = []
            valid_extensions = ['cpp', 'c', 'h', 'hpp', 'cc', 'cxx', 'java', 'py']
            
            for file_key in sorted(files):
                filename = Path(file_key).name
                
                # macOS 메타데이터 파일 무시
                if filename.startswith('._') or filename == '.DS_Store':
                    if debug:
                        print(f"    DEBUG: Skipped (metadata): {file_key}")
                    continue
                
                file_ext = Path(file_key).suffix.lstrip('.').lower()
                if file_ext in valid_extensions:
                    try:
                        data = download_from_minio(client, bucket, file_key)
                        text = data.decode('utf-8', errors='ignore')
                        normalized = normalize_line_endings(text)
                        code_parts.append(normalized)
                        code_parts.append('\n')
                        if debug:
                            print(f"    DEBUG: Read file: {file_key} ({len(normalized)} chars)")
                    except Exception as e:
                        if debug:
                            print(f"    DEBUG: Failed to read {file_key}: {e}")
            
            result = ''.join(code_parts)
            if debug:
                print(f"    DEBUG: Total reference code: {len(result)} chars")
            return result
            
        except Exception as e:
            if debug:
                print(f"    DEBUG: Error processing reference code: {e}")
            return ""


def extract_submitted_code(client, zip_path: str, bucket: str = "aoj-storage", debug: bool = False) -> str:
    """
    제출된 코드를 추출합니다.
    ZIP 파일 또는 디렉토리에서 모든 소스 파일을 읽습니다.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # ZIP 파일로 시도
            data = download_from_minio(client, bucket, zip_path)
            extract_dir = Path(temp_dir) / "extracted"
            extract_dir.mkdir()
            
            with zipfile.ZipFile(BytesIO(data)) as zf:
                zf.extractall(extract_dir)
            
            result = read_all_source_files(extract_dir, debug=debug)
            if debug:
                print(f"    DEBUG: Submitted code (ZIP): {len(result)} chars")
            return result
        except:
            # 디렉토리인 경우
            files = list_minio_directory(client, bucket, zip_path)
            code_parts = []
            valid_extensions = ['cpp', 'c', 'h', 'hpp', 'cc', 'cxx', 'java', 'py']
            
            for file_key in sorted(files):
                file_ext = Path(file_key).suffix.lstrip('.').lower()
                if file_ext in valid_extensions:
                    try:
                        data = download_from_minio(client, bucket, file_key)
                        text = data.decode('utf-8', errors='ignore')
                        normalized = normalize_line_endings(text)
                        code_parts.append(normalized)
                        code_parts.append('\n')
                        if debug:
                            print(f"    DEBUG: Read file: {file_key} ({len(normalized)} chars)")
                    except:
                        pass
            
            result = ''.join(code_parts)
            if debug:
                print(f"    DEBUG: Submitted code (dir): {len(result)} chars")
            return result


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
    parser.add_argument('--debug', action='store_true',
                       help='디버그 정보 출력')
    
    args = parser.parse_args()
    
    print(f"Contest ID: {args.contest_id}")
    print(f"Dry Run: {args.dry_run}")
    print()
    
    # MinIO 클라이언트 생성
    try:
        minio_client = get_minio_client()
    except Exception as e:
        print(f"Error creating MinIO client: {e}")
        print("Please check MINIO_ENDPOINT environment variable")
        print("For production, use SSH port forwarding:")
        print("  ssh -L 9000:localhost:9000 user@server")
        return 1
    
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
            ref_code = extract_reference_code(minio_client, submission['reference_code_path'], debug=args.debug)
            
            # 제출 코드 추출
            submitted_code = extract_submitted_code(minio_client, submission['zip_path'], debug=args.debug)
            
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
                diff_pct = abs(new_distance - old_distance) / max(old_distance, 1) * 100 if old_distance else 0
                print(f"CHANGED (old: {old_distance}, new: {new_distance}, diff: {diff_pct:.1f}%)")
                
                # 변화가 너무 큰 경우 경고
                if args.debug and diff_pct > 50:
                    print(f"    WARNING: Large change detected! Please verify.")
                    print(f"    Ref code length: {len(ref_code)}, Submitted code length: {len(submitted_code)}")
                
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


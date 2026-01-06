#!/usr/bin/env python3
"""
각 문제별 제출 통계를 출력하는 스크립트
- 제출 횟수
- 정답 횟수
- 정답률
- 처음으로 Task2 Accepted user_id
- 처음으로 Task2 Accepted 시간
"""

import sys
import subprocess
from typing import List, Dict, Optional, Tuple
from datetime import datetime


def get_contest_problems(contest_id: int) -> List[str]:
    """
    contest_id에 해당하는 문제 label 목록을 가져옵니다.
    """
    query = f'SELECT DISTINCT label, "order" FROM contest_problems WHERE contest_id = {contest_id} ORDER BY "order" ASC'
    
    cmd = [
        'docker', 'exec', 'aoj-postgres',
        'psql', '-U', 'postgres', '-d', 'aoj',
        '-t', '-A', '-c', query
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        problems = []
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                parts = line.strip().split('|')
                if parts:
                    problems.append(parts[0].strip())
        
        return problems
    except subprocess.CalledProcessError as e:
        print(f"Error fetching problems: {e}")
        return []


def get_problem_statistics(contest_id: int, problem_no: str) -> Dict:
    """
    특정 문제의 통계 정보를 가져옵니다.
    """
    query = f"""
    SELECT 
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE s.verdict = 'accepted') as accepted_count
    FROM submissions s
    JOIN contest_problems cp ON s.problem_id = cp.problem_id AND s.contest_id = cp.contest_id
    WHERE s.contest_id = {contest_id}
      AND cp.label = '{problem_no}'
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
        
        if result.stdout.strip():
            parts = result.stdout.strip().split('|')
            if len(parts) >= 2:
                total = int(parts[0].strip()) if parts[0].strip() else 0
                accepted = int(parts[1].strip()) if parts[1].strip() else 0
                acceptance_rate = (accepted / total * 100) if total > 0 else 0.0
                
                return {
                    'total_submissions': total,
                    'accepted_count': accepted,
                    'acceptance_rate': acceptance_rate
                }
        
        return {
            'total_submissions': 0,
            'accepted_count': 0,
            'acceptance_rate': 0.0
        }
    except subprocess.CalledProcessError as e:
        print(f"Error fetching statistics: {e}")
        return {
            'total_submissions': 0,
            'accepted_count': 0,
            'acceptance_rate': 0.0
        }


def get_contest_start_time(contest_id: int) -> Optional[datetime]:
    """
    contest의 시작 시간을 가져옵니다.
    """
    query = f"""
    SELECT 
        TO_CHAR(start_time, 'YYYY-MM-DD HH24:MI:SS') as start_time
    FROM contests
    WHERE id = {contest_id}
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
        
        if result.stdout.strip():
            start_time_str = result.stdout.strip().split('|')[0].strip()
            return datetime.strptime(start_time_str, '%Y-%m-%d %H:%M:%S')
        
        return None
    except (subprocess.CalledProcessError, ValueError) as e:
        print(f"Error fetching contest start time: {e}")
        return None


def get_first_task2_accepted(contest_id: int, problem_no: str) -> Optional[Tuple[str, datetime]]:
    """
    Task2 Accepted 중 가장 첫 번째 제출의 user_id와 시간을 가져옵니다.
    """
    query = f"""
    SELECT 
        u.username,
        TO_CHAR(s.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
    FROM submissions s
    JOIN contest_problems cp ON s.problem_id = cp.problem_id AND s.contest_id = cp.contest_id
    JOIN users u ON s.user_id = u.id
    WHERE s.contest_id = {contest_id}
      AND cp.label = '{problem_no}'
      AND s.anigma_task_type = 2
      AND s.verdict = 'accepted'
    ORDER BY s.created_at ASC
    LIMIT 1
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
        
        if result.stdout.strip():
            parts = result.stdout.strip().split('|')
            if len(parts) >= 2:
                username = parts[0].strip()
                created_at_str = parts[1].strip()
                created_at = datetime.strptime(created_at_str, '%Y-%m-%d %H:%M:%S')
                return (username, created_at)
        
        return None
    except (subprocess.CalledProcessError, ValueError) as e:
        print(f"Error fetching first Task2 accepted: {e}")
        return None


def format_time_delta(seconds: float) -> str:
    """
    초 단위 시간을 HH:MM:SS 형식으로 변환합니다.
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 problem_statistics.py <contest_id>")
        sys.exit(1)
    
    try:
        contest_id = int(sys.argv[1])
    except ValueError:
        print(f"Error: Invalid contest_id: {sys.argv[1]}")
        sys.exit(1)
    
    problems = get_contest_problems(contest_id)
    
    if not problems:
        print(f"No problems found for contest_id: {contest_id}")
        sys.exit(1)
    
    # Contest 시작 시간 가져오기
    start_time = get_contest_start_time(contest_id)
    if not start_time:
        print(f"Error: Could not fetch contest start time for contest_id: {contest_id}")
        sys.exit(1)
    
    # 헤더 출력
    print(f"{'Problem':<10} {'Total':<10} {'Accepted':<10} {'Rate (%)':<12} {'First Task2 User':<20} {'First Task2 Time':<20}")
    print("-" * 100)
    
    # 각 문제별 통계 출력
    for problem_no in problems:
        stats = get_problem_statistics(contest_id, problem_no)
        first_task2 = get_first_task2_accepted(contest_id, problem_no)
        
        problem_label = problem_no
        total = stats['total_submissions']
        accepted = stats['accepted_count']
        rate = stats['acceptance_rate']
        first_user = first_task2[0] if first_task2 else "N/A"
        
        # Contest 시작 시간으로부터의 상대 시간 계산
        if first_task2:
            time_diff = (first_task2[1] - start_time).total_seconds()
            first_time = format_time_delta(time_diff)
        else:
            first_time = "N/A"
        
        print(f"{problem_label:<10} {total:<10} {accepted:<10} {rate:<12.2f} {first_user:<20} {first_time:<20}")


if __name__ == '__main__':
    main()


import subprocess
import json
from typing import List, Dict, Any


def fetch_submissions_from_db(contest_id: int) -> List[Dict[str, Any]]:
    """
    PostgreSQL에서 contest_id에 해당하는 모든 제출 기록을 가져옵니다.
    """
    query = f"""
    SELECT 
        s.id,
        s.user_id,
        u.username,
        u.name,
        cp.label as problem_no,
        s.verdict,
        s.score,
        s.execution_time,
        s.memory_used,
        s.language,
        TO_CHAR(s.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        s.anigma_task_type
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN contest_problems cp ON s.problem_id = cp.problem_id AND s.contest_id = cp.contest_id
    WHERE s.contest_id = {contest_id}
    ORDER BY s.created_at ASC
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
            if len(parts) < 12:
                continue
            
            submissions.append({
                'id': parts[0].strip(),
                'user_id': parts[1].strip(),
                'username': parts[2].strip(),
                'name': parts[3].strip(),
                'problem_no': parts[4].strip(),
                'verdict': parts[5].strip(),
                'score': parts[6].strip(),
                'execution_time': parts[7].strip(),
                'memory_used': parts[8].strip(),
                'language': parts[9].strip(),
                'created_at': parts[10].strip(),
                'anigma_task_type': parts[11].strip()
            })
        
        return submissions
    except subprocess.CalledProcessError as e:
        print(f"Error fetching data from database: {e}")
        print(f"Error output: {e.stderr}")
        return []


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
                # label만 추출 (첫 번째 컬럼)
                parts = line.strip().split('|')
                if parts:
                    problems.append(parts[0].strip())
        
        return problems
    except subprocess.CalledProcessError as e:
        print(f"Error fetching problems: {e}")
        return []


def get_contest_time_range(contest_id: int) -> tuple:
    """
    contest의 시작 시간과 종료 시간을 가져옵니다.
    """
    query = f"""
    SELECT 
        TO_CHAR(start_time, 'YYYY-MM-DD HH24:MI:SS') as start_time,
        TO_CHAR(end_time, 'YYYY-MM-DD HH24:MI:SS') as end_time
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
            parts = result.stdout.strip().split('|')
            if len(parts) >= 2:
                return (parts[0].strip(), parts[1].strip())
        
        return (None, None)
    except subprocess.CalledProcessError as e:
        print(f"Error fetching contest time range: {e}")
        return (None, None)


def get_freeze_time(contest_id: int) -> str:
    """
    contest의 freeze 시간을 계산합니다.
    """
    query = f"""
    SELECT 
        TO_CHAR(end_time, 'YYYY-MM-DD HH24:MI:SS') as end_time,
        freeze_minutes
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
            parts = result.stdout.strip().split('|')
            if len(parts) >= 2 and parts[1].strip() and parts[1].strip() != 'None':
                # freeze_time 계산은 Python에서 처리
                return parts[0].strip(), parts[1].strip()
        
        return None, None
    except subprocess.CalledProcessError as e:
        print(f"Error fetching freeze time: {e}")
        return None, None


import sys
import os
from typing import List, Dict, Any
from datetime import datetime, timedelta

# 현재 디렉토리를 Python path에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from model import Submission, SubmissionResult


def map_verdict_to_result(verdict: str) -> str:
    """
    DB의 verdict 값을 SubmissionResult enum 값으로 변환합니다.
    """
    mapping = {
        'accepted': SubmissionResult.ACCEPTED.value,
        'wrong_answer': SubmissionResult.WRONG_ANSWER.value,
        'time_limit_exceeded': SubmissionResult.TIME_LIMIT_EXCEEDED.value,
        'memory_limit_exceeded': SubmissionResult.MEMORY_LIMIT_EXCEEDED.value,
        'runtime_error': SubmissionResult.RUNTIME_ERROR.value,
        'compile_error': SubmissionResult.COMPILE_ERROR.value,
        'presentation_error': SubmissionResult.PRESENTATION_ERROR.value,
    }
    
    return mapping.get(verdict, '기타')


def convert_db_to_submission(db_row: Dict[str, Any]) -> Submission:
    """
    DB에서 가져온 데이터를 Submission 모델로 변환합니다.
    """
    # created_at은 이미 TO_CHAR로 문자열로 변환되어 있음
    submitted_at = db_row['created_at'].strip()
    
    # memory_used와 execution_time 처리
    memory_kb = None
    if db_row['memory_used'] and db_row['memory_used'].strip() and db_row['memory_used'] != 'None':
        try:
            memory_kb = int(db_row['memory_used'])
        except:
            memory_kb = None
    
    time_ms = None
    if db_row['execution_time'] and db_row['execution_time'].strip() and db_row['execution_time'] != 'None':
        try:
            time_ms = int(db_row['execution_time'])
        except:
            time_ms = None
    
    # code_length는 DB에 없으므로 0으로 설정
    code_length = 0
    
    # anigma_task_type 처리
    task_type = None
    if 'anigma_task_type' in db_row and db_row['anigma_task_type'] and db_row['anigma_task_type'].strip() and db_row['anigma_task_type'] != 'None':
        try:
            task_type = int(db_row['anigma_task_type'])
        except:
            task_type = None
    
    return Submission(
        submission_id=int(db_row['id']),
        user_id=db_row['username'],
        problem_no=db_row['problem_no'],
        result=map_verdict_to_result(db_row['verdict']),
        memory_kb=memory_kb,
        time_ms=time_ms,
        language=db_row['language'],
        source_url=None,
        code_length=code_length,
        submitted_at=submitted_at,
        task_type=task_type
    )


def convert_db_rows_to_submissions(db_rows: List[Dict[str, Any]]) -> List[Submission]:
    """
    DB에서 가져온 여러 행을 Submission 리스트로 변환합니다.
    """
    return [convert_db_to_submission(row) for row in db_rows]


def calculate_freeze_time(end_time_str: str, freeze_minutes: int) -> str:
    """
    종료 시간과 freeze_minutes로부터 freeze 시작 시간을 계산합니다.
    """
    try:
        end_time = datetime.strptime(end_time_str, '%Y-%m-%d %H:%M:%S')
        freeze_time = end_time - timedelta(minutes=freeze_minutes)
        return freeze_time.strftime('%Y-%m-%d %H:%M:%S')
    except:
        return None


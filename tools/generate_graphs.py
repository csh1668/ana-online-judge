#!/usr/bin/env python3
"""
Contest ID를 입력받아 해당 대회의 모든 문제에 대한 제출 그래프를 생성합니다.
"""

import sys
import os
from typing import List

from db_connector import (
    fetch_submissions_from_db,
    get_contest_problems,
    get_contest_time_range,
    get_freeze_time
)
from db_to_model import convert_db_rows_to_submissions, calculate_freeze_time
from graph import GraphBuilder
from model import Submission


def generate_graphs_for_contest(contest_id: int, output_dir: str = 'output'):
    """
    contest_id에 해당하는 대회의 모든 문제에 대한 그래프를 생성합니다.
    """
    print(f"Fetching data for contest {contest_id}...")
    
    # 문제 목록 가져오기
    problems = get_contest_problems(contest_id)
    if not problems:
        print(f"No problems found for contest {contest_id}")
        return
    
    print(f"Found {len(problems)} problems: {', '.join(problems)}")
    
    # 대회 시간 범위 가져오기
    start_time, end_time = get_contest_time_range(contest_id)
    if not start_time or not end_time:
        print(f"Could not fetch contest time range for contest {contest_id}")
        return
    
    print(f"Contest time range: {start_time} ~ {end_time}")
    
    # Freeze 시간 가져오기
    end_time_obj, freeze_minutes = get_freeze_time(contest_id)
    freeze_time_str = None
    if end_time_obj and freeze_minutes:
        try:
            freeze_minutes_int = int(freeze_minutes)
            if freeze_minutes_int > 0:
                freeze_time_str = calculate_freeze_time(end_time_obj, freeze_minutes_int)
                print(f"Freeze time: {freeze_time_str}")
        except:
            pass
    
    # 모든 제출 기록 가져오기
    db_submissions = fetch_submissions_from_db(contest_id)
    if not db_submissions:
        print(f"No submissions found for contest {contest_id}")
        return
    
    print(f"Found {len(db_submissions)} total submissions")
    
    # Submission 모델로 변환
    all_submissions = convert_db_rows_to_submissions(db_submissions)
    
    # 문제별로 그룹화
    from graph import SubmissionRepository
    grouped = SubmissionRepository.group_by_problem(all_submissions)
    
    # 출력 디렉토리 생성
    os.makedirs(output_dir, exist_ok=True)
    
    # 각 문제에 대해 그래프 생성
    for problem_no in problems:
        problem_submissions = grouped.get(problem_no, [])
        
        if not problem_submissions:
            print(f"No submissions for problem {problem_no}, skipping...")
            continue
        
        print(f"Generating graph for problem {problem_no} ({len(problem_submissions)} submissions)...")
        
        output_path = os.path.join(output_dir, f'contest_{contest_id}_problem_{problem_no}.png')
        
        try:
            GraphBuilder() \
                .with_submissions(problem_submissions) \
                .with_time_range(start_time, end_time) \
                .with_freeze_time(freeze_time_str) \
                .with_output_path(output_path) \
                .build()
            
            print(f"✓ Graph saved to {output_path}")
        except Exception as e:
            print(f"✗ Error generating graph for problem {problem_no}: {e}")
    
    print(f"\nAll graphs generated in '{output_dir}' directory")


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_graphs.py <contest_id> [output_dir]")
        print("Example: python generate_graphs.py 1 output")
        sys.exit(1)
    
    try:
        contest_id = int(sys.argv[1])
    except ValueError:
        print(f"Error: '{sys.argv[1]}' is not a valid contest ID")
        sys.exit(1)
    
    output_dir = sys.argv[2] if len(sys.argv) > 2 else 'output'
    
    generate_graphs_for_contest(contest_id, output_dir)


if __name__ == '__main__':
    main()


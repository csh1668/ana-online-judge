#!/usr/bin/env python3
"""
Contest ID를 입력받아 각 문제별로 max(edit_distance)의 시간별 변화를 선그래프로 생성합니다.
"""

import sys
import os
import subprocess
from typing import List, Dict, Tuple
from datetime import datetime
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# 현재 디렉토리를 Python path에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db_connector import (
    fetch_submissions_from_db,
    get_contest_problems,
    get_contest_time_range,
    get_freeze_time
)
from db_to_model import calculate_freeze_time


def get_r_min_max_data(contest_id: int, problem_no: str) -> List[Tuple[datetime, int, int]]:
    """
    특정 문제의 R_min, R_max 데이터를 시간순으로 가져옵니다.
    R_min: 현재까지의 모든 정답 제출 중 최소 edit_distance
    R_max: 현재까지의 모든 정답 제출 중 최대 edit_distance
    """
    query = f"""
    SELECT 
        TO_CHAR(s.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        s.edit_distance
    FROM submissions s
    JOIN contest_problems cp ON s.problem_id = cp.problem_id AND s.contest_id = cp.contest_id
    WHERE s.contest_id = {contest_id}
      AND cp.label = '{problem_no}'
      AND s.anigma_task_type = 2
      AND s.edit_distance IS NOT NULL
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
        
        data = []
        r_min = None
        r_max = None
        
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            
            parts = line.split('|')
            if len(parts) < 2:
                continue
            
            created_at_str = parts[0].strip()
            edit_distance_str = parts[1].strip()
            
            if not edit_distance_str or edit_distance_str == 'None':
                continue
            
            try:
                edit_distance = int(edit_distance_str)
                created_at = datetime.strptime(created_at_str, '%Y-%m-%d %H:%M:%S')
                
                # R_min, R_max 추적 (현재까지의 모든 정답 제출 중 최소/최대)
                if r_min is None:
                    r_min = edit_distance
                    r_max = edit_distance
                else:
                    r_min = min(r_min, edit_distance)
                    r_max = max(r_max, edit_distance)
                
                data.append((created_at, r_min, r_max))
            except (ValueError, TypeError):
                continue
        
        return data
    except subprocess.CalledProcessError as e:
        print(f"Error fetching edit distance data: {e}")
        return []


def generate_edit_distance_graph(contest_id: int, problem_no: str, start_time: str, end_time: str, freeze_time: str = None, output_path: str = None):
    """
    특정 문제의 R_min, R_max 변화 그래프를 생성합니다.
    """
    print(f"Fetching R_min/R_max data for problem {problem_no}...")
    
    data = get_r_min_max_data(contest_id, problem_no)
    
    if not data:
        print(f"No edit distance data found for problem {problem_no}")
        return
    
    print(f"Found {len(data)} data points")
    
    # 데이터 분리
    times = [d[0] for d in data]
    r_mins = [d[1] for d in data]
    r_maxs = [d[2] for d in data]
    
    # 그래프 생성
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # R_min, R_max 선그래프 그리기
    ax.plot(times, r_mins, marker='o', markersize=3, linewidth=2, label='R_min', color='cyan')
    ax.plot(times, r_maxs, marker='s', markersize=3, linewidth=2, label='R_max', color='orange')
    
    # 시간 범위 설정
    start_dt = datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S')
    end_dt = datetime.strptime(end_time, '%Y-%m-%d %H:%M:%S')
    ax.set_xlim(start_dt, end_dt)
    
    # Freeze 시간 표시
    if freeze_time:
        freeze_dt = datetime.strptime(freeze_time, '%Y-%m-%d %H:%M:%S')
        ax.axvline(x=freeze_dt, color='red', linestyle='--', linewidth=2, label='Freeze Time', alpha=0.7)
    
    # 레이블 및 제목
    ax.set_xlabel('Time', fontsize=12)
    ax.set_ylabel('Edit Distance', fontsize=12)
    ax.set_title(f'Contest {contest_id} - Problem {problem_no}: R_min / R_max Over Time', fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3)
    ax.legend()
    
    # x축 날짜 포맷
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d %H:%M'))
    ax.xaxis.set_major_locator(mdates.HourLocator(interval=6))
    plt.xticks(rotation=45)
    
    plt.tight_layout()
    
    if output_path:
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"✓ Graph saved to {output_path}")
    else:
        plt.show()
    
    plt.close()


def generate_all_edit_distance_graphs(contest_id: int, output_dir: str = 'output'):
    """
    contest_id에 해당하는 모든 문제에 대한 edit distance 그래프를 생성합니다.
    """
    print(f"Generating edit distance graphs for contest {contest_id}...")
    
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
    
    # 출력 디렉토리 생성
    os.makedirs(output_dir, exist_ok=True)
    
    # 각 문제에 대해 그래프 생성
    for problem_no in problems:
        output_path = os.path.join(output_dir, f'contest_{contest_id}_problem_{problem_no}_edit_distance.png')
        
        try:
            generate_edit_distance_graph(
                contest_id, 
                problem_no, 
                start_time, 
                end_time, 
                freeze_time_str, 
                output_path
            )
        except Exception as e:
            print(f"✗ Error generating graph for problem {problem_no}: {e}")
    
    print(f"\nAll edit distance graphs generated in '{output_dir}' directory")


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_edit_distance_graph.py <contest_id> [output_dir]")
        print("Example: python generate_edit_distance_graph.py 1 output")
        sys.exit(1)
    
    try:
        contest_id = int(sys.argv[1])
    except ValueError:
        print(f"Error: '{sys.argv[1]}' is not a valid contest ID")
        sys.exit(1)
    
    output_dir = sys.argv[2] if len(sys.argv) > 2 else 'output'
    
    generate_all_edit_distance_graphs(contest_id, output_dir)


if __name__ == '__main__':
    main()


#!/usr/bin/env python3
"""
Contest ID를 입력받아 제출 그래프와 edit distance 그래프를 합친 통합 그래프를 생성합니다.
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
from db_to_model import convert_db_rows_to_submissions, calculate_freeze_time
from graph import GraphBuilder, TimeRange, SubmissionBinner, GraphRenderer


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
      AND s.verdict = 'accepted'
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
        print(f"Error fetching R_min/R_max data: {e}")
        return []


def generate_combined_graph(contest_id: int, problem_no: str, start_time: str, end_time: str, 
                            freeze_time: str = None, output_path: str = None):
    """
    제출 그래프와 edit distance 그래프를 합친 통합 그래프를 생성합니다.
    """
    print(f"Generating combined graph for problem {problem_no}...")
    
    # 제출 데이터 가져오기
    db_submissions = fetch_submissions_from_db(contest_id)
    if not db_submissions:
        print(f"No submissions found for problem {problem_no}")
        return
    
    # 해당 문제의 제출만 필터링
    problem_submissions = [
        s for s in db_submissions 
        if s.get('problem_no') == problem_no
    ]
    
    if not problem_submissions:
        print(f"No submissions found for problem {problem_no}")
        return
    
    # Submission 모델로 변환
    from db_to_model import convert_db_rows_to_submissions
    submissions = convert_db_rows_to_submissions(problem_submissions)
    
    # 그래프 생성
    fig = plt.figure(figsize=(15, 8))
    fig.patch.set_facecolor('#28343B')
    
    # 상단: 제출 그래프 (기존 스타일)
    ax1 = plt.subplot(2, 1, 1)
    ax1.set_facecolor('#28343B')
    
    # TimeRange 생성
    time_range = TimeRange.from_strings(start_time, end_time)
    
    # 제출 데이터 binning
    freeze_dt = None
    if freeze_time:
        try:
            freeze_dt = datetime.strptime(freeze_time, '%Y-%m-%d %H:%M:%S')
        except:
            pass
    
    binner = SubmissionBinner(minute_delta=3, freeze_time=freeze_dt)
    binned_data = binner.bin_submissions(submissions)
    
    # 제출 그래프 그리기
    sorted_bins = sorted(binned_data.items())
    max_positive, max_negative = 0, 0
    for _, bin_data in sorted_bins:
        max_positive = max(max_positive, bin_data.max_positive())
        max_negative = max(max_negative, bin_data.max_negative())
    
    bar_width = timedelta(minutes=3)
    for time_bin, counts in sorted_bins:
        if counts.blue > 0:
            ax1.bar(time_bin, counts.blue, color='#1E90FF', width=bar_width, align='edge')  # Dodger Blue (Task1)
        if counts.green > 0:
            ax1.bar(time_bin, counts.green, color='#32CD32', width=bar_width, align='edge')  # Lime Green (Task2)
        if counts.red > 0:
            ax1.bar(time_bin, -counts.red, color='#dd4124', width=bar_width, align='edge')
        if counts.orange > 0:
            ax1.bar(time_bin, -counts.orange, bottom=-counts.red, color='#fa7268', width=bar_width, align='edge')
        if counts.dark_grey > 0:
            bottom_position = -(counts.red + counts.orange)
            ax1.bar(time_bin, -counts.dark_grey, bottom=bottom_position, color='#0f4c81', width=bar_width, align='edge')
    
    # 상단 그래프 설정
    ax1.axhline(0, color='grey', linewidth=2.5)
    if max_positive == 0 and max_negative == 0:
        ax1.set_ylim(-3, 3)
    else:
        ax1.set_ylim(-(max_negative + 1), max_positive + 1)
    ax1.set_xlim(time_range.start, time_range.end)
    ax1.xaxis.set_visible(False)
    ax1.yaxis.set_visible(False)
    for spine in ('top', 'right', 'left', 'bottom'):
        ax1.spines[spine].set_visible(False)
    
    # Freeze 시간 표시
    if freeze_dt:
        ax1.axvline(x=freeze_dt, color='red', linestyle='--', linewidth=2, alpha=0.7)
    
    # 하단: R_min, R_max 그래프
    ax2 = plt.subplot(2, 1, 2)
    ax2.set_facecolor('#28343B')
    
    r_min_max_data = get_r_min_max_data(contest_id, problem_no)
    
    if r_min_max_data:
        times = [d[0] for d in r_min_max_data]
        r_mins = [d[1] for d in r_min_max_data]
        r_maxs = [d[2] for d in r_min_max_data]
        
        # R_min, R_max 선그래프 그리기 (영역 색칠 없음)
        ax2.plot(times, r_mins, marker='o', markersize=4, linewidth=2.5, 
                color='cyan', alpha=0.9)
        ax2.plot(times, r_maxs, marker='s', markersize=4, linewidth=2.5, 
                color='orange', alpha=0.9)
        
        # R_min의 최소값 (peak 중 최소) 찾기
        min_r_min = min(r_mins)
        min_r_min_idx = r_mins.index(min_r_min)
        min_r_min_time = times[min_r_min_idx]
        
        # R_max의 최대값 (peak 중 최대) 찾기
        max_r_max = max(r_maxs)
        max_r_max_idx = r_maxs.index(max_r_max)
        max_r_max_time = times[max_r_max_idx]
        
        # R_min의 마지막 값 찾기
        last_r_min = r_mins[-1]
        last_r_min_time = times[-1]
        
        # R_max의 마지막 값 찾기
        last_r_max = r_maxs[-1]
        last_r_max_time = times[-1]
        
        # R_min 최소값 표시 (아래로)
        ax2.text(min_r_min_time, min_r_min, f'  {min_r_min}', 
                color='cyan', fontsize=32, fontweight='bold',
                verticalalignment='top', horizontalalignment='left')
        
        # R_min 마지막 값 표시 (최소값과 다를 때만)
        if last_r_min != min_r_min:
            ax2.text(last_r_min_time, last_r_min, f'  {last_r_min}', 
                    color='cyan', fontsize=32, fontweight='bold',
                    verticalalignment='top', horizontalalignment='left')
        
        # R_max 최대값 표시 (위로)
        ax2.text(max_r_max_time, max_r_max, f'  {max_r_max}', 
                color='orange', fontsize=32, fontweight='bold',
                verticalalignment='bottom', horizontalalignment='left')
        
        # R_max 마지막 값 표시 (최대값과 다를 때만)
        if last_r_max != max_r_max:
            ax2.text(last_r_max_time, last_r_max, f'  {last_r_max}', 
                    color='orange', fontsize=32, fontweight='bold',
                    verticalalignment='bottom', horizontalalignment='left')
        
        # y축 범위 설정 (R_min, R_max에 맞게)
        min_dist = min(r_mins)
        max_dist = max(r_maxs)
        if min_dist == max_dist:
            ax2.set_ylim(max(0, min_dist - 5), min_dist + 5)
        else:
            ax2.set_ylim(max(0, min_dist - 2), max_dist + 2)
    else:
        ax2.set_ylim(0, 10)
    
    # 하단 그래프 설정
    start_dt = datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S')
    end_dt = datetime.strptime(end_time, '%Y-%m-%d %H:%M:%S')
    ax2.set_xlim(start_dt, end_dt)
    
    # Axis 숨기기 (generate_graphs.py 스타일)
    ax2.xaxis.set_visible(False)
    ax2.yaxis.set_visible(False)
    for spine in ('top', 'right', 'left', 'bottom'):
        ax2.spines[spine].set_visible(False)
    
    # Freeze 시간 표시
    if freeze_dt:
        ax2.axvline(x=freeze_dt, color='red', linestyle='--', linewidth=2, alpha=0.7)
    
    # 배경색 설정
    for ax in [ax1, ax2]:
        ax.set_facecolor('#28343B')
    
    plt.tight_layout()
    
    if output_path:
        fig.patch.set_alpha(0.0)
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        plt.savefig(output_path, transparent=True, dpi=300, bbox_inches='tight')
        print(f"✓ Combined graph saved to {output_path}")
    else:
        plt.show()
    
    plt.close()


def generate_all_combined_graphs(contest_id: int, output_dir: str = 'output'):
    """
    contest_id에 해당하는 모든 문제에 대한 통합 그래프를 생성합니다.
    """
    print(f"Generating combined graphs for contest {contest_id}...")
    
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
        output_path = os.path.join(output_dir, f'contest_{contest_id}_problem_{problem_no}_combined.png')
        
        try:
            generate_combined_graph(
                contest_id, 
                problem_no, 
                start_time, 
                end_time, 
                freeze_time_str, 
                output_path
            )
        except Exception as e:
            print(f"✗ Error generating combined graph for problem {problem_no}: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\nAll combined graphs generated in '{output_dir}' directory")


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_combined_graph.py <contest_id> [output_dir]")
        print("Example: python generate_combined_graph.py 1 output")
        sys.exit(1)
    
    try:
        contest_id = int(sys.argv[1])
    except ValueError:
        print(f"Error: '{sys.argv[1]}' is not a valid contest ID")
        sys.exit(1)
    
    output_dir = sys.argv[2] if len(sys.argv) > 2 else 'output'
    
    generate_all_combined_graphs(contest_id, output_dir)


if __name__ == '__main__':
    from datetime import timedelta
    main()


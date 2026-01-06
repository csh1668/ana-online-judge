import os
import json
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Optional

from model import Submission, ResultCategory, BinData


class TimeRange:
    def __init__(self, start: datetime, end: datetime):
        self.start = start
        self.end = end

    @classmethod
    def from_submissions(cls, submissions: List[Submission], minute_delta: int = 3):
        times = []
        for submission in submissions:
            try:
                dt = datetime.strptime(submission.submitted_at, '%Y-%m-%d %H:%M:%S')
                times.append(dt)
            except:
                continue

        if not times:
            now = datetime.now()
            return cls(now, now)

        return cls(min(times), max(times) + timedelta(minutes=minute_delta))

    @classmethod
    def from_strings(cls, start_str: str, end_str: str):
        start = datetime.strptime(start_str, '%Y-%m-%d %H:%M:%S')
        end = datetime.strptime(end_str, '%Y-%m-%d %H:%M:%S')
        return cls(start, end)


class SubmissionBinner:
    def __init__(self, minute_delta: int = 3, freeze_time: Optional[datetime] = None):
        self.minute_delta = minute_delta
        self.freeze_time = freeze_time

    def bin_submissions(self, submissions: List[Submission]) -> Dict[datetime, BinData]:
        binned = defaultdict(BinData)

        for submission in submissions:
            try:
                dt = datetime.strptime(submission.submitted_at, '%Y-%m-%d %H:%M:%S')
            except:
                continue

            bin_key = dt.replace(
                minute=(dt.minute // self.minute_delta) * self.minute_delta,
                second=0,
                microsecond=0
            )

            # Task type에 따라 분류 (freeze 시간 로직 제거)
            category = submission.classify_result()

            binned[bin_key].increment(category)

        return dict(binned)


class GraphRenderer:
    def __init__(self):
        self.fig_width = 15
        self.fig_height = 4
        self.background_color = '#28343B'
        self.bar_width_minutes = 3

    def render(self, binned_data: Dict[datetime, BinData], time_range: TimeRange, output_path: str):
        fig, ax = plt.subplots(figsize=(self.fig_width, self.fig_height))
        fig.set_facecolor(self.background_color)
        ax.set_facecolor(self.background_color)

        sorted_bins = sorted(binned_data.items())
        max_positive, max_negative = self._calculate_limits(sorted_bins)

        self._draw_bars(ax, sorted_bins)
        self._configure_axes(ax, time_range, max_positive, max_negative)
        self._save_figure(fig, output_path)

    def _calculate_limits(self, sorted_bins) -> tuple:
        max_positive = 0
        max_negative = 0

        for _, bin_data in sorted_bins:
            max_positive = max(max_positive, bin_data.max_positive())
            max_negative = max(max_negative, bin_data.max_negative())

        return max_positive, max_negative

    def _draw_bars(self, ax, sorted_bins):
        bar_width = timedelta(minutes=self.bar_width_minutes)

        for time_bin, counts in sorted_bins:
            if counts.blue > 0:
                ax.bar(time_bin, counts.blue, color='#1E90FF', width=bar_width, align='edge')  # Dodger Blue (Task1)
            if counts.green > 0:
                ax.bar(time_bin, counts.green, color='#32CD32', width=bar_width, align='edge')  # Lime Green (Task2)
            if counts.red > 0:
                ax.bar(time_bin, -counts.red, color='#dd4124', width=bar_width, align='edge')
            if counts.orange > 0:
                ax.bar(time_bin, -counts.orange, bottom=-counts.red, color='#fa7268', width=bar_width, align='edge')
            if counts.dark_grey > 0:
                bottom_position = -(counts.red + counts.orange)
                ax.bar(time_bin, -counts.dark_grey, bottom=bottom_position, color='#0f4c81', width=bar_width, align='edge')

    def _configure_axes(self, ax, time_range: TimeRange, max_positive: int, max_negative: int):
        ax.axhline(0, color='grey', linewidth=2.5)

        if max_positive == 0 and max_negative == 0:
            ax.set_ylim(-3, 3)
        else:
            ax.set_ylim(-(max_negative + 1), max_positive + 1)

        ax.set_xlim(time_range.start, time_range.end)
        ax.xaxis.set_visible(False)
        ax.yaxis.set_visible(False)

        for spine in ('top', 'right', 'left', 'bottom'):
            ax.spines[spine].set_visible(False)

    def _save_figure(self, fig, output_path: str):
        plt.tight_layout()
        fig.patch.set_alpha(0.0)
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        plt.savefig(output_path, transparent=True)
        plt.close(fig)


class GraphBuilder:
    def __init__(self):
        self.submissions: List[Submission] = []
        self.time_range: Optional[TimeRange] = None
        self.freeze_time: Optional[datetime] = None
        self.minute_delta = 3
        self.output_path = 'graph.png'

    def with_submissions(self, submissions: List[Submission]):
        self.submissions = submissions
        return self

    def with_time_range(self, start: str, end: str):
        self.time_range = TimeRange.from_strings(start, end)
        return self

    def with_freeze_time(self, freeze_time_str: Optional[str]):
        if freeze_time_str:
            try:
                self.freeze_time = datetime.strptime(freeze_time_str, '%Y-%m-%d %H:%M:%S')
            except:
                self.freeze_time = None
        return self

    def with_minute_delta(self, minute_delta: int):
        self.minute_delta = minute_delta
        return self

    def with_output_path(self, output_path: str):
        self.output_path = output_path
        return self

    def build(self):
        if not self.submissions:
            raise ValueError("No submissions provided")

        if not self.time_range:
            self.time_range = TimeRange.from_submissions(self.submissions, self.minute_delta)

        binner = SubmissionBinner(self.minute_delta, self.freeze_time)
        binned_data = binner.bin_submissions(self.submissions)

        renderer = GraphRenderer()
        renderer.render(binned_data, self.time_range, self.output_path)


class SubmissionRepository:
    @staticmethod
    def load_from_jsonl(path: str) -> List[Submission]:
        submissions = []
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    submission = Submission(**data)
                    submissions.append(submission)
                except Exception:
                    continue
        return submissions

    @staticmethod
    def group_by_problem(submissions: List[Submission]) -> Dict[str, List[Submission]]:
        grouped = defaultdict(list)
        for submission in submissions:
            if submission.problem_no:
                grouped[submission.problem_no].append(submission)
        return dict(grouped)
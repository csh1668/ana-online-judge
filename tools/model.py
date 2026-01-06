from dataclasses import dataclass
from typing import Optional, Dict, Any
from enum import Enum


class SubmissionResult(str, Enum):
    ACCEPTED = '맞았습니다!!'
    WRONG_ANSWER = '틀렸습니다'
    TIME_LIMIT_EXCEEDED = '시간 초과'
    MEMORY_LIMIT_EXCEEDED = '메모리 초과'
    OUTPUT_LIMIT_EXCEEDED = '출력 초과'
    PRESENTATION_ERROR = '출력 형식이 잘못되었습니다'
    RUNTIME_ERROR = '런타임 에러'
    COMPILE_ERROR = '컴파일 에러'


class ResultCategory(str, Enum):
    GREEN = 'green'
    RED = 'red'
    ORANGE = 'orange'
    DARK_GREY = 'dark_grey'
    BLUE = 'blue'


@dataclass
class Submission:
    submission_id: int
    user_id: str
    problem_no: str
    result: str
    memory_kb: Optional[int]
    time_ms: Optional[int]
    language: str
    source_url: Optional[str]
    code_length: int
    submitted_at: str
    task_type: Optional[int] = None

    @classmethod
    def from_raw(cls, submission_id: str, user_id: str, problem_no: str,
                 result: str, memory_text: str, time_text: str, language: str,
                 source_url: Optional[str], code_len_text: str, submitted_at: str):
        return cls(
            submission_id=cls._extract_int(submission_id),
            user_id=str(user_id or ""),
            problem_no=str(problem_no or ""),
            result=str(result or ""),
            memory_kb=cls._extract_int(memory_text),
            time_ms=cls._extract_int(time_text),
            language=str(language or ""),
            source_url=source_url if source_url else None,
            code_length=cls._extract_int(code_len_text) or 0,
            submitted_at=str(submitted_at or "")
        )

    @staticmethod
    def _extract_int(text: str) -> Optional[int]:
        if text is None:
            return None
        digits = ''.join(ch for ch in str(text) if ch.isdigit())
        return int(digits) if digits else None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'submission_id': self.submission_id,
            'user_id': self.user_id,
            'problem_no': self.problem_no,
            'result': self.result,
            'memory_kb': self.memory_kb,
            'time_ms': self.time_ms,
            'language': self.language,
            'source_url': self.source_url,
            'code_length': self.code_length,
            'submitted_at': self.submitted_at,
            'task_type': self.task_type,
        }

    def classify_result(self) -> ResultCategory:
        if self.result == SubmissionResult.ACCEPTED:
            # Task1과 Task2를 구별
            if self.task_type == 1:
                return ResultCategory.BLUE
            else:  # task_type == 2 or None
                return ResultCategory.GREEN
        if self.result == SubmissionResult.WRONG_ANSWER:
            return ResultCategory.RED
        if self.result in (SubmissionResult.MEMORY_LIMIT_EXCEEDED,
                          SubmissionResult.OUTPUT_LIMIT_EXCEEDED,
                          SubmissionResult.PRESENTATION_ERROR,
                          SubmissionResult.TIME_LIMIT_EXCEEDED):
            return ResultCategory.ORANGE
        return ResultCategory.DARK_GREY


@dataclass
class BinData:
    green: int = 0
    red: int = 0
    orange: int = 0
    dark_grey: int = 0
    blue: int = 0

    def increment(self, category: ResultCategory):
        setattr(self, category.value, getattr(self, category.value) + 1)

    def max_positive(self) -> int:
        return self.green + self.blue

    def max_negative(self) -> int:
        return self.red + self.orange + self.dark_grey
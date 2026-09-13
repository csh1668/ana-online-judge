"""AOJ Python Checker SDK

Provides Checker and Interactive classes for writing custom judges.

Exit Code Convention (same as testlib.h):
  0 = Accepted
  1 = Wrong Answer
  2 = Presentation Error
  3 = Fail (checker bug)
"""

import sys
import os
from pathlib import Path

try:
    from urllib.request import urlopen, Request
except ImportError:
    urlopen = None
    Request = None


class Storage:
    """MinIO storage accessor via judge proxy."""

    def __init__(self):
        self._endpoint = os.environ.get("AOJ_STORAGE_ENDPOINT")
        self._token = os.environ.get("AOJ_STORAGE_TOKEN")

    @property
    def available(self):
        return self._endpoint is not None

    def _request(self, method, path, data=None):
        if not self.available:
            raise RuntimeError("Storage is not available (no AOJ_STORAGE_ENDPOINT)")
        url = f"{self._endpoint}/storage/{path}"
        headers = {}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        if data is not None:
            if isinstance(data, str):
                data = data.encode("utf-8")
            headers["Content-Type"] = "application/octet-stream"
        req = Request(url, data=data, headers=headers, method=method)
        with urlopen(req) as resp:
            return resp.read()

    def read(self, path):
        return self._request("GET", path).decode("utf-8")

    def read_bytes(self, path):
        return self._request("GET", path)

    def write(self, path, content):
        if isinstance(content, str):
            content = content.encode("utf-8")
        self._request("PUT", path, data=content)

    def exists(self, path):
        try:
            self._request("HEAD", path)
            return True
        except Exception:
            return False


class Checker:
    """Output checker: compares user output against expected answer.

    Usage:
        from aoj_checker import Checker

        checker = Checker()
        if checker.output.strip() == checker.answer.strip():
            checker.accept()
        else:
            checker.wrong_answer("Mismatch")

    argv: checker.py <input_file> <output_file> <answer_file>
    """

    def __init__(self):
        if len(sys.argv) < 4:
            print("Usage: checker.py <input> <output> <answer>", file=sys.stderr)
            sys.exit(3)
        self.input_path = Path(sys.argv[1])
        self.output_path = Path(sys.argv[2])
        self.answer_path = Path(sys.argv[3])
        self.storage = Storage()

    @property
    def input(self):
        return self.input_path.read_text()

    @property
    def output(self):
        return self.output_path.read_text()

    @property
    def answer(self):
        return self.answer_path.read_text()

    def accept(self, message=""):
        if message:
            print(message, file=sys.stderr)
        sys.exit(0)

    def wrong_answer(self, message=""):
        if message:
            print(message, file=sys.stderr)
        sys.exit(1)

    def presentation_error(self, message=""):
        if message:
            print(message, file=sys.stderr)
        sys.exit(2)

    def fail(self, message=""):
        if message:
            print(message, file=sys.stderr)
        sys.exit(3)


class Interactive:
    """Interactive checker (interactor): communicates with user program via stdin/stdout.

    Usage:
        from aoj_checker import Interactive

        interactor = Interactive()
        answer = int(interactor.input.strip())
        interactor.writeline("ready")
        guess = int(interactor.readline())
        if guess == answer:
            interactor.accept()
        else:
            interactor.wrong_answer("Wrong guess")

    argv: interactor.py <input_file>
    """

    def __init__(self):
        if len(sys.argv) < 2:
            print("Usage: interactor.py <input>", file=sys.stderr)
            sys.exit(3)
        self.input_path = Path(sys.argv[1])
        self.storage = Storage()
        self._stdin = sys.stdin
        self._stdout = sys.stdout
        # Redirect print() to stderr so it doesn't go to user program
        sys.stdout = sys.stderr

    @property
    def input(self):
        return self.input_path.read_text()

    def readline(self):
        """Read one line from user program."""
        line = self._stdin.readline()
        if not line:
            self.wrong_answer("Unexpected EOF from solution")
        return line.rstrip("\n")

    def writeline(self, line):
        """Write one line to user program."""
        self._stdout.write(str(line) + "\n")
        self._stdout.flush()

    def writelines(self, lines):
        """Write multiple lines to user program."""
        for line in lines:
            self.writeline(line)

    def accept(self, message=""):
        if message:
            print(message)  # goes to stderr
        sys.exit(0)

    def wrong_answer(self, message=""):
        if message:
            print(message)
        sys.exit(1)

    def fail(self, message=""):
        if message:
            print(message)
        sys.exit(3)


class Transformer:
    """two-step 변환기: 다음 단계의 표준입력을 만들고 1단계 출력을 검증한다.

    argv: transformer.py <input_file> <stage1_file> <phase_file>

    페이로드는 print로 직접 쓴다. 스크립트가 끝까지 돌면 종료 코드 0이므로
    성공 종료를 위한 별도 호출이 없다.

    Usage:
        from aoj_checker import Transformer

        t = Transformer()
        if t.phase == 1:
            print("step1")
            print(t.input, end="")
        else:
            n = int(t.input.split()[0])
            msg = t.stage1.strip()
            if not msg:
                t.presentation_error("1단계 출력이 비어 있습니다")
            if len(msg) > n:
                t.wrong_answer(f"메시지가 너무 깁니다 ({len(msg)} > {n})")
            print("step2")
            print(msg)
    """

    def __init__(self):
        if len(sys.argv) < 4:
            self.fail("usage: transformer.py <input_file> <stage1_file> <phase_file>")
        self.input = Path(sys.argv[1]).read_text()
        self.stage1 = Path(sys.argv[2]).read_text()
        try:
            self.phase = int(Path(sys.argv[3]).read_text().strip())
        except ValueError:
            self.fail("phase file must contain 1 or 2")
        if self.phase not in (1, 2):
            self.fail(f"phase must be 1 or 2, got {self.phase}")
        self.storage = Storage()

    def wrong_answer(self, message=""):
        print(message, file=sys.stderr)
        sys.exit(1)

    def presentation_error(self, message=""):
        print(message, file=sys.stderr)
        sys.exit(2)

    def fail(self, message=""):
        print(message, file=sys.stderr)
        sys.exit(3)

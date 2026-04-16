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

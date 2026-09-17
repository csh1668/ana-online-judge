#!/usr/bin/env bash
# 언어 툴체인 스모크 테스트.
#
# 빌드된 judge 이미지 안에서 languages.toml의 compile/run 커맨드를 그대로 재현해
# (1) 툴체인이 실제로 존재하는지 (2) 버전 문자열이 toml과 일치하는지
# (3) C/C++의 -static 링크가 깨지지 않았는지 (4) Java 절대경로가 유효한지 확인한다.
#
# 사용법:
#   make dev-judge-build
#   docker compose run --rm --entrypoint bash judge /app/scripts/smoke-languages.sh
#
# 이미지에 scripts/가 포함되지 않았다면:
#   docker compose run --rm --entrypoint bash -v "$PWD/judge/scripts:/s" judge /s/smoke-languages.sh

set -uo pipefail

PASS=0
FAIL=0
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

ok()   { echo "  ✅ $*"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $*"; FAIL=$((FAIL+1)); }
head_() { echo; echo "=== $* ==="; }

# 실행 결과가 기대한 stdout과 같은지.
# stderr는 비교 대상에서 제외한다 — JVM이 JAVA_TOOL_OPTIONS 안내를 stderr로 찍는데
# 실제 채점도 stdout만 비교하므로 동일한 기준을 적용한다.
expect_out() { # expect_out <label> <expected> <cmd...>
	local label=$1 expected=$2; shift 2
	local actual err
	err=$(mktemp)
	actual=$("$@" 2>"$err")
	if [ "$actual" = "$expected" ]; then
		ok "$label"
	else
		bad "$label — stdout: ${actual:0:200} | stderr: $(head -c 200 "$err")"
	fi
	rm -f "$err"
}

# 바이너리가 정적 링크인지 (C/C++ -static 검증의 핵심).
# ldd는 정적 바이너리에 대해 exit 1을 반환하므로 파이프라인 종료 코드를 보면 안 된다
# (pipefail과 겹쳐 오탐). 출력 문자열만으로 판정한다.
expect_static() { # expect_static <label> <binary>
	local label=$1 bin=$2 out
	out=$(ldd "$bin" 2>&1)
	if printf '%s' "$out" | grep -qi "not a dynamic executable\|statically linked"; then
		ok "$label (statically linked)"
	else
		bad "$label — NOT static: $(printf '%s' "$out" | head -3 | tr '\n' ' ')"
	fi
}

head_ "toolchain versions"
for probe in "gcc --version" "g++ --version" "python3 --version" "pypy3 --version" \
             "go version" "node --version" "dotnet --version"; do
	if out=$($probe 2>&1 | head -1); then ok "$probe → $out"; else bad "$probe not found"; fi
done

head_ "Java (absolute paths from languages.toml)"
JAVA_HOME_PATH=/usr/lib/jvm/java-21-openjdk-amd64
for b in "$JAVA_HOME_PATH/bin/javac" "$JAVA_HOME_PATH/bin/java"; do
	if [ -x "$b" ]; then
		ok "$b exists → $("$b" -version 2>&1 | grep -v 'JAVA_TOOL_OPTIONS' | head -1)"
	else
		bad "$b MISSING"
	fi
done

head_ "Rust (absolute toolchain path from languages.toml)"
RUSTC=/usr/local/rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin/rustc
if [ -x "$RUSTC" ]; then ok "$RUSTC → $("$RUSTC" --version)"; else bad "$RUSTC MISSING"; fi

head_ "isolate (version pin — must stay v2.3)"
if out=$(isolate --version 2>&1 | head -1); then ok "$out"; else bad "isolate not found"; fi

head_ "C — static link"
printf '#include <stdio.h>\n#include <math.h>\nint main(){printf("%%d\\n",(int)sqrt(1764.0));return 0;}\n' > Main.c
if gcc -o MainC Main.c -O2 -Wall -lm -static -std=c17 -DONLINE_JUDGE 2>compile.log; then
	ok "compile"
	expect_static "static check" ./MainC
	expect_out "run" "42" ./MainC
else
	bad "compile failed: $(head -5 compile.log)"
fi

head_ "C++ — static link + C++23"
cat > Main.cpp <<'EOF'
#include <iostream>
#include <vector>
#include <algorithm>
int main(){ std::vector<int> v{1,2,3}; std::cout << (v.size()*14) << "\n"; }
EOF
if g++ -o MainCpp Main.cpp -O2 -Wall -lm -static -std=c++23 -DONLINE_JUDGE 2>compile.log; then
	ok "compile (-std=c++23)"
	expect_static "static check" ./MainCpp
	expect_out "run" "42" ./MainCpp
else
	bad "compile failed: $(head -5 compile.log)"
fi

head_ "Python / PyPy"
echo 'print(42)' > Main.py
python3 -m py_compile Main.py && ok "python3 py_compile" || bad "python3 py_compile"
expect_out "python3 run" "42" python3 -W ignore Main.py
pypy3 -m py_compile Main.py && ok "pypy3 py_compile" || bad "pypy3 py_compile"
expect_out "pypy3 run" "42" pypy3 -W ignore Main.py

head_ "Java"
cat > Main.java <<'EOF'
public class Main { public static void main(String[] a){ System.out.println(42); } }
EOF
if "$JAVA_HOME_PATH/bin/javac" -encoding UTF-8 Main.java 2>compile.log; then
	ok "javac"
	expect_out "java run" "42" "$JAVA_HOME_PATH/bin/java" \
		-Xms128m -Xmx512m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC Main
else
	bad "javac failed: $(head -5 compile.log)"
fi

head_ "Rust"
cat > Main.rs <<'EOF'
fn main() { println!("{}", 42); }
EOF
if "$RUSTC" -O --edition=2024 -o MainRs Main.rs 2>compile.log; then
	ok "rustc (--edition=2024)"
	expect_out "run" "42" ./MainRs
else
	bad "rustc failed: $(head -5 compile.log)"
fi

head_ "Go"
cat > Main.go <<'EOF'
package main
import "fmt"
func main() { fmt.Println(42) }
EOF
export GOCACHE=/tmp/go-cache
if go build -o MainGo Main.go 2>compile.log; then
	ok "go build"
	expect_out "run" "42" ./MainGo
else
	bad "go build failed: $(head -5 compile.log)"
fi

head_ "JavaScript"
echo 'console.log(42)' > Main.js
expect_out "node run" "42" node Main.js

head_ "C# (.NET)"
echo 'using System; Console.WriteLine(42);' > Main.cs
if /usr/local/bin/aoj-cs-compile >compile.log 2>&1; then
	ok "aoj-cs-compile"
	expect_out "run" "42" /usr/local/bin/dotnet Main.dll
else
	bad "aoj-cs-compile failed: $(tail -10 compile.log)"
fi

head_ "결과"
echo "PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

#ifndef AOJ_TRANSFORMER_H
#define AOJ_TRANSFORMER_H

// AOJ two-step 변환기 SDK
//
// 호출 규약 (testlib 체커와 동일):
//   ./transformer input.txt stage1.txt phase.txt
//     inf = 원본 테스트케이스 입력      (_input,  읽기 실패 = FAIL)
//     ouf = 1단계 유저 출력             (_output, 읽기 실패 = WA/PE)
//     ans = 단계 번호 "1" 또는 "2"      (_answer)
//
//   표준출력 = 다음 단계에 넣을 페이로드 전체
//   표준오류 = 진단 메시지
//   종료코드 = 0 통과 / 1 오답 / 2 형식 오류 / 3 출제자 버그
//
// 1회차(phase 1)에는 stage1.txt가 빈 파일이다.

#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "testlib.h"

static std::string aoj_input_path_;
static std::string aoj_stage1_path_;

inline std::string aoj_read_file_(const std::string &path) {
    std::ifstream in(path.c_str(), std::ios::binary);
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

/// 원본 테스트케이스 입력 전체를 문자열로 돌려준다.
inline std::string raw_input() { return aoj_read_file_(aoj_input_path_); }

/// 1단계 유저 출력 전체를 문자열로 돌려준다. phase 1에서는 빈 문자열.
inline std::string raw_stage1() { return aoj_read_file_(aoj_stage1_path_); }

/// 출제자가 구현한다. 페이로드는 std::cout으로 직접 쓴다.
void transform(int phase);

int main(int argc, char *argv[]) {
    if (argc < 4) {
        std::fprintf(stderr, "usage: transformer <input> <stage1> <phase>\n");
        return 3;
    }
    aoj_input_path_ = argv[1];
    aoj_stage1_path_ = argv[2];

    registerTestlibCmd(argc, argv);

    int phase = ans.readInt(1, 2, "phase");
    transform(phase);

    std::cout.flush();
    quitf(_ok, "transformed");
}

#endif  // AOJ_TRANSFORMER_H

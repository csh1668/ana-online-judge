// testlib wcmp — compares sequences of tokens (default whitespace).
// Source adapted from the canonical testlib checkers distribution
// (https://github.com/MikeMirzayanov/testlib/blob/master/checkers/wcmp.cpp).
#include "testlib.h"

#include <sstream>
#include <string>

int main(int argc, char *argv[]) {
    setName("compare sequences of tokens");
    registerTestlibCmd(argc, argv);

    int n = 0;
    std::string j, p;

    while (true) {
        if (!ans.seekEof() && !ouf.seekEof()) {
            n++;
            j = ans.readWord();
            p = ouf.readWord();
            if (j != p) {
                quitf(_wa,
                      "%d%s words differ - expected: '%s', found: '%s'",
                      n,
                      englishEnding(n).c_str(),
                      compress(j).c_str(),
                      compress(p).c_str());
            }
        } else if (!ans.seekEof()) {
            j = ans.readWord();
            quitf(_wa,
                  "expected %d more word(s); next expected: '%s'",
                  1,
                  compress(j).c_str());
        } else if (!ouf.seekEof()) {
            p = ouf.readWord();
            quitf(_wa,
                  "participant produced %d more word(s); next found: '%s'",
                  1,
                  compress(p).c_str());
        } else {
            break;
        }
    }

    if (n == 0) {
        quitf(_ok, "no tokens");
    }
    quitf(_ok, "%d token(s)", n);
}

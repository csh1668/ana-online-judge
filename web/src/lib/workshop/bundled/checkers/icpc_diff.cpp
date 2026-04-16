// ANA Online Judge — default checker ("icpc_diff").
// Token-by-token whitespace-insensitive comparison of participant
// output vs. author output. Matches the project's historical default
// judging behavior used before the workshop system existed.
#include "testlib.h"

#include <string>

int main(int argc, char *argv[]) {
    setName("ICPC-style token compare (whitespace-insensitive)");
    registerTestlibCmd(argc, argv);

    int n = 0;
    while (!ans.seekEof()) {
        n++;
        std::string expected = ans.readWord();
        std::string got = ouf.readWord();
        if (expected != got) {
            quitf(_wa,
                  "%d%s token differs: expected %s, found %s",
                  n,
                  englishEnding(n).c_str(),
                  compress(expected).c_str(),
                  compress(got).c_str());
        }
    }

    if (!ouf.seekEof()) {
        quitf(_wa, "participant produced extra trailing output after token %d", n);
    }

    quitf(_ok, "%d token%s", n, n == 1 ? "" : "s");
}

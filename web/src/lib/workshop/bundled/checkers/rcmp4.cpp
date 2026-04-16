// testlib rcmp4 — compares two sequences of floating-point numbers
// with max(absolute, relative) error at most 1e-4.
// Source adapted from the canonical testlib checkers distribution
// (https://github.com/MikeMirzayanov/testlib/blob/master/checkers/rcmp4.cpp).
#include "testlib.h"

#include <cmath>
#include <cstdio>

const double EPS = 1E-4;

int main(int argc, char *argv[]) {
    setName("compare two sequences of doubles, max absolute or relative error = %.10f", EPS);
    registerTestlibCmd(argc, argv);

    int n = 0;
    while (!ans.seekEof()) {
        n++;
        double j = ans.readDouble();
        double p = ouf.readDouble();

        double diff = std::fabs(j - p);
        double scale = std::fabs(j);
        if (scale < 1.0) scale = 1.0;

        if (diff > EPS && diff / scale > EPS) {
            quitf(_wa,
                  "%d%s numbers differ - expected: '%.10f', found: '%.10f', error = '%.10f'",
                  n,
                  englishEnding(n).c_str(),
                  j,
                  p,
                  diff);
        }
    }

    quitf(_ok, "%d number(s)", n);
}

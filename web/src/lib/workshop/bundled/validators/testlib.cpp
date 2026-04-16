// AOJ Workshop — Validator starter template (testlib.h)
//
// Validators read the input file from stdin and MUST exit 0 if the input
// conforms to the problem's constraints. Use testlib.h's typed readers — they
// enforce format strictness (whitespace, EOF, ranges) that judges rely on.
//
// Compiled against the bundled `testlib.h` resource that every draft ships with.

#include "testlib.h"

int main(int argc, char *argv[]) {
    registerValidation(argc, argv);

    // Example: a single line "N M" with 1 <= N <= 1000, 1 <= M <= 1000.
    // Replace the body with constraints specific to your problem.
    int n = inf.readInt(1, 1000, "n");
    inf.readSpace();
    int m = inf.readInt(1, 1000, "m");
    inf.readEoln();
    inf.readEof();

    (void)n;
    (void)m;
    return 0;
}

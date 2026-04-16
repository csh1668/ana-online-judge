#include "testlib.h"
using namespace std;

// testlib.h handles seed automatically via registerGen.
// The last argv element passed by AOJ Workshop is consumed as the seed.
int main(int argc, char* argv[]) {
    registerGen(argc, argv, 1);

    int n = rnd.next(1, 100);
    cout << n << endl;
    for (int i = 0; i < n; ++i) {
        cout << rnd.next(1, 1000);
        if (i + 1 < n) cout << ' ';
    }
    cout << endl;

    return 0;
}

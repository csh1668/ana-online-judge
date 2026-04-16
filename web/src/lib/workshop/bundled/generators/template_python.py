import argparse
import random
import sys

# AOJ Workshop appends the workshop seed (hex string) as the last positional argument.
# Accept it via nargs='?' so strict argparse doesn't reject it.
parser = argparse.ArgumentParser()
parser.add_argument("--n", type=int, default=10, help="number of values")
parser.add_argument("workshop_seed", nargs="?", default=None,
                    help="(auto-injected by AOJ Workshop) hex seed")
args = parser.parse_args()

# Use the workshop seed if provided, else fall back to a deterministic default.
if args.workshop_seed:
    random.seed(int(args.workshop_seed, 16))
else:
    random.seed(42)

print(args.n)
print(*[random.randint(1, 1000) for _ in range(args.n)])

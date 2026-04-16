/**
 * Plain-JS version of the image URL rewriter verification.
 * Run with: `node scripts/verify-workshop-publish-images.mjs`
 *
 * Inlines rewriteWorkshopImageUrls to avoid TS/path-alias dependency.
 */

function rewriteWorkshopImageUrls(markdown, workshopProblemId, publishedProblemId) {
	const rawFrom = `images/workshopProblems/${workshopProblemId}/`;
	const rawTo = `images/problems/${publishedProblemId}/`;
	const encFrom = `images%2FworkshopProblems%2F${workshopProblemId}%2F`;
	const encTo = `images%2Fproblems%2F${publishedProblemId}%2F`;
	return markdown.replaceAll(rawFrom, rawTo).replaceAll(encFrom, encTo);
}

const cases = [
	{
		name: "raw path substitution",
		input: "![alt](images/workshopProblems/42/foo.png)",
		workshopId: 42,
		publishedId: 100,
		expected: "![alt](images/problems/100/foo.png)",
	},
	{
		name: "url-encoded API path substitution",
		input: "![alt](/api/images/images%2FworkshopProblems%2F42%2Ffoo.png)",
		workshopId: 42,
		publishedId: 100,
		expected: "![alt](/api/images/images%2Fproblems%2F100%2Ffoo.png)",
	},
	{
		name: "both forms in the same doc",
		input:
			"raw: images/workshopProblems/7/a.png\nenc: /api/images/images%2FworkshopProblems%2F7%2Fb.png",
		workshopId: 7,
		publishedId: 88,
		expected:
			"raw: images/problems/88/a.png\nenc: /api/images/images%2Fproblems%2F88%2Fb.png",
	},
	{
		name: "non-matching workshop id untouched",
		input: "![alt](images/workshopProblems/99/other.png)",
		workshopId: 42,
		publishedId: 100,
		expected: "![alt](images/workshopProblems/99/other.png)",
	},
	{
		name: "multiple references to the same image",
		input:
			"![a](images/workshopProblems/5/x.png) ![b](images/workshopProblems/5/x.png)",
		workshopId: 5,
		publishedId: 12,
		expected: "![a](images/problems/12/x.png) ![b](images/problems/12/x.png)",
	},
];

let failed = 0;
for (const c of cases) {
	const out = rewriteWorkshopImageUrls(c.input, c.workshopId, c.publishedId);
	if (out === c.expected) {
		console.log(`  OK  ${c.name}`);
	} else {
		failed++;
		console.error(`  FAIL ${c.name}`);
		console.error(`    expected: ${c.expected}`);
		console.error(`    actual:   ${out}`);
	}
}

if (failed > 0) {
	console.error(`\n${failed} case(s) failed.`);
	process.exit(1);
}
console.log(`\nAll ${cases.length} cases passed.`);
process.exit(0);

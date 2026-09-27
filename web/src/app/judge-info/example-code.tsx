import "./example-code.css";

import hljs from "highlight.js/lib/core";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import delphi from "highlight.js/lib/languages/delphi";
import fortran from "highlight.js/lib/languages/fortran";
import fsharp from "highlight.js/lib/languages/fsharp";
import go from "highlight.js/lib/languages/go";
import groovy from "highlight.js/lib/languages/groovy";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import ocaml from "highlight.js/lib/languages/ocaml";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import vbnet from "highlight.js/lib/languages/vbnet";
import x86asm from "highlight.js/lib/languages/x86asm";

const GRAMMARS = {
	c,
	cpp,
	csharp,
	delphi,
	fortran,
	fsharp,
	go,
	groovy,
	java,
	javascript,
	kotlin,
	lua,
	ocaml,
	plaintext,
	python,
	r,
	ruby,
	rust,
	swift,
	typescript,
	vbnet,
	x86asm,
};
for (const [name, grammar] of Object.entries(GRAMMARS)) {
	if (!hljs.getLanguage(name)) hljs.registerLanguage(name, grammar);
}

interface ExampleCodeProps {
	code: string;
	language: string;
}

/**
 * 서버에서 highlight.js로 하이라이팅한 코드 블록. 카드 22개에 Monaco를 띄우는 대신
 * 정적 HTML만 내려보낸다. 미등록 문법은 plaintext로 폴백.
 */
export function ExampleCode({ code, language }: ExampleCodeProps) {
	const lang = hljs.getLanguage(language) ? language : "plaintext";
	const html = hljs.highlight(code, { language: lang }).value;
	return (
		<div className="aoj-hl">
			<pre className="hljs px-3 py-2 rounded-[2px] border border-border text-xs overflow-x-auto leading-5">
				{/* highlight.js가 토큰을 이스케이프한 출력이라 안전하다 */}
				<code dangerouslySetInnerHTML={{ __html: html }} />
			</pre>
		</div>
	);
}

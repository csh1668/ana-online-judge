import { createHash } from "node:crypto";
import type { LanguageInstallState } from "@/db/schema";

/**
 * Initial rows of the `languages` table (inserted by drizzle/0058_dynamic_languages.sql).
 * Values mirror the pre-dynamic static language tables (judge languages.toml, web language
 * list and client-command metadata), all since removed. Changing this file does NOT change
 * the DB; languages are managed at runtime via the admin page / CLI.
 */
export interface LanguageSeed {
	id: string;
	label: string;
	version: string;
	aliases: string[];
	sortOrder: number;
	enabled: boolean;
	sourceFile: string;
	fileExtension: string;
	monacoLanguage: string | null;
	defaultCode: string;
	compileCommand: string | null;
	runCommand: string;
	compileOnHost: boolean;
	compileScript: string | null;
	producesSingleBinary: boolean;
	env: string[];
	displayCompileCommand: string | null;
	displayRunCommand: string | null;
	clientCompileCommand: string | null;
	clientRunCommand: string | null;
	timeMultiplier: string; // numeric → 문자열 "2.000"
	timeBonusMs: number;
	memoryMultiplier: string;
	memoryBonusMb: number;
	installScript: string | null;
	installState: LanguageInstallState;
}

const JAVA_INSTALL = `curl -sSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" -o /tmp/jdk.tar.gz
mkdir -p "$AOJ_PREFIX"
tar -C "$AOJ_PREFIX" --strip-components=1 -xzf /tmp/jdk.tar.gz
"$AOJ_PREFIX/bin/java" -version
`;

const GO_INSTALL = `curl -sSL "https://go.dev/dl/go1.27.1.linux-amd64.tar.gz" -o /tmp/go.tar.gz
mkdir -p "$AOJ_PREFIX"
tar -C "$AOJ_PREFIX" --strip-components=1 -xzf /tmp/go.tar.gz
"$AOJ_PREFIX/bin/go" version
`;

const NODE_INSTALL = `curl -sSL "https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-x64.tar.xz" -o /tmp/node.tar.xz
mkdir -p "$AOJ_PREFIX"
tar -C "$AOJ_PREFIX" --strip-components=1 --no-same-owner -xJf /tmp/node.tar.xz
"$AOJ_PREFIX/bin/node" --version
`;

const PYPY_INSTALL = `curl -sSL "https://downloads.python.org/pypy/pypy3.11-v7.3.19-linux64.tar.bz2" -o /tmp/pypy.tar.bz2
mkdir -p "$AOJ_PREFIX"
tar -C "$AOJ_PREFIX" --strip-components=1 -xjf /tmp/pypy.tar.bz2
"$AOJ_PREFIX/bin/pypy3" --version
`;

const CS_INSTALL = `curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
bash /tmp/dotnet-install.sh --channel 10.0 --install-dir "$AOJ_PREFIX"
mkdir -p "$AOJ_PREFIX/template"
cat > "$AOJ_PREFIX/template/Main.csproj" <<'EOF'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <AssemblyName>Main</AssemblyName>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <Optimize>true</Optimize>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    <MSBuildEnableWorkloadResolver>false</MSBuildEnableWorkloadResolver>
    <CheckEolTargetFramework>false</CheckEolTargetFramework>
    <UseSharedCompilation>false</UseSharedCompilation>
    <DebugType>none</DebugType>
    <DebugSymbols>false</DebugSymbols>
    <GenerateDocumentationFile>false</GenerateDocumentationFile>
    <EnableNETAnalyzers>false</EnableNETAnalyzers>
    <EnforceCodeStyleInBuild>false</EnforceCodeStyleInBuild>
    <AnalysisLevel>none</AnalysisLevel>
    <RunAnalyzers>false</RunAnalyzers>
    <DisableImplicitNuGetFallbackFolder>true</DisableImplicitNuGetFallbackFolder>
  </PropertyGroup>
</Project>
EOF
cat > "$AOJ_PREFIX/template/NuGet.Config" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
  </packageSources>
</configuration>
EOF
"$AOJ_PREFIX/dotnet" --version
`;

const CS_COMPILE = `#!/usr/bin/bash
set -e
cp -r "{prefix}/template/." .
"{prefix}/dotnet" build Main.csproj --configuration Release --nologo --verbosity quiet \\
  -noAutoResponse \\
  -p:ImportDirectoryBuildProps=false \\
  -p:ImportDirectoryBuildTargets=false \\
  -p:ImportDirectoryPackagesProps=false \\
  -p:RestoreConfigFile={prefix}/template/NuGet.Config
mv bin/Release/net10.0/* .
`;

export const LANGUAGE_SEED: LanguageSeed[] = [
	{
		id: "c",
		label: "C",
		version: "GCC 14.2.0, C17",
		aliases: [],
		sortOrder: 10,
		enabled: true,
		sourceFile: "Main.c",
		fileExtension: "c",
		monacoLanguage: null,
		defaultCode: "#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}",
		compileCommand:
			"gcc {include_flags} -o Main Main.c -O2 -Wall -lm -static -std=c17 -fpermissive -DONLINE_JUDGE",
		runCommand: "./Main",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: true,
		env: [],
		displayCompileCommand:
			"gcc -o Main Main.c -O2 -Wall -lm -static -std=c17 -fpermissive -DONLINE_JUDGE",
		displayRunCommand: null,
		clientCompileCommand: "gcc -o {exe} {src} -O2 -Wall -lm -std=c17 -DONLINE_JUDGE",
		clientRunCommand: "{exe}",
		timeMultiplier: "1.000",
		timeBonusMs: 0,
		memoryMultiplier: "1.000",
		memoryBonusMb: 0,
		installScript: null,
		installState: "installed",
	},
	{
		id: "cpp",
		label: "C++",
		version: "GCC 14.2.0, C++23",
		aliases: ["c++", "cpp17", "cpp20", "cpp23"],
		sortOrder: 20,
		enabled: true,
		sourceFile: "Main.cpp",
		fileExtension: "cpp",
		monacoLanguage: null,
		defaultCode:
			"#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}",
		compileCommand:
			"g++ {include_flags} -o Main Main.cpp -O2 -Wall -lm -static -std=c++23 -DONLINE_JUDGE",
		runCommand: "./Main",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: true,
		env: [],
		displayCompileCommand: "g++ -o Main Main.cpp -O2 -Wall -lm -static -std=c++23 -DONLINE_JUDGE",
		displayRunCommand: null,
		clientCompileCommand: "g++ -o {exe} {src} -O2 -Wall -lm -std=c++23 -DONLINE_JUDGE",
		clientRunCommand: "{exe}",
		timeMultiplier: "1.000",
		timeBonusMs: 0,
		memoryMultiplier: "1.000",
		memoryBonusMb: 0,
		installScript: null,
		installState: "installed",
	},
	{
		id: "python",
		label: "Python",
		version: "Python 3.13.5",
		aliases: ["python3", "py"],
		sortOrder: 30,
		enabled: true,
		sourceFile: "Main.py",
		fileExtension: "py",
		monacoLanguage: "python",
		defaultCode: "",
		compileCommand: "python3 -m py_compile Main.py",
		runCommand: "python3 -W ignore Main.py",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: false,
		env: [],
		displayCompileCommand: null,
		displayRunCommand: null,
		clientCompileCommand: "python3 -m py_compile {src}",
		clientRunCommand: "python3 -W ignore {src}",
		timeMultiplier: "3.000",
		timeBonusMs: 2000,
		memoryMultiplier: "2.000",
		memoryBonusMb: 32,
		installScript: null,
		installState: "installed",
	},
	{
		id: "pypy",
		label: "PyPy",
		version: "PyPy3 7.3.19 (Python 3.11)",
		aliases: ["pypy3"],
		sortOrder: 40,
		enabled: true,
		sourceFile: "Main.py",
		fileExtension: "py",
		monacoLanguage: "python",
		defaultCode: "",
		compileCommand: "{prefix}/bin/pypy3 -m py_compile Main.py",
		runCommand: "{prefix}/bin/pypy3 -W ignore Main.py",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: false,
		env: [],
		displayCompileCommand: "pypy3 -m py_compile Main.py",
		displayRunCommand: "pypy3 -W ignore Main.py",
		clientCompileCommand: "pypy3 -m py_compile {src}",
		clientRunCommand: "pypy3 -W ignore {src}",
		timeMultiplier: "2.000",
		timeBonusMs: 1000,
		memoryMultiplier: "2.000",
		memoryBonusMb: 64,
		installScript: PYPY_INSTALL,
		installState: "installed",
	},
	{
		id: "java",
		label: "Java",
		version: "OpenJDK 21",
		aliases: [],
		sortOrder: 50,
		enabled: true,
		sourceFile: "Main.java",
		fileExtension: "java",
		monacoLanguage: null,
		defaultCode:
			"import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}",
		compileCommand: "{prefix}/bin/javac {include_flags} -encoding UTF-8 Main.java",
		runCommand:
			"{prefix}/bin/java -Xms128m -Xmx{heap_mb}m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC Main",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: false,
		env: ["JAVA_HOME={prefix}", "JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8"],
		displayCompileCommand: "javac -encoding UTF-8 Main.java",
		displayRunCommand:
			"java -Xms128m -Xmx{heap_mb}m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC Main",
		clientCompileCommand: "javac -encoding UTF-8 {src}",
		clientRunCommand:
			"java -Xms128m -Xmx512m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC -cp {srcDir} {className}",
		timeMultiplier: "2.000",
		timeBonusMs: 1000,
		memoryMultiplier: "2.000",
		memoryBonusMb: 16,
		installScript: JAVA_INSTALL,
		installState: "installed",
	},
	{
		id: "rust",
		label: "Rust",
		version: "Rust 1.98.1",
		aliases: ["rs"],
		sortOrder: 60,
		enabled: true,
		sourceFile: "Main.rs",
		fileExtension: "rs",
		monacoLanguage: null,
		defaultCode:
			"use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    \n}",
		compileCommand:
			"/usr/local/rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin/rustc -O --edition=2024 -o Main Main.rs",
		runCommand: "./Main",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: true,
		env: [],
		displayCompileCommand: "rustc -O --edition=2024 -o Main Main.rs",
		displayRunCommand: null,
		clientCompileCommand: "rustc -O --edition=2024 -o {exe} {src}",
		clientRunCommand: "{exe}",
		timeMultiplier: "1.000",
		timeBonusMs: 0,
		memoryMultiplier: "1.000",
		memoryBonusMb: 0,
		installScript: null,
		installState: "installed",
	},
	{
		id: "go",
		label: "Go",
		version: "Go 1.27.1",
		aliases: ["golang"],
		sortOrder: 70,
		enabled: true,
		sourceFile: "Main.go",
		fileExtension: "go",
		monacoLanguage: null,
		defaultCode: 'package main\n\nimport "fmt"\n\nfunc main() {\n    \n    fmt.Println()\n}',
		compileCommand: "{prefix}/bin/go build -o Main Main.go",
		runCommand: "./Main",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: true,
		env: ["GOROOT={prefix}", "GOCACHE=/tmp/go-cache", "GOPATH=/tmp/go", "GOMAXPROCS=4"],
		displayCompileCommand: "go build -o Main Main.go",
		displayRunCommand: null,
		clientCompileCommand: "go build -o {exe} {src}",
		clientRunCommand: "{exe}",
		timeMultiplier: "1.000",
		timeBonusMs: 0,
		memoryMultiplier: "1.000",
		memoryBonusMb: 0,
		installScript: GO_INSTALL,
		installState: "installed",
	},
	{
		id: "javascript",
		label: "JavaScript",
		version: "Node.js 22.23.2",
		aliases: ["js", "node", "nodejs"],
		sortOrder: 80,
		enabled: true,
		sourceFile: "Main.js",
		fileExtension: "js",
		monacoLanguage: null,
		defaultCode:
			"const fs = require('fs');\nconst input = fs.readFileSync('/dev/stdin').toString().trim().split('\\n');\n\n// Solution here\n",
		compileCommand: null,
		runCommand: "{prefix}/bin/node Main.js",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: false,
		env: [],
		displayCompileCommand: null,
		displayRunCommand: "node Main.js",
		clientCompileCommand: null,
		clientRunCommand: "node {src}",
		timeMultiplier: "3.000",
		timeBonusMs: 2000,
		memoryMultiplier: "2.000",
		memoryBonusMb: 32,
		installScript: NODE_INSTALL,
		installState: "installed",
	},
	{
		id: "csharp",
		label: "C#",
		version: ".NET 10 (C# 14)",
		aliases: ["cs", "c#", "dotnet"],
		sortOrder: 90,
		enabled: true,
		sourceFile: "Main.cs",
		fileExtension: "cs",
		monacoLanguage: null,
		defaultCode: 'using System;\n\nConsole.WriteLine("Hello, World!");\n',
		compileCommand: "bash aoj-compile.sh",
		runCommand: "{prefix}/dotnet Main.dll",
		compileOnHost: true,
		compileScript: CS_COMPILE,
		producesSingleBinary: false,
		env: [
			"DOTNET_ROOT={prefix}",
			"DOTNET_CLI_TELEMETRY_OPTOUT=1",
			"DOTNET_NOLOGO=1",
			"DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1",
			"DOTNET_gcServer=0",
			"DOTNET_GCDynamicAdaptationMode=1",
		],
		displayCompileCommand: "dotnet build Main.cs --configuration Release -p:AllowUnsafeBlocks=true",
		displayRunCommand: "dotnet Main.dll",
		clientCompileCommand: "dotnet build {src} --configuration Release",
		clientRunCommand: "dotnet {exe}.dll",
		timeMultiplier: "2.000",
		timeBonusMs: 1000,
		memoryMultiplier: "2.000",
		memoryBonusMb: 32,
		installScript: CS_INSTALL,
		installState: "installed",
	},
	{
		id: "text",
		label: "Text",
		version: "",
		aliases: ["txt"],
		sortOrder: 100,
		enabled: true,
		sourceFile: "Main.txt",
		fileExtension: "txt",
		monacoLanguage: "plaintext",
		defaultCode: "",
		compileCommand: null,
		runCommand: "cat Main.txt",
		compileOnHost: false,
		compileScript: null,
		producesSingleBinary: false,
		env: [],
		displayCompileCommand: null,
		displayRunCommand: null,
		clientCompileCommand: null,
		clientRunCommand: "cat {src}",
		timeMultiplier: "1.000",
		timeBonusMs: 0,
		memoryMultiplier: "1.000",
		memoryBonusMb: 0,
		installScript: null,
		installState: "installed",
	},
];

/** First 12 hex chars of sha256(`${installScript}\n${version}`). Shared with the services layer. */
export function computeInstallHash(installScript: string, version: string): string {
	return createHash("sha256").update(`${installScript}\n${version}`).digest("hex").slice(0, 12);
}

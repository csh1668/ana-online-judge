CREATE TYPE "public"."language_install_state" AS ENUM('not_installed', 'installing', 'installed', 'failed');--> statement-breakpoint
CREATE TABLE "languages" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"source_file" text NOT NULL,
	"file_extension" text NOT NULL,
	"monaco_language" text,
	"default_code" text DEFAULT '' NOT NULL,
	"compile_command" text,
	"run_command" text NOT NULL,
	"compile_on_host" boolean DEFAULT false NOT NULL,
	"compile_script" text,
	"produces_single_binary" boolean DEFAULT true NOT NULL,
	"env" text[] DEFAULT '{}'::text[] NOT NULL,
	"display_compile_command" text,
	"display_run_command" text,
	"client_compile_command" text,
	"client_run_command" text,
	"time_multiplier" numeric(6, 3) DEFAULT '1' NOT NULL,
	"time_bonus_ms" integer DEFAULT 0 NOT NULL,
	"memory_multiplier" numeric(6, 3) DEFAULT '1' NOT NULL,
	"memory_bonus_mb" integer DEFAULT 0 NOT NULL,
	"install_script" text,
	"install_state" "language_install_state" DEFAULT 'not_installed' NOT NULL,
	"installed_hash" text,
	"installed_at" timestamp,
	"install_log" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "language" SET DATA TYPE text USING "language"::text;--> statement-breakpoint
ALTER TABLE "workshop_generators" ALTER COLUMN "language" SET DATA TYPE text USING "language"::text;--> statement-breakpoint
ALTER TABLE "workshop_solutions" ALTER COLUMN "language" SET DATA TYPE text USING "language"::text;--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$c$seed$,$seed$C$seed$,$seed$GCC 14.2.0, C17$seed$,ARRAY[]::text[],10,true,$seed$Main.c$seed$,$seed$c$seed$,NULL,$seed$#include <stdio.h>

int main() {
    
    return 0;
}$seed$,$seed$gcc {include_flags} -o Main Main.c -O2 -Wall -lm -static -std=c17 -fpermissive -DONLINE_JUDGE$seed$,$seed$./Main$seed$,false,NULL,true,ARRAY[]::text[],$seed$gcc -o Main Main.c -O2 -Wall -lm -static -std=c17 -fpermissive -DONLINE_JUDGE$seed$,NULL,$seed$gcc -o {exe} {src} -O2 -Wall -lm -std=c17 -DONLINE_JUDGE$seed$,$seed${exe}$seed$,1.000,0,1.000,0,NULL,'installed',NULL,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$cpp$seed$,$seed$C++$seed$,$seed$GCC 14.2.0, C++23$seed$,ARRAY[$seed$c++$seed$,$seed$cpp17$seed$,$seed$cpp20$seed$,$seed$cpp23$seed$]::text[],20,true,$seed$Main.cpp$seed$,$seed$cpp$seed$,NULL,$seed$#include <iostream>
using namespace std;

int main() {
    
    return 0;
}$seed$,$seed$g++ {include_flags} -o Main Main.cpp -O2 -Wall -lm -static -std=c++23 -DONLINE_JUDGE$seed$,$seed$./Main$seed$,false,NULL,true,ARRAY[]::text[],$seed$g++ -o Main Main.cpp -O2 -Wall -lm -static -std=c++23 -DONLINE_JUDGE$seed$,NULL,$seed$g++ -o {exe} {src} -O2 -Wall -lm -std=c++23 -DONLINE_JUDGE$seed$,$seed${exe}$seed$,1.000,0,1.000,0,NULL,'installed',NULL,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$python$seed$,$seed$Python$seed$,$seed$Python 3.13.5$seed$,ARRAY[$seed$python3$seed$,$seed$py$seed$]::text[],30,true,$seed$Main.py$seed$,$seed$py$seed$,$seed$python$seed$,$seed$$seed$,$seed$python3 -m py_compile Main.py$seed$,$seed$python3 -W ignore Main.py$seed$,false,NULL,false,ARRAY[]::text[],NULL,NULL,$seed$python3 -m py_compile {src}$seed$,$seed$python3 -W ignore {src}$seed$,3.000,2000,2.000,32,NULL,'installed',NULL,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$pypy$seed$,$seed$PyPy$seed$,$seed$PyPy3 7.3.19 (Python 3.11)$seed$,ARRAY[$seed$pypy3$seed$]::text[],40,true,$seed$Main.py$seed$,$seed$py$seed$,$seed$python$seed$,$seed$$seed$,$seed${prefix}/bin/pypy3 -m py_compile Main.py$seed$,$seed${prefix}/bin/pypy3 -W ignore Main.py$seed$,false,NULL,false,ARRAY[]::text[],$seed$pypy3 -m py_compile Main.py$seed$,$seed$pypy3 -W ignore Main.py$seed$,$seed$pypy3 -m py_compile {src}$seed$,$seed$pypy3 -W ignore {src}$seed$,2.000,1000,2.000,64,$seed$curl -sSL "https://downloads.python.org/pypy/pypy3.11-v7.3.19-linux64.tar.bz2" -o /tmp/pypy.tar.bz2
mkdir -p "$AOJ_PREFIX"
tar -C "$AOJ_PREFIX" --strip-components=1 -xjf /tmp/pypy.tar.bz2
"$AOJ_PREFIX/bin/pypy3" --version
$seed$,'installed',$seed$c89e09506a6c$seed$,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$java$seed$,$seed$Java$seed$,$seed$OpenJDK 21$seed$,ARRAY[]::text[],50,true,$seed$Main.java$seed$,$seed$java$seed$,NULL,$seed$import java.util.*;

public class Main {
    public static void main(String[] args) {
        
    }
}$seed$,$seed${prefix}/bin/javac {include_flags} -encoding UTF-8 Main.java$seed$,$seed${prefix}/bin/java -Xms128m -Xmx{heap_mb}m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC Main$seed$,false,NULL,false,ARRAY[$seed$JAVA_HOME={prefix}$seed$,$seed$JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8$seed$]::text[],$seed$javac -encoding UTF-8 Main.java$seed$,$seed$java -Xms128m -Xmx{heap_mb}m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC Main$seed$,$seed$javac -encoding UTF-8 {src}$seed$,$seed$java -Xms128m -Xmx512m -Xss64m -Dfile.encoding=UTF-8 -XX:+UseSerialGC -cp {srcDir} {className}$seed$,2.000,1000,2.000,16,$seed$curl -sSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" -o /tmp/jdk.tar.gz
mkdir -p "$AOJ_PREFIX"
tar -C "$AOJ_PREFIX" --strip-components=1 -xzf /tmp/jdk.tar.gz
"$AOJ_PREFIX/bin/java" -version
$seed$,'installed',$seed$6636c39d1ec9$seed$,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$rust$seed$,$seed$Rust$seed$,$seed$Rust 1.98.1$seed$,ARRAY[$seed$rs$seed$]::text[],60,true,$seed$Main.rs$seed$,$seed$rs$seed$,NULL,$seed$use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    
}$seed$,$seed$/usr/local/rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin/rustc -O --edition=2024 -o Main Main.rs$seed$,$seed$./Main$seed$,false,NULL,true,ARRAY[]::text[],$seed$rustc -O --edition=2024 -o Main Main.rs$seed$,NULL,$seed$rustc -O --edition=2024 -o {exe} {src}$seed$,$seed${exe}$seed$,1.000,0,1.000,0,NULL,'installed',NULL,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$go$seed$,$seed$Go$seed$,$seed$Go 1.27.1$seed$,ARRAY[$seed$golang$seed$]::text[],70,true,$seed$Main.go$seed$,$seed$go$seed$,NULL,$seed$package main

import "fmt"

func main() {
    
    fmt.Println()
}$seed$,$seed${prefix}/bin/go build -o Main Main.go$seed$,$seed$./Main$seed$,false,NULL,true,ARRAY[$seed$GOROOT={prefix}$seed$,$seed$GOCACHE=/tmp/go-cache$seed$,$seed$GOPATH=/tmp/go$seed$,$seed$GOMAXPROCS=4$seed$]::text[],$seed$go build -o Main Main.go$seed$,NULL,$seed$go build -o {exe} {src}$seed$,$seed${exe}$seed$,1.000,0,1.000,0,$seed$curl -sSL "https://go.dev/dl/go1.27.1.linux-amd64.tar.gz" -o /tmp/go.tar.gz
mkdir -p "$AOJ_PREFIX"
tar -C "$AOJ_PREFIX" --strip-components=1 -xzf /tmp/go.tar.gz
"$AOJ_PREFIX/bin/go" version
$seed$,'installed',$seed$b87534ece21d$seed$,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$javascript$seed$,$seed$JavaScript$seed$,$seed$Node.js 22.23.2$seed$,ARRAY[$seed$js$seed$,$seed$node$seed$,$seed$nodejs$seed$]::text[],80,true,$seed$Main.js$seed$,$seed$js$seed$,NULL,$seed$const fs = require('fs');
const input = fs.readFileSync('/dev/stdin').toString().trim().split('\n');

// Solution here
$seed$,NULL,$seed${prefix}/bin/node Main.js$seed$,false,NULL,false,ARRAY[]::text[],NULL,$seed$node Main.js$seed$,NULL,$seed$node {src}$seed$,3.000,2000,2.000,32,$seed$curl -sSL "https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-x64.tar.xz" -o /tmp/node.tar.xz
mkdir -p "$AOJ_PREFIX"
tar -C "$AOJ_PREFIX" --strip-components=1 --no-same-owner -xJf /tmp/node.tar.xz
"$AOJ_PREFIX/bin/node" --version
$seed$,'installed',$seed$ff9619aca577$seed$,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$csharp$seed$,$seed$C#$seed$,$seed$.NET 10 (C# 14)$seed$,ARRAY[$seed$cs$seed$,$seed$c#$seed$,$seed$dotnet$seed$]::text[],90,true,$seed$Main.cs$seed$,$seed$cs$seed$,NULL,$seed$using System;

Console.WriteLine("Hello, World!");
$seed$,$seed$bash aoj-compile.sh$seed$,$seed${prefix}/dotnet Main.dll$seed$,true,$seed$#!/usr/bin/bash
set -e
cp -r "{prefix}/template/." .
"{prefix}/dotnet" build Main.csproj --configuration Release --nologo --verbosity quiet \
  -noAutoResponse \
  -p:ImportDirectoryBuildProps=false \
  -p:ImportDirectoryBuildTargets=false \
  -p:ImportDirectoryPackagesProps=false \
  -p:RestoreConfigFile={prefix}/template/NuGet.Config
mv bin/Release/net10.0/* .
$seed$,false,ARRAY[$seed$DOTNET_ROOT={prefix}$seed$,$seed$DOTNET_CLI_TELEMETRY_OPTOUT=1$seed$,$seed$DOTNET_NOLOGO=1$seed$,$seed$DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1$seed$,$seed$DOTNET_gcServer=0$seed$,$seed$DOTNET_GCDynamicAdaptationMode=1$seed$]::text[],$seed$dotnet build Main.cs --configuration Release -p:AllowUnsafeBlocks=true$seed$,$seed$dotnet Main.dll$seed$,$seed$dotnet build {src} --configuration Release$seed$,$seed$dotnet {exe}.dll$seed$,2.000,1000,2.000,32,$seed$curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
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
$seed$,'installed',$seed$0f5be080f79c$seed$,now());--> statement-breakpoint
INSERT INTO "languages" ("id","label","version","aliases","sort_order","enabled","source_file","file_extension","monaco_language","default_code","compile_command","run_command","compile_on_host","compile_script","produces_single_binary","env","display_compile_command","display_run_command","client_compile_command","client_run_command","time_multiplier","time_bonus_ms","memory_multiplier","memory_bonus_mb","install_script","install_state","installed_hash","installed_at") VALUES ($seed$text$seed$,$seed$Text$seed$,$seed$$seed$,ARRAY[$seed$txt$seed$]::text[],100,true,$seed$Main.txt$seed$,$seed$txt$seed$,$seed$plaintext$seed$,$seed$$seed$,NULL,$seed$cat Main.txt$seed$,false,NULL,false,ARRAY[]::text[],NULL,NULL,NULL,$seed$cat {src}$seed$,1.000,0,1.000,0,NULL,'installed',NULL,now());--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_language_languages_id_fk" FOREIGN KEY ("language") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_generators" ADD CONSTRAINT "workshop_generators_language_languages_id_fk" FOREIGN KEY ("language") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_solutions" ADD CONSTRAINT "workshop_solutions_language_languages_id_fk" FOREIGN KEY ("language") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;
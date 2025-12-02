// 테스트 17: Node.js 샌드박스 탈출 시도
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const os = require('os');
const net = require('net');

console.log("=== Node.js 샌드박스 탈출 테스트 ===\n");

// 1. execSync 실행
console.log("[1] execSync('id'):");
try {
    const result = execSync('id').toString();
    console.log(result);
} catch (e) {
    console.log("실패:", e.message);
}

// 2. 파일 시스템 읽기
console.log("\n[2] /etc/passwd 읽기:");
try {
    const content = fs.readFileSync('/etc/passwd', 'utf8');
    console.log(content.slice(0, 500));
} catch (e) {
    console.log("실패:", e.message);
}

// 3. 디렉토리 탐색
console.log("\n[3] 루트 디렉토리 목록:");
try {
    const files = fs.readdirSync('/');
    console.log(files.join(', '));
} catch (e) {
    console.log("실패:", e.message);
}

// 4. 시스템 정보
console.log("\n[4] 시스템 정보:");
console.log("hostname:", os.hostname());
console.log("platform:", os.platform());
console.log("userInfo:", JSON.stringify(os.userInfo()));
console.log("homedir:", os.homedir());

// 5. 환경변수
console.log("\n[5] 환경변수:");
Object.keys(process.env).slice(0, 5).forEach(key => {
    console.log(`${key}=${process.env[key]}`);
});

// 6. 프로세스 정보
console.log("\n[6] 프로세스 정보:");
console.log("PID:", process.pid);
console.log("PPID:", process.ppid);
console.log("UID:", process.getuid?.() || 'N/A');
console.log("CWD:", process.cwd());

// 7. 네트워크 연결
console.log("\n[7] 네트워크 연결 시도:");
const client = new net.Socket();
client.setTimeout(3000);
client.connect(80, '1.1.1.1', () => {
    console.log("연결 성공! 네트워크 접근 가능!");
    client.destroy();
});
client.on('error', (e) => {
    console.log("실패:", e.message);
});
client.on('timeout', () => {
    console.log("타임아웃!");
    client.destroy();
});

// 8. require 위험한 모듈
console.log("\n[8] 위험한 모듈 로드:");
const dangerousModules = ['vm', 'worker_threads', 'cluster'];
dangerousModules.forEach(mod => {
    try {
        require(mod);
        console.log(`${mod}: 로드 성공!`);
    } catch (e) {
        console.log(`${mod}: 차단됨 - ${e.message}`);
    }
});

// 9. 파일 쓰기
console.log("\n[9] 파일 쓰기 시도:");
try {
    fs.writeFileSync('/tmp/test_escape.txt', 'escape test');
    console.log("파일 쓰기 성공!");
    fs.unlinkSync('/tmp/test_escape.txt');
} catch (e) {
    console.log("실패:", e.message);
}






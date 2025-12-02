// 테스트 18: Rust 샌드박스 탈출 시도
use std::fs;
use std::process::Command;
use std::net::TcpStream;
use std::time::Duration;
use std::env;

fn main() {
    println!("=== Rust 샌드박스 탈출 테스트 ===\n");
    
    // 1. Command 실행
    println!("[1] Command::new('id'):");
    match Command::new("id").output() {
        Ok(output) => println!("{}", String::from_utf8_lossy(&output.stdout)),
        Err(e) => println!("실패: {}", e),
    }
    
    // 2. 파일 읽기
    println!("\n[2] /etc/passwd 읽기:");
    match fs::read_to_string("/etc/passwd") {
        Ok(content) => println!("{}", &content[..content.len().min(500)]),
        Err(e) => println!("실패: {}", e),
    }
    
    // 3. 디렉토리 탐색
    println!("\n[3] 루트 디렉토리:");
    match fs::read_dir("/") {
        Ok(entries) => {
            for entry in entries.take(10) {
                if let Ok(e) = entry {
                    println!("  {}", e.path().display());
                }
            }
        }
        Err(e) => println!("실패: {}", e),
    }
    
    // 4. 환경변수
    println!("\n[4] 환경변수:");
    for (key, value) in env::vars().take(5) {
        println!("  {}={}", key, value);
    }
    
    // 5. 현재 디렉토리
    println!("\n[5] 현재 디렉토리:");
    match env::current_dir() {
        Ok(path) => println!("  {}", path.display()),
        Err(e) => println!("실패: {}", e),
    }
    
    // 6. 네트워크 연결
    println!("\n[6] 네트워크 연결 시도:");
    match TcpStream::connect_timeout(
        &"1.1.1.1:80".parse().unwrap(),
        Duration::from_secs(3)
    ) {
        Ok(_) => println!("연결 성공! 네트워크 접근 가능!"),
        Err(e) => println!("실패: {}", e),
    }
    
    // 7. 파일 쓰기
    println!("\n[7] 파일 쓰기 시도:");
    match fs::write("/tmp/rust_test.txt", "test") {
        Ok(_) => {
            println!("파일 쓰기 성공!");
            let _ = fs::remove_file("/tmp/rust_test.txt");
        }
        Err(e) => println!("실패: {}", e),
    }
    
    // 8. unsafe 코드
    println!("\n[8] unsafe 코드 테스트:");
    unsafe {
        // 위험한 포인터 조작
        let ptr: *mut i32 = std::ptr::null_mut();
        println!("  null 포인터 생성됨: {:?}", ptr);
        // 실제로 역참조하면 크래시
        // *ptr = 42;
    }
    
    println!("\n완료!");
}






// 테스트 16: Java 샌드박스 탈출 시도
import java.io.*;
import java.lang.reflect.*;
import java.net.*;

public class Main {
    public static void main(String[] args) {
        System.out.println("=== Java 샌드박스 탈출 테스트 ===\n");
        
        // 1. Runtime.exec() 실행
        System.out.println("[1] Runtime.exec('id'):");
        try {
            Process p = Runtime.getRuntime().exec("id");
            BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String line;
            while ((line = br.readLine()) != null) {
                System.out.println(line);
            }
        } catch (Exception e) {
            System.out.println("실패: " + e.getMessage());
        }
        
        // 2. ProcessBuilder 사용
        System.out.println("\n[2] ProcessBuilder('ls', '-la', '/'):");
        try {
            ProcessBuilder pb = new ProcessBuilder("ls", "-la", "/");
            pb.redirectErrorStream(true);
            Process p = pb.start();
            BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String line;
            int count = 0;
            while ((line = br.readLine()) != null && count++ < 10) {
                System.out.println(line);
            }
        } catch (Exception e) {
            System.out.println("실패: " + e.getMessage());
        }
        
        // 3. 파일 읽기
        System.out.println("\n[3] /etc/passwd 읽기:");
        try {
            BufferedReader br = new BufferedReader(new FileReader("/etc/passwd"));
            String line;
            int count = 0;
            while ((line = br.readLine()) != null && count++ < 5) {
                System.out.println(line);
            }
            br.close();
        } catch (Exception e) {
            System.out.println("실패: " + e.getMessage());
        }
        
        // 4. 네트워크 연결
        System.out.println("\n[4] 네트워크 연결 시도:");
        try {
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress("1.1.1.1", 80), 3000);
            System.out.println("연결 성공! 네트워크 접근 가능!");
            socket.close();
        } catch (Exception e) {
            System.out.println("실패: " + e.getMessage());
        }
        
        // 5. 시스템 속성
        System.out.println("\n[5] 시스템 속성:");
        System.out.println("user.dir: " + System.getProperty("user.dir"));
        System.out.println("user.home: " + System.getProperty("user.home"));
        System.out.println("os.name: " + System.getProperty("os.name"));
        
        // 6. 환경변수
        System.out.println("\n[6] 환경변수:");
        int count = 0;
        for (String key : System.getenv().keySet()) {
            if (count++ >= 5) break;
            System.out.println(key + "=" + System.getenv(key));
        }
        
        // 7. ClassLoader 조작
        System.out.println("\n[7] ClassLoader 조작 시도:");
        try {
            ClassLoader cl = Main.class.getClassLoader();
            System.out.println("ClassLoader: " + cl.getClass().getName());
        } catch (Exception e) {
            System.out.println("실패: " + e.getMessage());
        }
    }
}






# ANIGMA 형식 Makefile
# make build: 소스 코드 컴파일
# make run file=<파일경로>: 프로그램 실행

CXX = g++
CXXFLAGS = -std=c++17 -O2 -Wall
TARGET = solution

build:
	@$(CXX) $(CXXFLAGS) -o $(TARGET) main.cpp

run:
	@./$(TARGET) $(INPUT)

clean:
	rm -f $(TARGET)

.PHONY: build run clean


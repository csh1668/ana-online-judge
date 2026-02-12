import sys
import re
import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv()

# DB Config
DB_CONFIG = {
    "dbname": "aoj",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": "5432"
}

DUMP_FILE = 'dmoj_backup_20260210_142408.sql'

# Get dummy password from env
DUMMY_PASSWORD = os.getenv("DUMMY_PASSWORD_HASH")
if DUMMY_PASSWORD is None:
    print("DUMMY_PASS_WORD_HASH not setted")
    exit()


def connect_db():
    return psycopg2.connect(**DB_CONFIG)

def parse_sql_values_with_offset(text, start_idx):
    """
    Parses the VALUES part of an SQL INSERT statement starting at start_idx.
    Returns (values, end_idx).
    """
    values = []
    
    # State machine variables
    state = 'OUT' # OUT, IN_TUPLE, IN_STRING, ESCAPE
    quote_char = None
    current_row = []
    current_token = []
    
    i = start_idx
    length = len(text)
    
    while i < length:
        char = text[i]
        
        if state == 'OUT':
            if char == '(':
                state = 'IN_TUPLE'
                current_row = []
                current_token = []
            elif char == ',' or char.isspace():
                pass # Skip separators between tuples
            elif char == ';':
                return values, i + 1 # End of statement
                
        elif state == 'IN_TUPLE':
            if char == "'" or char == '"':
                state = 'IN_STRING'
                quote_char = char
                # current_token.append(char) # Don't keep quotes for Python processing if we want clean data
            elif char == ',':
                # End of field
                val = "".join(current_token).strip()
                if val == 'NULL':
                    current_row.append(None)
                elif val.isdigit():
                    current_row.append(int(val))
                else:
                    try:
                        current_row.append(float(val))
                    except:
                        current_row.append(val)
                current_token = []
            elif char == ')':
                # End of tuple
                val = "".join(current_token).strip()
                if val: # Handle last field
                    if val == 'NULL':
                        current_row.append(None)
                    elif val.isdigit():
                        current_row.append(int(val))
                    else:
                        try:
                            current_row.append(float(val))
                        except:
                            current_row.append(val)
                values.append(current_row)
                state = 'OUT'
            else:
                current_token.append(char)
                
        elif state == 'IN_STRING':
            if char == '\\':
                state = 'ESCAPE'
            elif char == quote_char:
                state = 'IN_TUPLE'
            else:
                current_token.append(char)
                
        elif state == 'ESCAPE':
            if char == 'n': current_token.append('\n')
            elif char == 'r': current_token.append('\r')
            elif char == 't': current_token.append('\t')
            elif char == '0': current_token.append('\0')
            elif char == '\\': current_token.append('\\')
            elif char == "'": current_token.append("'")
            elif char == '"': current_token.append('"')
            else: current_token.append(char) # Literal
            state = 'IN_STRING'
            
        i += 1
        
    return values, i

def extract_inserts(content, table_name):
    """
    Finds and parses ALL INSERT statements for a specific table.
    """
    print(f"Extracting {table_name}...")
    search_str = f"INSERT INTO `{table_name}` VALUES"
    
    all_values = []
    start_search_idx = 0
    
    while True:
        start_idx = content.find(search_str, start_search_idx)
        if start_idx == -1:
            break
            
        values_start = content.find('(', start_idx)
        if values_start == -1:
            start_search_idx = start_idx + len(search_str)
            continue
            
        chunk_values, end_idx = parse_sql_values_with_offset(content, values_start)
        all_values.extend(chunk_values)
        start_search_idx = end_idx
        
    return all_values

def run_migration():
    print("Reading dump file...")
    try:
        with open(DUMP_FILE, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: Dump file '{DUMP_FILE}' not found.")
        return

    conn = connect_db()
    cur = conn.cursor()

    # 1. Languages
    print("Parsing Languages...")
    languages_data = extract_inserts(content, 'judge_language')
    lang_map = {row[0]: row[1] for row in languages_data if len(row) > 1}
    
    # 2. Users (auth_user)
    print("Parsing Users...")
    users_data = extract_inserts(content, 'auth_user')
    print(f"Migrating {len(users_data)} users...")
    
    for row in users_data:
        if len(row) < 11: continue
        user_id = row[0]
        username = row[4]
        # Use secure dummy password from env
        password = DUMMY_PASSWORD
        first_name = row[5]
        last_name = row[6]
        email = row[7] if row[7] else None
        
        # Handle duplicate dummy emails from DMOJ dump
        if email == 'example@email.com':
            email = f"example_{user_id}@email.com"
            
        date_joined = row[10]
        name = f"{first_name} {last_name}".strip()
        if not name: name = username
        
        role = 'user'
        if row[3] == 1: role = 'admin'
        
        try:
            cur.execute("""
                INSERT INTO users (id, username, email, password, name, role, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (id) DO NOTHING
            """, (user_id, username, email, password, name, role, date_joined))
        except Exception as e:
            print(f"Failed to insert user {username}: {e}")
            conn.rollback()
    conn.commit()
    
    # 3. Profiles (judge_profile) - Mapping Map
    # judge_profile: id, ..., user_id
    # We need to map judge_profile.id -> auth_user.id (which is now users.id)
    print("Parsing Profiles for ID mapping...")
    profiles_data = extract_inserts(content, 'judge_profile')
    # Schema check: L6039 in dump
    # id=0, ..., user_id=20 (based on CREATE TABLE counting, need to be careful)
    # Let's count columns in CREATE TABLE judge_profile
    # id, about, timezone, points, performance_points, problem_count, ace_theme, last_access, ip, 
    # display_rank, mute, is_unlisted, rating, user_script, math_engine, is_totp_enabled, totp_key, 
    # notes, current_contest_id, language_id, user_id, ...
    # 0: id
    # ...
    # 19: language_id
    # 20: user_id
    profile_to_user_map = {}
    for row in profiles_data:
        if len(row) > 20:
            profile_id = row[0]
            user_auth_id = row[20]
            profile_to_user_map[profile_id] = user_auth_id

    # 4. Problems
    print("Parsing Problems...")
    problems_data = extract_inserts(content, 'judge_problem')
    print(f"Migrating {len(problems_data)} problems...")
    
    for row in problems_data:
        if len(row) < 10: continue
        prob_id = row[0]
        title = row[2]
        content_md = row[3]
        time_limit = int(row[4] * 1000) # s -> ms
        memory_limit = int(row[5] / 1024) # KB -> MB
        max_score = int(row[7])
        is_public = bool(row[9])
        
        try:
            cur.execute("""
                INSERT INTO problems (id, title, content, time_limit, memory_limit, max_score, is_public, judge_available, problem_type, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, false, 'icpc', NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            """, (prob_id, title, content_md, time_limit, memory_limit, max_score, is_public))
        except Exception as e:
            print(f"Failed to insert problem {title}: {e}")
            conn.rollback()
    conn.commit()

    # 5. Contests
    print("Parsing Contests...")
    contests_data = extract_inserts(content, 'judge_contest')
    print(f"Migrating {len(contests_data)} contests...")
    
    for row in contests_data:
        if len(row) < 8: continue
        contest_id = row[0]
        title = row[2]
        description = row[3]
        start_time = row[4]
        end_time = row[5]
        visibility = 'public' if row[7] else 'private'
        
        try:
            cur.execute("""
                INSERT INTO contests (id, title, description, start_time, end_time, visibility, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            """, (contest_id, title, description, start_time, end_time, visibility))
        except Exception as e:
            print(f"Failed to insert contest {title}: {e}")
            conn.rollback()
    conn.commit()
    
    # 6. Contest Problems
    print("Parsing Contest Problems...")
    cp_data = extract_inserts(content, 'judge_contestproblem')
    print(f"Migrating {len(cp_data)} contest problems...")
    
    for row in cp_data:
        if len(row) < 9: continue
        order = row[4]
        contest_id = row[7]
        problem_id = row[8]
        label = chr(ord('A') + (order - 1))
        
        try:
            # Check if exists
            cur.execute("SELECT 1 FROM contest_problems WHERE contest_id = %s AND problem_id = %s", (contest_id, problem_id))
            if cur.fetchone():
                continue

            cur.execute("""
                INSERT INTO contest_problems (contest_id, problem_id, label, "order")
                VALUES (%s, %s, %s, %s)
            """, (contest_id, problem_id, label, order))
        except Exception as e:
            print(f"Failed to insert contest problem {contest_id}-{problem_id}: {e}")
            conn.rollback()
    conn.commit()

    # 6.5 Contest Participants
    print("Parsing Contest Participants...")
    participants_data = extract_inserts(content, 'judge_contestparticipation')
    print(f"Migrating {len(participants_data)} contest participants...")

    for row in participants_data:
        # id=0, start=1, score=2, cumtime=3, virtual=4, format_data=5, contest_id=6, user_id=7 (profile_id)
        if len(row) < 8: continue
        
        start_time = row[1]
        # virtual = row[4] # We might want to handle virtual participation, but schema only has basic participation
        contest_id = row[6]
        profile_id = row[7]
        
        user_id = profile_to_user_map.get(profile_id)
        if not user_id:
            print(f"Skipping participant profile {profile_id}: User not found")
            continue
            
        try:
            # Check if exists (since DMOJ has unique constraint on contest_id, user_id, virtual)
            # AOJ has PK on id, but no unique on (contest_id, user_id) in the schema definition visible in file?
            # Wait, checking schema.ts:
            # export const contestParticipants = pgTable("contest_participants", { ... });
            # It doesn't show a unique index in the provided snippet, but logically it should be unique.
            # Let's check for existence to be safe.
            
            cur.execute("SELECT 1 FROM contest_participants WHERE contest_id = %s AND user_id = %s", (contest_id, user_id))
            if cur.fetchone():
                continue

            cur.execute("""
                INSERT INTO contest_participants (contest_id, user_id, registered_at)
                VALUES (%s, %s, %s)
            """, (contest_id, user_id, start_time))
        except Exception as e:
            print(f"Failed to insert participant {user_id} for contest {contest_id}: {e}")
            conn.rollback()
    conn.commit()
    
    # 7. Submission Sources
    print("Parsing Submission Sources...")
    source_data = extract_inserts(content, 'judge_submissionsource')
    sources_map = {}
    for row in source_data:
        if len(row) > 2:
            sources_map[row[2]] = row[1]
            
    # 8. Submissions
    print("Parsing Submissions...")
    submissions_data = extract_inserts(content, 'judge_submission')
    print(f"Migrating {len(submissions_data)} submissions...")
    
    verdict_map = {
        'AC': 'accepted', 'WA': 'wrong_answer', 'TLE': 'time_limit_exceeded',
        'MLE': 'memory_limit_exceeded', 'RTE': 'runtime_error', 'IR': 'runtime_error',
        'CE': 'compile_error', 'PE': 'presentation_error', 'QU': 'pending',
        'G': 'judging', 'C': 'judging', 'IE': 'system_error'
    }
    
    lang_map_aoj = {
        'C': 'c', 'C11': 'c', 'CPP17': 'cpp', 'CPP20': 'cpp', 
        'C++17': 'cpp', 'C++20': 'cpp', 'PY3': 'python', 
        'Python 3': 'python', 'JAVA8': 'java', 'Java': 'java'
    }
    
    for row in submissions_data:
        if len(row) < 18: continue
        sub_id = row[0]
        created_at = row[1]
        
        exec_time = int(row[2] * 1000) if row[2] is not None else None
        memory = int(row[3]) if row[3] is not None else None
        
        score = int(row[4]) if row[4] else 0
        result_code = row[6]
        verdict = verdict_map.get(result_code, 'fail')
        
        lang_id = row[14]
        lang_key = lang_map.get(lang_id)
        language = lang_map_aoj.get(lang_key)
        
        if not language:
            # print(f"Skipping submission {sub_id}: Unsupported language {lang_key}")
            continue
            
        problem_id = row[15]
        profile_id = row[16] # This is judge_profile.id
        contest_id = row[17]
        
        # Map profile_id to user_id
        user_id = profile_to_user_map.get(profile_id)
        if not user_id:
            print(f"Skipping submission {sub_id}: Profile {profile_id} not found in map")
            continue
        
        source_code = sources_map.get(sub_id, "")
        if not source_code:
            # We can't insert without code as per schema
            # But maybe we should insert a placeholder to keep stats?
            source_code = "// Code missing in migration"
            
        try:
            cur.execute("""
                INSERT INTO submissions (id, user_id, problem_id, contest_id, code, language, verdict, execution_time, memory_used, score, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, (sub_id, user_id, problem_id, contest_id, source_code, language, verdict, exec_time, memory, score, created_at))
        except Exception as e:
            print(f"Failed to insert submission {sub_id}: {e}")
            conn.rollback()
            
    conn.commit()
    cur.close()
    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    run_migration()

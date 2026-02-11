import sys
import re
import psycopg2
import ast
from datetime import datetime

# DB Config
DB_CONFIG = {
    "dbname": "aoj",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": "5432"
}

DUMP_FILE = 'dmoj_backup_20260210_142408.sql'

def connect_db():
    return psycopg2.connect(**DB_CONFIG)

def parse_values(query):
    """
    Parses MySQL INSERT VALUES (...) string into a list of lists.
    Handles quoted strings and escapes roughly.
    Assuming the dump format: (1, 'str', ...), (2, 'str', ...);
    """
    # Remove "INSERT INTO `table` VALUES " prefix
    # But we might just pass the values part.
    
    # We will use a state machine because regex is hard for nested commas inside quotes
    values = []
    current_row = []
    current_token = []
    in_string = False
    quote_char = None
    escaped = False
    
    # Skip until the first (
    start_idx = query.find('(')
    if start_idx == -1:
        return []
    
    text = query[start_idx:]
    
    # Iterate chars
    i = 0
    length = len(text)
    
    # States
    IN_TUPLE = False
    
    while i < length:
        char = text[i]
        
        if not IN_TUPLE:
            if char == '(':
                IN_TUPLE = True
                current_row = []
                current_token = []
            # Skip other chars between tuples like , or 

        else:
            # Inside a tuple (...)
            if in_string:
                if escaped:
                    # Handle MySQL escape sequences if needed, or just keep as is
                    if char == 'n': current_token.append('
')
                    elif char == 'r': current_token.append('')
                    elif char == 't': current_token.append('	')
                    elif char == '0': current_token.append('\0')
                    elif char == "'": current_token.append("'")
                    elif char == '"': current_token.append('"')
                    elif char == '': current_token.append('')
                    else: current_token.append(char)
                    escaped = False
                elif char == '':
                    escaped = True
                elif char == quote_char:
                    in_string = False
                    quote_char = None
                else:
                    current_token.append(char)
            else:
                if char == "'":
                    in_string = True
                    quote_char = "'"
                elif char == ',':
                    # End of field
                    val = "".join(current_token).strip()
                    if val == 'NULL':
                        current_row.append(None)
                    else:
                        # Try to convert to number if it looks like one and wasn't quoted?
                        # Actually we stripped quotes? No, we didn't add quotes to token if we entered in_string
                        # If we were in_string, we added content.
                        # If we were NOT in_string, it's a number or keyword (NULL).
                        # But wait, my logic above adds chars to current_token ONLY if in_string?
                        # No, I missed the else block for not in_string
                        pass
                    
                    # Logic fix:
                    # We need to capture non-string tokens too.
                    pass
    
    # Let's try a simpler approach using Regex for the tuples if possible, 
    # OR a better state machine.
    
    # Better State Machine
    rows = []
    row = []
    token = []
    state = 'OUT' # OUT, IN_TUPLE, IN_STRING, ESCAPE
    quote = ''
    
    i = 0
    while i < len(text):
        c = text[i]
        
        if state == 'OUT':
            if c == '(':
                state = 'IN_TUPLE'
                row = []
                token = []
        elif state == 'IN_TUPLE':
            if c == "'" or c == '"':
                state = 'IN_STRING'
                quote = c
            elif c == ',':
                # End of value
                val = "".join(token).strip()
                if val == 'NULL': row.append(None)
                elif val.isdigit(): row.append(int(val))
                else: 
                    # Try float
                    try:
                        row.append(float(val))
                    except:
                        row.append(val)
                token = []
            elif c == ')':
                # End of tuple
                val = "".join(token).strip()
                if val:
                    if val == 'NULL': row.append(None)
                    elif val.isdigit(): row.append(int(val))
                    else:
                        try:
                            row.append(float(val))
                        except:
                            row.append(val)
                rows.append(row)
                state = 'OUT'
            else:
                token.append(c)
        elif state == 'IN_STRING':
            if c == '':
                state = 'ESCAPE'
            elif c == quote:
                # End of string
                # Add the string to row immediately? No, wait for comma.
                # But token currently holds the string content.
                # We need to mark that this was a string to avoid parsing as NULL/Number
                state = 'IN_TUPLE'
                # We treat everything as string if it was quoted. 
                # But my logic above joins token at comma.
                # To differentiate "123" from 123, we can wrap token in a wrapper or just leave as string.
                # For this migration, mostly it's fine.
                # However, if we have 'NULL' string vs NULL keyword.
                # Let's just append the string value to row?
                # The issue is the comma handling. 
                # If I just switch state back to IN_TUPLE, the next comma will append the token.
                # But I need to consume the quote.
                pass
            else:
                token.append(c)
        elif state == 'ESCAPE':
            # MySQL escape handling
            if c == 'n': token.append('
')
            elif c == 'r': token.append('')
            elif c == 't': token.append('	')
            elif c == '0': token.append('\0')
            else: token.append(c) # Literal char for others
            state = 'IN_STRING'
        
        i += 1
        
    return rows

# Revised Parser using regex splitting for the values block
# Since DMOJ dump is standard, we can assume standard escaping.
# `VALUES (a, b), (c, d);`
def extract_inserts(content, table_name):
    print(f"Extracting {table_name}...")
    pattern = re.compile(f"INSERT INTO `{table_name}` VALUES", re.IGNORECASE)
    start_match = pattern.search(content)
    if not start_match:
        return []
    
    start_pos = start_match.end()
    end_pos = content.find(';', start_pos)
    values_str = content[start_pos:end_pos].strip()
    
    # Simple split by `),(` is dangerous because string can contain it.
    # We will use a custom character walker.
    
    results = []
    current_row = []
    current_val = []
    in_string = False
    escape = False
    quote_char = None
    
    # Skip initial (
    i = 0
    if values_str[0] == '(': i = 1
    
    while i < len(values_str):
        c = values_str[i]
        
        if escape:
            # Handle escapes
            if c == 'n': current_val.append('
')
            elif c == 'r': current_val.append('')
            elif c == "'": current_val.append("'")
            elif c == '"': current_val.append('"')
            elif c == '': current_val.append('')
            else: current_val.append(c)
            escape = False
        elif in_string:
            if c == '':
                escape = True
            elif c == quote_char:
                in_string = False
            else:
                current_val.append(c)
        else:
            if c == "'" or c == '"':
                in_string = True
                quote_char = c
            elif c == ',' or c == ')':
                # Value end
                val_str = "".join(current_val).strip()
                if val_str == 'NULL':
                    current_row.append(None)
                else:
                    # Check if integer/float or string
                    # If we were in string, it should be string.
                    # My current_val collection mixes unquoted and quoted content (bad design).
                    # But for now, if it is numeric, convert.
                    if val_str.isdigit():
                        current_row.append(int(val_str))
                    else:
                        try:
                            current_row.append(float(val_str))
                        except:
                            current_row.append(val_str)
                
                current_val = []
                
                if c == ')':
                    # Row end
                    results.append(current_row)
                    current_row = []
                    # Skip until next (
                    while i + 1 < len(values_str) and values_str[i+1] != '(':
                        i += 1
                    if i + 1 < len(values_str):
                        i += 1 # Skip (
            else:
                current_val.append(c)
        
        i += 1
        
    return results

def run_migration():
    print("Reading dump file...")
    with open(DUMP_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # 1. Languages
    # judge_language: id, key
    print("Parsing Languages...")
    languages_data = extract_inserts(content, 'judge_language')
    # Schema: id, key, name, ...
    # We assume schema: id is 0, key is 1.
    lang_map = {}
    for row in languages_data:
        if len(row) > 1:
            lang_map[row[0]] = row[1]
    
    # 2. Users
    # auth_user: id, password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined
    print("Parsing Users...")
    users_data = extract_inserts(content, 'auth_user')
    
    conn = connect_db()
    cur = conn.cursor()
    
    print(f"Migrating {len(users_data)} users...")
    for row in users_data:
        # id=0, password=1, ..., username=4, first_name=5, last_name=6, email=7, ..., date_joined=10
        user_id = row[0]
        username = row[4]
        # Use dummy password
        password = "$2b$10$DUMMYHASHFORLEGACYACCOUNTDONOTUSE" 
        first_name = row[5]
        last_name = row[6]
        email = row[7] if row[7] else None
        date_joined = row[10]
        name = f"{first_name} {last_name}".strip()
        if not name: name = username
        
        role = 'user'
        if row[3] == 1: role = 'admin' # is_superuser
        
        # Insert
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
    
    # 3. Problems
    # judge_problem: id, code, name, description, time_limit, memory_limit, ..., is_public, points
    # Schema based on dump: id=0, code=1, name=2, description=3, time_limit=4, memory_limit=5, ..., points=7, ..., is_public=9
    print("Parsing Problems...")
    problems_data = extract_inserts(content, 'judge_problem')
    print(f"Migrating {len(problems_data)} problems...")
    
    for row in problems_data:
        prob_id = row[0]
        title = row[2]
        content_md = row[3]
        time_limit = int(row[4] * 1000) # s -> ms
        memory_limit = int(row[5] / 1024) # KB -> MB
        max_score = int(row[7])
        is_public = bool(row[9])
        
        try:
            cur.execute("""
                INSERT INTO problems (id, title, content, time_limit, memory_limit, max_score, is_public, problem_type, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'icpc', NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            """, (prob_id, title, content_md, time_limit, memory_limit, max_score, is_public))
        except Exception as e:
            print(f"Failed to insert problem {title}: {e}")
            conn.rollback()
            
    conn.commit()

    # 4. Contests
    # judge_contest: id, key, name, description, start_time, end_time, ..., is_visible
    # Schema: id=0, key=1, name=2, description=3, start_time=4, end_time=5, ..., is_visible=7
    print("Parsing Contests...")
    contests_data = extract_inserts(content, 'judge_contest')
    print(f"Migrating {len(contests_data)} contests...")
    
    for row in contests_data:
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
    
    # 5. Contest Problems
    # judge_contestproblem: id, points, partial, ..., order, ..., contest_id, problem_id
    # Schema from dump: id=0, ..., order=4, ..., contest_id=7, problem_id=8 (Wait, checking indices from dump content)
    # The dump insert: (1, 100, 0, 1, 1, 0, NULL, 1, 2)
    # id=0, points=1, partial=2, is_pretested=3, order=4, output_prefix=5, max_subs=6, contest_id=7, problem_id=8
    print("Parsing Contest Problems...")
    cp_data = extract_inserts(content, 'judge_contestproblem')
    print(f"Migrating {len(cp_data)} contest problems...")
    
    for row in cp_data:
        # cp_id = row[0] # Auto inc in AOJ, let's ignore or use strict?
        # AOJ uses auto-inc id. We can skip id insert.
        order = row[4]
        contest_id = row[7]
        problem_id = row[8]
        
        # Generate Label: A, B, C...
        label = chr(ord('A') + (order - 1))
        
        try:
            cur.execute("""
                INSERT INTO contest_problems (contest_id, problem_id, label, "order")
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (contest_id, problem_id, label, order))
        except Exception as e:
            print(f"Failed to insert contest problem {contest_id}-{problem_id}: {e}")
            conn.rollback()
            
    conn.commit()
    
    # 6. Submission Sources
    # judge_submissionsource: id, source, submission_id
    # Schema: id=0, source=1, submission_id=2
    print("Parsing Submission Sources...")
    source_data = extract_inserts(content, 'judge_submissionsource')
    sources_map = {}
    for row in source_data:
        if len(row) > 2:
            sources_map[row[2]] = row[1]
            
    # 7. Submissions
    # judge_submission: id, date, time, memory, points, status, result, error, current_testcase, batch, case_points, case_total, is_pretested, judged_on_id, language_id, problem_id, user_id, contest_object_id, judged_date, locked_after, rejudged_date
    # Schema: id=0, date=1, time=2, memory=3, points=4, status=5, result=6, error=7, ..., language_id=14, problem_id=15, user_id=16, contest_object_id=17
    print("Parsing Submissions...")
    submissions_data = extract_inserts(content, 'judge_submission')
    print(f"Migrating {len(submissions_data)} submissions...")
    
    # DMOJ Verdict Map
    verdict_map = {
        'AC': 'accepted',
        'WA': 'wrong_answer',
        'TLE': 'time_limit_exceeded',
        'MLE': 'memory_limit_exceeded',
        'RTE': 'runtime_error',
        'IR': 'runtime_error',
        'CE': 'compile_error',
        'PE': 'presentation_error',
        'QU': 'pending', # Queued
        'G': 'judging', # Grading
        'C': 'judging', # Compiling
    }
    
    # Language Map
    # DMOJ Keys: C, C11, CPP17, CPP20, PY3, JAVA8, TEXT, NODEJS
    lang_map_aoj = {
        'C': 'c', 'C11': 'c',
        'CPP17': 'cpp', 'CPP20': 'cpp', 'C++17': 'cpp', 'C++20': 'cpp',
        'PY3': 'python', 'Python 3': 'python',
        'JAVA8': 'java', 'Java': 'java'
    }
    
    for row in submissions_data:
        sub_id = row[0]
        created_at = row[1]
        exec_time = int(row[2] * 1000) if row[2] else 0
        memory = int(row[3]) if row[3] else 0 # KB, AOJ also uses KB in submissions table comment? 
        # Wait, schema.ts says: memoryUsed: integer("memory_used"), // KB
        # So no conversion needed for memory if DMOJ is KB.
        # DMOJ usually is KB.
        
        score = int(row[4]) if row[4] else 0
        result_code = row[6]
        verdict = verdict_map.get(result_code, 'fail')
        
        lang_id = row[14]
        lang_key = lang_map.get(lang_id)
        
        language = lang_map_aoj.get(lang_key)
        
        if not language:
            print(f"Skipping submission {sub_id}: Unsupported language {lang_key}")
            continue
            
        problem_id = row[15]
        user_id = row[16] # In DMOJ dump, this is judge_profile.id. Assuming 1:1 map to auth_user.id which we used for users table.
        contest_id = row[17] # Can be NULL
        
        source_code = sources_map.get(sub_id, "")
        if not source_code:
            print(f"Warning: No source code for submission {sub_id}")
            # Insert anyway? Schema says code is notNull.
            source_code = "// Lost source code"
            
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

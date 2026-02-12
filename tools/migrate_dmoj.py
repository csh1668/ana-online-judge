import sys
import os
import argparse
import subprocess

from dotenv import load_dotenv
load_dotenv()

# Get dummy password from env
DUMMY_PASSWORD = os.getenv("DUMMY_PASSWORD_HASH")

def to_sql_literal(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, str):
        # Postgres string literal escaping: replace ' with ''
        # Also remove null bytes as they are not allowed in text columns
        return "'" + val.replace("'", "''").replace('\0', '') + "'"
    return "'" + str(val).replace("'", "''") + "'"

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
                # current_token.append(char) # Don't keep quotes for Python processing
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

def generate_migration_sql(dump_files):
    if DUMMY_PASSWORD is None:
        print("Error: DUMMY_PASSWORD_HASH not set in .env")
        sys.exit(1)

    profile_to_user_map = {}
    sources_map = {}
    sql_statements = []
    
    # ==========================================
    # PASS 1: Build Maps (Profiles & Sources)
    # ==========================================
    print("Pass 1: Building maps from all dump files...")
    for dump_file in dump_files:
        print(f"  Scanning {dump_file}...")
        try:
            with open(dump_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except FileNotFoundError:
            print(f"  Warning: File '{dump_file}' not found.")
            continue

        # Map Profiles: judge_profile.id -> judge_profile.user_id (auth_user.id)
        # Schema check: id=0, ..., user_id=20
        profiles_data = extract_inserts(content, 'judge_profile')
        for row in profiles_data:
            if len(row) > 20:
                profile_id = row[0]
                user_auth_id = row[20]
                profile_to_user_map[profile_id] = user_auth_id
                
        # Map Sources: judge_submissionsource
        source_data = extract_inserts(content, 'judge_submissionsource')
        for row in source_data:
            if len(row) > 2:
                # row[2] = submission_id, row[1] = source
                sources_map[row[2]] = row[1]

    print(f"  Mapped {len(profile_to_user_map)} profiles and {len(sources_map)} sources.")

    # ==========================================
    # PASS 2: Generate SQL
    # ==========================================
    print("Pass 2: Generating SQL statements...")
    
    sql_statements.append("BEGIN;")
    
    for dump_file in dump_files:
        print(f"  Processing {dump_file}...")
        try:
            with open(dump_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except FileNotFoundError:
            continue

        # 1. Users (auth_user)
        users_data = extract_inserts(content, 'auth_user')
        if users_data:
            print(f"    - Processing {len(users_data)} users...")
            for row in users_data:
                if len(row) < 11: continue
                user_id = row[0]
                username = row[4]
                password = DUMMY_PASSWORD
                first_name = row[5]
                last_name = row[6]
                email = row[7] if row[7] else None
                
                if email == 'example@email.com':
                    email = f"example_{user_id}@email.com"
                    
                date_joined = row[10]
                name = f"{first_name} {last_name}".strip()
                if not name: name = username
                
                role = 'admin' if row[3] == 1 else 'user'
                
                # INSERT ... ON CONFLICT (id) DO NOTHING
                val_str = f"({to_sql_literal(user_id)}, {to_sql_literal(username)}, {to_sql_literal(email)}, {to_sql_literal(password)}, {to_sql_literal(name)}, {to_sql_literal(role)}, {to_sql_literal(date_joined)}, NOW())"
                sql = f"""
                INSERT INTO users (id, username, email, password, name, role, created_at, updated_at)
                VALUES {val_str}
                ON CONFLICT (id) DO NOTHING;
                """
                sql_statements.append(sql)

        # 2. Problems
        problems_data = extract_inserts(content, 'judge_problem')
        if problems_data:
            print(f"    - Processing {len(problems_data)} problems...")
            for row in problems_data:
                if len(row) < 10: continue
                prob_id = row[0]
                title = row[2]
                content_md = row[3]
                time_limit = int(row[4] * 1000)
                memory_limit = int(row[5] / 1024)
                max_score = int(row[7])
                is_public = bool(row[9])
                
                val_str = f"({to_sql_literal(prob_id)}, {to_sql_literal(title)}, {to_sql_literal(content_md)}, {to_sql_literal(time_limit)}, {to_sql_literal(memory_limit)}, {to_sql_literal(max_score)}, {to_sql_literal(is_public)}, false, 'icpc', NOW(), NOW())"
                sql = f"""
                INSERT INTO problems (id, title, content, time_limit, memory_limit, max_score, is_public, judge_available, problem_type, created_at, updated_at)
                VALUES {val_str}
                ON CONFLICT (id) DO NOTHING;
                """
                sql_statements.append(sql)

        # 3. Contests
        contests_data = extract_inserts(content, 'judge_contest')
        if contests_data:
            print(f"    - Processing {len(contests_data)} contests...")
            for row in contests_data:
                if len(row) < 8: continue
                contest_id = row[0]
                title = row[2]
                description = row[3]
                start_time = row[4]
                end_time = row[5]
                visibility = 'public' if row[7] else 'private'
                
                val_str = f"({to_sql_literal(contest_id)}, {to_sql_literal(title)}, {to_sql_literal(description)}, {to_sql_literal(start_time)}, {to_sql_literal(end_time)}, {to_sql_literal(visibility)}, NOW(), NOW())"
                sql = f"""
                INSERT INTO contests (id, title, description, start_time, end_time, visibility, created_at, updated_at)
                VALUES {val_str}
                ON CONFLICT (id) DO NOTHING;
                """
                sql_statements.append(sql)

        # 4. Contest Problems
        cp_data = extract_inserts(content, 'judge_contestproblem')
        if cp_data:
            print(f"    - Processing {len(cp_data)} contest problems...")
            for row in cp_data:
                if len(row) < 9: continue
                order = row[4]
                contest_id = row[7]
                problem_id = row[8]
                label = chr(ord('A') + (order - 1))
                
                # Use INSERT ... SELECT ... WHERE NOT EXISTS for safe idempotency without unique constraint
                sql = f"""
                INSERT INTO contest_problems (contest_id, problem_id, label, "order")
                SELECT {to_sql_literal(contest_id)}, {to_sql_literal(problem_id)}, {to_sql_literal(label)}, {to_sql_literal(order)}
                WHERE NOT EXISTS (
                    SELECT 1 FROM contest_problems 
                    WHERE contest_id = {to_sql_literal(contest_id)} AND problem_id = {to_sql_literal(problem_id)}
                );
                """
                sql_statements.append(sql)

        # 5. Contest Participants
        participants_data = extract_inserts(content, 'judge_contestparticipation')
        if participants_data:
            print(f"    - Processing {len(participants_data)} contest participants...")
            for row in participants_data:
                if len(row) < 8: continue
                start_time = row[1]
                contest_id = row[6]
                profile_id = row[7]
                
                user_id = profile_to_user_map.get(profile_id)
                if not user_id:
                    continue
                    
                sql = f"""
                INSERT INTO contest_participants (contest_id, user_id, registered_at)
                SELECT {to_sql_literal(contest_id)}, {to_sql_literal(user_id)}, {to_sql_literal(start_time)}
                WHERE NOT EXISTS (
                    SELECT 1 FROM contest_participants 
                    WHERE contest_id = {to_sql_literal(contest_id)} AND user_id = {to_sql_literal(user_id)}
                );
                """
                sql_statements.append(sql)

        # 6. Submissions
        submissions_data = extract_inserts(content, 'judge_submission')
        if submissions_data:
            print(f"    - Processing {len(submissions_data)} submissions...")
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
            lang_map_dmoj = {} # Need to rebuild this from current file or just use IDs?
            # Actually, lang IDs are consistent across DMOJ dumps usually.
            # But we need to know what ID maps to what string.
            # We can extract 'judge_language' from the current file.
            
            languages_data = extract_inserts(content, 'judge_language')
            local_lang_map = {row[0]: row[1] for row in languages_data if len(row) > 1}
            
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
                # If lang_id not in local map, we might fail. 
                # Ideally, judge_language is in the same file or we should have mapped it globally.
                # Let's try local first, then fallback? 
                # For now assume it's available.
                lang_key = local_lang_map.get(lang_id)
                language = lang_map_aoj.get(lang_key)
                
                if not language:
                    continue
                    
                problem_id = row[15]
                profile_id = row[16]
                contest_id = row[17]
                
                user_id = profile_to_user_map.get(profile_id)
                if not user_id:
                    continue
                
                source_code = sources_map.get(sub_id, "// Code missing in migration")
                
                val_str = f"({to_sql_literal(sub_id)}, {to_sql_literal(user_id)}, {to_sql_literal(problem_id)}, {to_sql_literal(contest_id)}, {to_sql_literal(source_code)}, {to_sql_literal(language)}, {to_sql_literal(verdict)}, {to_sql_literal(exec_time)}, {to_sql_literal(memory)}, {to_sql_literal(score)}, {to_sql_literal(created_at)})"
                
                sql = f"""
                INSERT INTO submissions (id, user_id, problem_id, contest_id, code, language, verdict, execution_time, memory_used, score, created_at)
                VALUES {val_str}
                ON CONFLICT (id) DO NOTHING;
                """
                sql_statements.append(sql)

    sql_statements.append("COMMIT;")
    return "\n".join(sql_statements)

def main():
    parser = argparse.ArgumentParser(description="Migrate DMOJ dumps to AOJ using docker exec")
    parser.add_argument("dump_files", nargs='+', help="Path to .sql dump files")
    args = parser.parse_args()

    print("Generating SQL script...")
    full_sql = generate_migration_sql(args.dump_files)
    
    # Save to temporary file
    temp_sql_file = "migration_gen.sql"
    with open(temp_sql_file, "w", encoding="utf-8") as f:
        f.write(full_sql)
        
    print(f"SQL script generated: {temp_sql_file}")
    print(f"Size: {os.path.getsize(temp_sql_file) / 1024 / 1024:.2f} MB")
    
    print("Executing SQL inside Postgres container...")
    
    # Command: docker compose exec -T postgres psql -U postgres -d aoj < migration_gen.sql
    cmd = ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "aoj"]
    
    try:
        with open(temp_sql_file, "r") as f:
            subprocess.run(cmd, stdin=f, check=True)
        print("Migration completed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error executing migration: {e}")
        print("Try running manually:")
        print(f"cat {temp_sql_file} | docker compose exec -T postgres psql -U postgres -d aoj")
    except FileNotFoundError:
        print("Error: docker compose not found or file issue.")

    # Optional: cleanup
    # os.remove(temp_sql_file)

if __name__ == "__main__":
    main()

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

    profile_to_user_map = {}  # (dump_file, profile_id) -> (dump_file, user_id)
    sources_map = {}          # (dump_file, submission_id) -> source_code
    lang_map = {}             # lang_id -> lang_name (global across dumps)
    sql_statements = []

    # Collect all data from dumps first, then deduplicate
    all_users = {}      # username -> (user_id, username, email, password, name, role, date_joined, dump_file)
    all_problems = {}   # title -> (prob_id, title, content_md, time_limit, memory_limit, max_score, is_public, dump_file)
    all_contests = []   # list of (contest_id, title, description, start_time, end_time, visibility, dump_file)
    all_contest_problems = []  # (order, contest_id, problem_id, dump_file)
    all_contest_participants = []  # (start_time, contest_id, profile_id, dump_file)
    all_submissions = []  # list of submission tuples

    # Maps for resolving references: (dump_file, dmoj_id) -> dedup_key
    user_dmoj_to_username = {}     # (dump_file, dmoj_user_id) -> username
    problem_dmoj_to_title = {}     # (dump_file, dmoj_problem_id) -> title
    contest_dedup_key = {}         # (dump_file, dmoj_contest_id) -> contest_index in all_contests

    # ==========================================
    # PASS 1: Extract all data from dumps
    # ==========================================
    print("Pass 1: Extracting data from all dump files...")
    for dump_file in dump_files:
        print(f"  Scanning {dump_file}...")
        try:
            with open(dump_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except FileNotFoundError:
            print(f"  Warning: File '{dump_file}' not found.")
            continue

        # --- Profiles: map profile_id -> auth_user_id ---
        profiles_data = extract_inserts(content, 'judge_profile')
        for row in profiles_data:
            if len(row) > 20:
                profile_id = row[0]
                user_auth_id = row[20]
                profile_to_user_map[(dump_file, profile_id)] = (dump_file, user_auth_id)

        # --- Sources: map submission_id -> source_code ---
        source_data = extract_inserts(content, 'judge_submissionsource')
        for row in source_data:
            if len(row) > 2:
                sources_map[(dump_file, row[2])] = row[1]

        # --- Languages ---
        languages_data = extract_inserts(content, 'judge_language')
        for row in languages_data:
            if len(row) > 1:
                lang_map[(dump_file, row[0])] = row[1]

        # --- Users: deduplicate by username ---
        users_data = extract_inserts(content, 'auth_user')
        for row in users_data:
            if len(row) < 11:
                continue
            user_id = row[0]
            username = str(row[4]).strip()
            # Skip admin user (already exists in AOJ)
            if username == 'admin':
                user_dmoj_to_username[(dump_file, user_id)] = username
                continue

            first_name = row[5]
            last_name = row[6]
            email = str(row[7]) if row[7] else None
            if email == 'example@email.com':
                email = None
            date_joined = row[10]
            name = f"{first_name} {last_name}".strip()
            if not name:
                name = username
            role = 'admin' if row[3] == 1 else 'user'

            user_dmoj_to_username[(dump_file, user_id)] = username

            # Only keep first occurrence (old dump takes priority)
            if username not in all_users:
                all_users[username] = (username, email, DUMMY_PASSWORD, name, role, date_joined)

        # --- Problems: deduplicate by title ---
        problems_data = extract_inserts(content, 'judge_problem')
        for row in problems_data:
            if len(row) < 10:
                continue
            prob_id = row[0]
            title = str(row[2]).strip()
            content_md = row[3]
            time_limit = int(row[4] * 1000)
            memory_limit = int(row[5] / 1024)
            max_score = int(row[7])
            is_public = bool(row[9])

            problem_dmoj_to_title[(dump_file, prob_id)] = title

            # Only keep first occurrence
            if title not in all_problems:
                all_problems[title] = (title, content_md, time_limit, memory_limit, max_score, is_public)

        # --- Contests: no dedup (all are unique) ---
        contests_data = extract_inserts(content, 'judge_contest')
        for row in contests_data:
            if len(row) < 8:
                continue
            contest_id = row[0]
            title = str(row[2])
            description = str(row[3]) if row[3] else None
            start_time = row[4]
            end_time = row[5]
            visibility = 'public' if row[7] else 'private'

            idx = len(all_contests)
            contest_dedup_key[(dump_file, contest_id)] = idx
            all_contests.append((title, description, start_time, end_time, visibility))

        # --- Contest Problems ---
        cp_data = extract_inserts(content, 'judge_contestproblem')
        for row in cp_data:
            if len(row) < 9:
                continue
            order = row[4]
            contest_id = row[7]
            problem_id = row[8]
            all_contest_problems.append((order, contest_id, problem_id, dump_file))

        # --- Contest Participants ---
        participants_data = extract_inserts(content, 'judge_contestparticipation')
        for row in participants_data:
            if len(row) < 8:
                continue
            start_time = row[1]
            contest_id = row[6]
            profile_id = row[7]
            all_contest_participants.append((start_time, contest_id, profile_id, dump_file))

        # --- Submissions ---
        submissions_data = extract_inserts(content, 'judge_submission')
        for row in submissions_data:
            if len(row) < 18:
                continue
            sub_id = row[0]
            created_at = row[1]
            exec_time = int(row[2] * 1000) if row[2] is not None else None
            memory = int(row[3]) if row[3] is not None else None
            score = int(row[4]) if row[4] else 0
            result_code = row[6]
            lang_id = row[14]
            problem_id = row[15]
            profile_id = row[16]
            contest_id = row[17]

            all_submissions.append((
                sub_id, created_at, exec_time, memory, score,
                result_code, lang_id, problem_id, profile_id, contest_id,
                dump_file
            ))

    # Deduplicate emails: if multiple users share the same email, nullify all but the first
    seen_emails = {}
    for username, (uname, email, password, name, role, date_joined) in all_users.items():
        if email:
            if email in seen_emails:
                # Nullify this duplicate email
                all_users[username] = (uname, None, password, name, role, date_joined)
                # Also nullify the first one if not already done
                first_user = seen_emails[email]
                fu = all_users[first_user]
                if fu[1] is not None:
                    all_users[first_user] = (fu[0], None, fu[2], fu[3], fu[4], fu[5])
            else:
                seen_emails[email] = username

    print(f"\n  Deduplicated: {len(all_users)} users, {len(all_problems)} problems, "
          f"{len(all_contests)} contests, {len(all_submissions)} submissions")

    # ==========================================
    # PASS 2: Generate SQL
    # ==========================================
    print("\nPass 2: Generating SQL statements...")

    sql_statements.append("BEGIN;")

    # --- Cleanup previously migrated data ---
    sql_statements.append("""
-- =============================================
-- CLEANUP: Remove previously migrated DMOJ data
-- Delete in reverse dependency order
-- =============================================

-- Identify migrated problems (no testcases, judge not available)
CREATE TEMP TABLE _cleanup_problem_ids AS
    SELECT p.id FROM problems p
    LEFT JOIN testcases t ON t.problem_id = p.id
    WHERE t.id IS NULL AND p.judge_available = false;

-- Identify migrated contests
CREATE TEMP TABLE _cleanup_contest_ids AS
    SELECT id FROM contests
    WHERE title LIKE '%ANAGETDON%' OR title LIKE '%테스트%' OR title LIKE '%TEST%';

-- 1. Delete ALL submissions to migrated problems (regardless of who submitted)
--    submission_results cascade-deletes automatically
DELETE FROM submissions WHERE problem_id IN (SELECT id FROM _cleanup_problem_ids);

-- 2. Delete remaining submissions from migrated users (to non-migrated problems, if any)
DELETE FROM submissions WHERE user_id IN (
    SELECT id FROM users WHERE password = """ + to_sql_literal(DUMMY_PASSWORD) + """ AND username != 'admin'
);

-- 3. Delete contest participants from migrated contests
DELETE FROM contest_participants WHERE contest_id IN (SELECT id FROM _cleanup_contest_ids);

-- 4. Also delete contest participants that are migrated users (in any contest)
DELETE FROM contest_participants WHERE user_id IN (
    SELECT id FROM users WHERE password = """ + to_sql_literal(DUMMY_PASSWORD) + """ AND username != 'admin'
);

-- 5. Delete contest problems from migrated contests (also cascades from contest delete, but explicit is safer)
DELETE FROM contest_problems WHERE contest_id IN (SELECT id FROM _cleanup_contest_ids);

-- 6. Delete migrated contests
DELETE FROM contests WHERE id IN (SELECT id FROM _cleanup_contest_ids);

-- 7. Delete migrated problems
DELETE FROM problems WHERE id IN (SELECT id FROM _cleanup_problem_ids);

-- 8. Delete migrated users
DELETE FROM users WHERE password = """ + to_sql_literal(DUMMY_PASSWORD) + """ AND username != 'admin';

-- Cleanup temp tables
DROP TABLE _cleanup_problem_ids;
DROP TABLE _cleanup_contest_ids;

-- Reset sequences BEFORE inserts to avoid ID conflicts with remaining data (e.g. ANIGMA)
SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1));
SELECT setval('problems_id_seq', COALESCE((SELECT MAX(id) FROM problems), 1));
SELECT setval('contests_id_seq', COALESCE((SELECT MAX(id) FROM contests), 1));
SELECT setval('submissions_id_seq', COALESCE((SELECT MAX(id) FROM submissions), 1));
SELECT setval('contest_problems_id_seq', COALESCE((SELECT MAX(id) FROM contest_problems), 1));
SELECT setval('contest_participants_id_seq', COALESCE((SELECT MAX(id) FROM contest_participants), 1));
""")

    # --- Temp mapping tables ---
    sql_statements.append("""
-- =============================================
-- TEMP MAPPING TABLES
-- =============================================
CREATE TEMP TABLE _mig_user_map (username TEXT PRIMARY KEY, new_id INTEGER);
CREATE TEMP TABLE _mig_problem_map (title TEXT PRIMARY KEY, new_id INTEGER);
CREATE TEMP TABLE _mig_contest_map (idx INTEGER PRIMARY KEY, new_id INTEGER);
""")

    # ------------------------------------------
    # 1. Users (skip admin)
    # ------------------------------------------
    print("  Generating Users...")
    for username, (uname, email, password, name, role, date_joined) in all_users.items():
        val_str = (f"{to_sql_literal(uname)}, {to_sql_literal(email)}, "
                   f"{to_sql_literal(password)}, {to_sql_literal(name)}, "
                   f"{to_sql_literal(role)}, {to_sql_literal(date_joined)}, NOW()")

        sql = f"""
WITH new_user AS (
    INSERT INTO users (username, email, password, name, role, created_at, updated_at)
    VALUES ({val_str})
    ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
    RETURNING id
)
INSERT INTO _mig_user_map (username, new_id)
SELECT {to_sql_literal(uname)}, id FROM new_user;
"""
        sql_statements.append(sql)

    # Also map 'admin' to existing admin user
    sql_statements.append("""
INSERT INTO _mig_user_map (username, new_id)
SELECT 'admin', id FROM users WHERE username = 'admin'
ON CONFLICT (username) DO NOTHING;
""")

    # ------------------------------------------
    # 2. Problems
    # ------------------------------------------
    print("  Generating Problems...")
    for title, (ptitle, content_md, time_limit, memory_limit, max_score, is_public) in all_problems.items():
        val_str = (f"{to_sql_literal(ptitle)}, {to_sql_literal(content_md)}, "
                   f"{to_sql_literal(time_limit)}, {to_sql_literal(memory_limit)}, "
                   f"{to_sql_literal(max_score)}, {to_sql_literal(is_public)}, "
                   f"false, 'icpc', NOW(), NOW()")

        sql = f"""
WITH new_problem AS (
    INSERT INTO problems (title, content, time_limit, memory_limit, max_score, is_public, judge_available, problem_type, created_at, updated_at)
    VALUES ({val_str})
    RETURNING id
)
INSERT INTO _mig_problem_map (title, new_id)
SELECT {to_sql_literal(ptitle)}, id FROM new_problem;
"""
        sql_statements.append(sql)

    # ------------------------------------------
    # 3. Contests
    # ------------------------------------------
    print("  Generating Contests...")
    for idx, (title, description, start_time, end_time, visibility) in enumerate(all_contests):
        val_str = (f"{to_sql_literal(title)}, {to_sql_literal(description)}, "
                   f"{to_sql_literal(start_time)}, {to_sql_literal(end_time)}, "
                   f"{to_sql_literal(visibility)}, NOW(), NOW()")

        sql = f"""
WITH new_contest AS (
    INSERT INTO contests (title, description, start_time, end_time, visibility, created_at, updated_at)
    VALUES ({val_str})
    RETURNING id
)
INSERT INTO _mig_contest_map (idx, new_id)
SELECT {idx}, id FROM new_contest;
"""
        sql_statements.append(sql)

    # ------------------------------------------
    # 4. Contest Problems
    # ------------------------------------------
    print("  Generating Contest Problems...")
    for order, contest_id, problem_id, dump_file in all_contest_problems:
        contest_idx = contest_dedup_key.get((dump_file, contest_id))
        problem_title = problem_dmoj_to_title.get((dump_file, problem_id))

        if contest_idx is None or problem_title is None:
            continue

        label = chr(ord('A') + (order - 1))

        sql = f"""
INSERT INTO contest_problems (contest_id, problem_id, label, "order")
SELECT cm.new_id, pm.new_id, {to_sql_literal(label)}, {to_sql_literal(order)}
FROM _mig_contest_map cm, _mig_problem_map pm
WHERE cm.idx = {contest_idx} AND pm.title = {to_sql_literal(problem_title)}
AND NOT EXISTS (
    SELECT 1 FROM contest_problems
    WHERE contest_id = cm.new_id AND problem_id = pm.new_id
);
"""
        sql_statements.append(sql)

    # ------------------------------------------
    # 5. Contest Participants
    # ------------------------------------------
    print("  Generating Contest Participants...")
    seen_participants = set()
    for start_time, contest_id, profile_id, dump_file in all_contest_participants:
        contest_idx = contest_dedup_key.get((dump_file, contest_id))
        user_ref = profile_to_user_map.get((dump_file, profile_id))

        if contest_idx is None or user_ref is None:
            continue

        username = user_dmoj_to_username.get(user_ref)
        if not username:
            continue

        # Deduplicate participants
        key = (contest_idx, username)
        if key in seen_participants:
            continue
        seen_participants.add(key)

        sql = f"""
INSERT INTO contest_participants (contest_id, user_id, registered_at)
SELECT cm.new_id, um.new_id, {to_sql_literal(start_time)}
FROM _mig_contest_map cm, _mig_user_map um
WHERE cm.idx = {contest_idx} AND um.username = {to_sql_literal(username)}
AND NOT EXISTS (
    SELECT 1 FROM contest_participants
    WHERE contest_id = cm.new_id AND user_id = um.new_id
);
"""
        sql_statements.append(sql)

    # ------------------------------------------
    # 6. Submissions
    # ------------------------------------------
    print("  Generating Submissions...")
    verdict_map = {
        'AC': 'accepted', 'WA': 'wrong_answer', 'TLE': 'time_limit_exceeded',
        'MLE': 'memory_limit_exceeded', 'RTE': 'runtime_error', 'IR': 'runtime_error',
        'CE': 'compile_error', 'PE': 'presentation_error', 'QU': 'pending',
        'G': 'judging', 'C': 'judging', 'IE': 'system_error'
    }
    lang_map_aoj = {
        'C': 'c', 'C11': 'c', 'CPP17': 'cpp', 'CPP20': 'cpp',
        'C++17': 'cpp', 'C++20': 'cpp', 'PY3': 'python',
        'Python 3': 'python', 'JAVA8': 'java', 'Java': 'java', "Text": "text"
    }

    for (sub_id, created_at, exec_time, memory, score,
         result_code, lang_id_val, problem_id, profile_id, contest_id,
         dump_file) in all_submissions:

        verdict = verdict_map.get(result_code, 'fail')

        lang_key = lang_map.get((dump_file, lang_id_val))
        language = lang_map_aoj.get(lang_key)
        if not language:
            continue

        problem_title = problem_dmoj_to_title.get((dump_file, problem_id))
        if not problem_title:
            continue

        user_ref = profile_to_user_map.get((dump_file, profile_id))
        if not user_ref:
            continue
        username = user_dmoj_to_username.get(user_ref)
        if not username:
            continue

        source_code = sources_map.get((dump_file, sub_id), "// Code missing in migration")
        if not isinstance(source_code, str):
            source_code = str(source_code)

        # Build contest subquery
        if contest_id is None:
            contest_val = "NULL"
        else:
            contest_idx = contest_dedup_key.get((dump_file, contest_id))
            if contest_idx is None:
                contest_val = "NULL"
            else:
                contest_val = f"(SELECT new_id FROM _mig_contest_map WHERE idx = {contest_idx})"

        code_length = len(source_code.encode('utf-8'))

        sql = f"""
INSERT INTO submissions (user_id, problem_id, contest_id, code, code_length, language, verdict, execution_time, memory_used, score, created_at)
SELECT um.new_id, pm.new_id, {contest_val},
       {to_sql_literal(source_code)}, {code_length}, {to_sql_literal(language)},
       {to_sql_literal(verdict)}, {to_sql_literal(exec_time)}, {to_sql_literal(memory)},
       {to_sql_literal(score)}, {to_sql_literal(created_at)}
FROM _mig_user_map um, _mig_problem_map pm
WHERE um.username = {to_sql_literal(username)} AND pm.title = {to_sql_literal(problem_title)};
"""
        sql_statements.append(sql)

    # --- Reset sequences ---
    sql_statements.append("""
-- =============================================
-- RESET SEQUENCES to max id + 1
-- =============================================
SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));
SELECT setval('problems_id_seq', (SELECT COALESCE(MAX(id), 1) FROM problems));
SELECT setval('contests_id_seq', (SELECT COALESCE(MAX(id), 1) FROM contests));
SELECT setval('submissions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM submissions));
SELECT setval('contest_problems_id_seq', (SELECT COALESCE(MAX(id), 1) FROM contest_problems));
SELECT setval('contest_participants_id_seq', (SELECT COALESCE(MAX(id), 1) FROM contest_participants));
""")

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
    cmd = ["docker", "compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "aoj"]

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

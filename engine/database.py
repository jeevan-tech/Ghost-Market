import sqlite3
import os
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "ghost_logs.db")

def init_db():
    """Initializes the SQLite database. Safe to call on every run (idempotent)."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # ── simulations ─────────────────────────────────────────────────────────
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS simulations (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            target_url        TEXT    NOT NULL,
            num_agents        INTEGER NOT NULL,
            completed_agents  INTEGER DEFAULT 0,
            status            TEXT    DEFAULT 'running',
            start_time        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time          TIMESTAMP,
            report_summary    TEXT
        )
    ''')

    # ── agent_sessions ───────────────────────────────────────────────────────
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS agent_sessions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            simulation_id INTEGER,
            agent_id      TEXT NOT NULL,
            persona       TEXT NOT NULL,
            final_status  TEXT,
            FOREIGN KEY (simulation_id) REFERENCES simulations (id)
        )
    ''')

    # ── agent_logs (Phase 4: + page_url, scroll_depth, action_success, duration_ms)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS agent_logs (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id     INTEGER,
            step_number    INTEGER NOT NULL,
            thought_process TEXT,
            action         TEXT,
            target         TEXT,
            page_url       TEXT,
            scroll_depth   INTEGER,
            action_success INTEGER,
            duration_ms    INTEGER,
            timestamp      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES agent_sessions (id)
        )
    ''')

    # ── Safe migrations for existing databases ────────────────────────────────
    _add_col(cursor, "simulations",  "report_summary",   "TEXT")
    _add_col(cursor, "simulations",  "completed_agents", "INTEGER DEFAULT 0")
    _add_col(cursor, "simulations",  "status",           "TEXT DEFAULT 'completed'")
    _add_col(cursor, "agent_logs",   "page_url",         "TEXT")
    _add_col(cursor, "agent_logs",   "scroll_depth",     "INTEGER")
    _add_col(cursor, "agent_logs",   "action_success",   "INTEGER")
    _add_col(cursor, "agent_logs",   "duration_ms",      "INTEGER")

    conn.commit()
    conn.close()
    print(f"\033[92mDatabase initialised at {DB_PATH}\033[0m")


def _add_col(cursor, table: str, col: str, col_type: str):
    """ALTER TABLE … ADD COLUMN — silently ignored if column already exists."""
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
    except sqlite3.OperationalError:
        pass


# ── GhostLogger ───────────────────────────────────────────────────────────────
class GhostLogger:
    """Thread/coroutine-safe DB logger (each call opens/closes its own connection)."""

    def __init__(self, simulation_id: int):
        self.simulation_id = simulation_id

    def create_session(self, agent_id: str, persona: str) -> int:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO agent_sessions (simulation_id, agent_id, persona, final_status) "
                "VALUES (?, ?, ?, ?)",
                (self.simulation_id, agent_id, persona, "RUNNING")
            )
            return cur.lastrowid

    def log_step(
        self,
        session_id: int,
        step_number: int,
        thought: str,
        action: str,
        target: str,
        page_url: str = "",
        scroll_depth: Optional[int] = None,
        action_success: Optional[bool] = None,
        duration_ms: Optional[int] = None,
    ):
        with sqlite3.connect(DB_PATH) as conn:
            conn.cursor().execute(
                """INSERT INTO agent_logs
                   (session_id, step_number, thought_process, action, target,
                    page_url, scroll_depth, action_success, duration_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    session_id, step_number, thought, action, target,
                    page_url,
                    scroll_depth,
                    int(action_success) if action_success is not None else None,
                    duration_ms,
                )
            )

    def update_session_status(self, session_id: int, status: str):
        with sqlite3.connect(DB_PATH) as conn:
            conn.cursor().execute(
                "UPDATE agent_sessions SET final_status = ? WHERE id = ?",
                (status, session_id)
            )

    def increment_completed(self):
        """Atomically increments completed_agents counter for the simulation."""
        with sqlite3.connect(DB_PATH) as conn:
            conn.cursor().execute(
                "UPDATE simulations SET completed_agents = completed_agents + 1 WHERE id = ?",
                (self.simulation_id,)
            )


# ── Simulation lifecycle helpers ──────────────────────────────────────────────
def create_simulation(target_url: str, num_agents: int, status: str = 'running') -> int:
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO simulations (target_url, num_agents, status) VALUES (?, ?, ?)",
            (target_url, num_agents, status)
        )
        return cur.lastrowid


def update_simulation_status(simulation_id: int, status: str):
    """Update the status field of a simulation row."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.cursor().execute(
            "UPDATE simulations SET status = ? WHERE id = ?",
            (status, simulation_id)
        )


def end_simulation(simulation_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE simulations SET end_time = CURRENT_TIMESTAMP, status = 'completed' WHERE id = ?",
            (simulation_id,)
        )
        # Also clean up any sessions still stuck in RUNNING state
        cur.execute(
            "UPDATE agent_sessions SET final_status = 'TIMED_OUT' WHERE simulation_id = ? AND final_status = 'RUNNING'",
            (simulation_id,)
        )


def save_report(simulation_id: int, report_text: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.cursor().execute(
            "UPDATE simulations SET report_summary = ? WHERE id = ?",
            (report_text, simulation_id)
        )


def get_live_feed(simulation_id: int, since_log_id: int = 0, limit: int = 50) -> list[dict]:
    """
    Returns new agent_logs rows (joined with sessions) since the given log id cursor.
    Used by the SSE live-feed API endpoint.
    """
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT
                l.id           AS log_id,
                s.agent_id,
                s.persona,
                l.step_number,
                l.thought_process,
                l.action,
                l.target,
                l.page_url,
                l.scroll_depth,
                l.action_success,
                l.duration_ms,
                l.timestamp
            FROM agent_logs l
            JOIN agent_sessions s ON l.session_id = s.id
            WHERE s.simulation_id = ? AND l.id > ?
            ORDER BY l.id ASC
            LIMIT ?
            """,
            (simulation_id, since_log_id, limit)
        ).fetchall()
    return [dict(r) for r in rows]


if __name__ == "__main__":
    init_db()

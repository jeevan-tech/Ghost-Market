import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../engine/ghost_logs.db');

export async function getDbConnection() {
    return new Promise<sqlite3.Database>((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.error('Error connecting to SQLite database:', err.message);
                reject(err);
            } else {
                resolve(db);
            }
        });
    });
}

export async function getDbWriteConnection() {
    return new Promise<sqlite3.Database>((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error('Error connecting to SQLite database for write:', err.message);
                reject(err);
            } else {
                resolve(db);
            }
        });
    });
}

export async function run(sql: string, params: any[] = []): Promise<{ lastID: number }> {
    const db = await getDbWriteConnection();
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (this: sqlite3.RunResult, err) {
            db.close();
            if (err) reject(err);
            else resolve({ lastID: this.lastID });
        });
    });
}

export async function query(sql: string, params: any[] = []): Promise<any[]> {
    const db = await getDbConnection();
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            db.close(); // Always close after query in a stateless API
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

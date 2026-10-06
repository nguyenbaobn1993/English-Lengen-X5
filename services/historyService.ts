import { LessonRecord, WeeklyReport } from '../types';
import { appStorage } from './appStorage';

const HISTORY_KEY = 'lesson_history';
const RETENTION_DAYS = 30;

// ─── CRUD ───────────────────────────────────────────────────

export function saveLessonRecord(record: LessonRecord): void {
    const all = getLessonHistory();
    all.push(record);
    // Remove records older than 30 days
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const filtered = all.filter(r => new Date(r.date).getTime() >= cutoff);
    appStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
}

export function getLessonHistory(): LessonRecord[] {
    try {
        const raw = appStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const all: LessonRecord[] = JSON.parse(raw);
        // Auto-clean old records on read
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        return all.filter(r => new Date(r.date).getTime() >= cutoff);
    } catch {
        return [];
    }
}

export function clearHistory(): void {
    appStorage.removeItem(HISTORY_KEY);
}

// ─── Weekly Reports ─────────────────────────────────────────

function getMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday = 1
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function formatShortDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
}

export function getWeeklyReports(): WeeklyReport[] {
    const records = getLessonHistory();
    const now = new Date();
    const currentMonday = getMonday(now);

    const reports: WeeklyReport[] = [];

    for (let w = 0; w < 4; w++) {
        const weekStart = new Date(currentMonday);
        weekStart.setDate(weekStart.getDate() - w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const weekRecords = records.filter(r => {
            const rd = new Date(r.date).getTime();
            return rd >= weekStart.getTime() && rd <= weekEnd.getTime();
        });

        const lessonCount = weekRecords.length;
        const averageScore = lessonCount > 0
            ? Math.round((weekRecords.reduce((s, r) => s + r.score, 0) / lessonCount) * 10) / 10
            : 0;
        const topics = [...new Set(weekRecords.map(r => r.topic))];

        reports.push({
            weekLabel: `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`,
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            lessonCount,
            averageScore,
            topics,
            progress: 'none',
            prevAverage: null,
        });
    }

    // Calculate progress compared to previous week
    for (let i = 0; i < reports.length - 1; i++) {
        const current = reports[i];
        const prev = reports[i + 1];
        current.prevAverage = prev.averageScore;
        if (current.lessonCount === 0 || prev.lessonCount === 0) {
            current.progress = 'none';
        } else if (current.averageScore > prev.averageScore) {
            current.progress = 'up';
        } else if (current.averageScore < prev.averageScore) {
            current.progress = 'down';
        } else {
            current.progress = 'same';
        }
    }

    return reports;
}

// ─── Streak ─────────────────────────────────────────────────

export function getStreak(): number {
    const records = getLessonHistory();
    if (records.length === 0) return 0;

    const daySet = new Set<string>();
    records.forEach(r => {
        const d = new Date(r.date);
        daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 60; i++) {
        const check = new Date(today);
        check.setDate(check.getDate() - i);
        const key = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
        if (daySet.has(key)) {
            streak++;
        } else if (i === 0) {
            // Today hasn't been learned yet, still check yesterday
            continue;
        } else {
            break;
        }
    }

    return streak;
}

export function generateRecordId(): string {
    return `lesson_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

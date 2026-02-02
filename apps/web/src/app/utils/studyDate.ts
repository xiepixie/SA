/**
 * Date utilities for learning applications
 * Handles timezone-aware "study day" calculations with rollover hour support
 */

/**
 * Gets the current "study day" based on user's timezone and rollover hour
 * The study day changes at rollover_hour (e.g., 4 AM), not midnight
 * 
 * @param timezone - User's timezone (e.g., 'Asia/Shanghai')
 * @param rolloverHour - Hour when the "study day" rolls over (0-23, default 4)
 * @returns Date object representing the start of the current study day
 */
export function getStudyDayStart(timezone: string, rolloverHour: number = 4): Date {
    const now = new Date();

    // Get current time in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(now);
    const userHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const userDay = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
    const userMonth = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10);
    const userYear = parseInt(parts.find(p => p.type === 'year')?.value || '2024', 10);

    // If current hour is before rollover, we're still in "yesterday's" study day
    if (userHour < rolloverHour) {
        const yesterday = new Date(userYear, userMonth - 1, userDay - 1, rolloverHour, 0, 0);
        return yesterday;
    }

    return new Date(userYear, userMonth - 1, userDay, rolloverHour, 0, 0);
}

/**
 * Checks if a due date is overdue based on user's timezone and rollover hour
 */
export function isOverdue(dueDate: string | Date | undefined | null, timezone: string, rolloverHour: number = 4): boolean {
    if (!dueDate) return false;

    const due = new Date(dueDate);
    const studyDayStart = getStudyDayStart(timezone, rolloverHour);

    return due < studyDayStart;
}

/**
 * Checks if a due date is today based on user's timezone and rollover hour
 */
export function isDueToday(dueDate: string | Date | undefined | null, timezone: string, rolloverHour: number = 4): boolean {
    if (!dueDate) return false;

    const due = new Date(dueDate);
    const studyDayStart = getStudyDayStart(timezone, rolloverHour);
    const nextStudyDayStart = new Date(studyDayStart);
    nextStudyDayStart.setDate(nextStudyDayStart.getDate() + 1);

    return due >= studyDayStart && due < nextStudyDayStart;
}

/**
 * Gets a human-readable relative due string
 */
export function getRelativeDueString(dueDate: string | Date | undefined | null, timezone: string, rolloverHour: number = 4): string {
    if (!dueDate) return '';

    const due = new Date(dueDate);
    const studyDayStart = getStudyDayStart(timezone, rolloverHour);

    const diffMs = due.getTime() - studyDayStart.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        const overdueDays = Math.abs(diffDays);
        return overdueDays === 1 ? 'Overdue 1 day' : `Overdue ${overdueDays} days`;
    } else if (diffDays === 0) {
        return 'Due today';
    } else if (diffDays === 1) {
        return 'Due tomorrow';
    } else if (diffDays <= 7) {
        return `Due in ${diffDays} days`;
    } else {
        return `Due in ${Math.ceil(diffDays / 7)} weeks`;
    }
}

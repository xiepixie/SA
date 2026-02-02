/**
 * checkETag helper to determine if data is stale based on sequence or updated_at
 */
export function checkETag(data: any) {
    if (!data) return 'null';
    if (Array.isArray(data)) {
        if (data.length === 0) return 'empty';
        const latest = [...data].sort((a, b) => (b.seq || 0) - (a.seq || 0))[0];
        return String(latest?.seq || latest?.updated_at || Date.now());
    }
    return String(data?.seq || data?.updated_at || Date.now());
}

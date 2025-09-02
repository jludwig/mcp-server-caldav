// iCalendar-related helpers used across the codebase

export function formatCalDavDateTime(dateTime: string): string {
  // Handle both date and datetime formats
  if (dateTime.includes('T')) {
    // Full datetime - ensure it ends with Z for UTC
    return dateTime.endsWith('Z') ? dateTime : `${dateTime}Z`;
  }
  return `${dateTime}T00:00:00Z`;
}

export function parseICalDate(raw: string): Date {
  const trimmed = raw.replace(/\s*\([^)]+\)\s*$/, '');
  if (/^\d{8}T\d{6}Z?$/.test(trimmed)) {
    const z = trimmed.endsWith('Z') ? trimmed : `${trimmed}Z`;
    return new Date(
      z.replace(
        /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
        '$1-$2-$3T$4:$5:$6Z',
      ),
    );
  }
  if (/^\d{8}$/.test(trimmed)) {
    return new Date(
      trimmed.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3T00:00:00Z'),
    );
  }
  return new Date(trimmed);
}

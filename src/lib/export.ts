import { getAllSessions, getAllProfiles, getSession } from '../db/schema';

export type ExportFormat = 'json' | 'csv' | 'markdown';

export function exportSessions(profileId?: number, format: ExportFormat = 'json'): string {
  const sessions = getAllSessions(profileId);
  const profiles = getAllProfiles();
  const profileMap = new Map(profiles.map(p => [p.id, p]));


  switch (format) {
    case 'json':
      return JSON.stringify(sessions.map(s => ({
        id: s.id,
        profile: profileMap.get(Number(s.profileId))?.name,
        status: s.status,
        prompt: s.prompt,
        result: s.result,
        error: s.error,
        provider: s.provider,
        model: s.model,
        createdAt: new Date(Number(s.createdAt)).toISOString()
      })), null, 2);

    case 'csv':
      const headers = ['ID', 'Profile', 'Status', 'Prompt', 'Provider', 'Model', 'Created', 'Result'];
      const rows = sessions.map(s => [
        String(s.id),
        profileMap.get(Number(s.profileId))?.name || '',
        String(s.status),
        `"${String(s.prompt || '').replace(/"/g, '""')}"`,
        s.provider ? String(s.provider) : '',
        s.model ? String(s.model) : '',
        new Date(Number(s.createdAt)).toISOString(),
        `"${String(s.result || s.error || '').replace(/"/g, '""').substring(0, 500)}"`
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    case 'markdown':
      let md = '# Research Sessions\n\n';
      md += `| ID | Profile | Status | Provider | Created |\n`;
      md += `|----|---------|--------|----------|----------|\n`;
      
      for (const s of sessions) {
        md += `| ${s.id} | ${profileMap.get(Number(s.profileId))?.name || '-'} | ${s.status} | ${s.provider || '-'}/${s.model || '-'} | ${new Date(Number(s.createdAt)).toLocaleString()} |\n`;
      }
      
      md += '\n## Details\n\n';
      for (const s of sessions) {
        if (s.result || s.error) {
          md += `### Session ${s.id}\n`;
          md += `**Prompt:** ${String(s.prompt || '')}\n\n`;
          if (s.result) md += `**Result:** ${String(s.result).substring(0, 500)}...\n\n`;
          if (s.error) md += `**Error:** ${String(s.error)}\n\n`;
          md += '---\n\n';
        }
      }
      return md;

    default:
      return '';
  }
}

export function exportSessionReport(sessionId: number, format: ExportFormat = 'json'): string | null {
  const session = getSession(sessionId);
  if (!session) return null;

  const profiles = getAllProfiles();
  const profile = profiles.find(p => p.id === Number(session.profileId));

  const data = {
    id: session.id,
    profile: profile?.name,
    url: profile?.url,
    status: session.status,
    prompt: session.prompt,
    result: session.result,
    error: session.error,
    provider: session.provider,
    model: session.model,
    createdAt: new Date(Number(session.createdAt)).toISOString(),
    completedAt: session.updatedAt ? new Date(Number(session.updatedAt)).toISOString() : null
  };

  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'csv':
      return Object.entries(data).map(([k, v]) => `${k},"${String(v || '').replace(/"/g, '""')}"`).join('\n');
    case 'markdown':
      return `# Session Report #${session.id}\n\n` +
        `**Profile:** ${profile?.name || '-'}\n` +
        `**Status:** ${session.status}\n` +
        `**Provider:** ${session.provider || '-'}/${session.model || '-'}\n\n` +
        `## Prompt\n\n${session.prompt}\n\n` +
        (session.result ? `## Result\n\n${session.result}\n\n` : '') +
        (session.error ? `## Error\n\n${session.error}\n\n` : '');
    default:
      return null;
  }
}
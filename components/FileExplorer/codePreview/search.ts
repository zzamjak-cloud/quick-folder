export function splitHighlightedLines(html: string): string[] {
  const rawLines = html.split('\n');
  const result: string[] = [];
  let openTags: string[] = [];

  for (const line of rawLines) {
    const prefix = openTags.map(tag => tag).join('');
    const combined = prefix + line;
    const tagRegex = /<(\/?)span([^>]*)>/g;
    let match;
    const lineOpenTags = [...openTags];

    while ((match = tagRegex.exec(line)) !== null) {
      const isClose = match[1] === '/';
      if (!isClose) {
        lineOpenTags.push(`<span${match[2]}>`);
      } else if (lineOpenTags.length > 0) {
        lineOpenTags.pop();
      }
    }

    const closingSuffix = lineOpenTags.map(() => '</span>').join('');
    result.push(combined + closingSuffix);
    openTags = lineOpenTags;
  }

  return result;
}

export function wrapAllSearchMatches(html: string, query: string): string {
  if (!query) return html;
  const markStyle = 'background:#854d0e88;color:inherit;border-radius:2px;';
  const lowerQuery = query.toLowerCase();
  const qLen = query.length;

  let result = '';
  let i = 0;

  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) {
        result += html.slice(i);
        break;
      }
      result += html.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (html[i] === '&') {
      const end = html.indexOf(';', i);
      if (end !== -1 && end - i <= 10) {
        result += html.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    const slice = html.slice(i, i + qLen);
    if (
      slice.length === qLen
      && slice.toLowerCase() === lowerQuery
      && !slice.includes('<')
      && !slice.includes('&')
      && !slice.includes('>')
    ) {
      result += `<mark style="${markStyle}">${slice}</mark>`;
      i += qLen;
      continue;
    }
    result += html[i];
    i++;
  }
  return result;
}

export function wrapSearchMatches(html: string, query: string, isCurrent: boolean): string {
  if (!query) return html;

  const markStyle = isCurrent
    ? 'background:#f59e0b;color:#000;border-radius:2px;'
    : 'background:#854d0e55;color:inherit;border-radius:2px;';

  let result = '';
  let i = 0;
  const lowerHtml = html.toLowerCase();
  const lowerQuery = query.toLowerCase();

  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) {
        result += html.slice(i);
        break;
      }
      result += html.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    if (html[i] === '&') {
      const end = html.indexOf(';', i);
      if (end !== -1 && end - i <= 10) {
        result += html.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    const matchPos = lowerHtml.indexOf(lowerQuery, i);
    if (matchPos === -1) {
      result += html.slice(i);
      break;
    }

    const beforeMatch = html.slice(i, matchPos);
    if (beforeMatch.includes('<') || beforeMatch.includes('&')) {
      result += html[i];
      i++;
      continue;
    }

    result += beforeMatch;
    result += `<mark style="${markStyle}">${html.slice(matchPos, matchPos + query.length)}</mark>`;
    i = matchPos + query.length;
  }

  return result;
}

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { HelpModal } from '../../components/HelpModal';
import { installDomLocalization } from '../../utils/i18n';

function normalizedText(selector: string): string[] {
  return Array.from(document.body.querySelectorAll(selector))
    .map(element => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);
}

describe('i18n rendering snapshot', () => {
  let cleanupLocalization: (() => void) | null = null;

  afterEach(() => {
    cleanupLocalization?.();
    cleanupLocalization = null;
  });

  test('HelpModal legacy Korean copy renders as English through DOM localization', () => {
    render(<HelpModal isOpen onClose={() => {}} />);

    cleanupLocalization = installDomLocalization('en');

    expect(screen.getByLabelText('Close')).toBeInTheDocument();
    expect(
      normalizedText('h2, p, button, h3, kbd, li').slice(0, 24),
    ).toMatchInlineSnapshot(`
      [
        "Help",
        "Review QuickFolder Widget features and shortcuts at a glance.",
        "Shortcuts",
        "File Explorer",
        "Preview & Edit",
        "Image tools",
        "Media & compression",
        "Markdown",
        "Sidebar",
        "Ctrl+T",
        "Ctrl+W",
        "Ctrl+Alt+W",
        "Tab / Shift+Tab",
        "Ctrl+double-click",
        "Alt+← / Alt+→",
        "Alt+↑",
        "Alt+↓ / Enter",
        "Backspace",
        "Ctrl+Shift+G",
        "Ctrl+C",
        "Ctrl+X",
        "Ctrl+V",
        "Ctrl+Shift+V",
        "Ctrl+D",
      ]
    `);
  });
});

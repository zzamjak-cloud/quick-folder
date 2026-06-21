import { fileCommands } from './tauriCommandDomains/fileCommands.ts';
import { mediaCommands } from './tauriCommandDomains/mediaCommands.ts';
import { previewCommands } from './tauriCommandDomains/previewCommands.ts';
import { systemCommands } from './tauriCommandDomains/systemCommands.ts';

export { fileCommands, mediaCommands, previewCommands, systemCommands };
export type { ExtractZipResult } from './tauriCommandDomains/fileCommands.ts';

export const tauriCommands = {
  ...fileCommands,
  ...previewCommands,
  ...mediaCommands,
  ...systemCommands,
};

export type TauriCommands = typeof tauriCommands;

// The aisle theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in aisle.settings.json and the generated aisle.settings.ts;
// change them with `astryx experimental theme editor set aisle ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {aisleSettings} from './aisle.settings';

export const aisleTheme = defineTheme({
  extends: aisleSettings,
  name: 'aisle',
});

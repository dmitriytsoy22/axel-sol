import { actionOptions, actionResponse } from '@/lib/actions/http';
import { actionsJson } from '@/lib/actions/spec';
import { LOCALES } from '@/i18n/locales';

/** The site's Actions rules: which pages unfurl into which Blink. */
export function GET(): Response {
  return actionResponse(actionsJson(LOCALES));
}

export const OPTIONS = actionOptions;

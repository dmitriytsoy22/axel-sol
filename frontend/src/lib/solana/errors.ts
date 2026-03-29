import { getTranslations } from 'next-intl/server';

export const decodeAnchorError = async (error: any): Promise<string> => {
  const t = await getTranslations('AnchorErrors');

  if (error && error.message) {
    // Attempt to parse anchor error code
    const codeMatch = error.message.match(/0x17[a-f0-9]{2}/) || error.message.match(/6\d{3}/);
    if (codeMatch) {
      const hexCode = codeMatch[0];
      let decimalCode = hexCode;

      if (hexCode.startsWith('0x')) {
        decimalCode = parseInt(hexCode, 16).toString();
      }

      try {
        const translatedError = t(decimalCode);
        return translatedError || t('unknown');
      } catch {
        return t('unknown');
      }
    }
    return error.message;
  }

  return t('unknown');
};

export const decodeAnchorErrorClient = (error: any, t: (key: string) => string): string => {
  if (error && error.message) {
    const codeMatch = error.message.match(/0x17[a-f0-9]{2}/) || error.message.match(/6\d{3}/);
    if (codeMatch) {
      const hexCode = codeMatch[0];
      let decimalCode = hexCode;

      if (hexCode.startsWith('0x')) {
        decimalCode = parseInt(hexCode, 16).toString();
      }

      try {
        const translatedError = t(decimalCode);
        return translatedError || t('unknown');
      } catch {
        return t('unknown');
      }
    }
    return error.message; // Custom JS error fallback
  }

  return t('unknown');
};

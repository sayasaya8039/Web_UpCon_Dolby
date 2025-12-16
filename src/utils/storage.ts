import type { AudioSettings } from '@/types/audio.types';
import { DEFAULT_SETTINGS } from '@/constants/presets';

const STORAGE_KEY = 'webUpconDolby_settings';

/**
 * 設定を保存
 */
export async function saveSettings(settings: AudioSettings): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  } catch (error) {
    console.error('設定の保存に失敗:', error);
    throw error;
  }
}

/**
 * 設定を読み込み
 */
export async function loadSettings(): Promise<AudioSettings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      // 保存された設定とデフォルトをマージ（新しいフィールドに対応）
      return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] };
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('設定の読み込みに失敗:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * 設定をリセット
 */
export async function resetSettings(): Promise<AudioSettings> {
  await saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

/**
 * 設定変更を監視
 */
export function onSettingsChange(
  callback: (settings: AudioSettings) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue as AudioSettings);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

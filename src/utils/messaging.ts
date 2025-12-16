import type { ExtensionMessage, AudioSettings, AudioStatus } from '@/types/audio.types';

/**
 * メッセージを送信（タブへ）
 */
export async function sendMessageToTab(
  tabId: number,
  message: ExtensionMessage
): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('タブへのメッセージ送信に失敗:', error);
    throw error;
  }
}

/**
 * メッセージを送信（バックグラウンドへ）
 */
export async function sendMessageToBackground(
  message: ExtensionMessage
): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.error('バックグラウンドへのメッセージ送信に失敗:', error);
    throw error;
  }
}

/**
 * 現在のタブに設定を送信
 */
export async function sendSettingsToCurrentTab(
  settings: AudioSettings
): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await sendMessageToTab(tab.id, {
      type: 'SET_SETTINGS',
      payload: settings,
    });
  }
}

/**
 * 現在のタブからステータスを取得
 */
export async function getStatusFromCurrentTab(): Promise<AudioStatus | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      const response = await sendMessageToTab(tab.id, { type: 'GET_STATUS' });
      return response as AudioStatus;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 処理の有効/無効を切り替え
 */
export async function toggleProcessing(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await sendMessageToTab(tab.id, { type: 'TOGGLE_ENABLED' });
  }
}

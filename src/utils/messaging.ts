import type { ExtensionMessage, AudioSettings, AudioStatus } from '@/types/audio.types';

/**
 * コンテンツスクリプトが読み込まれていないエラーかどうか判定
 */
function isContentScriptNotLoadedError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('receiving end does not exist') ||
      message.includes('could not establish connection') ||
      message.includes('no tab with id') ||
      message.includes('cannot access')
    );
  }
  return false;
}

/**
 * メッセージを送信（タブへ）
 * コンテンツスクリプトが読み込まれていない場合はnullを返す
 */
export async function sendMessageToTab(
  tabId: number,
  message: ExtensionMessage
): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (isContentScriptNotLoadedError(error)) {
      // コンテンツスクリプトが読み込まれていない（正常なケース）
      console.log('[Messaging] コンテンツスクリプト未読み込み - ページを更新してください');
      return null;
    }
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
 * @returns 送信成功時はtrue、コンテンツスクリプト未読み込み時はfalse
 */
export async function sendSettingsToCurrentTab(
  settings: AudioSettings
): Promise<boolean> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const result = await sendMessageToTab(tab.id, {
        type: 'SET_SETTINGS',
        payload: settings,
      });
      return result !== null;
    }
    return false;
  } catch (error) {
    console.warn('[Messaging] 設定送信エラー:', error);
    return false;
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
 * @returns 送信成功時はtrue、コンテンツスクリプト未読み込み時はfalse
 */
export async function toggleProcessing(): Promise<boolean> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const result = await sendMessageToTab(tab.id, { type: 'TOGGLE_ENABLED' });
      return result !== null;
    }
    return false;
  } catch (error) {
    console.warn('[Messaging] 切り替えエラー:', error);
    return false;
  }
}

/**
 * Content Script
 * 配信サービスのMediaElementを検出してオーディオ処理パイプラインに接続
 */

import type { AudioSettings, ExtensionMessage, AudioStatus } from '@/types/audio.types';
import { DEFAULT_SETTINGS } from '@/constants/presets';
import { AudioPipeline } from '@/audio/processors/AudioPipeline';

// グローバル状態
let pipeline: AudioPipeline | null = null;
let currentSettings: AudioSettings = DEFAULT_SETTINGS;
let observedElements = new WeakSet<HTMLMediaElement>();

/**
 * MediaElementを監視してオーディオパイプラインを接続
 */
function setupMediaElement(element: HTMLMediaElement): void {
  if (observedElements.has(element)) return;
  observedElements.add(element);

  console.log('[Web UpCon Dolby] MediaElement検出:', element.tagName, element.src || '(no src)');

  // 再生開始時にパイプラインを初期化
  const handlePlay = async () => {
    try {
      if (!pipeline) {
        pipeline = new AudioPipeline();
      }
      await pipeline.connect(element);
      pipeline.updateSettings(currentSettings);
      console.log('[Web UpCon Dolby] パイプライン接続完了');
    } catch (error) {
      console.error('[Web UpCon Dolby] パイプライン接続エラー:', error);
    }
  };

  // 停止時にパイプラインを切断
  const handlePause = () => {
    // 一時停止でも接続は維持（パフォーマンスのため）
  };

  element.addEventListener('play', handlePlay);
  element.addEventListener('pause', handlePause);

  // すでに再生中なら即座に接続
  if (!element.paused) {
    handlePlay();
  }
}

/**
 * DOMを監視してMediaElementを検出
 */
function observeDOM(): void {
  // 既存のMediaElementを処理
  document.querySelectorAll('video, audio').forEach((el) => {
    setupMediaElement(el as HTMLMediaElement);
  });

  // 新規追加されるMediaElementを監視
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLMediaElement) {
          setupMediaElement(node);
        }
        if (node instanceof Element) {
          node.querySelectorAll('video, audio').forEach((el) => {
            setupMediaElement(el as HTMLMediaElement);
          });
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

/**
 * メッセージハンドラー
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'SET_SETTINGS':
        currentSettings = message.payload as AudioSettings;
        pipeline?.updateSettings(currentSettings);
        sendResponse({ success: true });
        break;

      case 'GET_SETTINGS':
        sendResponse(currentSettings);
        break;

      case 'TOGGLE_ENABLED':
        currentSettings = {
          ...currentSettings,
          enabled: !currentSettings.enabled,
        };
        pipeline?.updateSettings(currentSettings);
        sendResponse({ success: true, enabled: currentSettings.enabled });
        break;

      case 'GET_STATUS':
        const status: AudioStatus = pipeline?.getStatus() ?? {
          connected: false,
          inputSampleRate: 0,
          outputSampleRate: 0,
          latency: 0,
          cpuUsage: 0,
          gpuActive: false,
        };
        sendResponse(status);
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
    return true; // 非同期レスポンスを許可
  }
);

/**
 * 初期化時に設定を読み込み
 */
async function init(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response) {
      currentSettings = response as AudioSettings;
    }
  } catch (error) {
    console.log('[Web UpCon Dolby] 設定読み込みスキップ（初回起動）');
  }

  // DOM監視を開始
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeDOM);
  } else {
    observeDOM();
  }

  console.log('[Web UpCon Dolby] Content Script 初期化完了');
}

init();

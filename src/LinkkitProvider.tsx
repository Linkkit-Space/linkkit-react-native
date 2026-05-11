import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import { PlayInstallReferrer } from 'react-native-play-install-referrer';
import { LinkkitContext } from './LinkkitContext';
import type {
  ConversionPayload,
  OpenPayload,
  OpenResponse,
  LinkkitConfig,
  TrackLeadParams,
  TrackSaleParams,
} from './types';

const STORAGE_KEY = '@linkkit/click_id';
const STORAGE_TS_KEY = '@linkkit/click_id_ts';
const DEFAULT_BASE_URL = 'https://api.linkkit.io';
const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 90;
const LKCLID_PARAM = 'lkclid';

interface LinkkitProviderProps extends LinkkitConfig {
  children: React.ReactNode;
}

function extractClickId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get(LKCLID_PARAM);
  } catch {
    // URL constructor not available in all RN environments — fall back to regex
    const match = url.match(/[?&]lkclid=([^&#]+)/);
    return match ? decodeURIComponent(match[1]!) : null;
  }
}

// Android: reads the Play Store install referrer for a deferred lkclid.
// The referrer is a URL-encoded query string ("utm_source=linkkit&lkclid=abc123")
// or occasionally a full URL — we try both forms.
async function getAndroidDeferredClickId(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    PlayInstallReferrer.getInstallReferrerInfo(
      (info: { installReferrer?: string }, error: unknown) => {
        if (error || !info?.installReferrer) {
          resolve(null);
          return;
        }
        const referrer = info.installReferrer;
        const id =
          extractClickId(referrer) ??
          extractClickId(`https://x.com?${referrer}`);
        resolve(id ?? null);
      },
    );
  });
}

// iOS: reads the clipboard for a URL containing lkclid.
// The Linkkit link page copies the destination URL to the clipboard before
// redirecting to the App Store, so it's available on first launch.
// iOS 16+ shows a system banner ("App pasted from ...") — no blocking prompt.
async function getIOSDeferredClickId(): Promise<string | null> {
  const text = await Clipboard.getString();
  if (!text) return null;
  return extractClickId(text);
}

async function getDeferredClickId(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') return await getAndroidDeferredClickId();
    if (Platform.OS === 'ios') return await getIOSDeferredClickId();
  } catch {
    return null;
  }
  return null;
}

export function LinkkitProvider({
  children,
  publishableKey,
  baseUrl = DEFAULT_BASE_URL,
  attributionWindow = DEFAULT_ATTRIBUTION_WINDOW_DAYS,
}: LinkkitProviderProps) {
  const [clickId, setClickId] = useState<string | null>(null);
  const [destinationUrl, setDestinationUrl] = useState<string | null>(null);
  const baseUrlRef = useRef(baseUrl);
  const publishableKeyRef = useRef(publishableKey);
  const attributionWindowRef = useRef(attributionWindow);
  const clickTimestampRef = useRef<number | null>(null);
  baseUrlRef.current = baseUrl;
  publishableKeyRef.current = publishableKey;
  attributionWindowRef.current = attributionWindow;

  const isExpired = useCallback((timestampMs: number): boolean => {
    const windowMs = attributionWindowRef.current * 24 * 60 * 60 * 1000;
    return Date.now() - timestampMs > windowMs;
  }, []);

  const persistClickId = useCallback(async (id: string, isNew = false) => {
    const now = Date.now();
    clickTimestampRef.current = now;
    setClickId(id);
    await AsyncStorage.multiSet([[STORAGE_KEY, id], [STORAGE_TS_KEY, now.toString()]]);
    if (isNew) {
      const res = await fetch(`${baseUrlRef.current}/track/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishable_key: publishableKeyRef.current, lkclid: id } satisfies OpenPayload),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Linkkit: trackOpen failed (${res.status}) — ${body}`);
      }
      const data: OpenResponse = await res.json();
      if (data.url) setDestinationUrl(data.url);
      return data.url ?? null;
    }
    return null;
  }, []);

  const handleUrl = useCallback(
    ({ url }: { url: string }) => {
      const id = extractClickId(url);
      if (id) persistClickId(id, true);
    },
    [persistClickId],
  );

  useEffect(() => {
    // Restore persisted click ID on mount; if none, attempt deferred attribution
    AsyncStorage.multiGet([STORAGE_KEY, STORAGE_TS_KEY]).then(async ([[, stored], [, ts]]) => {
      if (stored) {
        const expired = ts ? isExpired(Number(ts)) : false;
        if (expired) {
          await AsyncStorage.multiRemove([STORAGE_KEY, STORAGE_TS_KEY]);
        } else {
          clickTimestampRef.current = ts ? Number(ts) : Date.now();
          setClickId(stored);
        }
        return;
      }
      // No stored click ID — check Play Store install referrer (Android only)
      const deferred = await getDeferredClickId();
      if (deferred) {
        persistClickId(deferred, true);
        return;
      }
    });

    // Handle cold-start deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    // Handle warm deep links
    const subscription = Linking.addEventListener('url', handleUrl);

    // Re-check when app comes to foreground (handles some universal link edge cases)
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Linking.getInitialURL().then((url) => {
          if (url) handleUrl({ url });
        });
      }
    });

    return () => {
      subscription.remove();
      appStateSub.remove();
    };
  }, [handleUrl]);

  const postConversion = useCallback(
    async (type: 'lead' | 'sale', payload: Omit<ConversionPayload, 'publishable_key'>) => {
      const res = await fetch(`${baseUrlRef.current}/track/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishable_key: publishableKeyRef.current, ...payload }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Linkkit: conversion failed (${res.status}) — ${body}`);
      }
    },
    [],
  );

  const trackOpen = useCallback(async (): Promise<{ url: string | null }> => {
    if (!clickId) return { url: null };
    const res = await fetch(`${baseUrlRef.current}/track/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishable_key: publishableKeyRef.current, lkclid: clickId } satisfies OpenPayload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Linkkit: trackOpen failed (${res.status}) — ${body}`);
    }
    const data: OpenResponse = await res.json();
    if (data.url) setDestinationUrl(data.url);
    return { url: data.url ?? null };
  }, [clickId]);

  const clearClickId = useCallback(async () => {
    clickTimestampRef.current = null;
    setClickId(null);
    setDestinationUrl(null);
    await AsyncStorage.multiRemove([STORAGE_KEY, STORAGE_TS_KEY]);
  }, []);

  const trackLead = useCallback(
    async (params: TrackLeadParams) => {
      if (!clickId) throw new Error('Linkkit: trackLead called before a click ID was captured. Ensure a deep link with lkclid was opened first.');
      if (clickTimestampRef.current !== null && isExpired(clickTimestampRef.current)) {
        await clearClickId();
        throw new Error(`Linkkit: trackLead called after the ${attributionWindowRef.current}-day attribution window expired.`);
      }
      await postConversion('lead', {
        lkclid: clickId,
        event_name: params.eventName,
        customer_external_id: params.customerId,
        customer_email: params.customerEmail,
        customer_name: params.customerName,
        customer_avatar: params.customerAvatar,
        metadata: params.metadata,
      });
      await clearClickId();
    },
    [clickId, postConversion, clearClickId, isExpired],
  );

  const trackSale = useCallback(
    async (params: TrackSaleParams) => {
      if (!clickId) throw new Error('Linkkit: trackSale called before a click ID was captured. Ensure a deep link with lkclid was opened first.');
      if (clickTimestampRef.current !== null && isExpired(clickTimestampRef.current)) {
        await clearClickId();
        throw new Error(`Linkkit: trackSale called after the ${attributionWindowRef.current}-day attribution window expired.`);
      }
      await postConversion('sale', {
        lkclid: clickId,
        amount: params.amount,
        currency: params.currency,
        customer_external_id: params.customerId,
        customer_email: params.customerEmail,
        customer_name: params.customerName,
        customer_avatar: params.customerAvatar,
        payment_processor: params.paymentProcessor,
        invoice_id: params.invoiceId,
        metadata: params.metadata,
      });
    },
    [clickId, postConversion, clearClickId, isExpired],
  );

  return (
    <LinkkitContext.Provider value={{ clickId, destinationUrl, trackOpen, trackLead, trackSale }}>
      {children}
    </LinkkitContext.Provider>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import { PlayInstallReferrer } from 'react-native-play-install-referrer';
import { LinkkitContext } from './LinkkitContext';
import type {
  ConversionPayload,
  LinkkitConfig,
  TrackLeadParams,
  TrackSaleParams,
} from './types';

const STORAGE_KEY = '@linkkit/click_id';
const DEFAULT_BASE_URL = 'https://api.linkkit.io';
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
}: LinkkitProviderProps) {
  const [clickId, setClickId] = useState<string | null>(null);
  const baseUrlRef = useRef(baseUrl);
  const publishableKeyRef = useRef(publishableKey);
  baseUrlRef.current = baseUrl;
  publishableKeyRef.current = publishableKey;

  const persistClickId = useCallback(async (id: string) => {
    setClickId(id);
    await AsyncStorage.setItem(STORAGE_KEY, id);
  }, []);

  const handleUrl = useCallback(
    ({ url }: { url: string }) => {
      const id = extractClickId(url);
      if (id) persistClickId(id);
    },
    [persistClickId],
  );

  useEffect(() => {
    // Restore persisted click ID on mount; if none, attempt deferred attribution
    AsyncStorage.getItem(STORAGE_KEY).then(async (stored) => {
      if (stored) {
        setClickId(stored);
        return;
      }
      // No stored click ID — check Play Store install referrer (Android only)
      const deferred = await getDeferredClickId();
      if (deferred) {
        persistClickId(deferred);
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
    async (payload: ConversionPayload) => {
      const res = await fetch(`${baseUrlRef.current}/conversions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Publishable-Key': publishableKeyRef.current,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Linkkit: conversion failed (${res.status}) — ${body}`);
      }
    },
    [],
  );

  const trackLead = useCallback(
    async (params: TrackLeadParams) => {
      if (!clickId) return;
      await postConversion({
        lkclid: clickId,
        type: 'lead',
        event_name: params.eventName,
        customer_external_id: params.customerId,
        customer_email: params.customerEmail,
        customer_name: params.customerName,
        metadata: params.metadata,
      });
    },
    [clickId, postConversion],
  );

  const trackSale = useCallback(
    async (params: TrackSaleParams) => {
      if (!clickId) return;
      await postConversion({
        lkclid: clickId,
        type: 'sale',
        event_name: params.eventName,
        amount: params.amount,
        currency: params.currency,
        customer_external_id: params.customerId,
        customer_email: params.customerEmail,
        customer_name: params.customerName,
        payment_processor: params.paymentProcessor,
        invoice_id: params.invoiceId,
        metadata: params.metadata,
      });
    },
    [clickId, postConversion],
  );

  return (
    <LinkkitContext.Provider value={{ clickId, trackLead, trackSale }}>
      {children}
    </LinkkitContext.Provider>
  );
}

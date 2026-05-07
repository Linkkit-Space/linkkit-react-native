# @linkkit/react-native

React Native SDK for [Linkkit](https://linkkit.io) — deep link attribution and conversion tracking.

## How it works

When a user clicks a Linkkit short link, a `lkclid` parameter is appended to the destination URL. The SDK captures this parameter when the app opens (cold start, universal link, or URL scheme), persists it to `AsyncStorage`, and automatically attaches it whenever you call `trackLead` or `trackSale`.

## Installation

```sh
npm install @linkkit/react-native @react-native-async-storage/async-storage
# or
yarn add @linkkit/react-native @react-native-async-storage/async-storage
```

Follow the [AsyncStorage setup guide](https://react-native-async-storage.github.io/async-storage/docs/install) for iOS/Android native linking.

## Setup

Wrap your app with `LinkkitProvider`:

```tsx
import { LinkkitProvider } from '@linkkit/react-native';

export default function App() {
  return (
    <LinkkitProvider apiKey="lk_live_...">
      <YourApp />
    </LinkkitProvider>
  );
}
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `apiKey` | `string` | Yes | Your Linkkit API key (Settings → API Keys) |
| `baseUrl` | `string` | No | Override API base URL (default: `https://api.linkkit.io`) |

## Usage

```tsx
import { useLinkkit } from '@linkkit/react-native';

function CheckoutScreen() {
  const { trackLead, trackSale } = useLinkkit();

  const handleSignup = async () => {
    await trackLead({
      customerId: user.id,          // required
      customerEmail: user.email,
      customerName: user.name,
      eventName: 'Signup',          // optional label shown in dashboard
    });
  };

  const handlePurchase = async (order) => {
    await trackSale({
      customerId: user.id,          // required
      amount: order.totalCents,     // required, in cents
      currency: 'USD',
      customerEmail: user.email,
      invoiceId: order.id,
      eventName: 'Purchase',
    });
  };
}
```

If no `lkclid` is present (user didn't come through a Linkkit link), both functions are no-ops.

## API

### `useLinkkit()`

Returns:

| Property | Type | Description |
|----------|------|-------------|
| `clickId` | `string \| null` | The captured `lkclid` value, or `null` |
| `trackLead` | `(params) => Promise<void>` | Record a lead conversion |
| `trackSale` | `(params) => Promise<void>` | Record a sale conversion |

### `trackLead(params)`

| Param | Type | Required |
|-------|------|----------|
| `customerId` | `string` | Yes — your internal user/customer ID |
| `eventName` | `string` | No — label shown in dashboard (default: `"Lead"`) |
| `customerEmail` | `string` | No |
| `customerName` | `string` | No |
| `metadata` | `Record<string, unknown>` | No |

### `trackSale(params)`

| Param | Type | Required |
|-------|------|----------|
| `customerId` | `string` | Yes — your internal user/customer ID |
| `amount` | `number` | Yes — in cents (e.g. `$9.99` → `999`) |
| `eventName` | `string` | No — label shown in dashboard (default: `"Sale"`) |
| `currency` | `string` | No — ISO 4217, default `usd` |
| `customerEmail` | `string` | No |
| `customerName` | `string` | No |
| `paymentProcessor` | `string` | No — e.g. `"stripe"` |
| `invoiceId` | `string` | No |
| `metadata` | `Record<string, unknown>` | No |

## Deep link configuration

For attribution to work, your Linkkit short links must deep link into your app. Configure either:

- **Universal Links** (iOS) / **App Links** (Android) — point your custom domain at your app
- **URL schemes** — add `lkclid` passthrough in your scheme handler

Linkkit automatically appends `?lkclid=...` to destination URLs so the SDK can capture it on open.

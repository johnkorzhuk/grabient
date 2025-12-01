# Polar Integration Setup

*Payment & Subscription Guide*

Integrate Polar for subscription management and payment processing with TanStack Start

## Overview

[Polar](https://polar.sh) is a modern subscription platform designed for developers and creators. This integration provides a complete subscription management system using Polar's API without requiring webhooks or external database tables for payment tracking.

The setup includes:

- **Product Management** - Create and manage subscription products through Polar dashboard
- **Checkout Flow** - Generate secure payment links for subscription purchases
- **Subscription Tracking** - Monitor subscription status through Polar's API
- **Feature Management** - Control features based on product metadata
- **Pure API Integration** - No webhooks or external payment tables required

> **API Documentation:** Complete API reference available at [polar.sh/docs/api-reference/introduction](https://polar.sh/docs/api-reference/introduction)

---

## Step 1: Polar API Setup

Before integrating Polar into your application, you'll need to set up your Polar account and obtain the necessary API credentials.

### 1. Create Polar Account

1. Visit [polar.sh](https://polar.sh) and create an account
2. Navigate to your organization settings
3. Generate an API access token under "API Keys"

### 2. Configure Environment Variables

```bash
# .env
POLAR_SECRET="your-polar-api-access-token"
```

> **Sandbox vs Production:** Use Polar's sandbox environment for development and testing. Switch to production server for live applications.

---

## Step 2: Middleware Configuration

Create Polar middleware to initialize the Polar SDK instance and make it available throughout your server functions.

```typescript
// src/core/middleware/polar.ts
import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export const polarMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const polar = new Polar({
    accessToken: env.POLAR_SECRET,
    server: "sandbox", // Change to "production" for live environment
  });

  return next({
    context: {
      polar,
    },
  });
});
```

### Middleware Benefits

- **Centralized Configuration** - Single place to configure Polar SDK settings
- **Type Safety** - Polar instance available in server function context with full TypeScript support
- **Request Scoped** - Fresh Polar instance for each request ensuring isolation
- **Environment Handling** - Automatic environment variable access through Cloudflare Workers

---

## Step 3: Server Functions Implementation

Create server functions to handle product management, checkout creation, and subscription tracking.

```typescript
// src/core/functions/payments.ts
import { createServerFn } from "@tanstack/react-start";
import { protectedFunctionMiddleware } from "@/core/middleware/auth";
import { polarMiddleware } from "@/core/middleware/polar";
import z from "zod";
import { getRequestIP } from "@tanstack/react-start/server";

export const baseFunction = createServerFn().middleware([
  protectedFunctionMiddleware,
  polarMiddleware,
]);

export const getProducts = baseFunction.handler(async (ctx) => {
  const products = await ctx.context.polar.products.list({
    isArchived: false,
  });

  return products.result.items;
});

const PaymentLink = z.object({
  productId: z.string(),
});

export const createPaymentLink = baseFunction
  .inputValidator((data: z.infer<typeof PaymentLink>) => {
    return PaymentLink.parse(data);
  })
  .handler(async (ctx) => {
    const ip = getRequestIP();
    const checkout = await ctx.context.polar.checkouts.create({
      products: [ctx.data.productId],
      externalCustomerId: ctx.context.userId,
      successUrl: `http://localhost:3000/app/polar/checkout/success?checkout_id={CHECKOUT_ID}`,
      customerIpAddress: ip,
      customerEmail: ctx.context.email,
    });
    return checkout;
  });

export const validPayment = baseFunction
  .inputValidator((data: string) => {
    if (typeof data !== "string") {
      throw new Error("Invalid data type");
    }
    return data;
  })
  .handler(async (ctx) => {
    const payment = await ctx.context.polar.checkouts.get({
      id: ctx.data,
    });

    if (payment.status === "succeeded") {
      return true;
    }
    return false;
  });

export const collectSubscription = baseFunction.handler(async (ctx) => {
  const subscriptions = await ctx.context.polar.subscriptions.list({
    externalCustomerId: ctx.context.userId,
  });

  if (subscriptions.result.items.length === 0) {
    return null;
  }

  const subscription = subscriptions.result.items[0];
  return subscription;
});
```

### Function Breakdown

**`getProducts`**
- Fetches all active (non-archived) products from Polar
- Used to display available subscription plans

**`createPaymentLink`**
- Creates a secure checkout session for a specific product
- Links checkout to authenticated user via `externalCustomerId`
- Includes customer IP for automatic country selection

**`validPayment`**
- Validates a completed checkout by checking its status
- Returns boolean indicating if payment was successful

**`collectSubscription`**
- Retrieves active subscription for current user
- Returns null if no subscription exists

---

## Step 4: Product Configuration

Configure your subscription products in the Polar dashboard with metadata to control application features.

### Product Metadata Setup

![Polar Product Metadata](/polar-product-metadata.png)

Products support custom metadata that can be used to control feature access in your application:

```json
{
  "features": {
    "analytics": true,
    "api_access": true,
    "priority_support": true,
    "custom_branding": false
  },
  "limits": {
    "projects": 10,
    "storage_gb": 100,
    "api_calls_per_month": 10000
  }
}
```

### Benefits of Metadata-Driven Features

- **Dynamic Feature Control** - Enable/disable features based on subscription tier
- **No Database Required** - Feature configuration stored in Polar, not your database
- **Real-time Updates** - Changes to product metadata apply immediately
- **Flexible Pricing** - Easy to create different tiers with varying feature sets

---

## Step 5: Client-Side Integration

Create React components to handle the subscription flow and display products.

### Product Display Component

```typescript
// src/components/payments/polar/product-list.tsx
import { getProducts } from "@/core/functions/payments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProductList() {
  const products = await getProducts();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <Card key={product.id}>
          <CardHeader>
            <CardTitle>{product.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {product.description}
            </p>
            <div className="text-2xl font-bold mb-4">
              ${product.prices[0]?.priceAmount / 100}/mo
            </div>
            <SubscribeButton productId={product.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### Subscription Button Component

```typescript
// src/components/payments/polar/subscribe-button.tsx
import { createPaymentLink } from "@/core/functions/payments";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SubscribeButtonProps {
  productId: string;
}

export function SubscribeButton({ productId }: SubscribeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const checkout = await createPaymentLink({ productId });
      window.location.href = checkout.url;
    } catch (error) {
      console.error("Failed to create payment link:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSubscribe}
      disabled={isLoading}
      className="w-full"
    >
      {isLoading ? "Creating checkout..." : "Subscribe"}
    </Button>
  );
}
```

### Feature Access Hook

```typescript
// src/hooks/use-subscription-features.ts
import { collectSubscription } from "@/core/functions/payments";
import { useMemo } from "react";

export function useSubscriptionFeatures() {
  const subscription = await collectSubscription();

  const features = useMemo(() => {
    if (!subscription || !subscription.product.metadata) {
      return {};
    }

    const metadata = JSON.parse(subscription.product.metadata);
    return metadata.features || {};
  }, [subscription]);

  const hasFeature = (featureName: string) => {
    return features[featureName] === true;
  };

  return {
    subscription,
    features,
    hasFeature,
    isSubscribed: !!subscription,
  };
}
```

---

## Step 6: Checkout Success Handler

Create a success page to handle completed payments and validate the checkout.

```typescript
// src/routes/app/polar/checkout/success.tsx
import { createFileRoute } from "@tanstack/react-router";
import { validPayment } from "@/core/functions/payments";
import { CheckCircle } from "lucide-react";

export const Route = createFileRoute("/app/polar/checkout/success")({
  component: CheckoutSuccess,
  validateSearch: (search) => ({
    checkout_id: (search as any).checkout_id as string,
  }),
});

function CheckoutSuccess() {
  const { checkout_id } = Route.useSearch();
  const isValid = await validPayment(checkout_id);

  if (!isValid) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">
            Payment Verification Failed
          </h1>
          <p className="text-muted-foreground">
            Please contact support if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-green-600">
          Subscription Activated!
        </h1>
        <p className="text-muted-foreground mt-2">
          Your subscription has been successfully activated.
        </p>
      </div>
    </div>
  );
}
```

---

## Architecture Benefits

### Pure API Integration

This setup uses Polar's API exclusively without requiring:

- **No Webhooks** - Direct API calls for real-time subscription status
- **No Payment Tables** - Subscription data managed entirely by Polar
- **No Complex State Management** - Subscription status fetched on-demand

### Simplified Feature Management

- **Metadata-Driven** - Features controlled through product metadata in Polar dashboard
- **Real-time Updates** - Feature changes apply immediately without code deployments
- **Flexible Tiers** - Easy to create and modify subscription tiers

### Security & Reliability

- **Server-Side Processing** - All payment operations handled on server
- **IP Tracking** - Customer IP captured for fraud prevention
- **Type Safety** - Full TypeScript support throughout the integration

---

**Polar Integration Complete!** Your application now has a fully functional subscription system with Polar handling payments, subscription management, and feature access control through a clean API-only integration.

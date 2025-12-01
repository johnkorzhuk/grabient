import { getProducts, collectSubscription } from "@/core/functions/payments";

export type Products = Awaited<ReturnType<typeof getProducts>>;
export type Product = Products[number];
export type Price = Product["prices"][number];
export type Subscription = Awaited<ReturnType<typeof collectSubscription>>;

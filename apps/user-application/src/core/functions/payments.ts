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
        console.log("validatePayment", data);
        if (typeof data !== "string") {
            throw new Error("Invalid data type");
        }
        return data;
    })
    .handler(async (ctx) => {
        const payment = await ctx.context.polar.checkouts.get({
            id: ctx.data,
        });
        console.log(payment);
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

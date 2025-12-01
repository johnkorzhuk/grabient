import { useMutation } from "@tanstack/react-query";
import { createPaymentLink } from "@/core/functions/payments";

export function useCheckout() {
    const checkoutMutation = useMutation({
        mutationFn: async (productId: string) => {
            return await createPaymentLink({
                data: {
                    productId,
                },
            });
        },
    });

    const redirectToCheckout = (productId: string) => {
        checkoutMutation.mutate(productId, {
            onSuccess(data) {
                window.location.href = data.url;
            },
        });
    };

    return {
        redirectToCheckout,
        isCheckoutPending: checkoutMutation.isPending,
    };
}

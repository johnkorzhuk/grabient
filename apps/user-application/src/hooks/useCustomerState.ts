import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useCustomerState() {
    return useQuery({
        queryKey: ["customer-state"],
        queryFn: async () => {
            const { data } = await authClient.customer.state();
            return data;
        },
        staleTime: 30000,
    });
}

export function useHasActiveSubscription() {
    const { data: state, isLoading, error } = useCustomerState();

    const hasSubscription = (state?.activeSubscriptions?.length ?? 0) > 0;
    const subscription = state?.activeSubscriptions?.[0];

    return {
        hasSubscription,
        subscription,
        isLoading,
        error,
    };
}

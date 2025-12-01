import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function getContext() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                gcTime: 1000 * 60 * 30, // 30 minutes - keeps data in cache longer
            },
        },
    });
    return {
        queryClient,
    };
}

export function Provider({
    children,
    queryClient,
}: {
    children: React.ReactNode;
    queryClient: QueryClient;
}) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateUsername } from "@/server-functions/auth";
import { useRouter } from "@tanstack/react-router";

interface UpdateUsernameArgs {
    username: string;
}

export function useUpdateUsernameMutation() {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: async (args: UpdateUsernameArgs) => {
            return await updateUsername({
                data: args,
            });
        },
        onSuccess: async () => {
            await Promise.all([
                router.invalidate(),
                queryClient.invalidateQueries({ queryKey: ["session"] }),
            ]);
        },
    });
}

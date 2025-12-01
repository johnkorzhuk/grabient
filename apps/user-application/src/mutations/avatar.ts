import { useMutation } from "@tanstack/react-query";
import { generateAvatarUploadUrl, confirmAvatarUpload } from "@/server-functions/avatar";

interface GenerateUploadUrlArgs {
    contentType: string;
}

interface ConfirmUploadArgs {
    imageUrl: string;
}

export function useGenerateAvatarUploadUrl() {
    return useMutation({
        mutationFn: async (args: GenerateUploadUrlArgs) => {
            return await generateAvatarUploadUrl({
                data: args,
            });
        },
    });
}

export function useConfirmAvatarUpload() {
    return useMutation({
        mutationFn: async (args: ConfirmUploadArgs) => {
            return await confirmAvatarUpload({
                data: args,
            });
        },
    });
}

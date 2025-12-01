import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import imageCompression from "browser-image-compression";
import {
    useGenerateAvatarUploadUrl,
    useConfirmAvatarUpload,
} from "@/mutations/avatar";
import { cn } from "@/lib/utils";

interface AvatarUploadProps {
    onPreviewChange?: (url: string | null) => void;
    onUploadSuccess?: () => void;
}

export interface AvatarUploadHandle {
    uploadIfChanged: () => Promise<boolean>;
    hasChanges: boolean;
}

export const AvatarUpload = forwardRef<AvatarUploadHandle, AvatarUploadProps>(
    ({ onPreviewChange, onUploadSuccess }, ref) => {
        const [selectedFile, setSelectedFile] = useState<File | null>(null);
        const [_previewUrl, setPreviewUrl] = useState<string | null>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);

        const generateUploadUrl = useGenerateAvatarUploadUrl();
        const confirmUpload = useConfirmAvatarUpload();

        const isUploading =
            generateUploadUrl.isPending || confirmUpload.isPending;

        useImperativeHandle(ref, () => ({
            uploadIfChanged: async () => {
                if (!selectedFile) return false;
                await handleUpload(selectedFile);
                return true;
            },
            hasChanges: !!selectedFile,
        }));

        async function processImage(file: File): Promise<File> {
            const options = {
                maxSizeMB: 0.1,
                maxWidthOrHeight: 256,
                useWebWorker: true,
                fileType: "image/webp" as const,
            };

            const compressedFile = await imageCompression(file, options);

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Failed to get canvas context");

            const img =
                await imageCompression.getDataUrlFromFile(compressedFile);
            const image = new Image();

            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = img;
            });

            const size = 256;
            canvas.width = size;
            canvas.height = size;

            const sourceSize = Math.min(image.width, image.height);
            const sourceX = (image.width - sourceSize) / 2;
            const sourceY = (image.height - sourceSize) / 2;

            ctx.drawImage(
                image,
                sourceX,
                sourceY,
                sourceSize,
                sourceSize,
                0,
                0,
                size,
                size,
            );

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    (blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error("Failed to create blob"));
                    },
                    "image/webp",
                    0.9,
                );
            });

            return new File([blob], "avatar.webp", { type: "image/webp" });
        }

        async function handleFileSelect(
            event: React.ChangeEvent<HTMLInputElement>,
        ) {
            const file = event.target.files?.[0];
            if (!file) return;

            if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
                alert("Please select a valid image file (JPEG, PNG, or WebP)");
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                alert("File size must be less than 5MB");
                return;
            }

            try {
                const processedFile = await processImage(file);
                setSelectedFile(processedFile);

                const reader = new FileReader();
                reader.onloadend = () => {
                    const preview = reader.result as string;
                    setPreviewUrl(preview);
                    onPreviewChange?.(preview);
                };
                reader.readAsDataURL(processedFile);
            } catch (error) {
                console.error("Error processing image:", error);
                alert("Failed to process image. Please try again.");
            }
        }

        async function handleUpload(file: File) {
            const { uploadUrl, publicUrl } =
                await generateUploadUrl.mutateAsync({
                    contentType: "image/webp",
                });

            const uploadResponse = await fetch(uploadUrl, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": "image/webp",
                },
            });

            if (!uploadResponse.ok) {
                throw new Error("Upload failed");
            }

            await confirmUpload.mutateAsync({ imageUrl: publicUrl });

            setSelectedFile(null);
            setPreviewUrl(null);
            onPreviewChange?.(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }

            onUploadSuccess?.();
        }

        function handleCancel() {
            setPreviewUrl(null);
            setSelectedFile(null);
            onPreviewChange?.(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }

        return (
            <div className="space-y-2">
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="avatar-upload"
                        disabled={isUploading}
                    />
                    <button
                        type="button"
                        disabled={isUploading}
                        className={cn(
                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                            "text-sm h-8.5 px-3 border border-solid bg-background",
                            "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                            "text-muted-foreground hover:text-foreground",
                            "transition-colors duration-200 cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            isUploading && "opacity-50 cursor-not-allowed",
                        )}
                        onClick={
                            selectedFile
                                ? handleCancel
                                : () => fileInputRef.current?.click()
                        }
                    >
                        {selectedFile ? "Cancel" : "Change avatar"}
                    </button>
                    <p className="text-xs text-muted-foreground font-system mt-2">
                        JPG, PNG or WebP. Max 5MB.
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                        256x256
                    </p>
                </div>
            </div>
        );
    },
);

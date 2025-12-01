import { AwsClient } from "aws4fetch";

export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
}

export interface PresignedUrlResult {
    uploadUrl: string;
    publicUrl: string;
    key: string;
    expiresAt: number;
}

export function createR2Client(config: R2Config) {
    const client = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
    });

    const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;

    return {
        async generatePresignedUploadUrl(
            key: string,
            contentType: string,
            expiresIn = 3600,
        ): Promise<string> {
            const url = new URL(
                `${endpoint}/${config.bucketName}/${key}`,
            );

            url.searchParams.set('X-Amz-Expires', expiresIn.toString());

            const signedRequest = await client.sign(url.toString(), {
                method: "PUT",
                headers: {
                    "Content-Type": contentType,
                },
                aws: {
                    signQuery: true,
                },
            });

            return signedRequest.url;
        },

        async getFileMetadata(key: string): Promise<{ size: number; contentType: string } | null> {
            const url = `${endpoint}/${config.bucketName}/${key}`;

            const signedRequest = await client.sign(url, {
                method: "HEAD",
            });

            const response = await fetch(signedRequest.url, {
                method: "HEAD",
                headers: signedRequest.headers,
            });

            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`Failed to get file metadata: ${response.statusText}`);
            }

            const size = parseInt(response.headers.get("content-length") || "0", 10);
            const contentType = response.headers.get("content-type") || "";

            return { size, contentType };
        },

        async validateImageFile(key: string): Promise<{ valid: boolean; actualType?: string }> {
            const url = `${endpoint}/${config.bucketName}/${key}`;

            const signedRequest = await client.sign(url, {
                method: "GET",
            });

            const rangeHeaders = new Headers(signedRequest.headers as HeadersInit);
            rangeHeaders.set("Range", "bytes=0-11");

            const response = await fetch(signedRequest.url, {
                method: "GET",
                headers: rangeHeaders,
            });

            if (!response.ok) {
                return { valid: false };
            }

            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
                return { valid: true, actualType: "image/jpeg" };
            }

            if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
                return { valid: true, actualType: "image/png" };
            }

            if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
                return { valid: true, actualType: "image/webp" };
            }

            return { valid: false };
        },

        async deleteFile(key: string): Promise<void> {
            const url = `${endpoint}/${config.bucketName}/${key}`;

            const signedRequest = await client.sign(url, {
                method: "DELETE",
            });

            const response = await fetch(signedRequest.url, {
                method: "DELETE",
                headers: signedRequest.headers,
            });

            if (!response.ok && response.status !== 404) {
                throw new Error(`Failed to delete file: ${response.statusText}`);
            }
        },

        getPublicUrl(key: string, publicBaseUrl: string): string {
            return `${publicBaseUrl}/${key}`;
        },
    };
}

export function generateAvatarKey(userId: string): string {
    const timestamp = Date.now();
    return `avatars/${userId}/${timestamp}.webp`;
}

export function extractKeyFromUrl(url: string, publicBaseUrl: string): string | null {
    if (!url.startsWith(publicBaseUrl)) {
        return null;
    }
    return url.replace(`${publicBaseUrl}/`, "");
}

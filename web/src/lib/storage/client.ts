import "server-only";

import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/lib/env";

// Create S3/MinIO client
export const s3Client = new S3Client({
	endpoint: `http${serverEnv.MINIO_USE_SSL ? "s" : ""}://${serverEnv.MINIO_ENDPOINT}:${serverEnv.MINIO_PORT}`,
	region: "us-east-1",
	credentials: {
		accessKeyId: serverEnv.MINIO_ACCESS_KEY,
		secretAccessKey: serverEnv.MINIO_SECRET_KEY,
	},
	forcePathStyle: true, // Required for MinIO
});

export const BUCKET = serverEnv.MINIO_BUCKET;

// Cache to avoid checking bucket on every request
let bucketChecked = false;

// Ensure bucket exists
export async function ensureBucket() {
	if (bucketChecked) return;

	try {
		await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
		bucketChecked = true;
		// biome-ignore lint/suspicious/noExplicitAny: error is any
	} catch (error: any) {
		if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
			try {
				await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
				console.log(`Created bucket: ${BUCKET}`);
				bucketChecked = true;
				// biome-ignore lint/suspicious/noExplicitAny: createError is any
			} catch (createError: any) {
				// Bucket might have been created by another request
				if (
					createError.Code === "BucketAlreadyOwnedByYou" ||
					createError.Code === "BucketAlreadyExists"
				) {
					bucketChecked = true;
				} else {
					throw createError;
				}
			}
		} else {
			throw error;
		}
	}
}

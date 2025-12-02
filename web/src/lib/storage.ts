import "server-only";

import {
	CreateBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { serverEnv } from "@/lib/env";

// Create S3/MinIO client
const s3Client = new S3Client({
	endpoint: `http${serverEnv.MINIO_USE_SSL ? "s" : ""}://${serverEnv.MINIO_ENDPOINT}:${serverEnv.MINIO_PORT}`,
	region: "us-east-1",
	credentials: {
		accessKeyId: serverEnv.MINIO_ACCESS_KEY,
		secretAccessKey: serverEnv.MINIO_SECRET_KEY,
	},
	forcePathStyle: true, // Required for MinIO
});

const BUCKET = serverEnv.MINIO_BUCKET;

// Cache to avoid checking bucket on every request
let bucketChecked = false;

// Ensure bucket exists
async function ensureBucket() {
	if (bucketChecked) return;

	try {
		await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
		bucketChecked = true;
	} catch (error: any) {
		if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
			try {
				await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
				console.log(`Created bucket: ${BUCKET}`);
				bucketChecked = true;
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

/**
 * Upload a file to MinIO/S3
 */
export async function uploadFile(
	key: string,
	content: Buffer | string,
	contentType: string = "text/plain"
): Promise<string> {
	await ensureBucket();

	const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

	await s3Client.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: body,
			ContentType: contentType,
		})
	);

	return key;
}

/**
 * Download a file from MinIO/S3
 */
export async function downloadFile(key: string): Promise<Buffer> {
	const response = await s3Client.send(
		new GetObjectCommand({
			Bucket: BUCKET,
			Key: key,
		})
	);

	const chunks: Uint8Array[] = [];
	for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
		chunks.push(chunk);
	}

	return Buffer.concat(chunks);
}

/**
 * Delete a file from MinIO/S3
 */
export async function deleteFile(key: string): Promise<void> {
	await s3Client.send(
		new DeleteObjectCommand({
			Bucket: BUCKET,
			Key: key,
		})
	);
}

/**
 * Generate a testcase file path
 */
export function generateTestcasePath(
	problemId: number,
	testcaseIndex: number,
	type: "input" | "output"
): string {
	return `testcases/${problemId}/${testcaseIndex}_${type}.txt`;
}

/**
 * Generate an image file path
 */
export function generateImagePath(problemId: number | null, filename: string): string {
	const prefix = problemId ? `images/problems/${problemId}` : "images/general";
	return `${prefix}/${filename}`;
}

/**
 * Get the public URL for an image (via API route proxy)
 */
export function getImageUrl(key: string): string {
	return `/api/images/${encodeURIComponent(key)}`;
}

/**
 * Upload an image file to MinIO/S3
 */
export async function uploadImage(
	key: string,
	content: Buffer,
	contentType: string
): Promise<{ key: string; url: string }> {
	await ensureBucket();

	await s3Client.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: content,
			ContentType: contentType,
		})
	);

	return {
		key,
		url: getImageUrl(key),
	};
}

import {
	CopyObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { BUCKET, ensureBucket, s3Client } from "./client";
import { generateProblemBasePath, getImageUrl } from "./paths";

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

export interface StorageObject {
	key: string;
	size: number;
	lastModified: Date;
}

/**
 * List all objects with a given prefix
 */
export async function listObjects(prefix: string): Promise<string[]> {
	const keys: string[] = [];
	let continuationToken: string | undefined;

	try {
		do {
			const response = await s3Client.send(
				new ListObjectsV2Command({
					Bucket: BUCKET,
					Prefix: prefix,
					ContinuationToken: continuationToken,
				})
			);

			if (response.Contents) {
				for (const obj of response.Contents) {
					if (obj.Key) {
						keys.push(obj.Key);
					}
				}
			}

			continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
		} while (continuationToken);
		// biome-ignore lint/suspicious/noExplicitAny: error is any
	} catch (error: any) {
		if (error.Code === "NoSuchBucket" || error.name === "NoSuchBucket") {
			return [];
		}
		throw error;
	}

	return keys;
}

/**
 * List all objects with details
 */
export async function listObjectsWithDetails(prefix: string): Promise<StorageObject[]> {
	const objects: StorageObject[] = [];
	let continuationToken: string | undefined;

	do {
		const response = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: BUCKET,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			})
		);

		if (response.Contents) {
			for (const obj of response.Contents) {
				if (obj.Key && obj.Size !== undefined && obj.LastModified) {
					objects.push({
						key: obj.Key,
						size: obj.Size,
						lastModified: obj.LastModified,
					});
				}
			}
		}

		continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
	} while (continuationToken);

	return objects;
}

/**
 * Delete all files with a given prefix
 */
export async function deleteAllWithPrefix(prefix: string): Promise<number> {
	try {
		const keys = await listObjects(prefix);

		if (keys.length === 0) {
			return 0;
		}

		// S3 DeleteObjects can only delete 1000 objects at a time
		const batchSize = 1000;
		let deletedCount = 0;

		for (let i = 0; i < keys.length; i += batchSize) {
			const batch = keys.slice(i, i + batchSize);

			await s3Client.send(
				new DeleteObjectsCommand({
					Bucket: BUCKET,
					Delete: {
						Objects: batch.map((key) => ({ Key: key })),
						Quiet: true,
					},
				})
			);

			deletedCount += batch.length;
		}

		return deletedCount;
		// biome-ignore lint/suspicious/noExplicitAny: error is any
	} catch (error: any) {
		// If bucket doesn't exist, there's nothing to delete
		if (error.Code === "NoSuchBucket" || error.name === "NoSuchBucket") {
			return 0;
		}
		// Re-throw other errors
		throw error;
	}
}

/**
 * Delete all files for a problem (testcases, checker, validator, external_files)
 */
export async function deleteAllProblemFiles(problemId: number): Promise<number> {
	const prefix = generateProblemBasePath(problemId);
	return deleteAllWithPrefix(`${prefix}/`);
}

/**
 * Delete all files for a playground session
 */
export async function deleteAllPlaygroundFiles(sessionId: string): Promise<number> {
	return deleteAllWithPrefix(`playground/${sessionId}/`);
}

export interface DirectoryListing {
	folders: string[];
	files: StorageObject[];
}

/**
 * List objects in a directory-like structure with folder/file separation
 */
export async function listDirectory(prefix: string): Promise<DirectoryListing> {
	const folders: string[] = [];
	const files: StorageObject[] = [];
	let continuationToken: string | undefined;

	try {
		do {
			const response = await s3Client.send(
				new ListObjectsV2Command({
					Bucket: BUCKET,
					Prefix: prefix,
					Delimiter: "/",
					ContinuationToken: continuationToken,
				})
			);

			if (response.CommonPrefixes) {
				for (const cp of response.CommonPrefixes) {
					if (cp.Prefix) {
						folders.push(cp.Prefix);
					}
				}
			}

			if (response.Contents) {
				for (const obj of response.Contents) {
					if (obj.Key && obj.Key !== prefix && obj.Size !== undefined && obj.LastModified) {
						files.push({
							key: obj.Key,
							size: obj.Size,
							lastModified: obj.LastModified,
						});
					}
				}
			}

			continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
		} while (continuationToken);
		// biome-ignore lint/suspicious/noExplicitAny: error is any
	} catch (error: any) {
		if (error.Code === "NoSuchBucket" || error.name === "NoSuchBucket") {
			return { folders: [], files: [] };
		}
		throw error;
	}

	return { folders: folders.sort(), files: files.sort((a, b) => a.key.localeCompare(b.key)) };
}

/**
 * Server-side copy between two keys in the same bucket. Does not download the
 * body. Used for content-addressed object store restore (snapshot rollback).
 *
 * Idempotent against an existing destination — S3 overwrites on copy.
 */
export async function copyObject(sourceKey: string, destinationKey: string): Promise<void> {
	await ensureBucket();
	await s3Client.send(
		new CopyObjectCommand({
			Bucket: BUCKET,
			CopySource: encodeURIComponent(`${BUCKET}/${sourceKey}`),
			Key: destinationKey,
		})
	);
}

/**
 * Return true if the object exists, false otherwise. Any non-404 error
 * propagates. Used to skip re-upload when a content-addressed object is
 * already in the store.
 */
export async function headObject(key: string): Promise<boolean> {
	try {
		await s3Client.send(
			new HeadObjectCommand({
				Bucket: BUCKET,
				Key: key,
			})
		);
		return true;
		// biome-ignore lint/suspicious/noExplicitAny: error is any
	} catch (error: any) {
		const status = error?.$metadata?.httpStatusCode;
		if (status === 404 || error?.name === "NotFound" || error?.Code === "NotFound") {
			return false;
		}
		throw error;
	}
}

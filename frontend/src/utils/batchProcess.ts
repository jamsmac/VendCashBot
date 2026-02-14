/**
 * Batch processing utility for bulk API operations.
 * Splits large arrays into chunks and processes them sequentially,
 * aggregating results from each batch.
 *
 * BE-003: Enforces array size limits on bulk operations.
 */

export const BULK_CREATE_LIMIT = 1000
export const BULK_CANCEL_LIMIT = 500

export interface BulkCreateResult {
  created: number
  failed: number
  errors: { index: number; error: string }[]
  collections?: unknown[]
}

export interface BatchProgress {
  currentBatch: number
  totalBatches: number
  processed: number
  total: number
}

/**
 * Split an array into chunks of the specified size.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Process bulk create in batches, respecting the 1000-item server limit.
 * Returns aggregated results from all batches.
 *
 * @param collections - Full array of items to create
 * @param source - Source identifier for the bulk create
 * @param apiCall - The API function to call for each batch
 * @param onProgress - Optional callback for progress updates
 */
export async function batchBulkCreate<T>(
  collections: T[],
  source: string,
  apiCall: (data: { collections: T[]; source: string }) => Promise<BulkCreateResult>,
  onProgress?: (progress: BatchProgress) => void,
): Promise<BulkCreateResult> {
  const batches = chunk(collections, BULK_CREATE_LIMIT)

  const aggregated: BulkCreateResult = {
    created: 0,
    failed: 0,
    errors: [],
  }

  let processedSoFar = 0

  for (let i = 0; i < batches.length; i++) {
    onProgress?.({
      currentBatch: i + 1,
      totalBatches: batches.length,
      processed: processedSoFar,
      total: collections.length,
    })

    const result = await apiCall({ collections: batches[i], source })

    aggregated.created += result.created
    aggregated.failed += result.failed

    // Adjust error indices to reflect position in the full array
    if (result.errors?.length) {
      const offset = i * BULK_CREATE_LIMIT
      aggregated.errors.push(
        ...result.errors.map((err) => ({
          index: err.index + offset,
          error: err.error,
        })),
      )
    }

    processedSoFar += batches[i].length
  }

  return aggregated
}

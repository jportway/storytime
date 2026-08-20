import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

/**
 * A tiny blob store, so everything that used to be a file on Josh's laptop
 * can also be an object in a bucket.
 *
 * Deliberately not a general storage abstraction — it is exactly the four
 * operations this app performs, and no more. Stories, the profile and the
 * audio cache are all whole documents read and written in one go, which is
 * why there is no streaming or partial-update support here.
 */

export interface BlobEntry {
  key: string;
  /**
   * Small strings stored beside the object. Used so listing every story
   * doesn't require downloading every story — see `listStories`. The local
   * backend has nowhere to put these and returns them empty, which callers
   * must treat as "unknown", not "absent".
   */
  metadata: Record<string, string>;
}

export interface WriteOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  /** Make the object world-readable so browsers can fetch it directly. */
  publicRead?: boolean;
}

export interface BlobStore {
  read(key: string): Promise<Buffer | null>;
  write(key: string, data: Buffer | string, opts?: WriteOptions): Promise<void>;
  list(prefix: string): Promise<BlobEntry[]>;
  exists(key: string): Promise<boolean>;
  /**
   * A URL the browser can fetch directly, or null when the backend can't
   * serve bytes on its own and the request must be proxied.
   */
  publicUrl(key: string): string | null;
}

// ---------------------------------------------------------------------------
// Local filesystem
// ---------------------------------------------------------------------------

/**
 * Keys map straight onto paths under a root directory, which keeps the
 * on-disk layout identical to what it was before this indirection existed —
 * Cooper's existing stories in data/stories/*.json keep working untouched.
 */
class LocalBlobStore implements BlobStore {
  constructor(private root: string) {}

  private pathFor(key: string): string {
    // Guard against a crafted key escaping the root.
    const safe = key
      .split('/')
      .map((part) => part.replace(/[^a-zA-Z0-9_.-]/g, ''))
      .filter((part) => part && part !== '.' && part !== '..')
      .join('/');
    return path.join(this.root, safe);
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.pathFor(key));
    } catch {
      return null;
    }
  }

  async write(key: string, data: Buffer | string): Promise<void> {
    const file = this.pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Write-then-rename, so a crash mid-write can't corrupt a story she's
    // been working on for an hour. (The GCS backend needs no equivalent:
    // object writes there are already atomic.)
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const dir = this.pathFor(prefix);
    try {
      const names = await fs.readdir(dir);
      return names
        .filter((n) => !n.endsWith('.tmp'))
        .map((n) => ({ key: `${prefix.replace(/\/$/, '')}/${n}`, metadata: {} }));
    } catch {
      return [];
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(): string | null {
    // Nothing outside this process can reach a path on Josh's laptop.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Google Cloud Storage
// ---------------------------------------------------------------------------

class GcsBlobStore implements BlobStore {
  // Imported lazily so local development never loads the SDK, and a missing
  // dependency can't break a laptop run.
  private bucketPromise: Promise<import('@google-cloud/storage').Bucket> | null =
    null;

  /**
   * @param publicBaseUrl Set only when the bucket has deliberately been made
   *   world-readable. Left undefined the store never hands out direct URLs and
   *   every byte is served through the app, which is the right default for a
   *   bucket holding a child's stories.
   */
  constructor(
    private bucketName: string,
    private publicBaseUrl?: string,
  ) {}

  private bucket() {
    this.bucketPromise ??= import('@google-cloud/storage').then(
      ({ Storage }) => new Storage().bucket(this.bucketName),
    );
    return this.bucketPromise;
  }

  async read(key: string): Promise<Buffer | null> {
    const bucket = await this.bucket();
    try {
      const [buf] = await bucket.file(key).download();
      return buf;
    } catch (err) {
      // A missing object is an expected outcome everywhere this is called.
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async write(
    key: string,
    data: Buffer | string,
    opts: WriteOptions = {},
  ): Promise<void> {
    const bucket = await this.bucket();
    await bucket.file(key).save(data, {
      contentType: opts.contentType,
      metadata: opts.metadata ? { metadata: opts.metadata } : undefined,
      // `public: true` sets a per-object ACL, which uniform bucket-level
      // access rejects outright. Only ever attempted for a bucket that has
      // been deliberately opened up.
      ...(opts.publicRead && this.publicBaseUrl ? { public: true } : {}),
    });
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const bucket = await this.bucket();
    const [files] = await bucket.getFiles({ prefix });
    return files.map((f) => ({
      key: f.name,
      metadata: (f.metadata.metadata ?? {}) as Record<string, string>,
    }));
  }

  async exists(key: string): Promise<boolean> {
    const bucket = await this.bucket();
    const [found] = await bucket.file(key).exists();
    return found;
  }

  publicUrl(key: string): string | null {
    return this.publicBaseUrl ? `${this.publicBaseUrl}/${key}` : null;
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Stories, the profile and the token ledger. Local development keeps these
 * in data/ exactly as before; setting STORAGE_BUCKET moves them to a bucket
 * without any other code needing to know.
 */
export const blobs: BlobStore = config.storageBucket
  ? new GcsBlobStore(config.storageBucket)
  : new LocalBlobStore(config.paths.data);

/**
 * Synthesised audio, kept separate because it is a regenerable cache rather
 * than something Cooper would miss.
 *
 * Served through the app by default. Setting PUBLIC_AUDIO_BASE_URL — only
 * sensible against a bucket you have deliberately made world-readable — lets
 * the browser fetch repeat plays straight from storage instead.
 */
export const audioBlobs: BlobStore = config.storageBucket
  ? new GcsBlobStore(config.storageBucket, config.publicAudioBaseUrl)
  : new LocalBlobStore(config.paths.ttsCache);

/** True when running against a bucket rather than the local filesystem. */
export const isCloudStorage = Boolean(config.storageBucket);

/** Prefix for audio objects. Only meaningful for the bucket backend. */
export const AUDIO_PREFIX = isCloudStorage ? 'tts/' : '';

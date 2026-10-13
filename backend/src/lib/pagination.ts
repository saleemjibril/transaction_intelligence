/**
 * Keyset (cursor) pagination for transaction browsing.
 *
 * Rows are ordered by (date DESC, id ASC). A cursor encodes the (date, id)
 * of the last row on a page; the next query asks for rows strictly after it.
 * This stays efficient at millions of rows, unlike OFFSET pagination.
 */

export interface Cursor {
  date: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const { date, id } = parsed as Record<string, unknown>;
    if (typeof date !== "string" || typeof id !== "string") {
      return null;
    }
    return { date, id };
  } catch {
    return null;
  }
}

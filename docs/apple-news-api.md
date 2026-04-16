# Apple News Publisher API Reference

> Curated reference for this codebase. Raw fetched docs: `docs/raw/apple-news-api.md` (regenerate: `npm run update-docs`)  
> Source: https://developer.apple.com/documentation/applenewsapi

Base URL: `https://news-api.apple.com`

---

## Security Model

Every request requires an `Authorization` header signed with HMAC-SHA256. The API secret from News Publisher is base64-encoded — decode it before use.

### Canonical string

**GET:**
```
METHOD + URL + date
```

**POST (with body):**
```
METHOD + URL + date + Content-Type + body
```

- `date` — current UTC timestamp in ISO 8601 (e.g. `2015-03-05T03:00:27Z`)
- `Content-Type` — the full header value including boundary (e.g. `multipart/form-data; boundary=abc123`)
- `body` — full request body as UTF-8 string

### Authorization header

```
HHMAC; key=<api-key-id>; signature=<base64-hmac-sha256>; date=<date>
```

See `src/lib/api.ts` for the implementation.

---

## Article Endpoints

### Create an Article

```
POST /channels/{channelId}/articles
Content-Type: multipart/form-data
```

Returns `201 ArticleResponse`. Save the `id` and `revision` from the response.

### Update an Article

```
POST /articles/{articleId}
Content-Type: multipart/form-data
```

`metadata` part is required and must include `revision`. All other parts are optional — you can send just the document, just metadata, or both. Returns `200 ArticleResponse`.

Cannot partially update `article.json` — you must replace it entirely.

### Read Article Information

```
GET /articles/{articleId}
```

Returns the current `Article` object including `revision`, `state`, `shareUrl`, and `warnings`.

### Delete an Article

```
DELETE /articles/{articleId}
```

Returns `204 No Content`. **Irreversible.** To temporarily hide, use update with `isHidden: true`.

---

## MIME Multipart Rules

Every MIME part must have `Content-Disposition: form-data; name=<name>; filename=<filename>`. Missing `filename` causes `MIME_PART_MISSING_FILENAME`.

| Part | `name=` | `filename=` | `Content-Type` |
|------|---------|-------------|----------------|
| ANF document | `article.json` | `article.json` | `application/json` |
| Metadata | `metadata` | *(omit)* | `application/json` |
| Binary asset | any | must match the `bundle://` path in article.json | `image/jpeg`, `image/png`, `image/gif`, or `application/octet-stream` |

Metadata fields must be wrapped in a `data` key:
```json
{ "data": { "revision": "...", "isPreview": false } }
```

---

## Article Object

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | Store after publishing — needed for update/delete |
| `revision` | string | Required on every update — pass back exactly as received |
| `shareUrl` | string | Deep link to the article in the News app |
| `title` | string | From the ANF document `title` field |
| `state` | string | See states below |
| `isPreview` | boolean | `true` = only visible to channel members |
| `isSponsored` | boolean | |
| `isCandidateToBeFeatured` | boolean | |
| `createdAt` / `modifiedAt` | date-time | |
| `warnings` | `Warning[]` | Non-fatal processing issues |

### Article States

| State | Meaning |
|-------|---------|
| `PROCESSING` | Published, currently processing |
| `LIVE` | Published and visible in News |
| `PROCESSING_UPDATE` | Previous version live, update still processing |
| `TAKEN_DOWN` | Previously live, now removed |
| `FAILED_PROCESSING` | Processing failed, not visible |
| `FAILED_PROCESSING_UPDATE` | Previous version live, update failed |
| `DUPLICATE` | Duplicate of another article, not visible |

---

## Metadata Fields

Used in the `metadata` MIME part for both create and update. All optional on create; `revision` is required on update.

| Field | Notes |
|-------|-------|
| `revision` | **Required on update.** Must match the latest revision token. |
| `isPreview` | Default `false` for approved channels. On update: can change `true → false` (publish), but not `false → true`. |
| `isCandidateToBeFeatured` | Default `false` |
| `isHidden` | Default `false`. Use to temporarily hide instead of deleting. |
| `isSponsored` | Default `false`. Legally required for sponsored content. |
| `maturityRating` | `"KIDS"`, `"MATURE"`, `"GENERAL"`, or `null` |
| `targetTerritoryCountryCodes` | ISO 3166-1 alpha-2 codes (e.g. `["US", "GB"]`). Omit to use channel's territories. |
| `links.sections` | Array of section URLs. Omit = default section. `[]` = standalone (appears in search/topics, not channel feed). |

---

## Error Codes

| Code | Meaning |
|------|---------|
| `MIME_PART_MISSING_FILENAME` | `Content-Disposition` missing `filename` parameter |
| `INVALID_DOCUMENT` | Invalid ANF JSON — validate with News Preview |
| `INVALID_MIME_MULTIPART` | Malformed multipart body |
| `WRONG_REVISION` | Revision mismatch — fetch current revision and retry |
| `DUPLICATE_ARTICLE_FOUND` | Same title/URL published within 24 hours on this channel |
| `ONLY_PREVIEW_ALLOWED` | Channel not yet approved for live publishing |
| `PUBLISHING_NOT_ALLOWED` | Channel cannot publish |
| `MIME_PART_TOO_LARGE` | Image >20 MB, font >5 MB, attachment >50 MB |
| `REQUEST_BODY_TOO_LARGE` | Bundle >450 MB |
| `ARTICLE_TERRITORY_NOT_ALLOWED` | Country code not enabled for this channel |
| `429 Too Many Requests` | Rate limited — check `Retry-After` response header |
| `409 Conflict` | Revision conflict on update |

# Apple News Publisher API Reference

> Source: https://developer.apple.com/documentation/applenewsapi
> Last fetched: 2026-04-15

The Apple News API is a REST web service for publishing and managing Apple News Format articles. Base URL: `https://news-api.apple.com`.

---

## Security Model

### Overview
Security is the highest priority of the Apple News API, and it conforms to these principles:
- Authentication: Validates the identity of the client.
- Authorization: Provides fine-grained control over clients, allowing only specific actions that the client has permission to perform.
- Confidentiality: Protects information by encrypting data that’s exchanged between client and server.
#### Authentication
The Apple News API authenticates clients using message authentication codes (MAC) — specifically, hash-based message authentication codes (HMAC).
MAC/HMAC is a common authentication mechanism for REST APIs and provides a way for a server to prove to its client that it possesses a particular shared secret.
The server uses the following MAC/HMAC authentication process:
- The client uses the cryptographic hash function SHA-256 to combine the secret and the content of the message to generate a cryptographic hash.
- The server uses the same secret and message content to generate the server-side cryptographic hash.
- The server verifies the hash the client provides to check if it matches the serverʼs hash.
- If the hash the client provides doesn’t match the server’s hash, the client might not have the correct secret, the client might have generated the hash incorrectly, or someone may have tampered with the message.
For more information, see ``.
#### Authorization
The Apple News API enforces authorization by tying each API key to a single channel. A client thatʼs using a particular API key can create, read, update, or delete only those resources that are owned by the channel.
The Apple News API doesn’t support roles. Every key for a particular channel has access to all API endpoints for that channel.
#### Confidentiality
Transport layer security (TLS) enforces confidentiality in the Apple News API. The Apple News API listens for requests served over TLS/HTTPS only. This ensures that all requests and responses are fully encrypted.
#### Authenticating the Apple News API
To meet the authentication requirements of the Apple News API, follow these steps for each request.
##### Create a Request
If the request is a `GET`, create a canonical request by using a byte-wise concatenation of the following:
- The `HTTP` method (for example, `GET` or `POST` in all caps)
- The full `URL` of the request
- The current date in ISO 8601 format
If the request is a `POST` request with an entity, then include the following in the canonical request:
- The value of the `Content-Type` header
- The full content of the entity
##### Complete the Request
```other
HHMAC; key=<api-key-id>; signature=<hash>; date=<date>
```
where `<date>` is the date string you created in ``.
For more information about authenticating the Apple News API, see ``.

### Authorization Header Format

```
HHMAC; key=<api-key-id>; signature=<base64-hmac-sha256>; date=<ISO8601-date>
```

**GET canonical string:** `METHOD + URL + date`

**POST canonical string:** `METHOD + URL + date + Content-Type + body`

See `src/lib/api.ts` for the implementation.

---

## Create an Article

```
POST https://news-api.apple.com/channels/{channelId}/articles
```

### Discussion
Use the Create an Article endpoint to publish an article to your channel.
Here are the guidelines for Apple News Format documents and resources:
- A Create an Article request must consist of at least one `MIME` part that contains the article’s Apple News Format document. This part must have filename set to `article.json`. See “Example Code for Creating an Article Without Metadata” below.
- The server requires additional parts for each resource referenced in the Apple News Format document that uses a `URL` in this format: `bundle:// URL`.
- Each part must have a `Content-Disposition` header. The disposition must be form-data, and you must specify the filename parameter of `Content-Disposition`.
- In resource parts, the filename parameter must match the path of the `bundle://` `URL` in the Apple News Format document that references this file. For example, if the document references a URL of `bundle://logo.png`, there must be a `MIME` part with filename set to `logo.png`. For resource parts, the valid values for `Content-Type` are `image/jpeg`, `image/png`, `image/gif`, and `application/octet-stream`.
- When using a remote image, the URL must be in `http://` or `https://` format. No additional parts are required in the URL for remote images.
See `` to learn how to publish an article using the Apple News API.
Here are the guidelines for Apple News Format metadata:
- You can include an optional metadata part to provide additional non–Apple News Format data about the article, such as `isSponsored` and `maturityRating`. See ``. The metadata part can also specify any sections for the article by URL.
- You must wrap all metadata fields in a data key. See “Example Code for Creating an Article with Metadata” below_._ The `INVALID_JSON` error is thrown if there is no `data` key in the request call.
Here are the guidelines for Apple News Format sections:
- To publish the article to the channel’s default section, omit `links.sections`.
- To get information about a specific section, such as the section ID, use the `` endpoint.
- To publish a standalone article outside of sections, set `sections` to `[]` (an empty array). Standalone articles don’t appear in your channel, but still appear in topics and search results, and may appear in For You.
Here are general guidelines for Apple News Format:
- For articles with a source URL or thumbnail, avoid posting more than one article on the same channel using the same title, source URL, or thumbnail, within a 24-hour period. An article is considered a duplicate if these conditions are met.
- For articles without a source URL and thumbnail, avoid posting more than one article on same channel, using the same title, within a 24-hour period. An article is considered a duplicate if these conditions are met.
- When you create an article, be sure to retain the article ID or the self URL that’s returned in the response. You need the article ID to read, update, and delete an article.
- To publish older articles, use the metadata properties in Apple News Format. If you set an older publication date, the article appears earlier in the feed. See `` in Apple News Format documentation. Articles are sorted by publication date.
- A canonical URL is required to do data collection and reporting for comScore analytics.
- Don’t change the canonical URL of the article after it has been set.
#### Example Code for Creating an Article Without Metadata
#### Example Code for Creating an Article with Metadata

---

## Update an Article

```
POST https://news-api.apple.com/articles/{articleId}
```

### Discussion
The Update an Article endpoint accepts a MIME multipart request, in multipart/form-data format, instead of JSON (application/json). In contrast to the `` request, all parts of an Update an Article request are optional except for the metadata section. The Update an Article request may also include the article’s Apple News Format document or any of the resources referenced in the document with a `bundle://` `URL`, each with its own MIME part.
For example, you can update a single image, the document text or layout, the metadata, or all of them at once. Other than the option to omit parts, the format of the Update an Article request is identical to the Create an Article request. Although you can omit MIME parts that you previously posted, you can’t partially update the Apple News Format document in the `article.json.` You can only replace it, not patch it.
If you remove a resource part in one update call and later decide you want to reference it in the article, you must upload the resource again (not just restore the reference).
Updating an article doesn’t change the timestamp of the article or its placement in your  feeds, such as the Today feed, channel feeds, and topic feeds.
Here are the guidelines for updating an existing article:
- For each update, provide the article ID and the `revision` token that matches the current revision of the article. This ensures that two users can’t update an article at the same time and lose data. If this happens, the client informs the second user (via the `WRONG_REVISION` error) that the specified revision was incorrect because the article was updated in the meantime. The second user must retrieve the new version before proceeding. The client can then attempt to merge the two versions and call Update an Article again, or can choose to overwrite the older version with the new version. To get the current revision, use the method call shown in ``, or use a revision ID from an earlier Create an Article or Update an Article call.
- You must wrap all metadata fields in a data key. See “Example Code for Updating an Article with Metadata” below. The server returns the `INVALID_JSON` error if there is no data key in the request call.
- Include `isPreview` in the metadata to allow an update call to change the article’s preview/published state. Additionally, on update, you can make a preview article public (change `true` to `false`), but you can’t set a currently public article back to a preview state (change `false` to `true`).
- Use the `isHidden` property in the metadata  to hide and unhide an article in the Update an Article request.
#### Example Code for Updating an Article Without Metadata
#### Example Code for Updating an Article with Metadata

---

## Delete an Article

```
DELETE https://news-api.apple.com/articles/{articleId}
```

### Discussion
If the article is viewed on a device, it may take some time for the News app to refresh the cache so the article disappears on that device.
#### Example

---

## Article Object

| Property | Type | Notes |
|----------|------|-------|
| `accessoryText` | string |  Text that appears alongside article headlines — author name, channel name, subtitle, and so on. Maximum length: 100 characters. Default value: `metadata.authors` from the Apple News Format article. |
| `createdAt` | date-time |  The date and time the article was created. |
| `document` | string |  The content of the article, as an Apple News Format document. |
| `id` | uuid |  The unique identifier of the article. |
| `isCandidateToBeFeatured` | boolean |  A Boolean value that indicates whether this article should be considered for featuring in Apple News. Default value: `false` |
| `isPreview` | boolean |  A Boolean value that indicates whether this article should be public (live) or should be a preview that’s only visible to members of your channel. Set `isPreview` to `false` to publish the article imm |
| `isSponsored` | boolean |  A Boolean value that indicates whether this article consists of sponsored content for promotional purposes. You must mark sponsored content as such; channels that don’t follow this policy may be suspe |
| `links` | ArticleLinksResponse |  The URL of the channel in which the article appears. |
| `maturityRating` | string |  A string value that indicates the viewing audience for the content. The types of audiences or ratings are `KIDS`, `MATURE`, and `GENERAL,` or `null` if unspecified. A `MATURE` rating indicates explici |
| `modifiedAt` | date-time |  The date and time this article was last modified. |
| `revision` | string |  The current revision token for the article. You must send the latest revision when issuing a request to ``. The value of this field must match the latest revision from an earlier Create, Read, or Upda |
| `shareUrl` | string |  The URL to the article within the News app. |
| `state` | string |  The current state of the article, which can be one of the following: |
| `title` | string |  The title of the article, as specified in the Apple News Format document. |
| `type` | string |  The article. |
| `warnings` | [Warning] |  A list of warning messages indicating nonfatal problems with the article. |

### Article States

| State | Meaning |
|-------|---------|
| `PROCESSING` | Published, currently processing |
| `LIVE` | Published and visible in News |
| `PROCESSING_UPDATE` | Previous version live, update processing |
| `TAKEN_DOWN` | Previously live, now taken down |
| `FAILED_PROCESSING` | Failed processing, not visible |
| `FAILED_PROCESSING_UPDATE` | Previous version live, update failed |
| `DUPLICATE` | Duplicate of another article, not visible |

---

## Create Article Metadata Fields

Wrap all fields in a `data` key. Include in the `metadata` MIME part.

| Property | Type | Notes |
|----------|------|-------|
| `accessoryText` | string |  The text to include below the article excerpt in the channel view, such as a `byline` or `category` label. |
| `isCandidateToBeFeatured` | boolean |  A Boolean that indicates whether this article should be considered for featuring in Apple News. |
| `isHidden` | boolean |  A Boolean that indicates whether the article should be temporarily hidden from display in feeds in Apple News. Note that a hidden article is accessible if you have a direct link to the article. |
| `isPreview` | boolean |  A Boolean that indicates whether this article should be public (live) or should be a preview that’s only visible to members of your channel. Set `isPreview` to `false` to publish the article immediate |
| `isSponsored` | boolean |  A Boolean that indicates whether this article consists of sponsored content for promotional purposes. You must mark sponsored content as such; channels that don’t follow this policy may be suspended. |
| `links` | ArticleLinksRequest |  The section links for the article. |
| `maturityRating` | string |  A string that indicates the viewing audience for the content. `MATURE` indicates explicit content that’s only appropriate for a specific audience. By default, the article inherits the value you set fo |
| `targetTerritoryCountryCodes` | [string] |  The target country codes required for publishing the article. You must enable the specified country codes in your channel. For example, to publish an article only in the United Kingdom and Australia, |

---

## Update Article Metadata Fields

Same as create metadata, but `revision` is **required**.

| Property | Type | Notes |
|----------|------|-------|
| `revision` | string |  **(Required)** The current revision token for the article. The value of this field must match the latest revision from an earlier Create, Read, or Update Article call. This field prevents multiple users from updatin |
| `accessoryText` | string |  The text to include below the article excerpt in the channel view, such as a `byline` or `category` label. |
| `isCandidateToBeFeatured` | boolean |  A Boolean that indicates whether this article should be considered for featuring in Apple News. |
| `isHidden` | boolean |  A Boolean that indicates whether the article should be temporarily hidden from display in the News feed. Note that a hidden article is accessible if you have a direct link to the article. |
| `isPreview` | boolean |  A Boolean that indicates whether this article should be public (live) or should be a preview that’s only visible to members of your channel. Set `isPreview` to `false` to publish the article immediate |
| `isSponsored` | boolean |  A Boolean that indicates whether this article consists of sponsored content for promotional purposes. You must mark sponsored content as such; channels that don’t follow this policy may be suspended. |
| `links` | ArticleLinksRequest |  The section links for the article. |
| `maturityRating` | string |  A string that indicates the viewing audience for the content. `MATURE` indicates explicit content that’s only appropriate for a specific audience. By default, the article inherits the value you set fo |
| `targetTerritoryCountryCodes` | [string] |  The target country codes required for publishing the updated article. If you don’t specify the `targetTerritoryCountryCodes` in ``, or in `Update Article Metadata Fields`, the updated article is visib |

---

## MIME Multipart Rules

Every MIME part must have `Content-Disposition: form-data; name=<name>; filename=<filename>`.

| Part | name= | filename= | Content-Type |
|------|-------|-----------|-------------|
| ANF document | `article.json` | `article.json` | `application/json` |
| Metadata | `metadata` | *(omit)* | `application/json` |
| Binary assets | any | must match `bundle://` path in article.json | `image/jpeg`, `image/png`, `image/gif`, or `application/octet-stream` |

Key error codes: `MIME_PART_MISSING_FILENAME`, `WRONG_REVISION`, `INVALID_DOCUMENT`, `ONLY_PREVIEW_ALLOWED`, `DUPLICATE_ARTICLE_FOUND`.

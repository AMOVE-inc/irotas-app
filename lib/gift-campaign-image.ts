/** Only a newly selected local image needs uploading; archived site URLs are already durable. */
export function shouldUploadGiftImage(uri: string | undefined): boolean {
  return Boolean(uri && !/^https?:\/\//i.test(uri) && !uri.startsWith("/"));
}

declare module "*.png" {
  const asset: number | { uri: string; width?: number; height?: number; scale?: number };
  export default asset;
}

declare module "*.jpg" {
  const asset: number | { uri: string; width?: number; height?: number; scale?: number };
  export default asset;
}

declare module "*.jpeg" {
  const asset: number | { uri: string; width?: number; height?: number; scale?: number };
  export default asset;
}
